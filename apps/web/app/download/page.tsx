import { PRODUCT } from '@laughline/shared';
import type { Metadata } from 'next';
import Link from 'next/link';
import { ManualInstall } from '../../components/manual-install';
import { StoreButtons } from '../../components/store-buttons';
export const metadata: Metadata = { title: `get ${PRODUCT.name}` };
export default function Download() {
  return (
    <main className="standard-page install-page">
      <header className="page-intro">
        <p className="eyebrow">YOUR PEOPLE ARE ONE CLICK AWAY.</p>
        <h1>
          get <em>{PRODUCT.name}.</em>
        </h1>
        <p>Add it from your browser’s store. Updates arrive automatically.</p>
        <StoreButtons />
        <p>
          <Link href="/install" className="text-link">
            see the setup steps ↗
          </Link>
        </p>
      </header>
      <ManualInstall />
    </main>
  );
}
