import { Link } from 'waku';

import {
  METRICS,
  type Run,
  affiliationText,
  comparable,
  displayName,
  formatDate,
  formatValue,
  getClient,
  messages,
  partial,
  rank,
} from '../lib/data';
import { MetricCard } from './metric-card';

/** The facts a reader needs before any number: where, on what, by whom. */
export function RunFacts({ run, link = false }: { run: Run; link?: boolean }) {
  const m = run.machine;
  const affiliation = affiliationText(run);
  return (
    <div className="text-[13.5px] leading-relaxed text-muted">
      <p>
        <span className="text-ink-2">
          {m.name} ({m.cpu}
          {m.memory_gb ? `, ${m.memory_gb} GB` : ''}), {m.os}
        </span>
        <Dot />
        {m.display_hz} Hz display
        <Dot />
        {messages(run.corpus.messages)}-message mailbox
        <Dot />
        {formatDate(run.date)}
      </p>
      <p className="mt-1">
        Submitted by{' '}
        <a className="link" href={`https://github.com/${run.submitted_by}`}>
          @{run.submitted_by}
        </a>
        {affiliation && (
          <>
            , who <strong className="font-semibold text-ink-2">{affiliation}</strong>
          </>
        )}
        {!affiliation && ', who declared no affiliation with any client measured'}.
        {run.source.kind === 'imported' && (
          <>
            {' '}
            Imported from{' '}
            <a className="link" href={run.source.url}>
              where it was first published
            </a>
            ; raw output not yet in the repository.
          </>
        )}
        {link && (
          <>
            {' '}
            <Link to={`/results/${run.id}`} className="link">
              Every number, and the notes →
            </Link>
          </>
        )}
      </p>
    </div>
  );
}

const Dot = () => (
  <span className="mx-2 text-faint" aria-hidden="true">
    ·
  </span>
);

/** Clients that did not hold the whole mailbox, said once, above the charts. */
export function ParityNotice({ run }: { run: Run }) {
  const partials = Object.entries(run.parity ?? {}).filter(([, p]) => !p.full);
  if (partials.length === 0) return null;
  return (
    <div className="rounded-xl bg-warn-wash px-4 py-3 text-[13.5px] leading-relaxed text-ink-2">
      <span className="font-semibold text-warn-ink">◐ Not every client held the whole mailbox.</span>{' '}
      {partials.map(([id, p], i) => (
        <span key={id}>
          {i > 0 && '; '}
          <Link to={`/clients/${id}`} className="link">
            {getClient(id)?.name ?? id}
          </Link>
          {p.held ? `: ${p.held.charAt(0).toLowerCase()}${p.held.slice(1)}` : ''}
        </span>
      ))}
      . Their numbers are for a smaller job than everyone else's, and are marked ◐.
    </div>
  );
}

/** Every comparable metric in a run, as cards. */
export function MetricGrid({ run }: { run: Run }) {
  const shown = METRICS.filter((m) => comparable(run, m));
  return (
    <div className="grid gap-4 md:grid-cols-2">
      {shown.map((metric) => (
        <MetricCard key={metric.key} run={run} metric={metric} />
      ))}
    </div>
  );
}

/**
 * The table view: every client, every metric, the full detail. Clients in
 * alphabetical order — a table's order is not a ranking.
 */
export function ResultsTable({ run }: { run: Run }) {
  const clients = [...run.summary.clients].sort((a, b) => displayName(a).localeCompare(displayName(b)));
  const metrics = METRICS.filter((m) => clients.some((c) => c.metrics[m.key]));
  return (
    <div className="card overflow-x-auto">
      <table className="w-full min-w-[640px] border-collapse text-left text-[13.5px]">
        <caption className="sr-only">Every result in this run</caption>
        <thead>
          <tr className="border-b border-line">
            <th scope="col" className="px-4 py-3 font-semibold text-muted">
              Test
            </th>
            {clients.map((c) => (
              <th key={c.id + (c.tag ?? '')} scope="col" className="px-4 py-3 text-right font-semibold text-ink">
                <Link to={`/clients/${c.id}`} className="hover:underline">
                  {displayName(c)}
                </Link>
                {partial(run, c.id) && <span className="ml-1 text-muted">◐</span>}
                <span className="block text-[12px] font-normal text-muted">{c.version ?? '—'}</span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {metrics.map((m) => {
            const ranked = rank(run, m);
            const ranks = new Map(ranked.map((r) => [r.result, r]));
            const listed = !comparable(run, m);
            return (
              <tr key={m.key} className="border-b border-line last:border-0">
                <th scope="row" className="px-4 py-2.5 font-normal text-ink-2">
                  {m.title}
                  {listed && <span className="block text-[11.5px] text-muted">not ranked</span>}
                </th>
                {clients.map((c) => {
                  const v = c.metrics[m.key];
                  const r = ranks.get(c);
                  const best = !listed && r?.best;
                  return (
                    <td key={c.id + (c.tag ?? '')} className="num px-4 py-2.5 text-right font-mono whitespace-nowrap">
                      {v ? (
                        <>
                          <span className={best ? 'font-semibold text-ink' : 'text-ink-2'}>
                            {formatValue(v.value, m)}
                          </span>
                          {best && <span className="ml-1 inline-block h-2 w-2 rounded-[2px] bg-accent align-[1px]" />}
                          {best && <span className="sr-only"> (best)</span>}
                          {v.first !== undefined && (
                            <span className="block text-[11.5px] text-muted">first {Math.round(v.first)} ms</span>
                          )}
                          {v.captured !== undefined && v.runs !== undefined && v.captured < v.runs && (
                            <span className="block text-[11.5px] text-warn-ink">
                              {v.captured}/{v.runs} runs
                            </span>
                          )}
                          {v.ratio !== undefined && (
                            <span className="block text-[11.5px] text-muted">{Math.round(v.ratio * 100)}% of mailbox</span>
                          )}
                          {v.method === 'client-store-count' && (
                            <span className="block font-sans text-[11.5px] text-muted">its own count</span>
                          )}
                        </>
                      ) : (
                        <span className="text-faint">—</span>
                      )}
                    </td>
                  );
                })}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/** What the instrument itself adds on this machine. */
export function Calibration({ run }: { run: Run }) {
  const cal = run.summary.calibration;
  if (cal) {
    return (
      <div>
        <p className="text-[14px] leading-relaxed text-ink-2">
          The instrument adds about <strong className="text-ink">{Math.round(cal.overhead_ms)} ms</strong> to every
          time it reads off this machine's screen — the same for every client, so it cancels in a comparison. Measured
          against a target that changes colour a known time after a click:
        </p>
        <table className="num mt-3 w-full max-w-md border-collapse font-mono text-[13px]">
          <thead>
            <tr className="border-b border-line text-left font-sans text-[12.5px] text-muted">
              <th className="py-2 pr-3 font-medium">Asked</th>
              <th className="py-2 pr-3 font-medium">Target fired</th>
              <th className="py-2 pr-3 font-medium">Instrument read</th>
              <th className="py-2 font-medium">Overhead</th>
            </tr>
          </thead>
          <tbody>
            {cal.rows.map((r) => (
              <tr key={r.asked_ms} className="border-b border-line last:border-0 text-ink-2">
                <td className="py-1.5 pr-3">{r.asked_ms} ms</td>
                <td className="py-1.5 pr-3">{r.fired_ms.toFixed(1)} ms</td>
                <td className="py-1.5 pr-3">{r.read_ms.toFixed(1)} ms</td>
                <td className="py-1.5">+{r.overhead_ms.toFixed(1)} ms</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }
  if (run.calibration?.overhead_ms) {
    return (
      <p className="text-[14px] leading-relaxed text-ink-2">
        The instrument adds about <strong className="text-ink">{run.calibration.overhead_ms} ms</strong> to every time
        it reads off this machine's screen
        {run.calibration.floor_ms ? `; the fastest anything can measure here is around ${run.calibration.floor_ms} ms` : ''}
        . The same for every client, so it cancels in a comparison. {run.calibration.note}
      </p>
    );
  }
  return (
    <p className="text-[14px] leading-relaxed text-warn-ink">
      This machine was not calibrated, so the instrument's own overhead here is unknown. Differences between clients
      still hold; absolute times under about 50 ms should not be quoted.
    </p>
  );
}

