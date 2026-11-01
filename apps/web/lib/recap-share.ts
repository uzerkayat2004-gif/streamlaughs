import 'server-only';
import type { Metadata } from 'next';
import { PRODUCT, recapShareUrl, type RecapShare } from '@laughline/shared';
import { siteUrl } from './config';
export function recapMetadata(data: RecapShare | null): Metadata {
  if (!data)
    return {
      title: 'recap link needs a little help',
      robots: { index: false, follow: false },
    };
  const title = `I laughed ${data.laughs} times with ${data.streamer}${data.replay ? ' · watched a replay' : ''}`;
  const url = recapShareUrl(siteUrl(), data);
  const image = recapShareUrl(siteUrl(), data, true);
  return {
    title,
    description: `a ${PRODUCT.name} recap · stats only, shared by its creator`,
    alternates: { canonical: url },
    robots: { index: false, follow: false },
    openGraph: {
      title,
      description: PRODUCT.pitch,
      type: 'website',
      url,
      siteName: PRODUCT.name,
      images: [{ url: image, width: 1200, height: 630, alt: title }],
    },
    twitter: { card: 'summary_large_image', title, images: [image] },
  };
}
export const shareTime = (s: number) =>
  `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
export function recapChips(d: RecapShare): [string, string][] {
  return [
    d.word ? ['most used word', d.word] : null,
    d.funniest ? ['funniest word', d.funniest] : null,
    d.moment !== undefined ? ['biggest moment', shareTime(d.moment)] : null,
    d.hype ? ['hype shouts', String(d.hype)] : null,
  ].filter((v): v is [string, string] => v !== null);
}
export const shareHeaders = {
  'Cache-Control': 'private, no-store, max-age=0',
  'Referrer-Policy': 'no-referrer',
  'X-Content-Type-Options': 'nosniff',
};
