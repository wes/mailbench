'use client';

import { type KeyboardEvent, type ReactNode, useEffect, useState } from 'react';

type Panel = { key: string; label: ReactNode; content: ReactNode };

/**
 * Switches between runs on different mailbox sizes. Every panel is rendered on
 * the server and is in the HTML; this only decides which one shows, and keeps
 * the choice in the URL's hash so a link can open on the 250k run.
 */
export function CorpusSwitch({ label, panels }: { label: string; panels: Panel[] }) {
  const first = panels[0]?.key ?? '';
  const [active, setActive] = useState(first);

  useEffect(() => {
    const fromHash = () => {
      const key = window.location.hash.slice(1);
      setActive(panels.some((p) => p.key === key) ? key : first);
    };
    fromHash();
    window.addEventListener('hashchange', fromHash);
    return () => window.removeEventListener('hashchange', fromHash);
  }, [panels, first]);

  const select = (key: string) => {
    setActive(key);
    const { pathname, search } = window.location;
    history.replaceState(null, '', key === first ? pathname + search : `#${key}`);
  };

  const onKeyDown = (e: KeyboardEvent, i: number) => {
    const step = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0;
    if (!step) return;
    e.preventDefault();
    const next = panels[(i + step + panels.length) % panels.length]!;
    select(next.key);
    document.getElementById(`corpus-tab-${next.key}`)?.focus();
  };

  if (panels.length < 2) return <>{panels[0]?.content}</>;

  return (
    <div>
      <div className="flex flex-wrap items-center gap-3">
        <span id="corpus-switch-label" className="text-[13.5px] text-muted">
          {label}
        </span>
        <div
          role="tablist"
          aria-labelledby="corpus-switch-label"
          className="flex items-center gap-1 rounded-full border border-line bg-surface p-[3px]"
        >
          {panels.map((p, i) => {
            const on = p.key === active;
            return (
              <button
                key={p.key}
                id={`corpus-tab-${p.key}`}
                type="button"
                role="tab"
                aria-selected={on}
                aria-controls={`corpus-panel-${p.key}`}
                tabIndex={on ? 0 : -1}
                onClick={() => select(p.key)}
                onKeyDown={(e) => onKeyDown(e, i)}
                className={`rounded-full px-3.5 py-1 text-[13.5px] font-medium whitespace-nowrap transition-colors ${
                  on ? 'bg-ink text-page' : 'text-ink-2 hover:text-ink'
                }`}
              >
                {p.label}
              </button>
            );
          })}
        </div>
      </div>
      {panels.map((p) => (
        <div
          key={p.key}
          id={`corpus-panel-${p.key}`}
          role="tabpanel"
          aria-labelledby={`corpus-tab-${p.key}`}
          hidden={p.key !== active}
        >
          {p.content}
        </div>
      ))}
    </div>
  );
}
