import { PRODUCT } from '@laughline/shared';
import { z } from 'zod';
import identity from '../../../../extension/extension-identity.json';
import { authenticated } from '../../../lib/auth';
import { getPublicProfile, getVods } from '../../../lib/twitch';
export const dynamic = 'force-dynamic';
function cors(request: Request) {
  const origin = request.headers.get('Origin');
  const ids = [
    identity.id,
    PRODUCT.edgeStoreExtensionId,
    PRODUCT.chromeStoreExtensionId,
  ];
  if (!origin || !ids.some((id) => origin === `chrome-extension://${id}`))
    return null;
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Credentials': 'true',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    Vary: 'Origin',
    'Cache-Control': 'no-store',
  };
}
export function OPTIONS(request: Request) {
  const headers = cors(request);
  return new Response(null, {
    status: headers ? 204 : 403,
    headers: headers ?? {},
  });
}
export async function GET(request: Request) {
  const headers = cors(request);
  if (!headers) return new Response(null, { status: 403 });
  const connected = !!(await authenticated());
  return Response.json(
    connected ? { connected: true } : { error: 'sign in on the website first' },
    { status: connected ? 200 : 401, headers },
  );
}
const Input = z
  .object({ login: z.string().regex(/^[a-z0-9_]{1,25}$/) })
  .strict();
export async function POST(request: Request) {
  const headers = cors(request);
  if (!headers) return new Response(null, { status: 403 });
  if (!(await authenticated()))
    return Response.json(
      { error: 'sign in on the website first' },
      { status: 401, headers },
    );
  try {
    const text = await request.text();
    if (text.length > 128) return new Response(null, { status: 400, headers });
    const { login } = Input.parse(JSON.parse(text));
    const profile = await getPublicProfile(login);
    const response = await fetch(profile.avatarUrl, {
      credentials: 'omit',
      redirect: 'error',
      signal: AbortSignal.timeout(5000),
      cache: 'force-cache',
    });
    const mime = response.headers.get('Content-Type')?.split(';')[0];
    if (
      !response.ok ||
      !mime ||
      !['image/png', 'image/jpeg', 'image/webp'].includes(mime)
    )
      throw new Error('image unavailable');
    const bytes = await response.arrayBuffer();
    if (bytes.byteLength > 262144) throw new Error('image unavailable');
    const vods = await getVods(
      profile.userId,
      Date.now() - 60 * 24 * 3600 * 1000,
    ).catch(() => []);
    return Response.json(
      {
        vods: vods.map(({ id, created_at, duration }) => ({
          id,
          created_at,
          duration,
        })),
        login,
        displayName: profile.displayName,
        avatarDataUrl: `data:${mime};base64,${Buffer.from(bytes).toString('base64')}`,
      },
      { headers },
    );
  } catch {
    return Response.json(
      { error: 'photo unavailable · use initials' },
      { status: 400, headers },
    );
  }
}
