import { EncryptJWT, jwtDecrypt } from 'jose';
import { z } from 'zod';

const Login = z.string().regex(/^[a-z0-9_]{1,25}$/);
export const AuthSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('oauth'),
    state: z.string().regex(/^[a-f0-9]{64}$/),
  }),
  z
    .object({
      kind: z.literal('session'),
      login: Login,
      userId: z.string().regex(/^\d{1,32}$/),
      displayName: z.string().min(1).max(100),
    })
    .strict(),
]);
export type Auth = z.infer<typeof AuthSchema>;
async function key(secret: string) {
  if (secret.length < 32)
    throw new Error('Session secret must have at least 32 characters');
  return new Uint8Array(
    await crypto.subtle.digest('SHA-256', new TextEncoder().encode(secret)),
  );
}
export async function seal(auth: Auth, secret: string, seconds: number) {
  return new EncryptJWT(AuthSchema.parse(auth))
    .setProtectedHeader({ alg: 'dir', enc: 'A256GCM' })
    .setIssuedAt()
    .setIssuer('laughline-web')
    .setAudience('streamer-session')
    .setExpirationTime(`${seconds}s`)
    .encrypt(await key(secret));
}
export async function unseal(
  value: string | undefined,
  secret: string,
): Promise<Auth | null> {
  if (!value || value.length > 4096) return null;
  try {
    const { payload } = await jwtDecrypt(value, await key(secret), {
      issuer: 'laughline-web',
      audience: 'streamer-session',
      keyManagementAlgorithms: ['dir'],
      contentEncryptionAlgorithms: ['A256GCM'],
    });
    const auth = { ...payload };
    for (const claim of ['iss', 'aud', 'iat', 'exp', 'nbf', 'jti'])
      delete auth[claim];
    return AuthSchema.parse(auth);
  } catch {
    return null;
  }
}
export function ownsChannel(user: { login: string } | null, channel: string) {
  return !!user && /^[a-z0-9_]{1,25}$/.test(channel) && user.login === channel;
}
