import { authenticated } from '../../../../lib/auth';
import { ownsChannel } from '../../../../lib/session-crypto';
import { fanRatings } from '../../../../lib/ratings';
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ channel: string }> },
) {
  const user = await authenticated(),
    { channel } = await params;
  if (!user || !ownsChannel(user, channel))
    return Response.json(
      { error: 'owner authorization required' },
      { status: 403, headers: { 'Cache-Control': 'no-store' } },
    );
  try {
    return Response.json(await fanRatings(user, channel), {
      headers: { 'Cache-Control': 'no-store' },
    });
  } catch {
    return Response.json(
      { error: 'ratings unavailable · try again shortly' },
      { status: 503, headers: { 'Cache-Control': 'no-store' } },
    );
  }
}
