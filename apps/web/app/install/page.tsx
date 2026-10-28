import type { Metadata } from 'next';
import { InstallGuide } from '../../components/install-guide';
import { releaseUrl } from '../../lib/config';
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
        <p>Chrome or Edge. Your audio stays on your PC.</p>
      </header>
      <InstallGuide releaseUrl={releaseUrl()} />
    </main>
  );
}
