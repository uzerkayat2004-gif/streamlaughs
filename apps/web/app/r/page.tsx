import { PRODUCT, parseRecapShare } from '@laughline/shared';
import Link from 'next/link';
import { LogoMark } from '../../components/brand';
import { StoreButtons } from '../../components/store-buttons';
import { recapChips, recapMetadata } from '../../lib/recap-share';
export const dynamic = 'force-dynamic';
type Props = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};
export async function generateMetadata({ searchParams }: Props) {
  return recapMetadata(parseRecapShare(await searchParams));
}
export default async function SharedRecap({ searchParams }: Props) {
  const data = parseRecapShare(await searchParams);
  if (!data)
    return (
      <main className="standard-page shared-recap-page">
        <h1>this recap link needs a little help.</h1>
        <p>ask for a fresh link, or start your own story.</p>
        <Link className="primary-button" href="/install">
          get your own recap
        </Link>
      </main>
    );
  const suffix =
    data.stream % 100 >= 11 && data.stream % 100 <= 13
      ? 'th'
      : ({ 1: 'st', 2: 'nd', 3: 'rd' }[data.stream % 10] ?? 'th');
  return (
    <main className="shared-recap-page">
      <article className="public-recap-card" aria-label="shared recap">
        <div className="public-recap-brand">
          <LogoMark size={42} />
          <span>{PRODUCT.wordmark}</span>
        </div>
        <header>
          <span className="public-recap-avatar">
            {data.streamer.charAt(0).toUpperCase()}
          </span>
          <div>
            <b>{data.streamer}</b>
            <small>
              {data.date}
              {data.minutes !== undefined &&
                ` · ${data.minutes < 1 ? 'under a minute' : `${data.minutes} minutes`}`}
            </small>
          </div>
        </header>
        {data.replay && (
          <p className="public-recap-ordinal">watched a replay</p>
        )}
        <p>I laughed</p>
        <strong className="public-recap-number">{data.laughs}</strong>
        <h1>times with {data.streamer}</h1>
        <div className="public-recap-chips">
          {recapChips(data).map(([label, value]) => (
            <div key={label}>
              <small>{label}</small>
              <b>{value}</b>
            </div>
          ))}
        </div>
        <p className="public-recap-ordinal">
          my {data.stream}
          {suffix} stream with {data.streamer}
        </p>
        <small>shared stats · provided by the person sharing this link</small>
      </article>
      <div className="shared-recap-cta">
        <h2>your next laugh could be a story.</h2>
        <StoreButtons />
        <p>private, on-device · no account needed</p>
      </div>
    </main>
  );
}
