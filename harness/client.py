#!/usr/bin/env python3
"""Client definitions (clients/<id>.json), for the shell harness.

    python3 harness/client.py list
    python3 harness/client.py shell <id> --profile DIR

`shell` prints the definition as shell assignments for `run.sh` to eval: the
same variables the harness has always measured with, read from data instead
of a `case` statement, so adding a client is a JSON file and not an edit to
the harness. Every value is quoted with shlex; nothing in a definition is ever
run as shell except the optional `version_command` and the client's own
`clients/<id>.sh` hooks, both of which are reviewed like any other code.
"""

from __future__ import annotations

import glob
import json
import os
import shlex
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
CLIENTS = ROOT / "clients"


def load(client_id: str) -> dict:
    path = CLIENTS / f"{client_id}.json"
    if not path.exists():
        known = ", ".join(all_ids())
        raise SystemExit(f"unknown client: {client_id} (known: {known})")
    return json.loads(path.read_text())


def all_ids() -> list[str]:
    return sorted(p.stem for p in CLIENTS.glob("*.json") if not p.stem.startswith("_"))


def expand(value: str, profile: str) -> str:
    return os.path.expanduser(value.replace("{profile}", profile))


def point(xy) -> str:
    return f"{xy[0]},{xy[1]}" if xy else ""


def rect(r) -> str:
    return ",".join(str(v) for v in r) if r else ""


def step_args(step: str | None) -> list[str]:
    """One `measure` action from a step: `click@x:y` is a click, anything else a key."""
    if not step:
        return []
    if step.startswith("click@"):
        x, y = step[len("click@"):].split(":")
        return ["--click", f"{x},{y}"]
    return ["--key", step]


def shell(client_id: str, profile: str) -> str:
    c = load(client_id)
    app = c.get("app", {})
    layout = c.get("layout") or {}
    search = layout.get("search") or {}

    store = c.get("store", "")
    if store:
        store = expand(store, profile)
        if any(ch in store for ch in "*?["):
            matches = sorted(glob.glob(store))
            store = matches[0] if matches else ""

    env = []
    for k, v in (c.get("launch_env") or {}).items():
        env += ["--env", f"{k}={expand(v, profile)}"]

    scalars = {
        "CLIENT_ID": c["id"],
        "CLIENT_NAME": c.get("name", c["id"]),
        "PROC": app.get("process", ""),
        "BUNDLE": app.get("bundle_id", ""),
        "APPNAME": app.get("app_name", ""),
        "TITLE": app.get("window_title", ""),
        "APP_PATH": expand(app["path"], profile) if app.get("path") else "",
        "VERSION_CMD": app.get("version_command", ""),
        "LAYOUT_STATUS": layout.get("status", "missing"),
        "ROW": point(layout.get("row")),
        "ROW_DY": str(layout.get("row_dy", 0)),
        "READER": rect(layout.get("reader")),
        "LIST": rect(layout.get("list")),
        "SEARCH": point(search.get("field")),
        # MailMate and others search on Return, not as you type.
        "SEARCH_SUBMIT": "\n" if search.get("submit") else "",
        "SEARCH_CLEAR": search.get("clear", "cmd+a,backspace"),
        "SEARCH_PREPARE": search.get("prepare") or "",
        "STORE": store,
        "INSTALL_TEXT": c.get("install", ""),
    }
    arrays = {
        "SEARCH_DONE": step_args(search.get("leave", "escape")),
        "SEARCH_RESET": step_args(search.get("reset")),
        "LAUNCH_ENV": env,
        "ACCOUNT_STEPS": c.get("account", []),
        "PARITY_STEPS": c.get("parity", []),
        "RESET_STEPS": c.get("reset", []),
    }

    lines = []
    for k, v in scalars.items():
        # $'…' for the one value that can hold a newline.
        if "\n" in v:
            lines.append(f"{k}=$'{v.encode('unicode_escape').decode()}'")
        else:
            lines.append(f"{k}={shlex.quote(v)}")
    for k, items in arrays.items():
        lines.append(f"{k}=(" + " ".join(shlex.quote(i) for i in items) + ")")
    return "\n".join(lines)


def main(argv: list[str]) -> int:
    if len(argv) >= 1 and argv[0] == "list":
        print("\n".join(all_ids()))
        return 0
    if len(argv) >= 2 and argv[0] == "shell":
        profile = ""
        if "--profile" in argv:
            profile = argv[argv.index("--profile") + 1]
        print(shell(argv[1], profile))
        return 0
    if len(argv) >= 3 and argv[0] == "get":
        # get <id> <dotted.path>: one field, for the odd question the shell has.
        value = load(argv[1])
        for part in argv[2].split("."):
            value = value.get(part, "") if isinstance(value, dict) else ""
        print(value if isinstance(value, str) else json.dumps(value))
        return 0
    print(__doc__, file=sys.stderr)
    return 2


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
