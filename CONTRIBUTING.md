# Contributing

mailbench is only as useful as the clients in it and the machines it has run
on, so contributions of both are the most valuable kind. Everything happens
through pull requests, and everything that can be checked automatically is.

## Add a client

Any macOS mail client that can be pointed at an IMAP server can be measured.
You do not need to be its author — but if you are, you are especially welcome,
and you can maintain its definition from then on.

1. Set up the harness and server ([mailben.ch/run](https://mailben.ch/run)) and
   add the benchmark account to the client: `127.0.0.1`, port `10143`, no
   encryption, `bench@example.com` / `bench`.
2. Copy [`clients/_template.json`](clients/_template.json) to
   `clients/<id>.json` and fill it in. [`clients/README.md`](clients/README.md)
   describes every field and how to find the coordinates.
3. `./mailbench snapshot <id>` until the red rectangle is the pane that changes
   and the blue crosses sit on message rows.
4. `./mailbench run <id>`, then open a pull request with the definition and,
   if you like, the results from `./mailbench submit`.

### The rules for a definition

- **Measure it as it ships.** A definition may change only the settings that
  make the client hold the whole mailbox locally (`parity`), and any that give
  its reader the same room as every other client's. Each is listed in the
  definition and shown on the site.
- **Say what a reader needs to know.** If the client searches less than the
  full text, keeps only recent mail, or does something no other client does,
  add a `caveat`. It appears beside the number it affects.
- **Watch the pane that changes:** the reader for opening a message, the list
  for search and scroll — never the whole window.
- **Declare yourself.** Set `vendor_maintained` if you work on or for the client.
- **Your client only.** A change to someone else's client goes through an
  issue, or a pull request its maintainers review.

## Submit results

New hardware is always welcome. Run the harness
([mailben.ch/run](https://mailben.ch/run)), then:

```
./mailbench submit
```

It copies this machine's current results into `results/<run>/raw/` with home
directory paths removed, writes `run.json` from the session lines, and
generates `summary.json`. Read `run.json` before committing: if a client did not
hold the whole mailbox, say what it held under `parity`, and put anything else
a reader should know under `notes`. **Never edit `summary.json`** — CI
regenerates it from `raw/` and fails if it differs.

A run is accepted when:

- the mailbox matched the published digest (`corpus.verified`);
- the machine was calibrated, and every client was measured on the same display;
- each client held the whole mailbox, or `parity` says what it held;
- it was measured with released builds, not development ones;
- the submitter has said which clients, if any, they work on (`affiliations`).

Being a client's author does not disqualify a result. It is shown with it.

Results are never removed for being unflattering. A run can be superseded by a
later one on the same machine, and a mistake is corrected in the open, with the
history kept.

## Challenge a result

If a number looks wrong, a coordinate misses, a setting gives one client an
advantage, or a word on the site leans toward anyone,
[open an issue](https://github.com/wes/mailbench/issues/new/choose). A client's
author disputing their own result is the most useful report there is: usually
it means the definition is wrong, and the fix improves the benchmark for
everyone.

## Change the method

What is measured, and how, changes only after an issue discussing it. A change
that alters results is a new version of the method — a new `CORPUS_VERSION`, a
new metric — and old runs keep the version they were measured with. In
particular:

- Changing a byte of the generator's output is a new corpus. Bump
  `CORPUS_VERSION` in `harness/generate_corpus.py`, regenerate both corpora,
  and update the digests in `harness/corpus.json` and the pinned digest in
  `harness/tests/test_harness.py`. The test exists to make this impossible to
  do by accident.
- A metric is defined once, in `schema/metrics.json`, which the summarizer and
  the site both read.

## Working on the code

- The harness is Bash (`harness/run.sh`, compatible with macOS's Bash 3.2),
  Python 3.9+ with no third-party packages, and Swift. Keep it that way: every
  dependency is one more thing that differs between two people's runs.
- `python3 -m unittest discover -s harness/tests` and `./mailbench validate`
  must pass. CI runs both, and builds the site.
- The site is [Waku](https://waku.gg) with Tailwind. `npm run dev` serves it;
  it reads `clients/`, `results/` and `schema/metrics.json` at build time.
  Charts use one accent for the best result and one gray for everything else:
  no client gets a colour of its own.
