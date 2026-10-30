import { Link } from 'waku';

import { CorpusSwitch } from '../components/corpus-switch';
import { MetricGrid, ParityNotice, RunFacts } from '../components/run-parts';
import { CLIENTS, REPO, RUNS, SITE, latestByCorpus, messages } from '../lib/data';

const TITLE = 'mailbench — mail clients, measured the same way';
const DESCRIPTION =
  'An open benchmark for email clients. One mailbox, one machine, one instrument that watches the screen — and the harness, the mailbox and every raw result are public.';

const PRINCIPLES = [
  {
    title: 'The same mailbox, byte for byte',
    body: 'A generated mailbox of 50,000 or 250,000 messages, identical on every machine that generates it and checked against a published digest. Served by Dovecot on the same Mac, so no client is helped or hurt by a network.',
  },
  {
    title: 'Measured from outside',
    body: 'A small tool posts a real click or keypress and watches the window through ScreenCaptureKit. It needs nothing from the app under test, which is the only way to put different apps in one table.',
  },
  {
    title: 'Finished, not started',
    body: 'Each time runs from the event until the window stops changing. An app that paints a spinner quickly and the message slowly gets the slow number.',
  },
  {
    title: 'A frame is the resolution',
    body: 'The screen is read once a frame, so results within one frame of the fastest are a tie, and are shown as one. The instrument’s own overhead is measured on every machine and published beside its results.',
  },
  {
    title: 'Every client does the whole job',
    body: 'Each one is set to keep the full mailbox locally. Where a client cannot, its numbers are marked, next to the numbers, as a smaller job than everyone else’s.',
  },
  {
    title: 'Numbers nobody can edit',
    body: 'The published numbers are generated from the instrument’s raw output, which is committed with them. CI regenerates them on every change and fails if one differs.',
  },
] as const;

export default async function HomePage() {
  const latest = latestByCorpus();
  const measured = new Set(RUNS.flatMap((r) => r.summary.clients.map((c) => c.id)));

  return (
    <>
      <title>{TITLE}</title>
      <meta name="description" content={DESCRIPTION} />
      <meta property="og:title" content={TITLE} />
      <meta property="og:description" content={DESCRIPTION} />
      <meta property="og:url" content={SITE} />
      <link rel="canonical" href={SITE} />

      <section className="mx-auto max-w-[1120px] px-5 pt-16 pb-6 sm:pt-24">
        <p className="eyebrow">An open benchmark for email clients</p>
        <h1 className="mt-4 max-w-[52rem] text-[clamp(2.3rem,5.4vw,3.9rem)] leading-[1.03] font-bold tracking-[-0.035em] text-ink">
          Mail clients, measured the same way.
        </h1>
        <p className="mt-6 max-w-[44rem] text-[clamp(1.05rem,1.6vw,1.2rem)] leading-relaxed text-ink-2">
          One mailbox, one machine, one instrument that watches the screen — the time from a click or a keypress until
          the pixels stop changing. The harness, the mailbox and every raw result are on GitHub. Run it on your Mac,
          add your client, send a pull request.
        </p>
        <div className="mt-8 flex flex-wrap gap-3">
          <Link
            to="/results"
            className="rounded-full bg-ink px-5 py-2.5 text-[14.5px] font-medium text-page transition-opacity hover:opacity-85"
          >
            All results
          </Link>
          <Link
            to="/run"
            className="rounded-full border border-line-strong px-5 py-2.5 text-[14.5px] font-medium text-ink transition-colors hover:bg-surface"
          >
            Run it yourself
          </Link>
          <a
            href={REPO}
            className="rounded-full px-4 py-2.5 text-[14.5px] font-medium text-ink-2 transition-colors hover:text-ink"
          >
            github.com/wes/mailbench →
          </a>
        </div>
        <p className="mt-8 text-[13.5px] text-muted">
          {measured.size} clients measured · {CLIENTS.length} defined · {RUNS.length} runs
        </p>
      </section>

      <section className="mx-auto max-w-[1120px] px-5 pt-10" aria-labelledby="latest">
        <div className="border-t border-line pt-12">
          <h2 id="latest" className="text-[clamp(1.5rem,2.6vw,2rem)] leading-[1.1] font-bold tracking-[-0.025em]">
            Latest results
          </h2>
          <p className="mt-3 max-w-[44rem] text-[15px] leading-relaxed text-ink-2">
            The most recent run on each mailbox size. Lower is better throughout; the best in each test is{' '}
            <span className="inline-block h-2.5 w-2.5 rounded-[2px] bg-accent align-[0px]" aria-hidden="true" />{' '}
            <span className="font-medium text-ink">marked</span>, whoever has it.
          </p>
          <div className="mt-8">
            <CorpusSwitch
              label="Mailbox"
              panels={latest.map((run) => ({
                key: run.corpus.name,
                label: (
                  <>
                    {messages(run.corpus.messages)}
                    <span className="hidden sm:inline"> messages</span>
                  </>
                ),
                content: (
                  <div className="mt-6 grid gap-5">
                    <RunFacts run={run} link />
                    <ParityNotice run={run} />
                    <MetricGrid run={run} />
                  </div>
                ),
              }))}
            />
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-[1120px] px-5 pt-24" aria-labelledby="fair">
        <div className="border-t border-line pt-12">
          <h2 id="fair" className="text-[clamp(1.5rem,2.6vw,2rem)] leading-[1.1] font-bold tracking-[-0.025em]">
            What makes it fair
          </h2>
          <div className="mt-8 grid gap-x-10 gap-y-8 sm:grid-cols-2 lg:grid-cols-3">
            {PRINCIPLES.map((p) => (
              <div key={p.title}>
                <h3 className="text-[15.5px] font-semibold text-ink">{p.title}</h3>
                <p className="mt-2 text-[14.5px] leading-relaxed text-ink-2">{p.body}</p>
              </div>
            ))}
          </div>
          <p className="mt-10 text-[14.5px]">
            <Link to="/method" className="link">
              The whole method, including what it cannot measure →
            </Link>
          </p>
        </div>
      </section>

      <section id="who" className="mx-auto max-w-[1120px] scroll-mt-20 px-5 pt-24" aria-labelledby="who-h">
        <div className="card grid gap-6 p-6 sm:p-8 lg:grid-cols-[1fr_1.3fr]">
          <div>
            <p className="eyebrow">Who runs this</p>
            <h2 id="who-h" className="mt-3 text-[1.5rem] leading-[1.15] font-bold tracking-[-0.02em]">
              Started by the author of one of the clients here.
            </h2>
          </div>
          <div className="text-[15px] leading-relaxed text-ink-2">
            <p>
              mailbench began as the benchmark harness for{' '}
              <Link to="/clients/spool" className="link">
                Spool
              </Link>
              , written by{' '}
              <a className="link" href="https://github.com/wes">
                @wes
              </a>
              . That is a conflict of interest, and this project is set up to make it not matter: the instrument treats
              every client identically and from the outside, the mailbox is the same bytes everywhere, every published
              number is regenerated from raw output by CI, and every run says who submitted it and which clients they
              work on.
            </p>
            <p className="mt-4">
              If you find anything that favours one client — a setting, a coordinate, a word on this site — that is a
              bug.{' '}
              <a className="link" href={`${REPO}/issues/new/choose`}>
                Open an issue
              </a>
              . Client authors are especially welcome to maintain their own client’s definition.
            </p>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-[1120px] px-5 pt-16" aria-label="Get involved">
        <div className="grid gap-4 md:grid-cols-2">
          <Link to="/contribute" className="card group block p-6 transition-colors hover:border-line-strong">
            <h2 className="text-[17px] font-semibold">Make a mail client? Add it.</h2>
            <p className="mt-2 text-[14.5px] leading-relaxed text-ink-2">
              A client is one JSON file: where its window keeps the message list, the reader and the search field. The
              harness does the rest, the same way it does for everyone.
            </p>
            <span className="mt-4 inline-block text-[14px] font-medium text-ink group-hover:underline">
              How to add a client →
            </span>
          </Link>
          <Link to="/run" className="card group block p-6 transition-colors hover:border-line-strong">
            <h2 className="text-[17px] font-semibold">Different hardware? Run it.</h2>
            <p className="mt-2 text-[14.5px] leading-relaxed text-ink-2">
              An afternoon of setup on a Mac, then one command per client. <code className="font-mono text-[13px]">./mailbench submit</code>{' '}
              turns the results into a pull request, and they appear here once it is merged.
            </p>
            <span className="mt-4 inline-block text-[14px] font-medium text-ink group-hover:underline">
              Run it yourself →
            </span>
          </Link>
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
