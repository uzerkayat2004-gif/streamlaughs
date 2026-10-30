import { PRODUCT } from '@laughline/shared';
import Link from 'next/link';
import { Arrow } from '../components/brand';
import { FansPlayground, HomeMotion } from '../components/fans-playground';

export default function Home() {
  return (
    <main className="home-page">
      <HomeMotion />
      <section className="full-screen hero" aria-labelledby="hero-title">
        <div className="section-content hero-content">
          <p className="eyebrow">
            <span className="status-spark" /> FOR TWITCH VIEWERS
          </p>
          <h1 id="hero-title">
            laugh with the
            <br />
            <em>whole stream.</em>
          </h1>
          <p className="hero-copy">
            See when everyone watching your favourite streamer is laughing too.
            Live, right on Twitch.
          </p>
          <div className="hero-actions">
            <Link className="button yellow" href="/install?downloaded=1">
              Download {PRODUCT.name} <Arrow />
            </Link>
            <Link className="text-link" href="/try">
              <span className="play-outline">▶</span> watch the demo
            </Link>
          </div>
          <p className="quiet-caption">
            your people. your stream. your kind of funny.
          </p>
        </div>
        <a
          href="#the-feeling"
          className="scroll-cue"
          aria-label="scroll to the interactive smiley"
        >
          a little more together <span>↓</span>
        </a>
        <span className="section-index" aria-hidden="true">
          01 / 05
        </span>
      </section>
      <section
        className="full-screen feeling-section"
        id="the-feeling"
        aria-labelledby="feeling-title"
      >
        <div className="section-content" data-reveal>
          <p className="eyebrow">GOOD MOMENTS ARE BETTER TOGETHER</p>
          <h2 id="feeling-title" className="sr-only">
            a little feeling of together.
          </h2>
          <FansPlayground />
          <p className="feeling-caption">
            a tiny dot on Twitch that lights up
            <br className="mobile-break" /> when the room laughs.
          </p>
        </div>
        <span className="section-index" aria-hidden="true">
          02 / 05
        </span>
      </section>
      <section
        className="full-screen together-section"
        aria-labelledby="together-title"
      >
        <div className="section-content together-layout" data-reveal>
          <FansPlayground group />
          <div className="together-copy">
            <p className="eyebrow">NO CHAT TO KEEP UP WITH</p>
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
        <span className="section-index" aria-hidden="true">
          03 / 05
        </span>
      </section>
      <section
        className="full-screen streamer-invite"
        aria-labelledby="streamer-title"
      >
        <div className="section-content" data-reveal>
          <span className="outline-spark" aria-hidden="true">
            ✳
          </span>
          <p className="eyebrow">STREAMING YOURSELF?</p>
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
        <span className="section-index" aria-hidden="true">
          04 / 05
        </span>
      </section>
      <section
        className="full-screen final-invite"
        aria-labelledby="download-title"
      >
        <div className="section-content" data-reveal>
          <p className="eyebrow">YOUR NEXT GOOD MOMENT IS OUT THERE</p>
          <h2 id="download-title">
            ready to laugh
            <br />
            <em>together?</em>
          </h2>
          <Link className="button yellow" href="/install?downloaded=1">
            Download {PRODUCT.name} <Arrow />
          </Link>
          <p className="quiet-caption">Chrome, Edge and Brave · free</p>
        </div>
        <span className="section-index" aria-hidden="true">
          05 / 05
        </span>
      </section>
    </main>
  );
}
