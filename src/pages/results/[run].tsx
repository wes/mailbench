import { Link } from 'waku';

import {
  Calibration,
  MetricGrid,
  ParityNotice,
  ResultsTable,
  RunFacts,
} from '../../components/run-parts';
import { RUNS, SITE, getClient, getRun, messages, rawUrl } from '../../lib/data';

export default async function RunPage({ run: id }: { run: string }) {
  const run = getRun(id);
  if (!run) return null;
  const title = `${run.machine.name} (${run.machine.cpu}), ${messages(run.corpus.messages)} messages — mailbench`;
  const description = `${run.summary.clients.map((c) => c.name).join(', ')} on the same ${messages(run.corpus.messages)}-message mailbox, measured from the screen.`;
  const others = RUNS.filter((r) => r.id !== run.id && r.machine.cpu === run.machine.cpu && r.date.slice(0, 7) === run.date.slice(0, 7));

  return (
    <>
      <title>{title}</title>
      <meta name="description" content={description} />
      <meta property="og:title" content={title} />
      <meta property="og:description" content={description} />
      <link rel="canonical" href={`${SITE}/results/${run.id}`} />

      <section className="mx-auto max-w-[1120px] px-5 pt-14 sm:pt-18">
        <Link to="/results" className="text-[13.5px] text-muted transition-colors hover:text-ink">
          ← All results
        </Link>
        <h1 className="mt-6 text-[clamp(1.9rem,4vw,2.8rem)] leading-[1.08] font-bold tracking-[-0.03em]">
          {run.machine.name}, {messages(run.corpus.messages)} messages
        </h1>
        <div className="mt-4 max-w-[52rem]">
          <RunFacts run={run} />
        </div>
        {others.length > 0 && (
          <p className="mt-3 text-[13.5px] text-muted">
            Same machine:{' '}
            {others.map((o, i) => (
              <span key={o.id}>
                {i > 0 && ', '}
                <Link to={`/results/${o.id}`} className="link">
                  {messages(o.corpus.messages)} messages
                </Link>
              </span>
            ))}
          </p>
        )}
      </section>

      <section className="mx-auto mt-10 grid max-w-[1120px] gap-5 px-5">
        <ParityNotice run={run} />
        <MetricGrid run={run} />
      </section>

      <section className="mx-auto max-w-[1120px] px-5 pt-16" aria-labelledby="table">
        <h2 id="table" className="text-[1.45rem] font-bold tracking-[-0.02em]">
          Every number
        </h2>
        <p className="mt-2 max-w-[44rem] text-[14.5px] leading-relaxed text-ink-2">
          Medians. For a test timed from the screen, the number is when the window stopped changing, and “first”
          beneath it is when it started to. Quit is timed to the process exiting.
        </p>
        <div className="mt-6">
          <ResultsTable run={run} />
        </div>
      </section>

      {(run.notes?.length ?? 0) > 0 || Object.keys(run.parity ?? {}).length > 0 ? (
        <section className="mx-auto max-w-[1120px] px-5 pt-16" aria-labelledby="notes">
          <h2 id="notes" className="text-[1.45rem] font-bold tracking-[-0.02em]">
            Notes on this run
          </h2>
          <ul className="mt-5 grid max-w-[46rem] gap-4 text-[14.5px] leading-relaxed text-ink-2">
            {Object.entries(run.parity ?? {}).map(([cid, p]) => (
              <li key={`parity-${cid}`}>
                <span className="font-semibold text-ink">
                  {getClient(cid)?.name ?? cid} {p.full ? 'held the whole mailbox.' : `held ${p.held ? p.held.charAt(0).toLowerCase() + p.held.slice(1) : 'part of the mailbox'}.`}
                </span>{' '}
                {p.note}
              </li>
            ))}
            {(run.notes ?? []).map((n) => (
              <li key={n.title}>
                <span className="font-semibold text-ink">{n.title}</span> {n.body}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section className="mx-auto max-w-[1120px] px-5 pt-16" aria-labelledby="setup">
        <h2 id="setup" className="text-[1.45rem] font-bold tracking-[-0.02em]">
          The setup
        </h2>
        <div className="mt-5 grid gap-8 lg:grid-cols-2">
          <div>
            <h3 className="text-[15px] font-semibold">The instrument on this machine</h3>
            <div className="mt-3">
              <Calibration run={run} />
            </div>
          </div>
          <dl className="grid grid-cols-[8.5rem_1fr] gap-x-4 gap-y-2.5 text-[14px] leading-relaxed">
            <dt className="text-muted">Mailbox</dt>
            <dd className="text-ink-2">
              {messages(run.corpus.messages)} messages, corpus {run.corpus.version}
              {run.corpus.verified ? ' — matched the published digest' : ' — not checked against a published digest'}
              {run.corpus.note && <span className="mt-1 block text-[13px] text-muted">{run.corpus.note}</span>}
            </dd>
            <dt className="text-muted">Machine</dt>
            <dd className="text-ink-2">
              {run.machine.name}
              {run.machine.model_id ? ` (${run.machine.model_id})` : ''}, {run.machine.cpu}
              {run.machine.cores ? `, ${run.machine.cores} cores` : ''}
              {run.machine.memory_gb ? `, ${run.machine.memory_gb} GB` : ''}
              {run.machine.power ? `, on ${run.machine.power === 'ac' ? 'mains power' : 'battery'}` : ''}
            </dd>
            <dt className="text-muted">Display</dt>
            <dd className="text-ink-2">{run.machine.display ?? `${run.machine.display_hz} Hz`}</dd>
            <dt className="text-muted">Window</dt>
            <dd className="text-ink-2">{run.harness.window ?? '1400x900'} points, the same for every client</dd>
            <dt className="text-muted">Runs</dt>
            <dd className="text-ink-2">
              {run.harness.runs ?? 20} per test (10 for scroll, 5 for launch and quit, after one unrecorded launch)
            </dd>
            <dt className="text-muted">Search term</dt>
            <dd className="font-mono text-[13px] text-ink-2">{run.harness.search_term ?? 'postmortem'}</dd>
            <dt className="text-muted">Harness</dt>
            <dd className="text-ink-2">{run.harness.version}</dd>
            <dt className="text-muted">Raw output</dt>
            <dd className="text-ink-2">
              {run.source.kind === 'harness' ? (
                <a className="link" href={rawUrl(run, 'raw')}>
                  results/{run.id}/raw
                </a>
              ) : (
                <>
                  Not in the repository yet. {run.source.note}{' '}
                  <a className="link" href={run.source.url}>
                    Where it was first published.
                  </a>
                </>
              )}
            </dd>
          </dl>
        </div>
        <p className="mt-10 text-[14px] text-muted">
          See a problem with this run?{' '}
          <a className="link" href={`https://github.com/wes/mailbench/issues/new?template=result.yml&title=${encodeURIComponent(`Result: ${run.id}`)}`}>
            Open an issue about it
          </a>
          .
        </p>
      </section>
    </>
  );
}

export const getConfig = async () => {
  return {
    render: 'static',
    staticPaths: RUNS.map((r) => r.id),
  } as const;
};
