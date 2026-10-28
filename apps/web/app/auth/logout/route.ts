import { NextResponse } from 'next/server';
import { authCookie, cookieOptions } from '../../../lib/auth';
import { siteUrl } from '../../../lib/config';
export async function POST(request: Request) {
  if (request.headers.get('Origin') !== siteUrl())
    return new Response(null, { status: 403 });
  const response = NextResponse.redirect(`${siteUrl()}/streamers`, 303);
  response.cookies.set(authCookie(), '', cookieOptions(0));
  return response;
}
