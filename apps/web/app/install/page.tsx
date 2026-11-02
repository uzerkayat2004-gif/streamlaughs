import { PRODUCT } from '@laughline/shared';
import type { Metadata } from 'next';
import { ManualInstall } from '../../components/manual-install';
import { StoreButtons } from '../../components/store-buttons';
import { JudgeInstall } from '../../components/judge-install';
export const metadata: Metadata = { title: `add ${PRODUCT.name}` };
export default function Install() {
  return (
    <main className="standard-page install-page">
      <header className="page-intro">
        <h1>
          your stream.
          <br />
          <em>your people.</em>
        </h1>
        <p>Free. Private. Ready in a minute.</p>
        <div className="install-options">
          <StoreButtons />
          <JudgeInstall />
        </div>
      </header>
      <section className="store-steps" aria-label="install from the store">
        {[
          [
            '↗',
            'add from the store.',
            'Choose Add to Chrome or Get it for Edge above, then confirm in your browser.',
          ],
          [
            '⌖',
            'pin the smile.',
            'Open your browser’s extensions menu (the puzzle piece) and pin StreamLaughs.',
          ],
          [
            '▷',
            'find your stream.',
            'Open a live Twitch stream. Click the smile, then start.',
          ],
          [
            '♪',
            'allow the mic.',
            'In Welcome, allow your microphone and try “say something”. Choose whether to share anonymous reactions.',
          ],
        ].map(([icon, title, text]) => (
          <article className="install-step" key={title}>
            <span className="store-step-icon" aria-hidden="true">
              {icon}
            </span>
            <h2>{title}</h2>
            <p>{text}</p>
          </article>
        ))}
      </section>
      <p className="store-auto">Updates install automatically.</p>
      <ManualInstall />
    </main>
  );
}
