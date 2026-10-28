import { PRODUCT } from '@laughline/shared';
import identity from '../../../extension/extension-identity.json';
import { releaseUrl, siteUrl } from '../../lib/config';
export const dynamic = 'force-dynamic';
export async function GET(request: Request) {
  const origin = request.headers.get('Origin');
  const ids = [
    identity.id,
    ...(process.env.STORE_EXTENSION_IDS ?? '')
      .split(',')
      .filter((id) => /^[a-p]{32}$/.test(id)),
  ];
  const headers = new Headers({
    'Cache-Control': 'public, max-age=3600',
    Vary: 'Origin',
  });
  if (origin && ids.some((id) => origin === `chrome-extension://${id}`))
    headers.set('Access-Control-Allow-Origin', origin);
  return Response.json(
    {
      version: PRODUCT.version,
      installUrl: `${siteUrl()}/install`,
      releaseUrl: releaseUrl(),
    },
    { headers },
  );
}
