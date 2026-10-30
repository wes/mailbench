# mailbench

**An open benchmark for email clients.** One mailbox, one machine, one
instrument that watches the screen: the time from a click or a keypress until
the pixels stop changing, measured identically for every client.

Results: **[mailben.ch](https://mailben.ch)**

This repository is the whole thing — the harness that measures, the mailbox it
measures on, every client's definition, every raw result, and the site that
shows them. Anyone with a Mac can run it, and the point is that client authors
do: add your client, run it on your hardware, send a pull request.

```
git clone https://github.com/wes/mailbench.git && cd mailbench
brew install dovecot
./mailbench doctor              # what this machine has and is missing
./mailbench corpus 50k          # the mailbox: 50,000 messages, the same bytes everywhere
./mailbench server start        # Dovecot on 127.0.0.1:10143, warmed
./mailbench permissions         # Screen Recording + Accessibility, once
./mailbench calibrate           # the instrument's own overhead on this machine
./mailbench account mailmate    # add the benchmark account (or it tells you how)
./mailbench snapshot mailmate   # check where the clicks land
./mailbench run mailmate        # measure
./mailbench report              # every client on this machine, in one table
./mailbench submit              # into results/, ready for a pull request
```

The full walkthrough is at [mailben.ch/run](https://mailben.ch/run), and the
method — what is measured, how, and what it cannot tell you — at
[mailben.ch/method](https://mailben.ch/method).

## Who runs this

mailbench started as the benchmark harness for [Spool](https://joedesigns.com/spool),
a mail client written by [@wes](https://github.com/wes). That is a conflict of
interest, and the project is built so that it should not matter:

- The instrument treats every client identically and from the outside. It
  knows nothing about any app, and Spool's definition is a JSON file like
  every other client's.
- The mailbox is byte-identical on every machine and checked against a
  published digest before anything is measured.
- Every number on the site is generated from the instrument's raw output,
  which is committed beside it. CI regenerates every summary on every pull
  request and fails if a single number differs, so no one can edit one by hand.
- Every run says who submitted it and which clients they work on.
- Results closer together than the instrument can resolve are shown as ties,
  no client has a colour of its own, and caveats sit next to the numbers they
  affect.

If you find anything that favours one client, that is a bug.
[Open an issue](https://github.com/wes/mailbench/issues/new/choose).

## What's here

| | |
|---|---|
| [`mailbench`](mailbench) | The command line for everything below. `./mailbench help` |
| [`harness/`](harness) | The instrument (`measure.swift`), its calibration target, the corpus generator, the Dovecot setup, the IMAP meter, and the scripts that summarize, validate and submit results |
| [`clients/`](clients) | One JSON file per client: its window, where the list, reader and search field are, and what it takes to hold the whole mailbox. Optional `<id>.sh` hooks |
| [`results/`](results) | One directory per run: `run.json` (machine, mailbox, submitter), `raw/` (the instrument's output), `summary.json` (generated) |
| [`schema/`](schema) | JSON Schemas for clients and runs, and `metrics.json`, which defines every metric for the harness and the site alike |
| `src/` | The site at mailben.ch: [Waku](https://waku.gg), static, reading everything above at build time |

## Developing

The harness needs macOS, Python 3.9+, `swiftc` and Homebrew's Dovecot, and
nothing else — no pip, no npm. The site needs Node 22.

```
python3 -m unittest discover -s harness/tests   # corpus, client loading, summaries, the meter
./mailbench validate                            # every client and run, and every summary against its raw output
npm install && npm run dev                      # the site, on localhost:3000
npm run build                                   # the static site, into dist/public
```

The site deploys as a static nginx image: the [`Dockerfile`](Dockerfile)
validates the data, builds the site and serves `dist/public` with
[`deploy/nginx.conf`](deploy/nginx.conf). A deploy that would publish a
summary its raw output does not support fails to build.

See [CONTRIBUTING.md](CONTRIBUTING.md) for adding a client, submitting results
and proposing changes to the method.

## Licence

Code: [MIT](LICENSE). Results in `results/`:
[CC BY 4.0](https://creativecommons.org/licenses/by/4.0/) — quote and chart
them anywhere, with a link back to mailben.ch.
