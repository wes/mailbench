# Results

One directory per run — one machine, one mailbox, the clients measured on it.

```
results/<date>-<machine>-<cpu>-<corpus>/
  run.json        who, what machine, which mailbox, notes, parity
  raw/            the instrument's output, as the harness wrote it
    <client>.jsonl
    calibration.jsonl
  summary.json    the published numbers, generated from raw/
```

`./mailbench submit` writes all three. `run.json` is checked against
[`../schema/run.schema.json`](../schema/run.schema.json); add `notes` and
`parity` by hand. **`summary.json` is never edited**: CI regenerates every one
from its `raw/` and fails if a single number differs.

## Reading raw output

Each `<client>.jsonl` is JSON lines. A `session` line says who and what:

```json
{"event":"session","client":"mailmate","version":"1.14","machine":"apple-m1-max","model":"MacBookPro18,2",
 "os":"26.6.2","display":"3024 x 1964 @ 120.00Hz","window":"1400x900","runs":20,"search_term":"postmortem",
 "harness":"abc1234","corpus_name":"50k","corpus":{"version":"mailbench-v1","digest":"sha256:…","verified":true},…}
```

then the instrument's own lines: a `window` line (where the window was, and the
display's refresh rate), one `run` per run with `first_ms` and `settle_ms`, a
`summary` per test with medians, a `static` line for memory, idle CPU and disk,
and `launch` lines for launch and quit. A first sync adds a `sync` line from
the meter. A file can hold several sessions; the current one is the latest,
plus earlier sessions of the same version.

## Imported runs

The first two runs here were measured before this repository existed and
published on Spool's benchmark page. Their `summary.json` is transcribed from
that page and their raw output has not been added yet, so they are marked
`"kind": "imported"` and say so wherever they are shown. They are the only runs
CI cannot regenerate, and no new run may be added that way.

## Licence

Everything in this directory is
[CC BY 4.0](https://creativecommons.org/licenses/by/4.0/): quote and chart it
anywhere, with a link back to [mailben.ch](https://mailben.ch).
