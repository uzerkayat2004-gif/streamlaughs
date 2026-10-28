import { randomBytes } from 'node:crypto';
import { NextResponse } from 'next/server';
import { authCookie, cookieOptions } from '../../../lib/auth';
import {
  callbackUrl,
  secret,
  siteUrl,
  twitchOrigin,
} from '../../../lib/config';
import { seal } from '../../../lib/session-crypto';
export async function GET() {
  try {
    const state = randomBytes(32).toString('hex');
    const authorize = new URL(`${twitchOrigin()}/oauth2/authorize`);
    authorize.search = new URLSearchParams({
      client_id: secret('TWITCH_CLIENT_ID'),
      redirect_uri: callbackUrl(),
      response_type: 'code',
      scope: '',
      state,
    }).toString();
    const response = NextResponse.redirect(authorize);
    response.headers.set('Cache-Control', 'no-store');
    response.headers.set('Referrer-Policy', 'no-referrer');
    response.cookies.set(
      authCookie(),
      await seal({ kind: 'oauth', state }, secret('SESSION_SECRET'), 600),
      cookieOptions(600),
    );
    return response;
  } catch {
    return NextResponse.redirect(`${siteUrl()}/streamers?login=unconfigured`);
  }
}
