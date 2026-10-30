"""Reading what the harness writes. Shared by report.py, summarize.py and submit.py.

A client's results file is JSON lines: a `session` line (who, what version,
which machine and corpus), then the instrument's output — one `run` line per
run and a `summary` per action, a `static` line for memory and disk, a `sync`
line for a first sync. A file can hold many sessions; the current one is the
latest, plus whatever earlier sessions of the same version measured that it
did not (`./mailbench launch` adds launch and quit as a session of its own,
and should not hide the rest).
"""

from __future__ import annotations

import json
import statistics
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent


def read_lines(path: Path) -> list[dict]:
    out = []
    for line in path.read_text().splitlines():
        line = line.strip()
        if not line:
            continue
        try:
            out.append(json.loads(line))
        except json.JSONDecodeError:
            # A run that died halfway costs its own line, not the file.
            continue
    return out


def sessions(records: list[dict]) -> list[tuple[dict, list[dict]]]:
    out: list[tuple[dict, list[dict]]] = []
    for r in records:
        if r.get("event") == "session":
            out.append((r, []))
        elif out:
            out[-1][1].append(r)
    return out


def current_sessions(records: list[dict]) -> list[tuple[dict, list[dict]]]:
    """Every session of the latest session's version, oldest first."""
    all_sessions = sessions(records)
    if not all_sessions:
        return []
    head = all_sessions[-1][0]
    return [(s, rows) for s, rows in all_sessions if s.get("version") == head.get("version")]


def current(records: list[dict]) -> tuple[dict | None, dict]:
    """The latest session, and what the current sessions measured between them.

    Returns (session, measured), where measured has `summaries` by label,
    `static` and `sync`, each the latest of its kind.
    """
    chosen = current_sessions(records)
    if not chosen:
        return None, {"summaries": {}, "static": None, "sync": None, "display_hz": None}
    summaries: dict[str, dict] = {}
    static = sync = None
    display_hz = None
    for _, rows in chosen:
        for r in rows:
            event = r.get("event")
            if event == "summary":
                summaries[r.get("label")] = r
            elif event == "static":
                static = r
            elif event == "sync":
                sync = r
            elif event == "window" and r.get("display_hz"):
                display_hz = r["display_hz"]
    return chosen[-1][0], {"summaries": summaries, "static": static, "sync": sync, "display_hz": display_hz}


def load_metrics() -> list[dict]:
    return json.loads((ROOT / "schema" / "metrics.json").read_text())["metrics"]


def load_client(client_id: str) -> dict | None:
    path = ROOT / "clients" / f"{client_id}.json"
    return json.loads(path.read_text()) if path.exists() else None


def dig(record: dict | None, dotted: str):
    value = record
    for part in dotted.split("."):
        if not isinstance(value, dict):
            return None
        value = value.get(part)
    return value


def metric_values(name: str, measured: dict, metrics: list[dict]) -> dict:
    """One client's numbers, keyed by metric, in the shape summary.json keeps.

    `name` is the results file's stem — the client id, with `@tag` for an A/B
    build — which is the prefix of every summary label it wrote.
    """
    out: dict[str, dict] = {}
    for m in metrics:
        src = m["source"]
        entry: dict | None = None
        if "summary" in src:
            s = measured["summaries"].get(f"{name}/{src['summary']}")
            if s and s.get(src["field"]) is not None:
                entry = {"value": s[src["field"]], "runs": s.get("runs"), "captured": s.get("captured")}
                if src.get("first") and s.get(src["first"]) is not None:
                    entry["first"] = s[src["first"]]
        elif "static" in src:
            v = dig(measured["static"], src["static"])
            if v:
                entry = {"value": round(v / src.get("divide", 1), 2)}
        elif "sync" in src:
            sync = measured["sync"]
            if sync and sync.get(src["sync"]) is not None:
                entry = {"value": sync[src["sync"]]}
                for k in ("bytes_down", "ratio", "method"):
                    if sync.get(k) is not None:
                        entry[k] = sync[k]
        if entry is not None:
            out[m["key"]] = entry
    return out


def calibration(records: list[dict]) -> list[dict]:
    """Rows of asked / fired / read / overhead, from the latest calibration session."""
    all_sessions = sessions(records)
    rows_in = all_sessions[-1][1] if all_sessions else records
    rows = []
    for delay in (50, 200, 800):
        label = f"calibrate/{delay}"
        fired = [r["actual_ms"] for r in rows_in if r.get("event") == "fired" and r.get("label") == label]
        read = [r["first_ms"] for r in rows_in
                if r.get("event") == "run" and r.get("label") == label and r.get("first_ms") is not None]
        if not fired or not read:
            continue
        f, m = statistics.median(fired), statistics.median(read)
        rows.append({"asked_ms": delay, "fired_ms": round(f, 2), "read_ms": round(m, 2),
                     "overhead_ms": round(m - f, 2)})
    return rows
