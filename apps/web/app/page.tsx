import { PRODUCT } from '@laughline/shared';
import Link from 'next/link';
import { Arrow } from '../components/brand';
import {
  FansPlayground,
  HomeMotion,
  Smile,
} from '../components/fans-playground';
import { RatingsPreview } from '../components/ratings-preview';
import { StoreButtons } from '../components/store-buttons';

export default function Home() {
  return (
    <main className="home-page">
      <HomeMotion />
      <section className="full-screen hero" aria-labelledby="hero-title">
        <div className="section-content hero-content hero-with-smile">
          <div className="hero-words">
            <h1 id="hero-title">
              never laugh
              <br />
              <em>alone again.</em>
            </h1>
            <p className="hero-copy">
              A tiny dot on Twitch shows when everyone watching is laughing with
              you. Your audio never leaves your PC.
            </p>
            <div className="hero-actions">
              <StoreButtons />
              <Link className="text-link" href="/try">
                <span className="play-outline">▶</span> watch the demo
              </Link>
            </div>
          </div>
          <FansPlayground orbit />
        </div>
      </section>
      <section
        className="full-screen together-section"
        aria-labelledby="together-title"
      >
        <div className="section-content together-layout" data-reveal>
          <FansPlayground group />
          <div className="together-copy">
            <h2 id="together-title">
              you’re never the
              <br />
              <em>only one laughing.</em>
            </h2>
            <p>
              When a moment hits, the dot shows how many fans are laughing right
              now, and the word everyone’s saying. After the stream, you get
              your own private recap of the funniest moments.
            </p>
            <div className="privacy-promise">
              <span /> audio stays on your PC · sharing is always your choice
            </div>
          </div>
        </div>
      </section>
      <RatingsPreview />
      <section
        className="full-screen streamer-invite"
        aria-labelledby="streamer-title"
      >
        <div className="section-content" data-reveal>
          <span className="invite-smile" aria-hidden="true">
            <Smile tone="yellow" />
          </span>
          <h2 id="streamer-title">
            see the moments
            <br />
            <em>your fans loved.</em>
          </h2>
          <p>
            A live laugh meter and a recap of what made your fans laugh. <br />
            Anonymous and private to you.
          </p>
          <Link className="button outline" href="/streamers">
            {PRODUCT.name} for streamers <Arrow />
          </Link>
        </div>
      </section>
      <section
        className="full-screen final-invite"
        aria-labelledby="download-title"
      >
        <div className="section-content" data-reveal>
          <h2 id="download-title">
            ready to laugh
            <br />
            <em>together?</em>
          </h2>
          <StoreButtons />
          <p className="quiet-caption">Chrome, Edge and Brave · free</p>
        </div>
      </section>
    </main>
  );
}
