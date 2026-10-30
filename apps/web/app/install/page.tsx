import { PRODUCT } from '@laughline/shared';
import type { Metadata } from 'next';
import { Arrow } from '../../components/brand';
import { InstallDownload } from '../../components/install-download';
import { InstallGuide } from '../../components/install-guide';
export const metadata: Metadata = { title: `add ${PRODUCT.name} in 2 minutes` };
export default async function Install({
  searchParams,
}: {
  searchParams: Promise<{ downloaded?: string | string[] }>;
}) {
  const automatic = (await searchParams).downloaded === '1';
  const stores = Boolean(PRODUCT.chromeStoreUrl || PRODUCT.edgeStoreUrl);
  return (
    <main className="standard-page install-page">
      <header className="page-intro">
        <p className="eyebrow">A LITTLE SETUP. A LOT OF LAUGHS.</p>
        <h1>
          add {PRODUCT.name}
          <br />
          <em>in 2 minutes.</em>
        </h1>
        <p>Free. Works in Chrome, Edge and Brave.</p>
        {stores && (
          <div className="store-buttons">
            {PRODUCT.chromeStoreUrl && (
              <a className="button yellow" href={PRODUCT.chromeStoreUrl}>
                Add to Chrome <Arrow />
              </a>
            )}
            {PRODUCT.edgeStoreUrl && (
              <a className="button yellow" href={PRODUCT.edgeStoreUrl}>
                Add to Edge <Arrow />
              </a>
            )}
          </div>
        )}
        {!stores && <InstallDownload automatic={automatic} />}
      </header>
      <section className="manual-install" aria-label="manual install">
        {stores && (
          <>
            <h2>manual install</h2>
            <InstallDownload automatic={automatic} />
          </>
        )}
        <InstallGuide />
      </section>
    </main>
  );
}
