import { z } from 'zod';
import { ChannelLoginSchema } from './crowd';

const Claims = z
  .object({
    v: z.literal(1),
    iss: z.literal('laughline-web'),
    aud: z.literal('crowd-timeline'),
    channel: ChannelLoginSchema,
    sub: z.string().regex(/^\d{1,32}$/),
    issuedAt: z.number().int().nonnegative(),
    expiresAt: z.number().int().positive(),
  })
  .strict();
const encoder = new TextEncoder();
const encode = (bytes: Uint8Array) =>
  btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
const decode = (value: string) =>
  Uint8Array.from(atob(value.replace(/-/g, '+').replace(/_/g, '/')), (c) =>
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
export async function issueOwnerToken(
  secret: string,
  channel: string,
  sub: string,
  now = Date.now(),
) {
  if (secret.length < 32)
    throw new Error('Owner signing key is not configured');
  const body = encode(
    encoder.encode(
      JSON.stringify(
        Claims.parse({
          v: 1,
          iss: 'laughline-web',
          aud: 'crowd-timeline',
          channel,
          sub,
          issuedAt: now,
          expiresAt: now + 60000,
        }),
      ),
    ),
  );
  return `${body}.${encode(new Uint8Array(await crypto.subtle.sign('HMAC', await key(secret), encoder.encode(body))))}`;
}
export async function verifyOwnerToken(
  secret: string | undefined,
  token: string,
  channel: string,
  now = Date.now(),
) {
  try {
    if (
      !secret ||
      secret.length < 32 ||
      token.length > 2048 ||
      !/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(token)
    )
      return null;
    const [body, signature] = token.split('.');
    if (
      !(await crypto.subtle.verify(
        'HMAC',
        await key(secret),
        decode(signature!),
        encoder.encode(body),
      ))
    )
      return null;
    const claims = Claims.parse(
      JSON.parse(new TextDecoder().decode(decode(body!))),
    );
    return claims.channel === channel &&
      claims.issuedAt <= now + 5000 &&
      claims.expiresAt > now &&
      claims.expiresAt - claims.issuedAt === 60000
      ? claims
      : null;
  } catch {
    return null;
  }
}
