import { PRODUCT } from '@laughline/shared';
import type { Metadata } from 'next';
import { ExtensionDemo } from '../../components/extension-demo';
import { StoreButtons } from '../../components/store-buttons';
export const metadata: Metadata = {
  title: 'take a peek',
  description: `Watch a full ${PRODUCT.name} night on a Twitch stream, or click along. No install, login or microphone needed.`,
};
export default function Try() {
  return (
    <main className="standard-page try-page">
      <header className="page-intro">
        <p className="eyebrow">THE DEMO</p>
        <h1>
          take a <em>peek.</em>
        </h1>
        <p>
          A whole StreamLaughs night on Twitch, in about a minute.
          <br />
          Sit back, or click along yourself.
        </p>
      </header>
      <ExtensionDemo />
      <section className="try-download">
        <h2>
          your stream. <em>your turn.</em>
        </h2>
        <StoreButtons />
      </section>
    </main>
  );
}
