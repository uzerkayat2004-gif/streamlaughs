import type { Metadata } from 'next';
import { InstallDownload } from '../../components/install-download';
import { InstallGuide } from '../../components/install-guide';
export const metadata: Metadata = { title: 'a little setup, a lot of laughs' };
export default async function Install({
  searchParams,
}: {
  searchParams: Promise<{ downloaded?: string | string[] }>;
}) {
  const automatic = (await searchParams).downloaded === '1';
  return (
    <main className="standard-page install-page">
      <header className="page-intro">
        <p className="eyebrow">one tiny extension. six little steps.</p>
        <h1>
          make room
          <br />
          for the <em>crowd.</em>
        </h1>
        <p>one ZIP for Windows, Mac and Linux. your audio stays on your PC.</p>
        <InstallDownload automatic={automatic} />
        <p className="download-browser-note">also works in Edge / Brave</p>
      </header>
      <InstallGuide />
    </main>
  );
}
