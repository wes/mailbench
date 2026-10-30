'use client';

import { useId, useState } from 'react';

export type BarRow = {
  key: string;
  name: string;
  /** Footnote numbers for this client's caveats on this metric. */
  marks: number[];
  partial: boolean;
  value: string;
  /** Share of the longest bar, 0–100. Drawn at true length from zero. */
  pct: number;
  best: boolean;
  /** Lines for the tooltip, beyond the value and name. */
  details: string[];
};

/**
 * One metric's clients as ranked horizontal bars, lowest first.
 *
 * Every value is printed at its bar's tip, so the tooltip only adds detail —
 * version, the first-change time, runs captured, rank — and the same detail
 * appears on keyboard focus. Rendered on the server; this component only adds
 * the hover layer.
 */
export function BarList({ label, rows }: { label: string; rows: BarRow[] }) {
  const [active, setActive] = useState<string | null>(null);
  const id = useId();

  return (
    <ol className="mt-5 flex flex-col" aria-label={label}>
      {rows.map((row) => {
        const on = active === row.key;
        const tipId = `${id}-${row.key}`;
        return (
          <li
            key={row.key}
            tabIndex={0}
            aria-describedby={on ? tipId : undefined}
            onPointerEnter={() => setActive(row.key)}
            onPointerLeave={() => setActive((a) => (a === row.key ? null : a))}
            onFocus={() => setActive(row.key)}
            onBlur={() => setActive((a) => (a === row.key ? null : a))}
            className="group relative grid grid-cols-[minmax(0,7.6rem)_minmax(0,1fr)_4.6rem] items-center gap-3 rounded-md py-[5px] outline-none focus-visible:bg-accent-wash sm:grid-cols-[minmax(0,8.6rem)_minmax(0,1fr)_5.2rem]"
          >
            <span
              className={`flex min-w-0 items-baseline gap-1 text-[13.5px] ${row.best ? 'font-semibold text-ink' : 'text-ink-2'}`}
            >
              <span className="truncate">{row.name}</span>
              {row.partial && (
                <span className="shrink-0 text-[11px] text-muted" title="Did not hold the whole mailbox">
                  ◐<span className="sr-only"> (partial mailbox)</span>
                </span>
              )}
              {row.marks.length > 0 && (
                <sup className="shrink-0 text-[10.5px] font-normal text-muted">{row.marks.join(',')}</sup>
              )}
            </span>
            <span aria-hidden="true" className="block h-[10px]">
              <span
                className={`block h-full rounded-r-[4px] transition-[filter] ${row.best ? 'bg-accent' : 'bg-bar'} ${on ? 'brightness-110' : ''}`}
                style={{ width: `${Math.max(1.2, row.pct)}%` }}
              />
            </span>
            <span
              className={`num text-right font-mono text-[13px] whitespace-nowrap ${row.best ? 'font-semibold text-ink' : 'text-ink-2'}`}
            >
              {row.value}
              {row.best && <span className="sr-only"> (best)</span>}
            </span>
            {on && (
              <span
                id={tipId}
                role="tooltip"
                className="pointer-events-none absolute bottom-full left-[min(40%,9rem)] z-10 mb-1.5 w-max max-w-[18rem] rounded-lg border border-line bg-raised px-3 py-2 text-[12.5px] leading-snug text-ink-2 shadow-[0_6px_24px_rgba(0,0,0,0.12)]"
              >
                <span className="block font-mono text-[14px] font-semibold text-ink">{row.value}</span>
                <span className="block">{row.name}</span>
                {row.details.map((d) => (
                  <span key={d} className="block text-muted">
                    {d}
                  </span>
                ))}
              </span>
            )}
          </li>
        );
      })}
    </ol>
  );
}
