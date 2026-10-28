import { PRODUCT } from '@laughline/shared';
import type { Metadata } from 'next';
import { Arrow } from '../../components/brand';
import { InstallGuide } from '../../components/install-guide';
export const metadata: Metadata = { title: 'a little setup, a lot of laughs' };
export default function Install() {
  return (
    <main className="standard-page install-page">
      <header className="page-intro">
        <p className="eyebrow">one tiny extension. three little steps.</p>
        <h1>
          make room
          <br />
          for the <em>crowd.</em>
        </h1>
        <p>one ZIP for Windows, Mac and Linux. your audio stays on your PC.</p>
        <a className="button yellow install-download" href="/download" download>
          Download {PRODUCT.name} <Arrow />
        </a>
        <p className="download-browser-note">also works in Edge / Brave</p>
      </header>
      <InstallGuide />
    </main>
  );
}
