import { Link } from 'waku';

import { REPO } from '../lib/data';

export function SiteFooter() {
  return (
    <footer className="mt-24 border-t border-line">
      <div className="mx-auto grid max-w-[1120px] gap-8 px-5 py-10 text-[14px] text-muted sm:grid-cols-[1.4fr_1fr_1fr]">
        <div>
          <p className="font-mono text-[14px] font-semibold text-ink">
            mailben<span className="text-faint">.</span>ch
          </p>
          <p className="mt-2 max-w-sm leading-relaxed">
            An open benchmark for email clients. Every number on this site is generated from raw output in{' '}
            <a className="link" href={REPO}>
              the repository
            </a>
            , and anyone can run the harness that produced it.
          </p>
        </div>
        <ul className="grid content-start gap-2">
          <li>
            <Link to="/results" className="hover:text-ink">
              Results
            </Link>
          </li>
          <li>
            <Link to="/clients" className="hover:text-ink">
              Clients
            </Link>
          </li>
          <li>
            <Link to="/method" className="hover:text-ink">
              Method
            </Link>
          </li>
        </ul>
        <ul className="grid content-start gap-2">
          <li>
            <Link to="/run" className="hover:text-ink">
              Run it yourself
            </Link>
          </li>
          <li>
            <Link to="/contribute" className="hover:text-ink">
              Add a client
            </Link>
          </li>
          <li>
            <a href={`${REPO}/issues/new/choose`} className="hover:text-ink">
              Report a problem with a result
            </a>
          </li>
        </ul>
      </div>
      <div className="mx-auto max-w-[1120px] px-5 pb-10 text-[13px] text-faint">
        Code MIT, results CC BY 4.0. Started by the author of one of the clients measured here —{' '}
        <Link to="/#who" className="underline underline-offset-2 hover:text-ink">
          who runs this, and why it shouldn’t matter
        </Link>
        .
      </div>
    </footer>
  );
}
