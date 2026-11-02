import { PRODUCT } from '@laughline/shared';
import Link from 'next/link';
import { Arrow } from '../components/brand';
import { FansPlayground, HomeMotion } from '../components/fans-playground';
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
              Your favourite stream. Your kind of funny. See who’s laughing with
              you, right on Twitch.
            </p>
            <div className="hero-actions">
              <StoreButtons />
              <Link className="text-link" href="/try">
                <span className="play-outline">▶</span> watch the demo
              </Link>
            </div>
            <p className="quiet-caption">
              your people. your stream. your kind of funny.
            </p>
          </div>
          <FansPlayground orbit />
        </div>
        <a
          href="#the-feeling"
          className="scroll-cue"
          aria-label="scroll to the interactive smiley"
        >
          a little more together <span>↓</span>
        </a>
      </section>
      <section
        className="full-screen feeling-section"
        id="the-feeling"
        aria-labelledby="feeling-title"
      >
        <div className="section-content" data-reveal>
          <h2 id="feeling-title" className="sr-only">
            a little feeling of together.
          </h2>
          <FansPlayground />
          <p className="feeling-caption">
            a tiny dot on Twitch that lights up
            <br className="mobile-break" /> when the room laughs.
          </p>
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
          <span className="outline-spark" aria-hidden="true">
            ✳
          </span>
          <h2 id="streamer-title">
            see the moments
            <br />
            <em>your fans loved.</em>
          </h2>
          <p>
            A live laugh meter and a recap of what made your fans laugh.
            <br />
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
