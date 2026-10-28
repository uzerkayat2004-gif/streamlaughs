import { PRODUCT } from '@laughline/shared';
import type { Metadata } from 'next';
import localFont from 'next/font/local';
import Link from 'next/link';
import { Brand } from '../components/brand';
import { siteUrl, sourceUrl } from '../lib/config';
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
  icons: { icon: '/icon.svg', shortcut: '/icon.svg' },
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
            <Link href="/for-streamers">for streamers</Link>
            <Link href="/privacy">privacy</Link>
            <Link className="nav-cta" href="/install">
              get the extension <span>↗</span>
            </Link>
          </nav>
        </header>
        <div id="content">{children}</div>
        <footer className="site-footer">
          <Brand />
          <p>your audio stays yours. the good bits bring us together.</p>
          <div>
            <Link href="/privacy">privacy</Link>
            <Link href="/demo">try the demo ↗</Link>
            {sourceUrl() && (
              <a href={sourceUrl()!} target="_blank" rel="noreferrer">
                source code ↗
              </a>
            )}
          </div>
        </footer>
      </body>
    </html>
  );
}
