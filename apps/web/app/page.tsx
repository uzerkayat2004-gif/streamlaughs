import { PRODUCT } from '@laughline/shared';
import Link from 'next/link';
import { Arrow } from '../components/brand';
import {
  FansPlayground,
  FunBits,
  HomeMotion,
  Smile,
} from '../components/fans-playground';
import { RatingsPreview } from '../components/ratings-preview';
import { StoreButtons } from '../components/store-buttons';

export default function Home() {
  return (
    <main className="home-page">
      <HomeMotion />
      <section
        className="full-screen hero hero-clean"
        aria-labelledby="hero-title"
      >
        <div className="hero-glow" aria-hidden="true" />
        <div className="section-content hero-content">
          <p className="hero-kicker">
            <span aria-hidden="true">✳</span> your stream. your people. one big
            laugh.
          </p>
          <h1 id="hero-title">
            <span className="hero-line-1">
              your favorite streamer is so funny.
            </span>
            <em className="hero-line-2">see your reaction watching them.</em>
          </h1>
          <p className="hero-copy">
            Every laugh, every “no way”, every big moment, in one fun recap.
            <br />
            Free on Chrome and Edge. Your audio never leaves your PC.
          </p>
          <div className="hero-actions">
            <StoreButtons />
            <Link className="text-link" href="/try">
              <span className="play-outline">▶</span> watch the demo
            </Link>
          </div>
        </div>
      </section>
      <section
        className="full-screen feeling-section fun-stage"
        aria-label="say hi to the smiley"
      >
        <FunBits words={['haha', 'lol', 'W', 'brooo', '😂']} variant="big" />
        <div className="section-content" data-reveal>
          <FansPlayground orbit />
          <p className="feeling-caption">
            poke the smiley. <em>it laughs back.</em>
          </p>
        </div>
      </section>
      <section
        className="full-screen together-section"
        aria-labelledby="together-title"
      >
        <FunBits words={['hahaha', 'no way', 'LMAO']} variant="group" />
        <div className="section-content together-layout" data-reveal>
          <div className="group-stage">
            <FansPlayground group />
          </div>
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
        <FunBits />
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
        <FunBits words={['lol', 'haha', 'W']} variant="final" />
        <div className="section-content" data-reveal>
          <div className="final-faces" aria-hidden="true">
            <span>
              <Smile tone="coral" expression="cheeky" />
            </span>
            <span>
              <Smile tone="yellow" expression="squint" />
            </span>
            <span>
              <Smile tone="teal" />
            </span>
          </div>
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
