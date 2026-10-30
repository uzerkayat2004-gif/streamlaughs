import { PRODUCT } from '@laughline/shared';
import type { Metadata } from 'next';
import Link from 'next/link';
import { Arrow } from '../../components/brand';
import { ExtensionDemo } from '../../components/extension-demo';
export const metadata: Metadata = {
  title: 'take a peek',
  description: `Try a guided, simulated ${PRODUCT.name} session. No install, login or microphone needed.`,
};
export default function Try() {
  return (
    <main className="standard-page try-page">
      <header className="page-intro">
        <p className="eyebrow">A DEMO. A VERY GOOD TIME.</p>
        <h1>
          take a <em>peek.</em>
        </h1>
        <p>
          Your next Twitch stream, with a little more company.
          <br />
          No install. No mic. All reactions here are simulated.
        </p>
      </header>
      <ExtensionDemo />
      <section className="try-download">
        <h2>
          your stream. <em>your turn.</em>
        </h2>
        <Link className="button yellow" href="/install?downloaded=1">
          Download {PRODUCT.name} <Arrow />
        </Link>
      </section>
    </main>
  );
}
