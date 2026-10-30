import { Link } from 'waku';

import { REPO, SITE } from '../lib/data';

const TITLE = 'Contribute — mailbench';
const DESCRIPTION = 'Add a mail client to mailbench, submit results from your hardware, or challenge a result.';

const EXAMPLE = `{
  "$schema": "../schema/client.schema.json",
  "id": "myclient",
  "name": "My Client",
  "vendor": "My Company",
  "homepage": "https://example.com",
  "platform": "macos",
  "source": "open",
  "maintainers": ["your-github-handle"],
  "vendor_maintained": true,
  "install": "\`brew install --cask myclient\`.",
  "app": {
    "path": "/Applications/My Client.app",
    "bundle_id": "com.example.myclient",
    "process": "My Client",
    "window_title": "Inbox"
  },
  "account": ["Settings ▸ Accounts ▸ Add ▸ IMAP. No encryption."],
  "parity": ["Turn on Settings ▸ Offline ▸ Download all messages."],
  "reset": ["Remove the account and quit."],
  "store": "~/Library/Application Support/My Client",
  "layout": {
    "status": "verified",
    "verified": { "version": "2.1", "os": "macOS 26.1", "date": "2026-11" },
    "row": [420, 300],
    "row_dy": 64,
    "reader": [780, 90, 590, 760],
    "list": [220, 70, 540, 800],
    "search": { "field": [1250, 20], "clear": "cmd+a,backspace", "leave": "escape" }
  },
  "caveats": []
}`;

export default async function ContributePage() {
  return (
    <>
      <title>{TITLE}</title>
      <meta name="description" content={DESCRIPTION} />
      <link rel="canonical" href={`${SITE}/contribute`} />

      <section className="mx-auto max-w-[1120px] px-5 pt-16 sm:pt-20">
        <p className="eyebrow">Contribute</p>
        <h1 className="mt-3 max-w-[48rem] text-[clamp(2rem,4.4vw,3rem)] leading-[1.05] font-bold tracking-[-0.03em]">
          The point is that we all get faster
        </h1>
        <p className="mt-5 max-w-[44rem] text-[16px] leading-relaxed text-ink-2">
          mailbench is only as useful as the clients in it and the machines it has run on. Everything happens through
          pull requests on{' '}
          <a className="link" href={REPO}>
            GitHub
          </a>
          , and everything that can be checked automatically is.
        </p>

        <div className="mt-10 grid gap-4 md:grid-cols-3">
          {[
            ['#client', 'Add a client', 'One JSON file that tells the harness where things are in its window.'],
            ['#results', 'Submit results', 'Run the harness on your Mac and send what it measured.'],
            ['#challenge', 'Challenge a result', 'Something looks wrong, or favours someone. Say so.'],
          ].map(([href, title, body]) => (
            <a key={href} href={href} className="card block p-5 transition-colors hover:border-line-strong">
              <h2 className="text-[16px] font-semibold">{title}</h2>
              <p className="mt-1.5 text-[14px] leading-relaxed text-ink-2">{body}</p>
            </a>
          ))}
        </div>

        <div className="prose mt-16">
          <h2 id="client">Add a client</h2>
          <p>
            Any macOS mail client that can be pointed at an IMAP server can be measured. You do not need to be its author
            to add it — but if you are, you are especially welcome, and you can maintain its definition from then on.
          </p>
          <ol>
            <li>
              Set up the harness and the server as in <Link to="/run">Run it yourself</Link>, and add the benchmark
              account to the client.
            </li>
            <li>
              Copy <a href={`${REPO}/blob/main/clients/_template.json`}>clients/_template.json</a> to{' '}
              <code>clients/&lt;id&gt;.json</code> and fill it in. Coordinates are window-relative points, for a 1400 × 900
              window; <code>./mailbench snapshot &lt;id&gt;</code> resizes the window to that and draws what you have, so
              you can adjust until the red box is the reader pane (or the list) and the blue crosses sit on message rows.
            </li>
            <li>
              If the client needs anything beyond clicks — an account written to a config file, an isolated profile, an
              installer — add <code>clients/&lt;id&gt;.sh</code> with hooks. See{' '}
              <a href={`${REPO}/blob/main/clients/spool.sh`}>clients/spool.sh</a> for one that uses all of them.
            </li>
            <li>
              Run it: <code>./mailbench run &lt;id&gt;</code>. Then open a pull request with the definition — and, if you
              like, the results, from <code>./mailbench submit</code>.
            </li>
          </ol>
          <p>A complete definition looks like this:</p>
          <pre>
            <code>{EXAMPLE}</code>
          </pre>
          <p>
            Every field is described in <a href={`${REPO}/blob/main/clients/README.md`}>clients/README.md</a> and checked
            against <a href={`${REPO}/blob/main/schema/client.schema.json`}>the schema</a>, which editors pick up from the{' '}
            <code>$schema</code> line.
          </p>

          <h3>The rules for a definition</h3>
          <ul>
            <li>
              <strong>Measure it as it ships.</strong> The only settings a definition may change are the ones that make
              the client hold the whole mailbox locally (<code>parity</code>), and any that give its reader the same room as
              everyone else’s. Each one is listed, and shown on the client’s page.
            </li>
            <li>
              <strong>Say what a reader needs to know.</strong> If the client searches less than the full text, keeps
              only recent mail, or does something no other client does, add a <code>caveat</code>. It appears beside the
              number it affects.
            </li>
            <li>
              <strong>Watch the pane that changes.</strong> The reader for opening a message, the list for search and
              scroll — not the whole window.
            </li>
            <li>
              <strong>Declare yourself.</strong> Set <code>vendor_maintained</code> if you work on or for the client.
            </li>
            <li>
              <strong>Your client only.</strong> Changes to another client’s definition go through an issue, or a pull
              request its maintainer reviews.
            </li>
          </ul>

          <h2 id="results">Submit results</h2>
          <p>
            New hardware is always welcome: an Intel Mac, a base M-series laptop, a 60 Hz external display and a 120 Hz
            built-in one. Follow <Link to="/run">Run it yourself</Link>, then <code>./mailbench submit</code>. It writes
            a run into <code>results/</code> with the raw output, the machine’s details and a generated summary; you add
            notes on anything unusual and open a pull request. CI checks the schema, the corpus, that no home directory
            leaked into the files, and that the summary is exactly what the raw output gives.
          </p>
          <p>A run is accepted when:</p>
          <ul>
            <li>the mailbox matched the published digest;</li>
            <li>the machine was calibrated, and every client in the run was measured on the same display;</li>
            <li>
              each client held the whole mailbox, or <code>parity</code> in <code>run.json</code> says what it held;
            </li>
            <li>it was measured with a released build of each client, not a development one;</li>
            <li>the submitter has said which clients, if any, they work on.</li>
          </ul>
          <p>
            Results are never removed for being unflattering. They can be superseded by a later run on the same machine,
            and a run with a mistake in it is corrected in the open, with the history kept.
          </p>

          <h2 id="challenge">Challenge a result</h2>
          <p>
            If a number looks wrong, a coordinate misses, a setting gives one client an advantage, or a word on this site
            leans toward anyone: <a href={`${REPO}/issues/new/choose`}>open an issue</a>. A client’s author disputing
            their own result is the most useful kind of report there is — usually it means the definition is wrong, and
            the fix makes the benchmark better for everyone.
          </p>
          <p>
            Changes to the method itself — what is measured, and how — start as an issue too, so they are discussed before
            they are made. One that changes results becomes a new version of the method, and old runs keep the version
            they were measured with.
          </p>

          <h2>The code</h2>
          <p>
            The harness is Bash, Python and Swift with no dependencies to install beyond Dovecot; the site is{' '}
            <a href="https://waku.gg">Waku</a> and reads everything from the repository at build time. Tests:{' '}
            <code>python3 -m unittest discover -s harness/tests</code>, and <code>./mailbench validate</code> for the
            data. The code is MIT-licensed; the results are CC BY 4.0, so you can quote and chart them anywhere with a
            link back.
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
