import { authenticated } from '../../../../lib/auth';
import { crowdConfigured } from '../../../../lib/config';
import { report } from '../../../../lib/report';
import { ownsChannel } from '../../../../lib/session-crypto';
export async function GET(
  request: Request,
  { params }: { params: Promise<{ channel: string }> },
) {
  const user = await authenticated(),
    { channel } = await params;
  if (!ownsChannel(user, channel))
    return Response.json(
      { error: 'Owner authorization required' },
      { status: 403, headers: { 'Cache-Control': 'no-store' } },
    );
  if (!crowdConfigured())
    return Response.json(
      { error: 'crowd features aren’t set up yet' },
      { status: 503, headers: { 'Cache-Control': 'no-store' } },
    );
  try {
    const days = new URL(request.url).searchParams.get('days') ?? '7';
    if (!['7', '30'].includes(days))
      return Response.json({ error: 'Choose 7 or 30 days' }, { status: 400 });
    return Response.json(await report(user!, channel, days === '30' ? 30 : 7), {
      headers: { 'Cache-Control': 'no-store' },
    });
  } catch {
    return Response.json(
      { error: 'Crowd history is unavailable. Try again shortly.' },
      { status: 503, headers: { 'Cache-Control': 'no-store' } },
    );
  }
}
