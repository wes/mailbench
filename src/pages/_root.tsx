import type { ReactNode } from 'react';

export default async function RootElement({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <meta name="color-scheme" content="light dark" />
        <script
          defer
          src="https://umami.limehosting.com/script.js"
          data-website-id="10608a43-a4d7-4014-b51f-55e6cbd541ea"
        />
      </head>
      <body>{children}</body>
    </html>
  );
}

export const getConfig = async () => {
  return {
    render: 'static',
  } as const;
};
