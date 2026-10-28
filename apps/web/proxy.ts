import { type NextRequest, NextResponse } from 'next/server';
import { logOAuthFailure, OAuthFailure } from './lib/oauth-errors';

export function proxy(request: NextRequest) {
  // Twitch can return registration errors to the app's registered homepage.
  // Keep provider descriptions and state out of the rendered page and retry URL.
  if (
    request.nextUrl.pathname === '/' &&
    request.nextUrl.searchParams.get('error') === 'redirect_mismatch'
  ) {
    logOAuthFailure(new OAuthFailure('redirect_mismatch'));
    const response = NextResponse.redirect(
      new URL('/streamers?login=retry&reason=redirect_mismatch', request.url),
    );
    response.headers.set('Cache-Control', 'no-store');
    response.headers.set('Referrer-Policy', 'no-referrer');
    return response;
  }
  return NextResponse.next();
}

export const config = { matcher: '/' };
