import { Link } from 'waku';

import {
  CLIENTS,
  METRICS,
  REPO,
  RUNS,
  SITE,
  formatDate,
  formatValue,
  getClient,
  messages,
  partial,
  rank,
  comparable,
} from '../../lib/data';

export default async function ClientPage({ client: id }: { client: string }) {
  const client = getClient(id);
  if (!client) return null;
  const runs = RUNS.filter((r) => r.summary.clients.some((c) => c.id === id && !c.tag));
  const title = `${client.name} — mailbench`;
  const description = `${client.name}, measured from the screen against other mail clients on the same mailbox.`;
  const metrics = METRICS.filter((m) => runs.some((r) => r.summary.clients.find((c) => c.id === id)?.metrics[m.key]));
  const general = (client.caveats ?? []).filter((c) => !c.metric);
  const specific = (client.caveats ?? []).filter((c) => c.metric);

  return (
    <>
      <title>{title}</title>
      <meta name="description" content={description} />
      <link rel="canonical" href={`${SITE}/clients/${id}`} />

      <section className="mx-auto max-w-[1120px] px-5 pt-14 sm:pt-18">
        <Link to="/clients" className="text-[13.5px] text-muted transition-colors hover:text-ink">
          ← All clients
        </Link>
        <h1 className="mt-6 text-[clamp(2rem,4.4vw,3rem)] leading-[1.05] font-bold tracking-[-0.03em]">{client.name}</h1>
        <p className="mt-3 text-[14.5px] text-ink-2">
          {client.vendor ?? 'Vendor unknown'}
          <span className="mx-2 text-faint">·</span>
          {client.source === 'open' ? 'Open source' : 'Closed source'}
          {client.homepage && (
            <>
              <span className="mx-2 text-faint">·</span>
              <a className="link" href={client.homepage}>
                {client.homepage.replace(/^https:\/\/(www\.)?/, '').replace(/\/$/, '')}
              </a>
            </>
          )}
        </p>
        <p className="mt-2 text-[14px] text-muted">
          Definition maintained by{' '}
          {client.maintainers.length
            ? client.maintainers.map((m, i) => (
                <span key={m}>
                  {i > 0 && ', '}
                  <a className="link" href={`https://github.com/${m}`}>
                    @{m}
                  </a>
                </span>
              ))
            : 'nobody yet'}
          {client.vendor_maintained ? ', who works on it' : ''}.{' '}
          <a className="link" href={`${REPO}/blob/main/clients/${id}.json`}>
            clients/{id}.json
          </a>
        </p>
        <LayoutStatus client={client} />
      </section>

      {general.length > 0 && (
        <section className="mx-auto max-w-[1120px] px-5 pt-10">
          <div className="card max-w-[46rem] p-5 text-[14.5px] leading-relaxed text-ink-2">
            <h2 className="text-[14px] font-semibold text-ink">Reading its numbers</h2>
            <ul className="mt-2 grid list-disc gap-1.5 pl-5 marker:text-faint">
              {general.map((c) => (
                <li key={c.text}>{c.text}</li>
              ))}
            </ul>
          </div>
        </section>
      )}

      <section className="mx-auto max-w-[1120px] px-5 pt-14" aria-labelledby="results">
        <h2 id="results" className="text-[1.45rem] font-bold tracking-[-0.02em]">
          Results
        </h2>
        {runs.length === 0 ? (
          <p className="mt-3 max-w-[44rem] text-[15px] leading-relaxed text-ink-2">
            Not measured yet.{' '}
            {client.layout.status === 'missing' ? (
              <>Its definition needs a layout first — see below.</>
            ) : (
              <>
                <Link to="/run" className="link">
                  Run it
                </Link>{' '}
                and submit the results.
              </>
            )}
          </p>
        ) : (
          <>
            <p className="mt-2 max-w-[44rem] text-[14.5px] leading-relaxed text-ink-2">
              Each column is one run. The place is among the clients in that run, lowest first; within one display frame
              of the fastest counts as a tie. Runs are not comparable with each other.
            </p>
            <div className="card mt-6 overflow-x-auto">
              <table className="w-full min-w-[560px] border-collapse text-left text-[13.5px]">
                <thead>
                  <tr className="border-b border-line">
                    <th scope="col" className="px-4 py-3 font-semibold text-muted">
                      Test
                    </th>
                    {runs.map((r) => {
                      const mine = r.summary.clients.find((c) => c.id === id)!;
                      return (
                        <th key={r.id} scope="col" className="px-4 py-3 text-right font-semibold text-ink">
                          <Link to={`/results/${r.id}`} className="hover:underline">
                            {messages(r.corpus.messages)} messages
                          </Link>
                          {partial(r, id) && <span className="ml-1 text-muted">◐</span>}
                          <span className="block text-[12px] font-normal text-muted">
                            {r.machine.name}, {formatDate(r.date)}
                          </span>
                          <span className="block text-[12px] font-normal text-muted">version {mine.version ?? '—'}</span>
                        </th>
                      );
                    })}
                  </tr>
                </thead>
                <tbody>
                  {metrics.map((m) => (
                    <tr key={m.key} className="border-b border-line last:border-0">
                      <th scope="row" className="px-4 py-2.5 font-normal text-ink-2">
                        {m.title}
                      </th>
                      {runs.map((r) => {
                        const mine = r.summary.clients.find((c) => c.id === id)!;
                        const v = mine.metrics[m.key];
                        const ranked = comparable(r, m) ? rank(r, m) : [];
                        const place = ranked.find((x) => x.result === mine);
                        const tied = place?.best && ranked.filter((x) => x.best).length > 1;
                        return (
                          <td key={r.id} className="num px-4 py-2.5 text-right font-mono whitespace-nowrap">
                            {v ? (
                              <>
                                <span className={place?.best ? 'font-semibold text-ink' : 'text-ink-2'}>
                                  {formatValue(v.value, m)}
                                </span>
                                {place && (
                                  <span className="block font-sans text-[11.5px] text-muted">
                                    {place.best ? (tied ? 'tied for best' : 'best') : `${place.rank} of ${ranked.length}`}
                                  </span>
                                )}
                                {!place && <span className="block font-sans text-[11.5px] text-muted">not ranked</span>}
                              </>
                            ) : (
                              <span className="text-faint">—</span>
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {specific.length > 0 && (
              <ul className="mt-5 grid max-w-[46rem] gap-2 text-[13.5px] leading-relaxed text-muted">
                {specific.map((c) => (
                  <li key={c.text}>
                    <span className="font-medium text-ink-2">{METRICS.find((m) => m.key === c.metric)?.title}.</span>{' '}
                    {c.text}
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
      </section>

      <section className="mx-auto max-w-[1120px] px-5 pt-14" aria-labelledby="setup">
        <h2 id="setup" className="text-[1.45rem] font-bold tracking-[-0.02em]">
          Setting it up
        </h2>
        <div className="prose mt-4">
          {client.install && (
            <>
              <h3>Install</h3>
              <p>
                <Inline text={client.install} />
              </p>
            </>
          )}
          {(client.account?.length ?? 0) > 0 && (
            <>
              <h3>Add the benchmark account</h3>
              <p>
                Server <code>127.0.0.1</code>, port <code>10143</code> (<code>10144</code> for the 250k mailbox), no
                encryption, user <code>bench@example.com</code>, password <code>bench</code>.
              </p>
              <ul>
                {client.account!.map((s) => (
                  <li key={s}>
                    <Inline text={s} />
                  </li>
                ))}
              </ul>
            </>
          )}
          {(client.parity?.length ?? 0) > 0 && (
            <>
              <h3>So it holds the whole mailbox</h3>
              <ul>
                {client.parity!.map((s) => (
                  <li key={s}>
                    <Inline text={s} />
                  </li>
                ))}
              </ul>
            </>
          )}
          {(client.reset?.length ?? 0) > 0 && (
            <>
              <h3>For a first-sync measurement</h3>
              <ul>
                {client.reset!.map((s) => (
                  <li key={s}>
                    <Inline text={s} />
                  </li>
                ))}
              </ul>
            </>
          )}
          {client.layout.note && (
            <>
              <h3>Its window</h3>
              <p>{client.layout.note}</p>
            </>
          )}
        </div>
      </section>
    </>
  );
}

function LayoutStatus({ client }: { client: NonNullable<ReturnType<typeof getClient>> }) {
  const l = client.layout;
  if (l.status === 'verified' && l.verified) {
    return (
      <p className="mt-2 text-[14px] text-muted">
        Coordinates checked by snapshot with version {l.verified.version} on {l.verified.os} ({formatDate(l.verified.date)}).
      </p>
    );
  }
  if (l.status === 'unverified') {
    return (
      <p className="mt-3 inline-block rounded-lg bg-warn-wash px-3 py-1.5 text-[13.5px] text-warn-ink">
        Its coordinates have never been checked by snapshot. Anyone with it installed can:{' '}
        <code className="font-mono text-[12.5px]">./mailbench snapshot {client.id}</code>
      </p>
    );
  }
  return (
    <p className="mt-3 inline-block rounded-lg bg-warn-wash px-3 py-1.5 text-[13.5px] text-warn-ink">
      Cannot be measured until its definition has a layout: the window, the list, the reader and the search field.
    </p>
  );
}

/** `code` spans in definition text, and nothing else. */
function Inline({ text }: { text: string }) {
  return (
    <>
      {text.split(/(`[^`]+`)/).map((part, i) =>
        part.startsWith('`') && part.endsWith('`') ? <code key={i}>{part.slice(1, -1)}</code> : part,
      )}
    </>
  );
}

export const getConfig = async () => {
  return {
    render: 'static',
    staticPaths: CLIENTS.map((c) => c.id),
  } as const;
};
