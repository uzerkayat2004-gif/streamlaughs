import Link from 'next/link';
import { Arrow } from '../../components/brand';
import { CrowdArt } from '../../components/crowd-art';
import { dashboardConfigured } from '../../lib/config';
import { loginErrorMessage } from '../../lib/oauth-errors';
export default async function Streamers({
  searchParams,
}: {
  searchParams: Promise<{ login?: string; reason?: string }>;
}) {
  const query = await searchParams;
  if (query.login === 'retry')
    return (
      <main className="standard-page streamer-page">
        <section className="streamer-hero auth-retry" role="alert">
          <div>
            <p className="eyebrow">let’s get you back to your crowd.</p>
            <h1>your sign-in didn’t finish.</h1>
            <p className="auth-note">{loginErrorMessage(query.reason)}</p>
            <a className="button yellow" href="/auth/login">
              try Twitch again <Arrow />
            </a>
            <p>
              <Link className="text-link" href="/demo">
                explore the demo while you wait ↗
              </Link>
            </p>
          </div>
          <CrowdArt illustration calm />
        </section>
      </main>
    );
  const configured = dashboardConfigured();
  return (
    <main className="standard-page streamer-page">
      <section className="streamer-hero">
        <div>
          <p className="eyebrow">for the person making the moments.</p>
          <h1>
            your crowd has
            <br />a <em>laugh track.</em>
          </h1>
          <p>
            See the room react. Find the bits that got everyone.
            <br />
            Keep the good moments close.
          </p>
          {configured ? (
            <a className="button yellow" href="/auth/login">
              log in with Twitch <Arrow />
            </a>
          ) : (
            <Link className="button yellow" href="/demo">
              explore the demo <Arrow />
            </Link>
          )}
          <span className="under-button">
            nothing to install · just your channel
          </span>
          {(!configured || query.login) && (
            <p className="auth-note" role="status">
              {!configured || query.login === 'unconfigured'
                ? 'not set up yet. streamer login is coming; the demo is ready to explore.'
                : 'that login didn’t quite land. try Twitch again.'}
            </p>
          )}
          <Link className="text-link" href="/demo">
            or wander through the demo ↗
          </Link>
        </div>
        <CrowdArt illustration />
      </section>
      <section className="streamer-copy">
        <h2>
          less counting.
          <br />
          <em>more remembering.</em>
        </h2>
        <div>
          <p>
            A living little blob when you’re live. A glowing laugh wave when the
            night’s over. Your biggest moments, with a way back to the VOD when
            one’s available.
          </p>
          <p>
            Only anonymous crowd summaries with three or more contributors. No
            viewer recordings, identities or transcripts. Your channel is yours
            to see.
          </p>
        </div>
      </section>
    </main>
  );
}
