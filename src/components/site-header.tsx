import { Link } from 'waku';

import { REPO } from '../lib/data';

const NAV = [
  { to: '/results', label: 'Results' },
  { to: '/clients', label: 'Clients' },
  { to: '/method', label: 'Method' },
  { to: '/run', label: 'Run it' },
  { to: '/contribute', label: 'Contribute' },
] as const;

export function SiteHeader() {
  return (
    <header className="sticky top-0 z-20 border-b border-line bg-page/85 backdrop-blur-md">
      <div className="mx-auto flex h-14 max-w-[1120px] items-center gap-3 px-5 sm:gap-6">
        <Link to="/" className="shrink-0 font-mono text-[15px] font-semibold tracking-tight text-ink">
          mailben<span className="text-faint">.</span>ch
        </Link>
        <nav
          aria-label="Main"
          className="-mr-2 ml-auto flex items-center overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        >
          {NAV.map((item) => (
            <Link
              key={item.to}
              to={item.to}
              className="rounded-md px-1.5 py-1.5 text-[13.5px] whitespace-nowrap text-ink-2 transition-colors hover:text-ink sm:px-2.5 sm:text-[14px]"
            >
              {item.label}
            </Link>
          ))}
          <a
            href={REPO}
            className="ml-1 hidden rounded-md px-2.5 py-1.5 text-[14px] text-ink-2 transition-colors hover:text-ink sm:block"
          >
            GitHub
          </a>
        </nav>
      </div>
    </header>
  );
}
