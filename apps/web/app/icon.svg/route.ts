import { PRODUCT } from '@laughline/shared';
import { SMILE_PATH } from '../../../extension/src/SmileLogo';
export function GET() {
  const title = PRODUCT.name
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;');
  return new Response(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><title>${title}</title><path d="${SMILE_PATH}" fill="none" stroke="#FFD23F" stroke-width="6" stroke-linecap="round"/></svg>`,
    {
      headers: {
        'Content-Type': 'image/svg+xml',
        'Cache-Control': 'public, max-age=86400',
      },
    },
  );
}
