import { Link } from 'waku';

import { CLIENTS, REPO, RUNS, SITE } from '../../lib/data';

const TITLE = 'Clients — mailbench';

const STATUS = {
  verified: 'Ready to measure',
  unverified: 'Coordinates unchecked',
  missing: 'Needs a layout',
} as const;

export default async function ClientsPage() {
  return (
    <>
      <title>{TITLE}</title>
      <meta name="description" content="Every mail client mailbench knows how to measure, who maintains its definition, and what it takes to set up." />
      <link rel="canonical" href={`${SITE}/clients`} />

      <section className="mx-auto max-w-[1120px] px-5 pt-16 sm:pt-20">
        <p className="eyebrow">Clients</p>
        <h1 className="mt-3 text-[clamp(2rem,4.4vw,3rem)] leading-[1.05] font-bold tracking-[-0.03em]">
          The clients
        </h1>
        <p className="mt-5 max-w-[44rem] text-[16px] leading-relaxed text-ink-2">
          Each client is a JSON file in{' '}
          <a className="link" href={`${REPO}/tree/main/clients`}>
            clients/
          </a>
          : how to find its window, where its message list, reader and search field are, and what has to be set so it
          holds the whole mailbox. The harness measures every one of them with the same code. Alphabetical.
        </p>

        <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {CLIENTS.map((c) => {
            const runs = RUNS.filter((r) => r.summary.clients.some((x) => x.id === c.id)).length;
            return (
              <Link
                key={c.id}
                to={`/clients/${c.id}`}
                className="card group flex flex-col p-5 transition-colors hover:border-line-strong"
              >
                <div className="flex items-baseline justify-between gap-3">
                  <h2 className="text-[17px] font-semibold text-ink group-hover:underline">{c.name}</h2>
                  <span className="text-[12px] text-muted">{c.source === 'open' ? 'open source' : 'closed source'}</span>
                </div>
                <p className="mt-1 text-[13.5px] text-muted">{c.vendor ?? 'Vendor unknown'}</p>
                <dl className="mt-4 grid grid-cols-[6.5rem_1fr] gap-y-1.5 text-[13px]">
                  <dt className="text-muted">Status</dt>
                  <dd className={c.layout.status === 'verified' ? 'text-ink-2' : 'text-warn-ink'}>
                    {STATUS[c.layout.status]}
                  </dd>
                  <dt className="text-muted">Runs</dt>
                  <dd className="text-ink-2">{runs}</dd>
                  <dt className="text-muted">Maintained by</dt>
                  <dd className="text-ink-2">
                    {c.maintainers.length ? c.maintainers.map((m) => `@${m}`).join(', ') : 'nobody yet'}
                    {c.vendor_maintained && <span className="text-muted"> (its developers)</span>}
                  </dd>
                </dl>
              </Link>
            );
          })}
          <Link
            to="/contribute"
            className="flex flex-col justify-center rounded-[14px] border border-dashed border-line-strong p-5 text-ink-2 transition-colors hover:text-ink"
          >
            <span className="text-[17px] font-semibold">Your client here</span>
            <span className="mt-1 text-[13.5px] leading-relaxed">
              One JSON file and a pull request. Mail clients on macOS that can be pointed at an IMAP server.
            </span>
          </Link>
        </div>

        <div className="prose mt-14">
          <h2>Not here, and why</h2>
          <p>
            A client can only be measured if it can be pointed at the benchmark’s own IMAP server — that is what puts
            every client on the same mailbox. Clients that only speak to a provider’s API, or sync through the vendor’s
            own servers, cannot be, so no like-for-like measurement of them exists. That is the finding, not an
            omission: <strong>Mimestream</strong> (Gmail API only) and <strong>Superhuman</strong> (Gmail and Outlook,
            through its own backend) are the best-known examples.
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
