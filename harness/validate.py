#!/usr/bin/env python3
"""Checks everything a pull request can change. CI runs it; so can you.

    ./mailbench validate
    python3 harness/validate.py

* every clients/<id>.json against schema/client.schema.json, and the ids,
  metrics and hooks it refers to;
* every results/<run>/run.json against schema/run.schema.json, and the
  clients it names;
* every summary.json against the raw output it is generated from, so a
  published number cannot be edited by hand;
* that no raw file carries a home directory's name.

No dependencies beyond Python 3.9: the schema checker here understands the
part of JSON Schema those two files use, and nothing else.
"""

from __future__ import annotations

import json
import re
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
errors: list[str] = []


def error(where: str, message: str) -> None:
    errors.append(f"{where}: {message}")


# ------------------------------------------------------------ schema subset

def check(value, schema: dict, root: dict, where: str) -> None:
    if "$ref" in schema:
        ref = schema["$ref"]
        assert ref.startswith("#/$defs/"), ref
        check(value, root["$defs"][ref.split("/")[-1]], root, where)
        return
    if "enum" in schema and value not in schema["enum"]:
        error(where, f"{value!r} is not one of {schema['enum']}")
        return
    kinds = schema.get("type")
    if kinds is not None:
        kinds = kinds if isinstance(kinds, list) else [kinds]
        if not any(is_type(value, k) for k in kinds):
            error(where, f"expected {' or '.join(kinds)}, got {type(value).__name__}")
            return
    if isinstance(value, str):
        if len(value) < schema.get("minLength", 0):
            error(where, "is empty")
        if "pattern" in schema and not re.search(schema["pattern"], value):
            error(where, f"{value!r} does not match {schema['pattern']}")
    if isinstance(value, list):
        if len(value) < schema.get("minItems", 0) or len(value) > schema.get("maxItems", 1 << 30):
            error(where, f"has {len(value)} items")
        for i, item in enumerate(value):
            if "items" in schema:
                check(item, schema["items"], root, f"{where}[{i}]")
    if isinstance(value, dict):
        for key in schema.get("required", []):
            if key not in value:
                error(where, f"missing {key!r}")
        props = schema.get("properties", {})
        extra = schema.get("additionalProperties", True)
        for key, item in value.items():
            if key in props:
                check(item, props[key], root, f"{where}.{key}")
            elif extra is False:
                error(where, f"unknown field {key!r}")
            elif isinstance(extra, dict):
                check(item, extra, root, f"{where}.{key}")


def is_type(value, kind: str) -> bool:
    return {
        "object": isinstance(value, dict),
        "array": isinstance(value, list),
        "string": isinstance(value, str),
        "boolean": isinstance(value, bool),
        "integer": isinstance(value, int) and not isinstance(value, bool),
        "number": isinstance(value, (int, float)) and not isinstance(value, bool),
        "null": value is None,
    }[kind]


def load(path: Path, where: str):
    try:
        return json.loads(path.read_text())
    except json.JSONDecodeError as e:
        error(where, f"not valid JSON: {e}")
        return None


# ------------------------------------------------------------------ checks

def clients(metric_keys: set[str]) -> set[str]:
    schema = json.loads((ROOT / "schema" / "client.schema.json").read_text())
    ids = set()
    for path in sorted((ROOT / "clients").glob("*.json")):
        if path.stem.startswith("_"):
            continue
        where = f"clients/{path.name}"
        c = load(path, where)
        if c is None:
            continue
        check(c, schema, schema, where)
        ids.add(path.stem)
        if c.get("id") != path.stem:
            error(where, f"id {c.get('id')!r} does not match the file name")
        layout = c.get("layout") or {}
        status = layout.get("status")
        if status in ("verified", "unverified"):
            for key in ("row", "row_dy", "reader", "list"):
                if key not in layout:
                    error(where, f"layout is {status} but has no {key!r}")
            app = c.get("app", {})
            if not (app.get("bundle_id") or app.get("app_name")):
                error(where, "a measurable client needs app.bundle_id (or app.app_name)")
            if not app.get("process"):
                error(where, "a measurable client needs app.process")
        if status == "verified" and "verified" not in layout:
            error(where, "layout is verified, but not at which version (layout.verified)")
        for i, caveat in enumerate(c.get("caveats", [])):
            if caveat.get("metric") and caveat["metric"] not in metric_keys:
                error(f"{where}.caveats[{i}]", f"no metric called {caveat['metric']!r}")
    # The template is what people copy, so it has to be a valid definition too.
    template = ROOT / "clients" / "_template.json"
    if template.exists():
        t = load(template, "clients/_template.json")
        if t is not None:
            check(t, schema, schema, "clients/_template.json")
    for path in sorted((ROOT / "clients").glob("*.sh")):
        if path.stem not in ids:
            error(f"clients/{path.name}", "hooks for a client with no definition")
        result = subprocess.run(["bash", "-n", str(path)], capture_output=True, text=True)
        if result.returncode != 0:
            error(f"clients/{path.name}", result.stderr.strip())
    return ids


def runs(client_ids: set[str], metric_keys: set[str]) -> None:
    schema = json.loads((ROOT / "schema" / "run.schema.json").read_text())
    results = ROOT / "results"
    for run_dir in sorted(p for p in results.iterdir() if p.is_dir()):
        where = f"results/{run_dir.name}"
        run = load(run_dir / "run.json", f"{where}/run.json") if (run_dir / "run.json").exists() else None
        if run is None:
            error(where, "no run.json")
            continue
        check(run, schema, schema, f"{where}/run.json")
        if run.get("id") != run_dir.name:
            error(f"{where}/run.json", f"id {run.get('id')!r} does not match the directory")
        for cid in run.get("affiliations", []):
            if cid not in client_ids:
                error(f"{where}/run.json", f"affiliation with unknown client {cid!r}")
        for cid in (run.get("parity") or {}):
            if cid not in client_ids:
                error(f"{where}/run.json", f"parity for unknown client {cid!r}")
        for i, note in enumerate(run.get("notes", [])):
            for cid in note.get("clients", []):
                if cid not in client_ids:
                    error(f"{where}/run.json.notes[{i}]", f"unknown client {cid!r}")
            if note.get("metric") and note["metric"] not in metric_keys:
                error(f"{where}/run.json.notes[{i}]", f"no metric called {note['metric']!r}")

        summary_path = run_dir / "summary.json"
        raw = run_dir / "raw"
        if not summary_path.exists():
            error(where, "no summary.json (python3 harness/summarize.py results/<run>)")
            continue
        summary = load(summary_path, f"{where}/summary.json")
        if summary is None:
            continue
        kind = run.get("source", {}).get("kind")
        if raw.is_dir():
            if kind != "harness":
                error(f"{where}/run.json", "has raw/, so source.kind should be \"harness\"")
            check_raw(raw, where)
        elif kind != "imported":
            error(where, "no raw/: only an imported run may publish numbers without the output they came from")
        elif not run.get("source", {}).get("url"):
            error(f"{where}/run.json", "an imported run says where it was imported from (source.url)")
        for i, c in enumerate(summary.get("clients", [])):
            if c.get("id") not in client_ids:
                error(f"{where}/summary.json.clients[{i}]", f"unknown client {c.get('id')!r}")
            for key in c.get("metrics", {}):
                if key not in metric_keys:
                    error(f"{where}/summary.json.clients[{i}]", f"no metric called {key!r}")
        hz = summary.get("display_hz")
        if isinstance(hz, list):
            error(f"{where}/summary.json", f"clients were measured on displays of different rates {hz}; "
                                           "split them into separate runs")
        if summary.get("source") == "raw" and run.get("machine", {}).get("display_hz") not in (None, hz):
            error(f"{where}/run.json", f"machine.display_hz says {run['machine']['display_hz']}, the raw output {hz}")

    regenerated = subprocess.run([sys.executable, str(ROOT / "harness" / "summarize.py"), "--all", "--check"],
                                 capture_output=True, text=True)
    for line in regenerated.stderr.strip().splitlines():
        error("summarize --check", line)


HOME_PATTERN = re.compile(r"/(Users|home)/[^/\"~]+/")


def check_raw(raw: Path, where: str) -> None:
    for path in sorted(raw.glob("*.jsonl")):
        text = path.read_text()
        if HOME_PATTERN.search(text):
            error(f"{where}/raw/{path.name}", "contains a home directory path; `./mailbench submit` removes them")
        for n, line in enumerate(text.splitlines(), 1):
            if line.strip():
                try:
                    json.loads(line)
                except json.JSONDecodeError:
                    error(f"{where}/raw/{path.name}:{n}", "not valid JSON")
        if path.stem != "calibration":
            base = path.stem.partition("@")[0]
            if not (ROOT / "clients" / f"{base}.json").exists():
                error(f"{where}/raw/{path.name}", f"no client called {base!r}")


def main() -> int:
    metrics = json.loads((ROOT / "schema" / "metrics.json").read_text())["metrics"]
    keys = {m["key"] for m in metrics}
    ids = clients(keys)
    runs(ids, keys)
    if errors:
        print("\n".join(errors), file=sys.stderr)
        print(f"\n{len(errors)} problem{'s' if len(errors) != 1 else ''}", file=sys.stderr)
        return 1
    print(f"ok: {len(ids)} clients, {sum(1 for p in (ROOT / 'results').iterdir() if p.is_dir())} runs")
    return 0


if __name__ == "__main__":
    sys.exit(main())
