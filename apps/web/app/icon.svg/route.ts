import { PRODUCT } from '@laughline/shared';
export function GET() {
  const title = PRODUCT.name
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;');
  return new Response(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128"><title>${title}</title><rect width="128" height="128" rx="30" fill="#090b10"/><circle cx="64" cy="64" r="55" fill="#FFD23F"/><ellipse cx="45" cy="49" rx="6" ry="9" fill="#090b10"/><ellipse cx="83" cy="49" rx="6" ry="9" fill="#090b10"/><path d="M34 76Q64 111 94 76" fill="none" stroke="#090b10" stroke-width="8" stroke-linecap="round"/></svg>`,
    {
      headers: {
        'Content-Type': 'image/svg+xml',
        'Cache-Control': 'public, max-age=86400',
      },
    },
  );
}
