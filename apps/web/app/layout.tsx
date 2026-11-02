import { PRODUCT } from '@laughline/shared';
import type { Metadata } from 'next';
import localFont from 'next/font/local';
import Link from 'next/link';
import { Brand } from '../components/brand';
import { SiteMotion } from '../components/site-motion';
import { StoreButtons } from '../components/store-buttons';
import { siteUrl } from '../lib/config';
import './globals.css';

const display = localFont({
  src: '../public/fonts/bricolage-grotesque.woff2',
  variable: '--display',
  display: 'swap',
});
const inter = localFont({
  src: '../public/fonts/inter.woff2',
  variable: '--body',
  display: 'swap',
});
export const metadata: Metadata = {
  metadataBase: new URL(siteUrl()),
  title: { default: PRODUCT.name, template: `%s · ${PRODUCT.name}` },
  description: PRODUCT.pitch,
  applicationName: PRODUCT.name,
  icons: {
    icon: `/icon.svg?v=${PRODUCT.version}`,
    shortcut: `/icon.svg?v=${PRODUCT.version}`,
    apple: `/apple-icon?v=${PRODUCT.version}`,
  },
  openGraph: {
    title: PRODUCT.name,
    siteName: PRODUCT.name,
    description: PRODUCT.pitch,
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: PRODUCT.name,
    description: PRODUCT.pitch,
  },
  appleWebApp: { title: PRODUCT.name },
};
export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="en"
      data-scroll-behavior="smooth"
      className={`${display.variable} ${inter.variable}`}
    >
      <body>
        <SiteMotion />
        <a className="skip-link" href="#content">
          skip to the good part
        </a>
        <header className="site-header">
          <Brand />
          <nav aria-label="main navigation">
            <Link href="/try">the demo</Link>
            <Link href="/streamers">for streamers</Link>
            <Link href="/privacy">privacy</Link>
            <StoreButtons compact />
          </nav>
        </header>
        <div id="content">{children}</div>
        <footer className="site-footer">
          <div className="footer-identity">
            <Brand />
            <p>{PRODUCT.pitch}.</p>
            <div className="footer-badges">
              <span>free</span>
              <span>Chrome + Edge</span>
              <span>audio stays on your PC</span>
            </div>
          </div>
          <nav aria-label="footer navigation">
            <div>
              <strong>product</strong>
              <Link href="/try">demo</Link>
              <Link href="/install">install</Link>
            </div>
            <div>
              <strong>streamers</strong>
              <Link href="/streamers">for streamers</Link>
              <Link href="/demo">sample page</Link>
            </div>
            <div>
              <strong>trust</strong>
              <Link href="/privacy">privacy</Link>
              <a href="mailto:kayatuzair525@gmail.com">contact ↗</a>
            </div>
          </nav>
          <div className="copyright">
            <span>© 2026 {PRODUCT.name}</span>
            <span>
              made for people who laugh at streams · not affiliated with Twitch
            </span>
          </div>
        </footer>
      </body>
    </html>
  );
}
