import { PRODUCT } from '@laughline/shared';
import { EYES_PATH, MOUTH_PATH } from '../../../extension/src/AppIcon';
export function GET() {
  const title = PRODUCT.name
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;');
  return new Response(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><title>${title}</title><rect width="64" height="64" rx="18" fill="#FFD23F"/><path d="${EYES_PATH}" fill="none" stroke="#14141A" stroke-width="4" stroke-linecap="round"/><path d="${MOUTH_PATH}" fill="#14141A"/></svg>`,
    {
      headers: {
        'Content-Type': 'image/svg+xml',
        'Cache-Control': 'public, max-age=86400',
      },
    },
  );
}
