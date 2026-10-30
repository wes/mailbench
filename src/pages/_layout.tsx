import '../styles.css';

import type { ReactNode } from 'react';

import { SiteFooter } from '../components/site-footer';
import { SiteHeader } from '../components/site-header';

export default async function RootLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-svh flex-col">
      <meta name="description" content="An open, reproducible benchmark for email clients: one mailbox, one machine, one instrument that watches the screen." />
      <meta property="og:site_name" content="mailbench" />
      <meta name="theme-color" content="#f9f9f7" media="(prefers-color-scheme: light)" />
      <meta name="theme-color" content="#0d0d0d" media="(prefers-color-scheme: dark)" />
      <link rel="icon" type="image/svg+xml" href="/favicon.svg" />
      <a
        href="#content"
        className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50 focus:rounded-md focus:bg-raised focus:px-3 focus:py-2"
      >
        Skip to content
      </a>
      <SiteHeader />
      <main id="content" className="flex-1">
        {children}
      </main>
      <SiteFooter />
    </div>
  );
}

export const getConfig = async () => {
  return {
    render: 'static',
  } as const;
};
