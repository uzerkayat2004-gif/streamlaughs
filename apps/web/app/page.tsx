import { PRODUCT } from '@laughline/shared';
import Link from 'next/link';
import { Arrow } from '../components/brand';
import { CrowdArt } from '../components/crowd-art';
export default function Home() {
  const words = PRODUCT.pitch.split(' ');
  return (
    <main className="home-page">
      <section className="hero">
        <p className="eyebrow">
          <span className="tiny-spark">✳</span> your stream. your people. one
          big reaction.
        </p>
        <h1>
          {words.slice(0, -2).join(' ')} <em>{words.slice(-2).join(' ')}</em>
        </h1>
        <p className="hero-copy">
          Your laughs. Everyone’s reactions.
          <br />A little more together, wherever you watch.
        </p>
        <div className="hero-actions">
          <Link className="button yellow" href="/install?downloaded=1">
            Download {PRODUCT.name} <Arrow />
          </Link>
          <Link href="/demo" className="text-link">
            take a peek first ↗
          </Link>
        </div>
        <div className="hero-visual">
          <CrowdArt illustration />
          <span className="art-note">
            a little illustration of a very good time.
          </span>
        </div>
      </section>
      <section className="together-section">
        <div className="three-faces" aria-hidden="true">
          <span>◡</span>
          <span>◡</span>
          <span>◡</span>
        </div>
        <div>
          <p className="eyebrow">no chat to keep up with. just a feeling.</p>
          <h2>
            you weren’t the
            <br />
            <em>only one laughing.</em>
          </h2>
          <p>
            Catch the room’s laughs and little words as they happen. Join in if
            you want. Or just enjoy the company.
          </p>
          <div className="privacy-promise">
            <i /> audio stays on your PC · sharing is your choice
          </div>
        </div>
      </section>
      <section className="streamer-invite">
        <span className="little-star">✳</span>
        <p className="eyebrow">on the other side of the stream?</p>
        <h2>
          meet the moments
          <br />
          that made your crowd.
        </h2>
        <Link className="button outline" href="/streamers">
          {PRODUCT.name} for streamers <Arrow />
        </Link>
      </section>
      <section className="download-invite" aria-label="join the crowd">
        <Link className="button yellow" href="/install?downloaded=1">
          Download {PRODUCT.name} <Arrow />
        </Link>
      </section>
    </main>
  );
}
