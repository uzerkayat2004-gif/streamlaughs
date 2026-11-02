import type { CrowdState } from '@laughline/shared';
import { Dashboard } from '../../components/dashboard';
import { StreamerNight } from '../../components/streamer-night';
import { DEMO_STREAMS } from '../../lib/demo-streams';
import { SAMPLE_RATINGS } from '../../lib/streamer-ratings';

export default async function Demo({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const snapshot: CrowdState = {
    channel: 'pixelcamp',
    source: 'live',
    state: 'live',
    laughingNow: 27,
    laughlineViewers: 64,
    laughPercent: 42,
    topWords: [
      { word: 'LMAO', count: 19 },
      { word: 'no way', count: 11 },
      { word: 'bro', count: 7 },
    ],
    updatedAt: 0,
    testTraffic: true,
  };
  return (
    <Dashboard
      demo
      channel="pixelcamp"
      api=""
      snapshot={snapshot}
      initialTab={(await searchParams).tab}
    >
      <StreamerNight
        demo
        channel="pixelcamp"
        streams={DEMO_STREAMS}
        ratings={SAMPLE_RATINGS}
      />
    </Dashboard>
  );
}
