import {
  CrowdMinuteSchema,
  CrowdPacketSchema,
  type CrowdState,
} from '@laughline/shared';
import { Dashboard } from '../../components/dashboard';
import { PastStreams } from '../../components/past-streams';
import fixture from '../../data/crowd-sim.json';
import { streamStories } from '../../lib/stories';
export default async function Demo({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const packet = CrowdPacketSchema.safeParse(fixture.live),
    p = packet.success && packet.data.state === 'live' ? packet.data : null;
  const snapshot: CrowdState = {
    channel: fixture.channel,
    source: 'live',
    state: p ? 'live' : 'few',
    laughingNow: p?.laughingNow ?? 0,
    laughlineViewers: p?.sharing ?? 0,
    laughPercent: p?.laughPercent ?? 0,
    topWords: p?.bubbles.map((b) => ({ word: b.text, count: b.count })) ?? [],
    updatedAt: 0,
    testTraffic: true,
  };
  const rows = fixture.minutes.map((row) => CrowdMinuteSchema.parse(row));
  return (
    <Dashboard
      demo
      channel={fixture.channel}
      api=""
      snapshot={snapshot}
      initialTab={(await searchParams).tab}
    >
      <PastStreams streams={streamStories(rows, [])} />
    </Dashboard>
  );
}
