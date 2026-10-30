import { PRODUCT } from '@laughline/shared';
import type { Metadata } from 'next';
import localFont from 'next/font/local';
import Link from 'next/link';
import { Brand, LogoMark } from '../components/brand';
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
  icons: { icon: '/icon.svg', shortcut: '/icon.svg', apple: '/apple-icon' },
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
        <a className="skip-link" href="#content">
          skip to the good part
        </a>
        <header className="site-header">
          <Brand />
          <nav aria-label="main navigation">
            <Link href="/try">the demo</Link>
            <Link href="/streamers">for streamers</Link>
            <Link href="/privacy">privacy</Link>
            <Link className="nav-cta" href="/install?downloaded=1">
              Download <span>↗</span>
            </Link>
          </nav>
        </header>
        <div id="content">{children}</div>
        <footer className="site-footer">
          <div className="footer-identity">
            <LogoMark />
            <Brand />
            <p>{PRODUCT.pitch}.</p>
          </div>
          <nav aria-label="footer navigation">
            <Link href="/try">demo</Link>
            <Link href="/streamers">for streamers</Link>
            <Link href="/install">install help</Link>
            <Link href="/privacy">privacy</Link>
            <a href="mailto:kayatuzair525@gmail.com">contact ↗</a>
          </nav>
          <p className="copyright">© 2026 {PRODUCT.name}</p>
        </footer>
      </body>
    </html>
  );
}
