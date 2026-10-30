import type { ReactNode } from 'react';
import { Link } from 'waku';

import { REPO, SITE } from '../lib/data';

const TITLE = 'Run it yourself — mailbench';
const DESCRIPTION = 'Run the mailbench harness on your own Mac, measure the clients you have, and submit the results.';

type Step = { title: string; body: ReactNode; code?: string };

const STEPS: Step[] = [
  {
    title: 'Get the harness',
    body: (
      <>
        A Mac with Xcode’s command line tools (for <code>swiftc</code>), Python 3.9 or later, and Homebrew. The
        instrument is built on your machine the first time it runs: a binary built on another machine’s macOS would be
        the instrument from a different experiment.
      </>
    ),
    code: `git clone ${REPO}.git
cd mailbench
xcode-select --install     # if swiftc is missing
brew install dovecot
./mailbench doctor         # what this machine has and is missing`,
  },
  {
    title: 'Generate the mailbox and start the server',
    body: (
      <>
        About ten seconds for 50,000 messages. It lands in <code>~/mailbench/maildir-50k</code>, and the server checks
        it against the published digest every time it starts. For the larger mailbox, prefix both commands with{' '}
        <code>CORPUS=250k</code>; it runs beside the first, on port 10144.
      </>
    ),
    code: `./mailbench corpus 50k
./mailbench server start   # Dovecot on 127.0.0.1:10143, warmed, behind the meter`,
  },
  {
    title: 'Grant the permissions, then calibrate',
    body: (
      <>
        The instrument needs <strong>Screen Recording</strong> (to watch windows) and <strong>Accessibility</strong> (to
        post clicks and keys), granted to the terminal you run it from. Calibration measures the instrument’s own
        overhead on this machine and display; results without it say so.
      </>
    ),
    code: `./mailbench permissions    # opens both panes in System Settings
./mailbench calibrate      # about a minute; a window flips colour on its own`,
  },
  {
    title: 'Add the account to each client',
    body: (
      <>
        Server <code>127.0.0.1</code>, port <code>10143</code>, no encryption, user <code>bench@example.com</code>,
        password <code>bench</code>. Each client’s page lists what else it needs — above all, the settings that make it
        keep the whole mailbox locally. Let every client finish syncing before measuring it.
      </>
    ),
    code: `./mailbench clients            # which are installed, and which are ready
./mailbench account applemail  # adds it for you where the client allows; prints the steps where not`,
  },
  {
    title: 'Check where the clicks land',
    body: (
      <>
        Coordinates are per client and per version, and a click two pixels off a row measures nothing. The snapshot
        outlines the watched rectangle in red and marks every click in blue. If they are wrong, fix the client’s JSON —
        and send the fix.
      </>
    ),
    code: `./mailbench snapshot mailmate`,
  },
  {
    title: 'Measure',
    body: (
      <>
        One client at a time, with every other mail client quit and nothing else moving on screen. Each takes a few
        minutes and ends by quitting and relaunching it. Plug the Mac in, and don’t touch the mouse.
      </>
    ),
    code: `./mailbench run mailmate
./mailbench run thunderbird
./mailbench report             # every client on this machine, in one table`,
  },
  {
    title: 'First sync (optional)',
    body: (
      <>
        Timed at the server: empty the client’s store, follow the prompt, and the meter times the download from its
        first busy second to its last. It also reports what share of the mailbox the client downloaded.
      </>
    ),
    code: `./mailbench sync thunderbird`,
  },
  {
    title: 'Submit',
    body: (
      <>
        <code>submit</code> copies this machine’s current results into <code>results/</code>, removes your home
        directory from every path, writes the machine’s details, and generates the summary the site shows. It asks for
        your GitHub handle and whether you work on any of the clients measured — answered either way, and shown with the
        run.
      </>
    ),
    code: `./mailbench submit
git checkout -b results/my-mac
git add results && git commit -m "Results: <machine>, 50k"
gh pr create --fill`,
  },
];

export default async function RunPage() {
  return (
    <>
      <title>{TITLE}</title>
      <meta name="description" content={DESCRIPTION} />
      <link rel="canonical" href={`${SITE}/run`} />

      <section className="mx-auto max-w-[1120px] px-5 pt-16 sm:pt-20">
        <p className="eyebrow">Run it yourself</p>
        <h1 className="mt-3 max-w-[48rem] text-[clamp(2rem,4.4vw,3rem)] leading-[1.05] font-bold tracking-[-0.03em]">
          Your Mac, your clients, the same instrument
        </h1>
        <p className="mt-5 max-w-[44rem] text-[16px] leading-relaxed text-ink-2">
          An afternoon of setup, most of it adding an account to each client and waiting for it to sync. After that,
          each client is one command. Everything stays on your machine until you open a pull request.
        </p>
        <p className="mt-3 max-w-[44rem] text-[14px] leading-relaxed text-muted">
          The harness clicks, types and scrolls in real windows. It never touches your own mail — the benchmark account
          is a separate account on a local server — but run it on a Mac you can leave alone for a while.
        </p>

        <ol className="mt-12 grid max-w-[52rem] gap-10">
          {STEPS.map((step, i) => (
            <li key={step.title} className="grid grid-cols-[2.25rem_1fr] gap-x-4">
              <span className="num mt-0.5 flex h-7 w-7 items-center justify-center rounded-full border border-line-strong font-mono text-[13px] text-ink-2">
                {i + 1}
              </span>
              <div className="prose min-w-0">
                <h2 className="!mt-0 !text-[1.1rem]">{step.title}</h2>
                <p>{step.body}</p>
                {step.code && (
                  <pre>
                    <code>{step.code}</code>
                  </pre>
                )}
              </div>
            </li>
          ))}
        </ol>

        <div className="prose mt-16">
          <h2>Comparing two builds of your own client</h2>
          <p>
            The same harness answers “did this change make it faster?”. <code>APP</code> measures a particular bundle and{' '}
            <code>TAG</code> keeps its results apart, so the report puts them side by side:
          </p>
          <pre>
            <code>{`TAG=before APP=~/builds/Before.app ./mailbench run myclient
TAG=after  APP=~/builds/After.app  ./mailbench run myclient
./mailbench report`}</code>
          </pre>
          <p>Tagged results are for you; submit the released build.</p>

          <h2>Over SSH</h2>
          <p>
            Nothing started over SSH can capture the screen or post input, so the commands that need either re-run themselves
            in Terminal on the Mac’s own display, with the display held awake, and stream their output back. Unlock the Mac
            first: a locked screen captures black, and the instrument refuses to run on one.
          </p>

          <h2>When something looks wrong</h2>
          <ul>
            <li>
              <strong>A test reports timeouts</strong> (“14/20 runs”): a click missed its row, or the watched rectangle is
              not where the change happens. Run <code>snapshot</code> and look.
            </li>
            <li>
              <strong>“2 windows match”</strong>: the client has a second window open. Close it, or narrow the client’s{' '}
              <code>window_title</code>.
            </li>
            <li>
              <strong>The corpus is not the published one</strong>: regenerate it. A client that deleted or moved a
              message changes the mailbox for every client after it.
            </li>
          </ul>
          <p>
            Stuck? <a href={`${REPO}/issues/new/choose`}>Open an issue</a> with the output of{' '}
            <code>./mailbench doctor</code>. Adding a client that is not here yet is <Link to="/contribute">its own guide</Link>.
          </p>
        </div>
      </section>
    </>
  );
}

export const getConfig = async () => {
  return {
    render: 'static',
  } as const;
};
