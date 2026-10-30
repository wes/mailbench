"""The parts of the harness that can be tested without a screen.

    python3 -m unittest discover -s harness/tests

Measuring needs a Mac, permissions and the clients themselves; none of that is
here. What is: the corpus is the same bytes everywhere, client definitions
load into the shell the harness expects, the published numbers come out of the
raw output unchanged, and the meter counts what passes through it.
"""

from __future__ import annotations

import asyncio
import json
import socket
import subprocess
import sys
import tempfile
import time
import unittest
from pathlib import Path

HARNESS = Path(__file__).resolve().parent.parent
ROOT = HARNESS.parent
sys.path.insert(0, str(HARNESS))

import generate_corpus  # noqa: E402
import mailbench_data  # noqa: E402
import summarize  # noqa: E402

# The digest of a 300-message corpus at the default seed and epoch. If a change
# to generate_corpus.py moves it, that change is a new corpus: bump
# CORPUS_VERSION and the published digests in corpus.json, and say so in the
# pull request. Never just update this number.
SMALL_DIGEST = "sha256:a99c3c51411fc316fe5c287d68029722c47a33abe681eb66ec533e4f73f36808"


class Corpus(unittest.TestCase):
    def generate(self, count: int) -> Path:
        root = Path(tempfile.mkdtemp()) / "maildir"
        generate_corpus.generate(root, count, 0x5EED, generate_corpus.DEFAULT_EPOCH)
        return root

    def test_same_bytes_every_time(self):
        a = generate_corpus.digest(self.generate(300))
        b = generate_corpus.digest(self.generate(300))
        self.assertEqual(a, b)
        self.assertEqual(a["messages"], 300)

    def test_pinned(self):
        self.assertEqual(generate_corpus.digest(self.generate(300))["digest"], SMALL_DIGEST,
                         "the corpus generator's output changed; see the comment on SMALL_DIGEST")

    def test_prefix(self):
        # The first messages of a bigger corpus are the smaller corpus.
        small, big = self.generate(100), self.generate(300)
        names = lambda root: {p.name for p in root.rglob("cur/*")}  # noqa: E731
        self.assertTrue(names(small) <= names(big))

    def test_flags_do_not_change_the_digest(self):
        root = self.generate(50)
        before = generate_corpus.digest(root)
        path = next(root.rglob("cur/*"))
        path.rename(path.with_name(path.name.split(":2,")[0] + ":2,FRS"))
        self.assertEqual(before, generate_corpus.digest(root))

    def test_mtime_is_the_date(self):
        root = self.generate(20)
        for path in root.rglob("cur/*"):
            self.assertEqual(int(path.stat().st_mtime), int(path.name.split(".")[0]))

    def test_registry(self):
        registry = json.loads((HARNESS / "corpus.json").read_text())
        self.assertEqual(registry["version"], generate_corpus.CORPUS_VERSION)
        self.assertEqual(registry["seed"], 0x5EED)
        self.assertEqual(registry["epoch"], generate_corpus.DEFAULT_EPOCH)


class Clients(unittest.TestCase):
    def test_every_definition_loads_into_bash(self):
        ids = subprocess.run([sys.executable, str(HARNESS / "client.py"), "list"],
                             capture_output=True, text=True, check=True).stdout.split()
        self.assertIn("applemail", ids)
        for cid in ids:
            script = (f'eval "$({sys.executable} {HARNESS}/client.py shell {cid} --profile /p)"; '
                      'echo "$CLIENT_ID|$LAYOUT_STATUS|${#SEARCH_DONE[@]}|${#LAUNCH_ENV[@]}"')
            out = subprocess.run(["/bin/bash", "-c", script], capture_output=True, text=True, check=True).stdout
            self.assertTrue(out.startswith(cid + "|"), (cid, out))

    def test_no_variable_runs_into_unicode(self):
        # `$dir…` in a locale that is not UTF-8 is a variable called `dir` plus
        # the first byte of the ellipsis, which is unbound. Brace them: `${dir}…`.
        import re
        pattern = re.compile(rb"\$[A-Za-z_][A-Za-z0-9_]*[\x80-\xff]")
        scripts = [HARNESS / "run.sh", HARNESS / "server.sh", *sorted((ROOT / "clients").glob("*.sh"))]
        for path in scripts:
            for n, line in enumerate(path.read_bytes().splitlines(), 1):
                self.assertIsNone(pattern.search(line), f"{path.name}:{n}")

    def test_steps(self):
        import client
        self.assertEqual(client.step_args("click@400:101"), ["--click", "400,101"])
        self.assertEqual(client.step_args("escape"), ["--key", "escape"])
        self.assertEqual(client.step_args(None), [])


def run_lines(label: str, settles: list[float], firsts: list[float]) -> list[dict]:
    rows = [{"event": "run", "label": label, "run": i + 1, "first_ms": f, "settle_ms": s}
            for i, (f, s) in enumerate(zip(firsts, settles))]
    ok_s = sorted(settles)
    ok_f = sorted(firsts)
    rows.append({"event": "summary", "label": label, "runs": len(settles), "captured": len(settles),
                 "first_ms_median": ok_f[len(ok_f) // 2], "settle_ms_median": ok_s[len(ok_s) // 2]})
    return rows


class Summaries(unittest.TestCase):
    def fixture(self) -> Path:
        run = Path(tempfile.mkdtemp()) / "2026-11-01-test-mac-50k"
        raw = run / "raw"
        raw.mkdir(parents=True)
        old = [{"event": "session", "client": "mailmate", "version": "1.13", "at": 1793000000},
               *run_lines("mailmate/open-message", [900, 900, 900], [10, 10, 10])]
        new = [{"event": "session", "client": "mailmate", "version": "1.14", "at": 1793500000},
               {"event": "window", "display_hz": 120},
               *run_lines("mailmate/open-message", [150, 160, 170], [40, 41, 42]),
               {"event": "static", "client": "mailmate", "memory": {"total_kb": 204800}, "store_kb": 10240,
                "idle_cpu_pct": 0.2}]
        # A later session of the same version adds launch and quit.
        later = [{"event": "session", "client": "mailmate", "version": "1.14", "at": 1793600000},
                 {"event": "summary", "label": "mailmate/launch", "runs": 5, "captured": 5,
                  "first_ms_median": 800, "settle_ms_median": 1900},
                 {"event": "summary", "label": "mailmate/quit", "runs": 5, "captured": 5,
                  "first_ms_median": 196, "settle_ms_median": 196}]
        (raw / "mailmate.jsonl").write_text("\n".join(json.dumps(r) for r in old + new + later) + "\n")
        return run

    def test_values_come_from_the_current_version(self):
        summary = summarize.summarize(self.fixture())
        (client,) = summary["clients"]
        self.assertEqual(client["id"], "mailmate")
        self.assertEqual(client["version"], "1.14")
        m = client["metrics"]
        self.assertEqual(m["open"], {"value": 160, "first": 41, "runs": 3, "captured": 3})
        self.assertEqual(m["launch"]["value"], 1900)
        self.assertEqual(m["quit"]["value"], 196)
        self.assertEqual(m["memory"]["value"], 200)
        self.assertEqual(m["disk"]["value"], 10)
        self.assertEqual(m["cpu"]["value"], 0.2)
        self.assertNotIn("sync", m)
        self.assertEqual(summary["display_hz"], 120)

    def test_check_catches_a_hand_edit(self):
        run = self.fixture()
        self.assertTrue(summarize.one(run, check=False))
        self.assertTrue(summarize.one(run, check=True))
        path = run / "summary.json"
        path.write_text(path.read_text().replace('"value": 160', '"value": 60'))
        self.assertFalse(summarize.one(run, check=True))

    def test_every_metric_has_a_source(self):
        for m in mailbench_data.load_metrics():
            self.assertTrue({"summary", "static", "sync"} & set(m["source"]), m["key"])


class Meter(unittest.TestCase):
    def test_counts_every_byte(self):
        log = Path(tempfile.mkdtemp()) / "meter.jsonl"
        payload = 2 * 1024 * 1024

        async def upstream(r, w):
            w.write(b"* OK\r\n")
            await w.drain()
            while line := await r.readline():
                if b"FETCH" in line:
                    w.write(b"x" * payload + b"\r\n")
                w.write(line.split(b" ")[0] + b" OK\r\n")
                await w.drain()
            w.close()

        async def scenario():
            server = await asyncio.start_server(upstream, "127.0.0.1", 0)
            up_port = server.sockets[0].getsockname()[1]
            with socket.socket() as probe:
                probe.bind(("127.0.0.1", 0))
                listen = probe.getsockname()[1]
            meter = subprocess.Popen([sys.executable, str(HARNESS / "imap_meter.py"), "serve",
                                      "--listen", str(listen), "--upstream", str(up_port), "--log", str(log)])
            try:
                await asyncio.sleep(0.8)
                since = time.time()
                r, w = await asyncio.open_connection("127.0.0.1", listen, limit=4 * payload)
                got = len(await r.readline())
                for cmd in (b"a1 FETCH 1:* BODY[]\r\n", b"a2 LOGOUT\r\n"):
                    w.write(cmd)
                    await w.drain()
                    while not (line := await r.readuntil(b"\r\n")).startswith(cmd[:2]):
                        got += len(line)
                    got += len(line)
                w.close()
                await asyncio.sleep(1.5)
                watch = subprocess.run([sys.executable, str(HARNESS / "imap_meter.py"), "watch", "--log", str(log),
                                        "--since", str(since), "--quiet", "1", "--threshold", "1000",
                                        "--corpus-bytes", str(payload), "--quiet-output"],
                                       capture_output=True, text=True, timeout=30)
                return got, json.loads(watch.stdout)
            finally:
                meter.terminate()
                meter.wait()
                server.close()

        got, result = asyncio.run(scenario())
        self.assertEqual(result["bytes_down"], got)
        self.assertEqual(result["connections"], 1)
        self.assertAlmostEqual(result["ratio"], 1.0, places=2)


if __name__ == "__main__":
    unittest.main()
