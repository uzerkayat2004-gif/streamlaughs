import { PRODUCT } from '@laughline/shared';
import Link from 'next/link';
export function Brand() {
  return (
    <Link href="/" className="brand" aria-label={`${PRODUCT.name} home`}>
      {PRODUCT.wordmark === 'streamlaughs' ? (
        // The bundled Bricolage letterforms are outlined, so the logo needs no font load.
        // biome-ignore lint/performance/noImgElement: A small vector logo with explicit dimensions.
        <img
          src="/wordmark.svg"
          width="220"
          height="44"
          alt={PRODUCT.wordmark}
        />
      ) : (
        <span>{PRODUCT.wordmark}</span>
      )}
    </Link>
  );
}
export function LogoMark({ size = 40 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 128 128"
      fill="none"
      aria-hidden="true"
    >
      <circle cx="64" cy="64" r="59" fill="#FFD23F" />
      <ellipse cx="44" cy="49" rx="6" ry="9" fill="#090b10" />
      <ellipse cx="84" cy="49" rx="6" ry="9" fill="#090b10" />
      <path
        d="M32 76Q64 113 96 76"
        stroke="#090b10"
        strokeWidth="8"
        strokeLinecap="round"
      />
    </svg>
  );
}
export function Arrow() {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
    >
      <path
        d="M5 12h14m-6-6 6 6-6 6"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
