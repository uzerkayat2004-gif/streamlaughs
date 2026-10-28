import { PRODUCT } from '@laughline/shared';
import Link from 'next/link';
export function Brand() {
  return (
    <Link href="/" className="brand" aria-label={`${PRODUCT.name} home`}>
      {PRODUCT.wordmark}
      <svg viewBox="0 0 96 15" aria-hidden="true">
        <path d="M3 3Q45 22 92 3" />
      </svg>
    </Link>
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
