import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { Dashboard } from '../../../components/dashboard';
import { StreamerNight } from '../../../components/streamer-night';
import { authenticated } from '../../../lib/auth';
import { crowdConfigured, workerUrl } from '../../../lib/config';
import { report } from '../../../lib/report';
import { ownsChannel } from '../../../lib/session-crypto';
export const dynamic = 'force-dynamic';
export default async function ChannelDashboard({
  params,
  searchParams,
}: {
  params: Promise<{ channel: string }>;
  searchParams: Promise<{ tab?: string; days?: string }>;
}) {
  const user = await authenticated();
  if (!user) redirect('/streamers');
  const { channel } = await params;
  if (!ownsChannel(user, channel)) notFound();
  const query = await searchParams,
    days = query.days === '30' ? 30 : 7;
  const crowdReady = crowdConfigured();
  const data = crowdReady
    ? await report(user, channel, days).catch(() => null)
    : null;
  return (
    <Dashboard
      channel={channel}
      api={crowdReady ? workerUrl() : ''}
      initialTab={query.tab}
    >
      <div className="history-range">
        <Link
          href={`/dashboard/${channel}?tab=past&days=7`}
          aria-current={days === 7 ? 'page' : undefined}
        >
          last 7 days
        </Link>
        <Link
          href={`/dashboard/${channel}?tab=past&days=30`}
          aria-current={days === 30 ? 'page' : undefined}
        >
          last 30 days
        </Link>
      </div>
      {crowdReady ? (
        <StreamerNight
          channel={channel}
          streams={data?.streams ?? []}
          // Fan ratings arrive from the Worker (v0.8.7); until then the tile
          // explains that ratings start next stream.
          ratings={
            (
              data as {
                ratings?: import('../../../lib/streamer-ratings').StreamerRatings;
              } | null
            )?.ratings ?? null
          }
        />
      ) : (
        <div className="quiet-empty">
          <span>◡</span>
          <h2>your fans are almost here.</h2>
          <p>
            sign-in is ready. past streams will appear after fan reactions are
            set up.
          </p>
          <Link href="/demo">explore the demo ↗</Link>
        </div>
      )}
    </Dashboard>
  );
}
