import 'server-only';
import { issueOwnerToken, TimelineSchema } from '@laughline/shared';
import { secret, workerUrl } from './config';
import { ownsChannel } from './session-crypto';
import { streamStories } from './stories';
import { getVods } from './twitch';
export async function report(
  user: { login: string; userId: string },
  channel: string,
  days: 7 | 30 = 7,
) {
  if (!ownsChannel(user, channel)) throw new Error('Owner only');
  const to = Date.now(),
    from = to - days * 86400000,
    api = workerUrl();
  if (!api) throw new Error('Fan server is not configured');
  const requests: (() => Promise<import('@laughline/shared').CrowdMinute[]>)[] =
    [];
  for (let start = from; start < to; start += 86400000) {
    const end = Math.min(start + 86400000, to);
    requests.push(async () => {
      const response = await fetch(
        `${api}/v1/channels/${channel}/timeline?from=${start}&to=${end}`,
        {
          headers: {
            Authorization: `Bearer ${await issueOwnerToken(secret('WORKER_OWNER_KEY'), channel, user.userId)}`,
          },
          cache: 'no-store',
          signal: AbortSignal.timeout(10000),
        },
      );
      if (!response.ok) throw new Error('Timeline unavailable');
      return TimelineSchema.parse(await response.json()).minutes;
    });
  }
  const minutes: import('@laughline/shared').CrowdMinute[] = [];
  for (let i = 0; i < requests.length; i += 4)
    minutes.push(
      ...(
        await Promise.all(requests.slice(i, i + 4).map((task) => task()))
      ).flat(),
    );
  let vods: Awaited<ReturnType<typeof getVods>> = [],
    vodsUnavailable = false;
  try {
    vods = await getVods(user.userId, from);
  } catch {
    vodsUnavailable = true;
  }
  return {
    channel,
    from,
    to,
    vodsUnavailable,
    streams: streamStories(minutes, vods),
  };
}
