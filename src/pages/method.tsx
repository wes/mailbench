import { Link } from 'waku';

import { REPO, SITE } from '../lib/data';

const TITLE = 'Method — mailbench';
const DESCRIPTION =
  'How mailbench measures mail clients: one generated mailbox, a local IMAP server, and an instrument that times the screen from the outside.';

const CONTENTS = [
  ['principle', 'The principle'],
  ['trap', 'Numbers that cannot be compared'],
  ['mailbox', 'The mailbox'],
  ['server', 'The server'],
  ['instrument', 'The instrument'],
  ['calibration', 'Calibration'],
  ['tests', 'The tests'],
  ['sync', 'First sync'],
  ['parity', 'Every client does the whole job'],
  ['publishing', 'How a result is published'],
  ['limits', 'What it cannot tell you'],
] as const;

export default async function MethodPage() {
  return (
    <>
      <title>{TITLE}</title>
      <meta name="description" content={DESCRIPTION} />
      <link rel="canonical" href={`${SITE}/method`} />

      <div className="mx-auto grid max-w-[1120px] gap-12 px-5 pt-16 sm:pt-20 lg:grid-cols-[13rem_1fr]">
        <nav aria-label="On this page" className="hidden lg:block">
          <div className="sticky top-24">
            <p className="eyebrow">On this page</p>
            <ol className="mt-3 grid gap-1.5 text-[13.5px]">
              {CONTENTS.map(([id, label]) => (
                <li key={id}>
                  <a href={`#${id}`} className="text-ink-2 hover:text-ink">
                    {label}
                  </a>
                </li>
              ))}
            </ol>
          </div>
        </nav>

        <article>
          <p className="eyebrow">Method</p>
          <h1 className="mt-3 text-[clamp(2rem,4.4vw,3rem)] leading-[1.05] font-bold tracking-[-0.03em]">
            One mailbox, one machine, one instrument
          </h1>
          <div className="prose mt-6">
            <p className="text-[1.1rem] leading-relaxed">
              Every client is measured on the same generated mailbox, served from the same Mac, by a tool that knows
              nothing about the app under test: it posts a real click or keypress and watches the window until it stops
              changing. Everything below is in{' '}
              <a href={`${REPO}/tree/main/harness`}>harness/</a>, and anyone with a Mac can run it.
            </p>

            <h2 id="principle">The principle</h2>
            <p>
              A comparison is only fair if every number in it was taken the same way. So nothing here asks a client how
              fast it is. The instrument measures what a person waits for — the time between their hand and the pixels
              — from outside the app, identically for every client. It needs no hooks, no cooperation and no source
              code, which is the only way to put an open-source client and a closed one, or an AppKit app and an
              Electron one, in the same table.
            </p>
            <p>
              Those numbers are in milliseconds, not microseconds, because they include the input stack, the window
              server and the display. That is not noise to subtract. It is the part a person actually experiences.
            </p>

            <h2 id="trap">Numbers that cannot be compared</h2>
            <p>
              Mail clients publish their own numbers: a frame built in 85 µs, a search in 15 ms, 29,000 messages
              ingested a second. Those are real, and they cannot go in a comparison. They are an app timing its own
              work from the inside — a render pass, a query against its own index, a write straight into its own store
              — and nothing like them can be taken out of another client. Putting one beside a number that{' '}
              <em>was</em> taken from the outside would be dishonest in that app’s favour, whichever app it is.
            </p>
            <p>
              So mailbench publishes only external measurements, taken the same way for every client, including the
              client of whoever ran them.
            </p>

            <h2 id="mailbox">The mailbox</h2>
            <p>
              <code>harness/generate_corpus.py</code> writes a Maildir of invented mail: threads, mailing lists, plain
              text, and HTML in the three shapes it usually arrives in — a receipt, a newsletter, a rich-text reply. A
              third of messages are <code>multipart/related</code> with an inline image every client has to decode. One
              account, seven folders weighted as a working inbox is: Inbox 60%, Sent 15%, Archive 15%, Lists/rust 5%,
              Junk 3%, Trash 2%, and an empty Drafts.
            </p>
            <p>
              It is the same bytes on every machine. Given a size, the generator’s output is fixed — every message,
              every file name, every date — and checked against digests published in{' '}
              <a href={`${REPO}/blob/main/harness/corpus.json`}>harness/corpus.json</a> when the server starts. Every
              result records which mailbox it was measured on and whether it matched. Two sizes are published: 50,000
              messages (about 51 MB) and 250,000 (about 255 MB, 150,000 of them in the inbox). The first 50,000
              messages of the larger are the smaller.
            </p>
            <p>
              Twelve percent of messages name an attachment in a header but carry no payload. Real attachments at this
              count would be tens of gigabytes and would make this a test of disk throughput.
            </p>

            <h2 id="server">The server</h2>
            <p>
              Dovecot, run natively from Homebrew on the same Mac as the clients, on <code>127.0.0.1:10143</code> (and{' '}
              <code>10144</code> for the larger mailbox): plain IMAP, one user, one password. Nobody is helped or hurt by
              a network, because there is none. Native rather than in a container, because Docker on a Mac is a Linux
              VM, and serving a quarter of a million small files across its file sharing would put a hypervisor
              between every client and every message.
            </p>
            <p>
              The server is warmed when it starts. Dovecot builds its indexes on first access, and whichever client
              connected first would otherwise pay for that and have it reported as its own slowness. Starting the
              server reads every header once, which builds the indexes and pulls the whole mailbox into the page cache.
            </p>

            <h2 id="instrument">The instrument</h2>
            <p>
              <code>harness/measure.swift</code> posts a synthetic event with <code>CGEventPost</code>, captures the
              client’s window with ScreenCaptureKit, hashes every pixel of a watched rectangle in every frame, and
              reports two times per run:
            </p>
            <ul>
              <li>
                <strong>first</strong> — the first frame in which the rectangle differs from before the event.
                Something happened.
              </li>
              <li>
                <strong>settle</strong> — the frame after which the rectangle stays the same. It finished happening.
              </li>
            </ul>
            <p>
              The published number is <strong>settle</strong>. Quoting only <em>first</em> would let a client that
              paints a spinner in one frame and the message a second later look fast, which is a way of lying with a
              true number. Both are in the raw output and the tables.
            </p>
            <p>
              The rectangle matters more than anything else. To time opening a message, the instrument watches the
              reader pane, not the whole window — the whole window would catch the row highlight, which every client
              paints at once and which is not what anyone is waiting for. Each client’s rectangles are in its{' '}
              <Link to="/clients">definition</Link>, and <code>./mailbench snapshot</code> draws them on a screenshot so
              anyone can check them.
            </p>
            <p>A few details exist because the obvious version measured nothing:</p>
            <ul>
              <li>
                Clicks alternate between two rows. Clicking an already-selected row repaints nothing, and the run
                burns its whole timeout.
              </li>
              <li>
                Each search run empties the field and lets the full list come back before its baseline, so every run
                types the same query into the same empty field.
              </li>
              <li>
                A scroll moves the pointer into the list first, because a scroll goes to whatever is under the pointer.
              </li>
              <li>
                It refuses to guess which window it is looking at. Two matching windows is an error, because silently
                picking one is how a run ends up timing the wrong window and reporting plausible nonsense.
              </li>
              <li>A locked screen captures black and takes no input, so it refuses to run on one.</li>
            </ul>
            <p>
              Every client gets the same window: 1400 × 900 points at the same position. A taller window shows more rows,
              and rows are what makes a frame cost more.
            </p>

            <h2 id="calibration">Calibration</h2>
            <p>
              An instrument nobody has checked against a known interval reports whatever its bugs produce.{' '}
              <code>harness/calibrate.swift</code> is a window that changes colour a known number of milliseconds after
              it is clicked, and reports what it actually did (macOS coalesces timers, and a target that fires late
              would otherwise read as a slow instrument). Measured at 50, 200 and 800 ms, the instrument adds a roughly
              constant overhead — around 20 ms on a 120 Hz display, nearer 28 ms at 60 Hz — flat across the range rather
              than proportional.
            </p>
            <p>What that means for reading the results:</p>
            <ul>
              <li>
                <strong>Differences between clients are real.</strong> The overhead is the same for every client on a
                machine, so it cancels in a comparison.
              </li>
              <li>
                <strong>Absolute floors are not.</strong> Anything within a frame or two of the overhead is at the
                instrument’s floor; the honest phrasing is “within a frame of the click”.
              </li>
              <li>
                <strong>Raw numbers are published.</strong> The overhead is stated beside them rather than subtracted,
                so anyone can reproduce what is printed.
              </li>
              <li>
                <strong>The display is the resolution.</strong> Nothing can be seen more often than the display
                refreshes: every 16.7 ms at 60 Hz, 8.3 ms at 120 Hz. So results within one frame of the fastest are
                shown as a tie, and numbers from displays of different rates never share a table.
              </li>
            </ul>
            <p>Every machine is calibrated before its results are published, and its calibration is published with them.</p>

            <h2 id="tests">The tests</h2>
            <p>
              Each client is measured on its own, the only mail client running, after it has fully synced the mailbox
              and finished checking the server on launch, showing the inbox newest first. In order:
            </p>
            <table>
              <thead>
                <tr>
                  <th>Test</th>
                  <th>What happens</th>
                  <th>Watched</th>
                  <th>Runs</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>Open a message</td>
                  <td>Click a message row (alternating between two)</td>
                  <td>The reader</td>
                  <td>20</td>
                </tr>
                <tr>
                  <td>Next message</td>
                  <td>Press ↓</td>
                  <td>The reader</td>
                  <td>20</td>
                </tr>
                <tr>
                  <td>Scroll</td>
                  <td>Thirty notches of the wheel, 8 ms apart</td>
                  <td>The list</td>
                  <td>10</td>
                </tr>
                <tr>
                  <td>Search</td>
                  <td>
                    Type <code>postmortem</code> into an empty search field, 8 ms a key
                  </td>
                  <td>The list</td>
                  <td>20</td>
                </tr>
                <tr>
                  <td>Memory</td>
                  <td>Physical footprint, with the helpers macOS charges to the app</td>
                  <td>—</td>
                  <td>1</td>
                </tr>
                <tr>
                  <td>Idle CPU</td>
                  <td>CPU time over ten seconds of nothing</td>
                  <td>—</td>
                  <td>1</td>
                </tr>
                <tr>
                  <td>Launch</td>
                  <td>Open the app through Launch Services until the list is still for 1.5 s</td>
                  <td>The list</td>
                  <td>5 (+1)</td>
                </tr>
                <tr>
                  <td>Quit</td>
                  <td>The Quit command, until the process has exited</td>
                  <td>The process</td>
                  <td>5 (+1)</td>
                </tr>
              </tbody>
            </table>
            <p>
              Every number is a <strong>median</strong>: one run in twenty catches a background sync or a Spotlight
              wake-up, and a mean would let that one run set the number for the other nineteen. A run that saw no change
              timed out, and the tables say how many did.
            </p>
            <p>
              <strong>Launch is warm.</strong> The app has run before and macOS has its files cached, as it does for an
              app used every day. The first launch of each set reads from disk and is not counted.{' '}
              <strong>Memory</strong> is physical footprint, the number Activity Monitor shows, not RSS — RSS counts
              shared framework pages, and a system app maps so many that its RSS once read 1.1 GB against a footprint of
              140 MB. It includes the WebKit, GPU and networking processes macOS holds the app responsible for, which is
              why every client is started through Launch Services, the way the Dock starts it: started from a shell,
              those processes would be charged to the terminal.
            </p>
            <p>
              <strong>Search is not engine against engine.</strong> One client asks Spotlight, another has its own index,
              another filters the list it already has. Measuring “how long until I see results” is a fair comparison of
              what a person waits for, and not a comparison of search engines. Where a client searches less than the
              full text, its search result says so.
            </p>

            <h2 id="sync">First sync</h2>
            <p>
              How long a client takes to download the whole mailbox into an empty store is measured at the server, not by
              asking the client. A small proxy, <code>harness/imap_meter.py</code>, sits in front of Dovecot and counts
              every byte it passes, second by second. A sync runs from the first second that moves more than 16 KB to
              the last, followed by 30 quiet seconds. That is the same instrument for every client, and it also reports
              how much of the mailbox the client downloaded — which is the parity check the screen cannot make.
            </p>
            <p>
              What it does not see is work a client does after the last byte arrives, such as building a search index.
              The number is “downloaded”, not “ready”, and is published as that. A first sync measured any other way —
              by a client counting its own rows, say — is listed, and is not charted against anything.
            </p>

            <h2 id="parity">Every client does the whole job</h2>
            <p>
              Several clients can be set to fetch headers and leave bodies on the server, which makes them fast at
              everything except the thing being measured. Every client is set to keep the whole mailbox locally, and its
              definition lists the settings that takes. Otherwise every client is measured as it ships.
            </p>
            <p>
              Where a client cannot hold the whole mailbox — by design, some keep only recent mail — it is still
              measured, and its numbers are marked ◐ wherever they appear, next to the numbers rather than in a
              footnote, because it is doing a smaller job than everyone else.
            </p>
            <p>
              A client that cannot be pointed at an IMAP server at all, because it only talks to one provider’s API or
              syncs through its vendor’s servers, cannot be in a like-for-like comparison. That is the finding, and it
              is stated as one.
            </p>

            <h2 id="publishing">How a result is published</h2>
            <ul>
              <li>
                The harness writes raw output — every run, every summary, the machine, the display, the mailbox’s digest
                — as JSON lines. <code>./mailbench submit</code> copies it into{' '}
                <a href={`${REPO}/tree/main/results`}>results/</a> and generates <code>summary.json</code> from it.
              </li>
              <li>
                On every pull request, CI regenerates every summary from its raw output and fails if a single number
                differs. No number on this site can be edited by hand, including by the people who run the site.
              </li>
              <li>
                Every run states who submitted it, and which clients, if any, they work on or for. Being a client’s
                author does not disqualify a result — most will come from people who build mail clients — but a reader
                deserves to know.
              </li>
              <li>
                Numbers from different runs are never put in one chart. Within a run, results closer together than the
                instrument can resolve are shown as a tie.
              </li>
              <li>
                Clients are listed alphabetically wherever order is not a ranking, and no client has a colour of its
                own.
              </li>
            </ul>

            <h2 id="limits">What it cannot tell you</h2>
            <ul>
              <li>
                <strong>It is one mailbox.</strong> Invented mail, with simple HTML and no real attachments. A client
                that is fast here and slow on your newsletters is possible.
              </li>
              <li>
                <strong>It is macOS only,</strong> for now. The instrument is built on ScreenCaptureKit. The method is
                not Mac-specific, and an instrument for another platform would be welcome.
              </li>
              <li>
                <strong>It is a local server.</strong> No network latency, no provider throttling, no OAuth. That is what
                makes it fair, and it is not what using mail is like.
              </li>
              <li>
                <strong>It measures speed and footprint, not quality.</strong> Nothing here says whether a client is
                good to use.
              </li>
              <li>
                <strong>Results from one machine are not results from another.</strong> Which is why there is a{' '}
                <Link to="/run">way to run it on yours</Link>.
              </li>
            </ul>
            <p>
              Disagree with any of this?{' '}
              <a href={`${REPO}/issues/new?template=method.yml`}>Propose a change to the method</a>. Changes to what is
              measured are discussed in the open before they are made, and a change that alters results is a new
              version of the method, not an edit to the old one.
            </p>
          </div>
        </article>
      </div>
    </>
  );
}

export const getConfig = async () => {
  return {
    render: 'static',
  } as const;
};
