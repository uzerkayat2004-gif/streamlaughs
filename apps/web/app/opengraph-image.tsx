import { PRODUCT } from '@laughline/shared';
import { ImageResponse } from 'next/og';
import { LogoMark } from '../components/brand';

export const alt = `${PRODUCT.name} — ${PRODUCT.pitch}`;
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

export default function SocialImage() {
  return new ImageResponse(
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        padding: 80,
        background: '#0b0b10',
        color: '#f4f4f7',
      }}
    >
      <div
        style={{ display: 'flex', flexDirection: 'column', marginBottom: 55 }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 24,
            fontSize: 58,
            fontWeight: 800,
            letterSpacing: -3,
          }}
        >
          <LogoMark size={100} /> {PRODUCT.wordmark}
        </div>
        <svg width="190" height="26" viewBox="0 0 190 26" aria-hidden="true">
          <path
            d="M4 5Q92 38 184 5"
            fill="none"
            stroke="#FFD23F"
            strokeWidth="7"
            strokeLinecap="round"
          />
        </svg>
      </div>
      <div
        style={{
          fontSize: 82,
          fontWeight: 800,
          lineHeight: 1.06,
          maxWidth: 1000,
          color: '#2EE6C5',
        }}
      >
        {PRODUCT.pitch}
      </div>
    </div>,
    size,
  );
}
