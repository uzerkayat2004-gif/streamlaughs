import Link from 'next/link';
import { Arrow } from '../../components/brand';
import {
  FansPlayground,
  FunBits,
  Smile,
} from '../../components/fans-playground';
import { StoreButtons } from '../../components/store-buttons';
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
          <span className="under-button">free · nothing to install</span>
          <aside className="oauth-trust">
            <h2>your channel. safely.</h2>
            <p>
              We only read your channel name and ID to confirm it’s yours. We
              can’t post, read chat, or see your password. You sign in on Twitch
              and can disconnect any time in Twitch Settings → Connections.
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
        <div className="streamer-stage">
          <FunBits words={['W', 'haha']} variant="streamer" />
          <FansPlayground />
        </div>
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
      <section
        className="streamer-rating-steps"
        aria-labelledby="tonight-title"
      >
        <h2 id="tonight-title">
          how did <em>tonight go?</em>
        </h2>
        <p>real reviews from your own fans, not random people. free.</p>
        <ol>
          <li>
            <span aria-hidden="true">
              <Smile tone="yellow" />
            </span>
            <h3>fans watch.</h3>
            <p>ten minutes or more of your live stream.</p>
          </li>
          <li>
            <span aria-hidden="true">
              <Smile tone="teal" expression="squint" />
            </span>
            <h3>fans rate.</h3>
            <p>a score and a few reason chips in their recap.</p>
          </li>
          <li>
            <span aria-hidden="true">
              <Smile tone="coral" expression="cheeky" />
            </span>
            <h3>you wake up knowing.</h3>
            <p>
              your average and top reasons, ready next morning. unlocks at 5
              fans.
            </p>
          </li>
        </ol>
        <Link className="text-link" href="/demo">
          see a sample rating ↗
        </Link>
      </section>
      <section className="try-download watching-card">
        <FunBits variant="card" />
        <span className="watching-face" aria-hidden="true">
          <Smile tone="yellow" expression="squint" />
        </span>
        <h2>
          watching <em>too?</em>
        </h2>
        <p>
          get the dot on your own Twitch tab. free, and it stays on your PC.
        </p>
        <StoreButtons hideNote />
      </section>
    </main>
  );
}
