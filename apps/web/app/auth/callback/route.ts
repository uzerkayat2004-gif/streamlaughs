import { timingSafeEqual } from 'node:crypto';
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { authCookie, cookieOptions } from '../../../lib/auth';
import { secret, siteUrl } from '../../../lib/config';
import { logOAuthFailure, OAuthFailure } from '../../../lib/oauth-errors';
import { seal, unseal } from '../../../lib/session-crypto';
import {
  currentTwitchUser,
  exchangeCode,
  validateIdentity,
} from '../../../lib/twitch';
export async function GET(request: Request) {
  let clearPending = false;
  try {
    const query = new URL(request.url).searchParams,
      code = query.get('code'),
      state = query.get('state');
    const stateCookie = (await cookies()).get(authCookie())?.value;
    const pending = await unseal(stateCookie, secret('SESSION_SECRET'));
    clearPending = pending?.kind === 'oauth';
    if (query.has('error')) throw new OAuthFailure('provider_denied');
    if (!stateCookie) throw new OAuthFailure('state_missing');
    if (pending?.kind !== 'oauth') throw new OAuthFailure('state_invalid');
    if (!code || code.length > 2048 || !state || !/^[a-f0-9]{64}$/.test(state))
      throw new OAuthFailure('callback_invalid');
    if (!timingSafeEqual(Buffer.from(state), Buffer.from(pending.state)))
      throw new OAuthFailure('state_mismatch');
    console.info(
      '[streamlaughs.auth]',
      JSON.stringify({ code: 'state_verified', cookiePresent: true }),
    );
    const token = await exchangeCode(code),
      identity = await validateIdentity(token.access_token),
      user = await currentTwitchUser(token.access_token);
    if (user.id !== identity.user_id || user.login !== identity.login)
      throw new OAuthFailure('identity_mismatch');
    const seconds = Math.min(8 * 3600, token.expires_in, identity.expires_in);
    const response = NextResponse.redirect(
      `${siteUrl()}/dashboard/${user.login}`,
    );
    response.headers.set('Cache-Control', 'no-store');
    response.headers.set('Referrer-Policy', 'no-referrer');
    response.cookies.set(
      authCookie(),
      await seal(
        {
          kind: 'session',
          login: user.login,
          userId: user.id,
          accessToken: token.access_token,
        },
        secret('SESSION_SECRET'),
        seconds,
      ),
      cookieOptions(seconds),
    );
    console.info(
      '[streamlaughs.auth]',
      JSON.stringify({ code: 'login_succeeded' }),
    );
    return response;
  } catch (error) {
    const failure = logOAuthFailure(error);
    const response = NextResponse.redirect(
      `${siteUrl()}/streamers?login=retry&reason=${failure.code}`,
    );
    response.headers.set('Referrer-Policy', 'no-referrer');
    response.headers.set('Cache-Control', 'no-store');
    if (clearPending) response.cookies.set(authCookie(), '', cookieOptions(0));
    return response;
  }
}
