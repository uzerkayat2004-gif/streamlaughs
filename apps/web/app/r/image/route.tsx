import { PRODUCT, parseRecapShare } from '@laughline/shared';
import { ImageResponse } from 'next/og';
import { recapChips, shareHeaders } from '../../../lib/recap-share';
export const dynamic = 'force-dynamic';
export async function GET(request: Request) {
  const d = parseRecapShare(new URL(request.url).searchParams);
  if (!d)
    return new Response('invalid recap stats', {
      status: 400,
      headers: shareHeaders,
    });
  return new ImageResponse(
    <div
      style={{
        width: '100%',
        height: '100%',
        background: '#FF5C5C',
        color: '#14141A',
        padding: '44px 58px',
        display: 'flex',
        flexDirection: 'column',
        fontFamily: 'sans-serif',
      }}
    >
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}
      >
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            fontSize: 34,
            fontWeight: 700,
          }}
        >
          <span>{PRODUCT.wordmark}</span>
          <svg width="175" height="14" viewBox="0 0 175 14" aria-hidden="true">
            <path
              d="M3 2Q87 23 172 2"
              fill="none"
              stroke="#14141A"
              strokeWidth="4"
            />
          </svg>
        </div>
        <span style={{ fontSize: 21 }}>{d.date}</span>
      </div>
      <div style={{ display: 'flex', flex: 1, alignItems: 'center', gap: 60 }}>
        <div style={{ display: 'flex', flexDirection: 'column', width: 585 }}>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 16,
              marginBottom: 14,
            }}
          >
            <span
              style={{
                width: 58,
                height: 58,
                borderRadius: '50%',
                background: '#087F69',
                color: '#fff',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: 30,
                fontWeight: 700,
              }}
            >
              {d.streamer.charAt(0).toUpperCase()}
            </span>
            <span style={{ fontSize: 26 }}>{d.streamer}</span>
          </div>
          <span style={{ fontSize: 32 }}>I laughed</span>
          <span
            style={{
              fontSize: 152,
              fontWeight: 800,
              lineHeight: 1.1,
              letterSpacing: -7,
            }}
          >
            {d.laughs}
          </span>
          <span style={{ fontSize: 34 }}>times with {d.streamer}</span>
          <span style={{ fontSize: 18, marginTop: 12 }}>
            {d.replay ? 'watched a replay · ' : ''}stream #{d.stream}
            {d.minutes !== undefined
              ? ` · ${d.minutes < 1 ? 'under a minute' : `${d.minutes} minutes`}`
              : ''}
          </span>
        </div>
        <div
          style={{ display: 'flex', flexDirection: 'column', gap: 12, flex: 1 }}
        >
          {recapChips(d).map(([label, value], i) => (
            <div
              key={label}
              style={{
                display: 'flex',
                flexDirection: 'column',
                padding: '14px 22px',
                borderRadius: 20,
                background: i % 2 ? '#2EE6C5' : '#FFD23F',
              }}
            >
              <span style={{ fontSize: 18 }}>{label}</span>
              <span style={{ fontSize: 30, fontWeight: 700 }}>{value}</span>
            </div>
          ))}
        </div>
      </div>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          fontSize: 20,
        }}
      >
        <span>get your own recap</span>
        <span>{new URL(process.env.SITE_URL || PRODUCT.siteUrl).host}</span>
      </div>
    </div>,
    { width: 1200, height: 630, headers: shareHeaders },
  );
}
