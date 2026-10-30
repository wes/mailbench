#!/usr/bin/env python3
"""One table: every client measured on this machine, side by side.

    ./mailbench report
    ./mailbench report --markdown
    python3 harness/report.py ~/mailbench/results/<machine>-<corpus>
    python3 harness/report.py --calibration ~/mailbench/results/<machine>-<corpus>/calibration.jsonl

Reads the `<client>.jsonl` files the harness writes and takes, for each
client, its current session only — an older session was taken against a
different build or a different setting and is history, not a second opinion.

Timed cells are `first / settle` in milliseconds, medians. `first` is
something changed; `settle` is it stopped changing. Quoting only `first` lets
a client that paints a spinner quickly look fast. The published number is
`settle`.
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

from mailbench_data import calibration, current, load_client, load_metrics, read_lines


def fmt(v, decimals: int = 0) -> str:
    if v is None:
        return "—"
    return f"{v:,.{decimals}f}"


def table(rows: list[list[str]], markdown: bool) -> str:
    if markdown:
        lines = ["| " + " | ".join(rows[0]) + " |", "|" + "---|" * len(rows[0])]
        lines += ["| " + " | ".join(r) + " |" for r in rows[1:]]
        return "\n".join(lines)
    widths = [max(len(r[i]) for r in rows) for i in range(len(rows[0]))]
    out = []
    for n, r in enumerate(rows):
        out.append("  ".join(c.ljust(widths[i]) if i == 0 else c.rjust(widths[i]) for i, c in enumerate(r)))
        if n == 0:
            out.append("  ".join("-" * w for w in widths))
    return "\n".join(out)


def calibration_table(path: Path, markdown: bool) -> str:
    rows = calibration(read_lines(path))
    if not rows:
        return "no calibration runs found"
    out = [["asked", "target fired", "instrument read", "overhead"]]
    for r in rows:
        out.append([f"{r['asked_ms']} ms", f"{r['fired_ms']:.2f} ms", f"{r['read_ms']:.2f} ms",
                    f"+{r['overhead_ms']:.1f} ms"])
    return table(out, markdown)


def display_name(stem: str) -> str:
    base, _, tag = stem.partition("@")
    client = load_client(base)
    name = client["name"] if client else base
    return f"{name} @{tag}" if tag else name


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("results", type=Path, nargs="?")
    ap.add_argument("--markdown", action="store_true")
    ap.add_argument("--calibration", type=Path)
    args = ap.parse_args()

    if args.calibration:
        print(calibration_table(args.calibration, args.markdown))
        return 0
    if not args.results or not args.results.is_dir():
        ap.error("give the results directory for a machine")

    clients: dict[str, tuple[dict, dict]] = {}
    for path in sorted(args.results.glob("*.jsonl")):
        if path.stem == "calibration":
            continue
        session, measured = current(read_lines(path))
        if session:
            clients[path.stem] = (session, measured)
    if not clients:
        print(f"nothing measured yet in {args.results}")
        return 1

    # Alphabetical by name: the order of a table is not a ranking.
    order = sorted(clients, key=lambda c: display_name(c).lower())
    metrics = load_metrics()
    rows = [["metric"] + [display_name(c) for c in order]]
    for m in metrics:
        row = [f"{m['title'].lower()}, {m['unit']}"]
        for c in order:
            _, measured = clients[c]
            src = m["source"]
            if "summary" in src:
                s = measured["summaries"].get(f"{c}/{src['summary']}")
                if not s:
                    row.append("—")
                    continue
                if src.get("first"):
                    text = f"{fmt(s.get(src['first']))} / {fmt(s.get(src['field']))}"
                else:
                    text = fmt(s.get(src["field"]))
                # A run that saw no change timed out. A median over the ones that
                # did is still a number, but not one to quote without saying how
                # many were lost.
                if s.get("captured", 0) < s.get("runs", 0):
                    text += f" ({s['captured']}/{s['runs']})"
                row.append(text)
            elif "static" in src:
                st = measured["static"] or {}
                v = st
                for part in src["static"].split("."):
                    v = v.get(part) if isinstance(v, dict) else None
                row.append(fmt(v / src.get("divide", 1), m.get("decimals", 0)) if v else "—")
            elif "sync" in src:
                sync = measured["sync"]
                if sync and sync.get("seconds") is not None:
                    text = fmt(sync["seconds"])
                    if sync.get("ratio") is not None:
                        text += f" ({sync['ratio']:.0%})"
                    row.append(text)
                else:
                    row.append("—")
        rows.append(row)

    any_session = clients[order[0]][0]
    corpus = any_session.get("corpus") or {}
    verified = "published corpus" if corpus.get("verified") else "NOT the published corpus"
    print(f"{any_session.get('machine')} ({any_session.get('model')}), macOS {any_session.get('os')}, "
          f"display {any_session.get('display')}, window {any_session.get('window')}, "
          f"corpus {any_session.get('corpus_name', '?')} ({verified})")
    print(table(rows, args.markdown))
    print("Timed rows are first / settle; the published number is settle. Sync shows the share of the corpus downloaded.")
    print()
    for c in order:
        s = clients[c][0]
        print(f"  {display_name(c)} {s.get('version') or ''}".rstrip())

    cal = args.results / "calibration.jsonl"
    print()
    if cal.exists():
        print("Instrument overhead on this machine (identical for every client, so it cancels in a")
        print("comparison; anything within a frame or two of it is at the floor):")
        print(calibration_table(cal, args.markdown))
    else:
        print("Not calibrated on this machine: run `./mailbench calibrate` before quoting these.")
    print("Memory is physical footprint, as Activity Monitor shows it, including the helper processes")
    print("each client renders mail in.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
