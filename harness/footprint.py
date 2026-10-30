#!/usr/bin/env python3
"""A mail client's memory, the way Activity Monitor counts it.

    python3 harness/footprint.py <pid>

Prints one JSON object: the main process's physical footprint, and the same
for every process macOS holds it responsible for — the WebKit content, GPU and
networking processes that render HTML mail — with the total.

Physical footprint rather than RSS. RSS counts shared framework pages and
memory the allocator has freed but not yet handed back; a system app like Mail
maps so much of the former that its RSS read 1.1 GB while Activity Monitor said
140 MB. Footprint is the number the system charges the process for.

The helpers are found by responsibility, not by parentage: WebKit's processes
are launched by launchd, but macOS records which app they work for. That
record is only right when the app was itself launched by Launch Services —
started from a shell, its helpers are charged to the terminal — so run.sh
starts every client with `open`, without exception.
"""

from __future__ import annotations

import ctypes
import json
import re
import subprocess
import sys


def footprint_bytes(pid: int) -> int | None:
    out = subprocess.run(
        ["footprint", "-f", "bytes", "-p", str(pid)], capture_output=True, text=True
    ).stdout
    m = re.search(r"Footprint: (\d+) B", out)
    return int(m.group(1)) if m else None


def helpers(pid: int) -> list[tuple[int, str]]:
    libsystem = ctypes.CDLL("/usr/lib/libSystem.B.dylib")
    responsible = libsystem.responsibility_get_pid_responsible_for_pid
    responsible.argtypes = [ctypes.c_int]
    responsible.restype = ctypes.c_int
    listing = subprocess.run(["ps", "-axo", "pid=,comm="], capture_output=True, text=True).stdout
    found = []
    for line in listing.strip().splitlines():
        other, command = line.split(None, 1)
        other = int(other)
        if other != pid and responsible(other) == pid:
            found.append((other, command.rsplit("/", 1)[-1]))
    return found


def main() -> int:
    if len(sys.argv) != 2:
        print(__doc__, file=sys.stderr)
        return 2
    pid = int(sys.argv[1])
    main_bytes = footprint_bytes(pid)
    if main_bytes is None:
        print(json.dumps({"error": f"no footprint for pid {pid}"}))
        return 1
    parts = []
    for other, name in helpers(pid):
        size = footprint_bytes(other)
        if size is not None:
            parts.append({"pid": other, "name": name, "kb": size // 1024})
    total = main_bytes + sum(p["kb"] * 1024 for p in parts)
    print(json.dumps({"main_kb": main_bytes // 1024, "total_kb": total // 1024, "helpers": parts}))
    return 0


if __name__ == "__main__":
    sys.exit(main())
