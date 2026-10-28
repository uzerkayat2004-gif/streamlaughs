import {
  type AnonymousClaims,
  AnonymousClaimsSchema,
  CROWD_LIMITS,
} from '@laughline/shared';

const encoder = new TextEncoder();
const encode = (bytes: Uint8Array) =>
  btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
const decode = (text: string) =>
  Uint8Array.from(atob(text.replace(/-/g, '+').replace(/_/g, '/')), (c) =>
    c.charCodeAt(0),
  );
const key = (secret: string) =>
  crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify'],
  );
export async function issueToken(
  secret: string,
  channel: string,
  testTraffic = false,
  now = Date.now(),
) {
  const claims: AnonymousClaims = {
    v: 1,
    id: crypto.randomUUID(),
    channel,
    testTraffic,
    expiresAt: now + CROWD_LIMITS.tokenMs,
  };
  const body = encode(encoder.encode(JSON.stringify(claims)));
  const signature = await crypto.subtle.sign(
    'HMAC',
    await key(secret),
    encoder.encode(body),
  );
  return {
    token: `${body}.${encode(new Uint8Array(signature))}`,
    expiresAt: claims.expiresAt,
  };
}
export async function verifyToken(
  secret: string,
  token: string,
  channel: string,
  now = Date.now(),
): Promise<AnonymousClaims | null> {
  try {
    if (token.length > 1024) return null;
    const parts = token.split('.');
    const [body, signature] = parts;
    if (
      parts.length !== 2 ||
      !body ||
      !signature ||
      !/^[A-Za-z0-9_-]+$/.test(body) ||
      !/^[A-Za-z0-9_-]+$/.test(signature)
    )
      return null;
    if (
      !(await crypto.subtle.verify(
        'HMAC',
        await key(secret),
        decode(signature),
        encoder.encode(body),
      ))
    )
      return null;
    const claims = AnonymousClaimsSchema.parse(
      JSON.parse(new TextDecoder().decode(decode(body))),
    );
    return claims.channel === channel &&
      claims.expiresAt > now &&
      claims.expiresAt <= now + CROWD_LIMITS.tokenMs
      ? claims
      : null;
  } catch {
    return null;
  }
}
export function socketToken(request: Request) {
  const protocols =
    request.headers
      .get('Sec-WebSocket-Protocol')
      ?.split(',')
      .map((s) => s.trim()) ?? [];
  if (!protocols.includes('laughline.v1')) return null;
  const auth = protocols.filter((p) => p.startsWith('auth.'));
  return auth.length === 1 ? auth[0]!.slice(5) : null;
}
