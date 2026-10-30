import { Link } from 'waku';

export default async function NotFoundPage() {
  return (
    <>
      <title>Not found — mailbench</title>
      <meta name="robots" content="noindex" />
      <section className="mx-auto max-w-[1120px] px-5 pt-24 pb-10">
        <p className="eyebrow">404</p>
        <h1 className="mt-3 text-[clamp(2rem,4.4vw,3rem)] leading-[1.05] font-bold tracking-[-0.03em]">
          Nothing measured here
        </h1>
        <p className="mt-5 max-w-[36rem] text-[16px] leading-relaxed text-ink-2">
          That page does not exist, or has moved. The results are{' '}
          <Link to="/results" className="link">
            here
          </Link>
          , and the clients{' '}
          <Link to="/clients" className="link">
            here
          </Link>
          .
        </p>
      </section>
    </>
  );
}

export const getConfig = async () => {
  return {
    render: 'static',
  } as const;
};
