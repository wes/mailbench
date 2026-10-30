import {
  type Metric,
  type Run,
  caveatsFor,
  displayName,
  formatValue,
  partial,
  rank,
  tieWindow,
} from '../lib/data';
import { BarList, type BarRow } from './bar-list';

/**
 * One test across every client in a run, fastest first. The best result is
 * the accent, whoever has it, and every client within one display frame of it
 * shares it; the rest are one gray. Caveats that bear on a client's number are
 * footnoted on its row, in the card, rather than collected somewhere below.
 */
export function MetricCard({ run, metric }: { run: Run; metric: Metric }) {
  const ranked = rank(run, metric);
  if (ranked.length === 0) return null;
  const max = Math.max(...ranked.map((r) => r.value.value));
  const window = tieWindow(metric, run);
  const bestCount = ranked.filter((r) => r.best).length;

  // One footnote per distinct text: a note about two clients is one note with
  // both their names on it, not the same paragraph twice.
  const footnotes: { n: number; clients: string[]; text: string }[] = [];
  const rows: BarRow[] = ranked.map(({ result, value, best, rank: place }) => {
    const marks: number[] = [];
    for (const text of caveatsFor(run, result.id, metric.key)) {
      let note = footnotes.find((f) => f.text === text);
      if (note) note.clients.push(result.name);
      else footnotes.push((note = { n: footnotes.length + 1, clients: [result.name], text }));
      marks.push(note.n);
    }
    const details: string[] = [];
    if (result.version) details.push(`version ${result.version}`);
    if (value.first !== undefined) details.push(`first change after ${Math.round(value.first)} ms`);
    if (value.runs !== undefined)
      details.push(
        value.captured !== undefined && value.captured < value.runs
          ? `median of ${value.captured} runs (${value.runs - value.captured} timed out)`
          : `median of ${value.runs} runs`,
      );
    details.push(best && bestCount > 1 ? `tied for best` : best ? 'best' : `${ordinal(place)} of ${ranked.length}`);
    if (partial(run, result.id)) details.push(`partial mailbox: ${run.parity?.[result.id]?.held ?? 'see notes'}`);
    return {
      key: `${result.id}${result.tag ? `@${result.tag}` : ''}`,
      name: displayName(result),
      marks,
      partial: partial(run, result.id),
      value: formatValue(value.value, metric),
      pct: max > 0 ? (value.value / max) * 100 : 0,
      best,
      details,
    };
  });

  return (
    <section className="card flex flex-col p-5 sm:p-6" aria-labelledby={`m-${run.id}-${metric.key}`}>
      <h3 id={`m-${run.id}-${metric.key}`} className="text-[15.5px] font-semibold text-ink">
        {metric.title}
      </h3>
      <p className="mt-1 text-[13px] leading-relaxed text-muted">{metric.what}</p>
      <BarList label={`${metric.title}, lowest first`} rows={rows} />
      {(footnotes.length > 0 || (window > 0 && bestCount > 1)) && (
        <div className="mt-4 border-t border-line pt-3 text-[12.5px] leading-relaxed text-muted">
          {window > 0 && bestCount > 1 && (
            <p>
              {bestCount} clients are within {metric.screen ? `one frame (${Math.round(window)} ms)` : `${window} ms`} of
              the lowest, closer than the instrument can tell apart, so all of them are marked best.
            </p>
          )}
          {footnotes.length > 0 && (
            <ol className={`grid gap-1.5 ${window > 0 && bestCount > 1 ? 'mt-2' : ''}`}>
              {footnotes.map((f) => (
                <li key={f.n} className="grid grid-cols-[1rem_1fr]">
                  <span className="text-faint">{f.n}</span>
                  <span>
                    <span className="font-medium text-ink-2">{f.clients.join(', ')}.</span> {f.text}
                  </span>
                </li>
              ))}
            </ol>
          )}
        </div>
      )}
    </section>
  );
}

const ordinal = (n: number) => {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return `${n}${s[(v - 20) % 10] ?? s[v] ?? s[0]}`;
};
