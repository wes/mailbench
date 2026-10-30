#!/usr/bin/env python3
"""The server-side instrument: what every client downloads, and when.

    python3 harness/imap_meter.py serve --listen 10143 --upstream 11143 --log meter.jsonl
    python3 harness/imap_meter.py watch --log meter.jsonl --since <unix time> [--corpus-bytes N]

`serve` sits between the clients and Dovecot and passes every byte through
unchanged, counting as it goes. It writes a line when a connection opens and
closes, and once a second while anything is moving:

    {"event":"tick","t":1790812800.0,"down":524288,"up":1024,"open":3}

`down` is server to client. That is the whole of a first sync, measured the
same way for every client: no client is asked when it has finished, because
each would answer by a different rule, and some cannot be asked at all.

`watch` reads that log from a moment on — the launch of a client with an
empty store — and reports when the download stopped:

    {"event":"sync","seconds":38.2,"bytes_down":261000000,"ratio":1.03,...}

What it does not see is work a client does after the last byte arrives, such
as building a search index. The number is "downloaded", not "ready", and is
published as that. `ratio` is the bytes downloaded over the corpus's size: a
client that keeps only recent mail, or only headers, shows it there, which is
the parity check the screen cannot make.

Passing through the meter costs each round trip a fraction of a millisecond on
loopback, the same for every client.
"""

from __future__ import annotations

import argparse
import asyncio
import json
import sys
import time
from pathlib import Path

CHUNK = 256 * 1024


class Meter:
    def __init__(self, log: Path) -> None:
        self.log = log.open("a", buffering=1)
        self.down = 0
        self.up = 0
        self.open = 0
        self.next_id = 0

    def write(self, record: dict) -> None:
        self.log.write(json.dumps(record, separators=(",", ":")) + "\n")

    async def ticker(self) -> None:
        while True:
            await asyncio.sleep(1)
            if self.down or self.up:
                self.write({"event": "tick", "t": round(time.time(), 3), "down": self.down,
                            "up": self.up, "open": self.open})
                self.down = self.up = 0


async def pipe(reader: asyncio.StreamReader, writer: asyncio.StreamWriter, count) -> int:
    total = 0
    try:
        while data := await reader.read(CHUNK):
            count(len(data))
            total += len(data)
            writer.write(data)
            await writer.drain()
    except (ConnectionError, asyncio.IncompleteReadError):
        pass
    finally:
        # Half-close, so the other direction can finish what it is sending.
        try:
            if writer.can_write_eof():
                writer.write_eof()
        except (OSError, RuntimeError):
            pass
    return total


async def serve(args: argparse.Namespace) -> None:
    meter = Meter(Path(args.log).expanduser())

    async def handle(client_r: asyncio.StreamReader, client_w: asyncio.StreamWriter) -> None:
        meter.next_id += 1
        conn = meter.next_id
        try:
            server_r, server_w = await asyncio.open_connection("127.0.0.1", args.upstream)
        except OSError as e:
            meter.write({"event": "refused", "conn": conn, "t": round(time.time(), 3), "error": str(e)})
            client_w.close()
            return
        meter.open += 1
        meter.write({"event": "open", "conn": conn, "t": round(time.time(), 3)})

        def counted_down(n: int) -> None:
            meter.down += n

        def counted_up(n: int) -> None:
            meter.up += n

        down, up = await asyncio.gather(
            pipe(server_r, client_w, counted_down),
            pipe(client_r, server_w, counted_up),
        )
        for w in (client_w, server_w):
            w.close()
        meter.open -= 1
        meter.write({"event": "close", "conn": conn, "t": round(time.time(), 3), "down": down, "up": up})

    server = await asyncio.start_server(handle, "127.0.0.1", args.listen)
    meter.write({"event": "start", "t": round(time.time(), 3), "listen": args.listen, "upstream": args.upstream})
    asyncio.ensure_future(meter.ticker())
    async with server:
        await server.serve_forever()


def read_since(log: Path, since: float) -> list[dict]:
    out = []
    if not log.exists():
        return out
    for line in log.read_text().splitlines():
        try:
            r = json.loads(line)
        except json.JSONDecodeError:
            continue
        if r.get("t", 0) >= since:
            out.append(r)
    return out


def watch(args: argparse.Namespace) -> int:
    """Waits for a sync to start and finish, then prints one `sync` record.

    Finished: no second has moved more than `--threshold` bytes down for
    `--quiet` seconds. Not "no bytes at all", because a synced client still
    talks — IDLE, NOOP, a poll a minute — and that is not the sync.
    """
    log = Path(args.log).expanduser()
    started = time.time()
    while True:
        records = read_since(log, args.since)
        ticks = [r for r in records if r.get("event") == "tick"]
        opens = [r for r in records if r.get("event") == "open"]
        busy = [r for r in ticks if r["down"] > args.threshold]
        total = sum(r["down"] for r in ticks)
        now = time.time()

        if not args.quiet_output:
            print(f"\r  {now - args.since:6.0f}s  {total / 1e6:8.1f} MB down  "
                  f"{(opens and len(opens)) or 0} connections ", end="", file=sys.stderr, flush=True)

        if busy and now - busy[-1]["t"] >= args.quiet:
            # The last busy tick covers the second before its timestamp.
            end = busy[-1]["t"]
            moved = sum(r["down"] for r in ticks if r["t"] <= end)
            result = {
                "event": "sync",
                "method": "server-meter",
                "seconds": round(end - args.since, 2),
                "first_connection_s": round(opens[0]["t"] - args.since, 2) if opens else None,
                "bytes_down": moved,
                "bytes_up": sum(r["up"] for r in ticks if r["t"] <= end),
                "connections": len(opens),
                "quiet_s": args.quiet,
                "threshold_bytes": args.threshold,
            }
            if args.corpus_bytes:
                result["corpus_bytes"] = args.corpus_bytes
                result["ratio"] = round(moved / args.corpus_bytes, 3)
            if not args.quiet_output:
                print(file=sys.stderr)
            print(json.dumps(result))
            return 0

        if not busy and now - started > args.start_timeout:
            if not args.quiet_output:
                print(file=sys.stderr)
            print(f"nothing downloaded in {args.start_timeout}s; is the client pointed at the meter's port?",
                  file=sys.stderr)
            return 1
        if now - started > args.timeout:
            if not args.quiet_output:
                print(file=sys.stderr)
            print(f"still downloading after {args.timeout}s; giving up", file=sys.stderr)
            return 1
        time.sleep(1)


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = ap.add_subparsers(dest="command", required=True)

    s = sub.add_parser("serve")
    s.add_argument("--listen", type=int, required=True)
    s.add_argument("--upstream", type=int, required=True)
    s.add_argument("--log", required=True)

    w = sub.add_parser("watch")
    w.add_argument("--log", required=True)
    w.add_argument("--since", type=float, required=True, help="unix time the client was launched")
    w.add_argument("--quiet", type=float, default=30, help="seconds below the threshold that count as done")
    w.add_argument("--threshold", type=int, default=16 * 1024, help="bytes in a second that count as busy")
    w.add_argument("--corpus-bytes", type=int, default=0)
    w.add_argument("--start-timeout", type=float, default=300)
    w.add_argument("--timeout", type=float, default=3 * 3600)
    w.add_argument("--quiet-output", action="store_true")

    args = ap.parse_args()
    if args.command == "serve":
        try:
            asyncio.run(serve(args))
        except KeyboardInterrupt:
            pass
        return 0
    return watch(args)


if __name__ == "__main__":
    sys.exit(main())
