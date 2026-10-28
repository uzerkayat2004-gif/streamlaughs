import { timingSafeEqual } from 'node:crypto';
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { authCookie, cookieOptions } from '../../../lib/auth';
import { secret, siteUrl } from '../../../lib/config';
import { seal, unseal } from '../../../lib/session-crypto';
import { exchangeCode, validateIdentity } from '../../../lib/twitch';
export async function GET(request: Request) {
  let clearPending = false;
  try {
    const query = new URL(request.url).searchParams,
      code = query.get('code'),
      state = query.get('state');
    const pending = await unseal(
      (await cookies()).get(authCookie())?.value,
      secret('SESSION_SECRET'),
    );
    clearPending = pending?.kind === 'oauth';
    if (
      query.has('error') ||
      !code ||
      code.length > 2048 ||
      !state ||
      !/^[a-f0-9]{64}$/.test(state) ||
      pending?.kind !== 'oauth' ||
      !timingSafeEqual(Buffer.from(state), Buffer.from(pending.state))
    )
      throw new Error('Invalid callback');
    const token = await exchangeCode(code),
      user = await validateIdentity(token.access_token);
    const seconds = Math.min(8 * 3600, token.expires_in, user.expires_in);
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
          userId: user.user_id,
          accessToken: token.access_token,
        },
        secret('SESSION_SECRET'),
        seconds,
      ),
      cookieOptions(seconds),
    );
    return response;
  } catch {
    const response = NextResponse.redirect(
      `${siteUrl()}/streamers?login=retry`,
    );
    response.headers.set('Referrer-Policy', 'no-referrer');
    if (clearPending) response.cookies.set(authCookie(), '', cookieOptions(0));
    return response;
  }
}
