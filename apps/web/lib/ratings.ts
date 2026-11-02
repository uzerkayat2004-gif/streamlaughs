import 'server-only';
import { issueOwnerToken, RatingsReportSchema } from '@laughline/shared';
import { secret, workerUrl } from './config';
import { ownsChannel } from './session-crypto';
export async function fanRatings(
  user: { login: string; userId: string },
  channel: string,
) {
  if (!ownsChannel(user, channel)) throw new Error('owner only');
  const response = await fetch(
    `${workerUrl()}/v1/channels/${channel}/ratings`,
    {
      headers: {
        Authorization: `Bearer ${await issueOwnerToken(secret('WORKER_OWNER_KEY'), channel, user.userId)}`,
      },
      cache: 'no-store',
      signal: AbortSignal.timeout(10000),
    },
  );
  if (!response.ok) throw new Error('ratings unavailable');
  return RatingsReportSchema.parse(await response.json());
}
