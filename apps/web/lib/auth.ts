import 'server-only';
import { cookies } from 'next/headers';
import { secret, siteUrl } from './config';
import { unseal } from './session-crypto';
import { validateIdentity } from './twitch';
export const authCookie = () =>
  siteUrl().startsWith('https:') ? '__Host-laughline-auth' : 'laughline-auth';
export const cookieOptions = (maxAge: number) => ({
  httpOnly: true,
  secure: siteUrl().startsWith('https:'),
  sameSite: 'lax' as const,
  path: '/',
  maxAge,
});
export async function authenticated() {
  try {
    const session = await unseal(
      (await cookies()).get(authCookie())?.value,
      secret('SESSION_SECRET'),
    );
    if (session?.kind !== 'session') return null;
    const current = await validateIdentity(session.accessToken);
    return current.user_id === session.userId && current.login === session.login
      ? { login: current.login, userId: current.user_id }
      : null;
  } catch {
    return null;
  }
}
