import { Link } from 'waku';

import { RUNS, SITE, affiliationText, formatDate, messages } from '../../lib/data';

const TITLE = 'All results — mailbench';

export default async function ResultsPage() {
  return (
    <>
      <title>{TITLE}</title>
      <meta name="description" content="Every benchmark run: which machine, which mailbox, which clients, and who submitted it." />
      <link rel="canonical" href={`${SITE}/results`} />

      <section className="mx-auto max-w-[1120px] px-5 pt-16 sm:pt-20">
        <p className="eyebrow">Results</p>
        <h1 className="mt-3 text-[clamp(2rem,4.4vw,3rem)] leading-[1.05] font-bold tracking-[-0.03em]">Every run</h1>
        <p className="mt-5 max-w-[44rem] text-[16px] leading-relaxed text-ink-2">
          A run is one machine, one mailbox and the clients measured on it. Numbers from different runs are never put in
          one chart: a different machine, display or mailbox is a different experiment. Newest first.
        </p>

        <div className="card mt-10 overflow-x-auto">
          <table className="w-full min-w-[760px] border-collapse text-left text-[14px]">
            <thead>
              <tr className="border-b border-line text-[12.5px] text-muted">
                <th scope="col" className="px-4 py-3 font-medium">Measured</th>
                <th scope="col" className="px-4 py-3 font-medium">Machine</th>
                <th scope="col" className="px-4 py-3 font-medium">Mailbox</th>
                <th scope="col" className="px-4 py-3 font-medium">Clients</th>
                <th scope="col" className="px-4 py-3 font-medium">Submitted by</th>
              </tr>
            </thead>
            <tbody>
              {RUNS.map((run) => {
                const affiliation = affiliationText(run);
                return (
                  <tr key={run.id} className="border-b border-line align-top last:border-0">
                    <td className="px-4 py-3.5 whitespace-nowrap">
                      <Link to={`/results/${run.id}`} className="font-medium text-ink hover:underline">
                        {formatDate(run.date)}
                      </Link>
                      {run.source.kind === 'imported' && (
                        <span className="mt-0.5 block text-[12px] text-muted">imported, no raw output yet</span>
                      )}
                    </td>
                    <td className="px-4 py-3.5 text-ink-2">
                      {run.machine.name}, {run.machine.cpu}
                      <span className="block text-[12.5px] text-muted">
                        {run.machine.os} · {run.machine.display_hz} Hz
                      </span>
                    </td>
                    <td className="px-4 py-3.5 text-ink-2">
                      {messages(run.corpus.messages)}
                      <span className="block text-[12.5px] text-muted">
                        {run.corpus.verified ? `${run.corpus.version}, verified` : `${run.corpus.version}, not verified`}
                      </span>
                    </td>
                    <td className="px-4 py-3.5 text-ink-2">
                      {run.summary.clients.map((c) => c.name).join(', ')}
                    </td>
                    <td className="px-4 py-3.5 text-ink-2">
                      <a className="link" href={`https://github.com/${run.submitted_by}`}>
                        @{run.submitted_by}
                      </a>
                      <span className="block text-[12.5px] text-muted">{affiliation ?? 'no affiliation'}</span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <p className="mt-6 max-w-[44rem] text-[14px] leading-relaxed text-muted">
          Have a Mac these numbers do not cover?{' '}
          <Link to="/run" className="link">
            Run the benchmark
          </Link>{' '}
          and send the results as a pull request.
        </p>
      </section>
    </>
  );
}

export const getConfig = async () => {
  return {
    render: 'static',
  } as const;
};
