import 'server-only';
import { z } from 'zod';
import { callbackUrl, helixOrigin, secret, twitchOrigin } from './config';

const Token = z.object({
  access_token: z.string().min(1).max(2048),
  expires_in: z.number().int().positive(),
});
const Identity = z.object({
  client_id: z.string(),
  login: z.string().regex(/^[a-z0-9_]{1,25}$/),
  user_id: z.string().regex(/^\d{1,32}$/),
  expires_in: z.number().positive(),
});
async function json(url: string, init: RequestInit = {}) {
  const response = await fetch(url, {
    ...init,
    cache: 'no-store',
    signal: AbortSignal.timeout(10000),
  });
  if (!response.ok)
    throw new Error('Twitch is unavailable or authorization expired');
  return response.json();
}
async function token(values: Record<string, string>) {
  return Token.parse(
    await json(`${twitchOrigin()}/oauth2/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: secret('TWITCH_CLIENT_ID'),
        client_secret: secret('TWITCH_CLIENT_SECRET'),
        ...values,
      }),
    }),
  );
}
export const exchangeCode = (code: string) =>
  token({
    grant_type: 'authorization_code',
    code,
    redirect_uri: callbackUrl(),
  });
export async function validateIdentity(accessToken: string) {
  const identity = Identity.parse(
    await json(`${twitchOrigin()}/oauth2/validate`, {
      headers: { Authorization: `OAuth ${accessToken}` },
    }),
  );
  if (identity.client_id !== secret('TWITCH_CLIENT_ID'))
    throw new Error('Wrong OAuth client');
  return identity;
}
export type Vod = {
  id: string;
  created_at: string;
  duration: string;
  title: string;
};
const Videos = z.object({
  data: z
    .array(
      z.object({
        id: z.string().regex(/^\d+$/),
        created_at: z.string().datetime(),
        duration: z.string().max(80),
        title: z.string().max(500),
      }),
    )
    .max(100),
  pagination: z.object({ cursor: z.string().max(2000).optional() }).optional(),
});
let appToken: { value: string; expires: number; provider: string } | null =
  null;
export async function getVods(
  userId: string,
  earliest: number,
): Promise<Vod[]> {
  const provider = twitchOrigin();
  if (
    !appToken ||
    appToken.expires <= Date.now() + 60000 ||
    appToken.provider !== provider
  ) {
    const issued = await token({ grant_type: 'client_credentials' });
    appToken = {
      value: issued.access_token,
      expires: Date.now() + issued.expires_in * 1000,
      provider,
    };
  }
  const result: Vod[] = [];
  let cursor: string | undefined;
  const accessToken = appToken.value;
  for (let page = 0; page < 5; page++) {
    const query = new URLSearchParams({
      user_id: userId,
      type: 'archive',
      first: '100',
    });
    if (cursor) query.set('after', cursor);
    const response = await fetch(`${helixOrigin()}/helix/videos?${query}`, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Client-Id': secret('TWITCH_CLIENT_ID'),
      },
      cache: 'no-store',
      signal: AbortSignal.timeout(10000),
    });
    if (response.status === 401) appToken = null;
    if (!response.ok) throw new Error('VOD lookup unavailable');
    const data = Videos.parse(await response.json());
    result.push(...data.data);
    cursor = data.pagination?.cursor;
    if (
      !cursor ||
      !data.data.length ||
      Date.parse(data.data.at(-1)!.created_at) < earliest
    )
      break;
  }
  return result;
}
