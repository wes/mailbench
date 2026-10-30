#!/usr/bin/env python3
"""Turns this machine's results into a run in results/, ready for a pull request.

    ./mailbench submit                         asks for what it needs
    ./mailbench submit --github octocat --affiliation none
    CORPUS=250k ./mailbench submit             the 250k results instead

Copies each client's current session (and the latest calibration) from
~/mailbench/results/<machine>-<corpus>/ into results/<run>/raw/, with home
directory paths replaced by ~; writes run.json from the session lines; and
generates summary.json from the raw output, the same way CI will.

Two things it asks that it cannot find out:

* your GitHub handle, which is shown with the run;
* whether you work on, or for, any of the clients in it. This is shown next
  to the run whatever the answer. It does not disqualify anyone — most
  results will come from people who build mail clients, which is the point —
  but a reader deserves to know.
"""

from __future__ import annotations

import argparse
import json
import re
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path

from mailbench_data import ROOT, current_sessions, load_client, read_lines, sessions

HOME = str(Path.home())


def scrub(value):
    """Home directory paths to ~, all the way down."""
    if isinstance(value, str):
        return value.replace(HOME, "~")
    if isinstance(value, list):
        return [scrub(v) for v in value]
    if isinstance(value, dict):
        return {k: scrub(v) for k, v in value.items()}
    return value


def slug(text: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", text.lower()).strip("-")


def hardware_name() -> str:
    try:
        out = subprocess.run(["system_profiler", "SPHardwareDataType"], capture_output=True, text=True).stdout
        m = re.search(r"Model Name: (.+)", out)
        return m.group(1).strip() if m else ""
    except OSError:
        return ""


def ask(prompt: str, given: str | None) -> str:
    if given is not None:
        return given
    if not sys.stdin.isatty():
        raise SystemExit(f"{prompt.strip()} (pass it as an option when not running interactively)")
    return input(prompt).strip()


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("results", type=Path, help="this machine's results directory")
    ap.add_argument("--github", help="your GitHub handle")
    ap.add_argument("--affiliation", help="client ids you work on or for, comma-separated, or 'none'")
    ap.add_argument("--clients", help="only these client ids (comma-separated); default all")
    ap.add_argument("--id", help="the run's id; default <date>-<machine>-<cpu>-<corpus>")
    ap.add_argument("--allow-unverified", action="store_true",
                    help="submit even though the corpus did not match the published digest")
    args = ap.parse_args()

    files = sorted(p for p in args.results.glob("*.jsonl") if p.stem != "calibration")
    if args.clients:
        wanted = set(args.clients.split(","))
        files = [p for p in files if p.stem.partition("@")[0] in wanted]
    if not files:
        raise SystemExit(f"nothing to submit in {args.results}")

    chosen: dict[str, list[tuple[dict, list[dict]]]] = {}
    for path in files:
        current = current_sessions(read_lines(path))
        if current:
            chosen[path.stem] = current
    heads = [s[-1][0] for s in chosen.values()]

    # One run is one machine, one corpus and one display. Anything else is two
    # runs, and its numbers must not meet in a table.
    for key in ("machine", "corpus_name"):
        found = {h.get(key) for h in heads}
        if len(found) > 1:
            raise SystemExit(f"these results disagree about {key}: {sorted(map(str, found))}")
    corpora = {json.dumps(h.get("corpus") or {}, sort_keys=True) for h in heads}
    corpus = json.loads(sorted(corpora)[0])
    if len(corpora) > 1:
        raise SystemExit("these results were measured against different corpora; submit them separately")
    if not corpus.get("verified") and not args.allow_unverified:
        raise SystemExit("the corpus these were measured on did not match the published digest.\n"
                         "Regenerate it (./mailbench corpus), measure again, or pass --allow-unverified "
                         "to submit it marked as such.")
    for stem in chosen:
        base = stem.partition("@")[0]
        if load_client(base) is None:
            raise SystemExit(f"{stem}: there is no clients/{base}.json; add the definition in the same pull request")

    github = ask("Your GitHub handle: ", args.github).lstrip("@")
    if not re.fullmatch(r"[A-Za-z0-9-]+", github):
        raise SystemExit(f"{github!r} is not a GitHub handle")
    ids = sorted({s.partition("@")[0] for s in chosen})
    answer = ask(f"Do you work on, or for, any of these clients: {', '.join(ids)}? "
                 "Their ids, comma-separated, or 'none': ", args.affiliation)
    if answer == "":
        raise SystemExit("an answer is needed: 'none', or the ids")
    affiliations = [] if answer.lower() in ("none", "no") else [a.strip() for a in answer.split(",")]
    unknown = [a for a in affiliations if load_client(a) is None]
    if unknown:
        raise SystemExit(f"no such clients: {', '.join(unknown)}")

    head = min(heads, key=lambda h: h.get("at", 0))
    date = datetime.fromtimestamp(head.get("at", 0), timezone.utc).date().isoformat()
    name = hardware_name() or head.get("model", "mac")
    run_id = args.id or f"{date}-{slug(name)}-{slug(head.get('cpu') or head.get('machine', ''))}-{head.get('corpus_name')}"
    run_dir = ROOT / "results" / run_id
    n = 2
    while run_dir.exists() and not args.id:
        run_dir = ROOT / "results" / f"{run_id}-{n}"
        n += 1
    if run_dir.exists():
        raise SystemExit(f"{run_dir} already exists")
    raw = run_dir / "raw"
    raw.mkdir(parents=True)

    display_hz = None
    for stem, current in chosen.items():
        lines = []
        for session, rows in current:
            for r in [session] + rows:
                if r.get("event") == "window" and r.get("display_hz"):
                    display_hz = r["display_hz"]
                lines.append(json.dumps(scrub(r), separators=(",", ":")))
        (raw / f"{stem}.jsonl").write_text("\n".join(lines) + "\n")

    cal = args.results / "calibration.jsonl"
    if cal.exists():
        cal_sessions = sessions(read_lines(cal))
        if cal_sessions:
            session, rows = cal_sessions[-1]
            (raw / "calibration.jsonl").write_text(
                "\n".join(json.dumps(scrub(r), separators=(",", ":")) for r in [session] + rows) + "\n")
    else:
        print("warning: this machine was never calibrated (./mailbench calibrate); the run will say so",
              file=sys.stderr)

    memory = head.get("memory_bytes")
    run = {
        "$schema": "../../schema/run.schema.json",
        "id": run_dir.name,
        "date": date,
        "corpus": {
            "version": corpus.get("version", "unknown"),
            "name": head.get("corpus_name", ""),
            "messages": corpus.get("messages", 0),
            "digest": corpus.get("digest"),
            "verified": bool(corpus.get("verified")),
        },
        "machine": {
            "name": name,
            "model_id": head.get("model"),
            "cpu": head.get("cpu") or head.get("machine", ""),
            "cores": head.get("cores"),
            "memory_gb": round(memory / 2**30) if memory else None,
            "os": f"macOS {head.get('os', '')}".strip(),
            "display": head.get("display") or None,
            "display_hz": display_hz or 0,
            "power": head.get("power") if head.get("power") in ("ac", "battery") else None,
        },
        "harness": {
            "version": head.get("harness", "unknown"),
            "window": head.get("window", ""),
            "runs": head.get("runs", 0),
            "search_term": head.get("search_term", ""),
        },
        "submitted_by": github,
        "affiliations": affiliations,
        "source": {"kind": "harness"},
        "parity": {},
        "notes": [],
    }
    (run_dir / "run.json").write_text(json.dumps(run, indent=2, ensure_ascii=False) + "\n")

    subprocess.run([sys.executable, str(ROOT / "harness" / "summarize.py"), str(run_dir)], check=True)
    check = subprocess.run([sys.executable, str(ROOT / "harness" / "validate.py")])

    rel = run_dir.relative_to(ROOT)
    print(f"""
Wrote {rel}/ — {len(chosen)} client{'s' if len(chosen) != 1 else ''}.

Before you open the pull request:

  1. Read {rel}/run.json. If a client did not hold the whole mailbox, say so
     under "parity"; anything a reader needs to know goes under "notes".
     Never edit summary.json: it is generated, and CI checks it.
  2. If harness.version ends in +dirty, you measured with changes to the
     harness or a client definition. Include them in the same pull request.
  3. Then:

       git checkout -b results/{run_dir.name}
       git add {rel}
       git commit -m "Results: {name}, {head.get('corpus_name')}"
       gh pr create --fill
""")
    return check.returncode


if __name__ == "__main__":
    sys.exit(main())
