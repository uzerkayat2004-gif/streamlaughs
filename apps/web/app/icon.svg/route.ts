import { PRODUCT } from '@laughline/shared';
export function GET() {
  const title = PRODUCT.name
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;');
  return new Response(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128"><title>${title}</title><rect width="128" height="128" rx="32" fill="#15151d"/><path d="M30 68Q64 125 98 68" fill="none" stroke="#FFD23F" stroke-width="12"/></svg>`,
    {
      headers: {
        'Content-Type': 'image/svg+xml',
        'Cache-Control': 'public, max-age=86400',
      },
    },
  );
}
