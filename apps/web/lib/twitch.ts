import 'server-only';
import { z } from 'zod';
import { callbackUrl, helixOrigin, secret, twitchOrigin } from './config';
import { OAuthFailure, type OAuthFailureCode } from './oauth-errors';

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
async function json(
  url: string,
  init: RequestInit = {},
  failure: OAuthFailureCode = 'token_exchange',
) {
  let response: Response;
  try {
    response = await fetch(url, {
      ...init,
      cache: 'no-store',
      signal: AbortSignal.timeout(10000),
    });
  } catch {
    throw new OAuthFailure(failure);
  }
  if (!response.ok) {
    let detail: OAuthFailure['detail'];
    try {
      const body = await response.json();
      const message =
        typeof body.message === 'string' ? body.message.toLowerCase() : '';
      if (message === 'invalid client secret') detail = 'invalid_client_secret';
      else if (message === 'invalid client id') detail = 'invalid_client_id';
      else if (message === 'invalid authorization code')
        detail = 'invalid_authorization_code';
      else if (
        message === 'redirect mismatch' ||
        message === 'redirect_uri mismatch'
      )
        detail = 'redirect_mismatch';
    } catch {
      /* Provider response bodies are never logged. */
    }
    throw new OAuthFailure(failure, response.status, detail);
  }
  try {
    return await response.json();
  } catch {
    throw new OAuthFailure(failure, response.status);
  }
}
async function token(values: Record<string, string>) {
  const clientId = secret('TWITCH_CLIENT_ID'),
    clientSecret = secret('TWITCH_CLIENT_SECRET');
  if (/\s/.test(clientId) || /\s/.test(clientSecret))
    throw new OAuthFailure('credentials_whitespace');
  const parsed = Token.safeParse(
    await json(
      `${twitchOrigin()}/oauth2/token`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          client_id: clientId,
          client_secret: clientSecret,
          ...values,
        }),
      },
      values.grant_type === 'client_credentials'
        ? 'credentials_rejected'
        : 'token_exchange',
    ),
  );
  if (!parsed.success) throw new OAuthFailure('token_response');
  return parsed.data;
}
export const exchangeCode = (code: string) =>
  token({
    grant_type: 'authorization_code',
    code,
    redirect_uri: callbackUrl(),
  });
export async function validateIdentity(accessToken: string) {
  const parsed = Identity.safeParse(
    await json(
      `${twitchOrigin()}/oauth2/validate`,
      {
        headers: { Authorization: `OAuth ${accessToken}` },
      },
      'identity_validation',
    ),
  );
  if (!parsed.success) throw new OAuthFailure('identity_response');
  const identity = parsed.data;
  if (identity.client_id !== secret('TWITCH_CLIENT_ID'))
    throw new OAuthFailure('wrong_client');
  return identity;
}

const User = z.object({
  data: z
    .array(
      z.object({
        id: z.string().regex(/^\d{1,32}$/),
        login: z.string().regex(/^[a-z0-9_]{1,25}$/),
      }),
    )
    .length(1),
});
export async function currentTwitchUser(accessToken: string) {
  const parsed = User.safeParse(
    await json(
      `${helixOrigin()}/helix/users`,
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Client-Id': secret('TWITCH_CLIENT_ID'),
        },
      },
      'user_lookup',
    ),
  );
  if (!parsed.success) throw new OAuthFailure('user_response');
  return parsed.data.data[0]!;
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
export async function checkClientCredentials() {
  if (
    /\s/.test(secret('TWITCH_CLIENT_ID')) ||
    /\s/.test(secret('TWITCH_CLIENT_SECRET'))
  )
    throw new OAuthFailure('credentials_whitespace');
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
    console.info(
      '[streamlaughs.auth]',
      JSON.stringify({ code: 'credentials_verified', whitespace: false }),
    );
  }
}
export async function getVods(
  userId: string,
  earliest: number,
): Promise<Vod[]> {
  await checkClientCredentials();
  const result: Vod[] = [];
  let cursor: string | undefined;
  const accessToken = appToken!.value;
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
