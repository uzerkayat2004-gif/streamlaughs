import Link from 'next/link';
import { Arrow } from '../../components/brand';
import { FansPlayground } from '../../components/fans-playground';
import { callbackUrl, dashboardConfigured } from '../../lib/config';
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
            <p className="eyebrow">let’s get you back to your fans.</p>
            <h1>your sign-in didn’t finish.</h1>
            <p className="auth-note">{loginErrorMessage(query.reason)}</p>
            {query.reason === 'redirect_mismatch' && (
              <p>
                app owner: add <code>{callbackUrl()}</code> to{' '}
                <strong>OAuth Redirect URLs</strong> in the Twitch Developer
                Console, then save.
              </p>
            )}
            <a className="button yellow" href="/auth/login">
              try Twitch again <Arrow />
            </a>
            <p>
              <Link className="text-link" href="/demo">
                explore the demo while you wait ↗
              </Link>
            </p>
          </div>
          <FansPlayground />
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
            your fans have
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
          <aside className="oauth-trust">
            <h2>Sign in with Twitch, safely.</h2>
            <p>
              You log in on twitch.tv, so we never see your password. We only
              get your Twitch name and ID to show your own stats. You can remove
              access anytime in Twitch Settings → Connections.
            </p>
          </aside>
          {(!configured || query.login) && (
            <p className="auth-note" role="status">
              {!configured || query.login === 'unconfigured'
                ? 'not set up yet. streamer login is coming; the demo is ready to explore.'
                : 'that login didn’t quite land. try Twitch again.'}
            </p>
          )}
          <Link className="text-link" href="/demo">
            see a sample dashboard ↗
          </Link>
        </div>
        <FansPlayground />
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
            Only anonymous fan summaries with three or more contributors. No
            viewer recordings, identities or transcripts. Your channel is yours
            to see.
          </p>
        </div>
      </section>
    </main>
  );
}
