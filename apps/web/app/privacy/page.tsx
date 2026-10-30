import { PRODUCT } from '@laughline/shared';
import type { Metadata } from 'next';
export const metadata: Metadata = { title: 'your audio stays yours' };
const topics = [
  ['on-your-pc', 'on your computer'],
  ['sharing', 'what is shared'],
  ['never', 'what we never collect'],
  ['streamers', 'streamer sign-in'],
  ['permissions', 'permissions'],
  ['retention', 'how long it stays'],
  ['services', 'our services'],
  ['choices', 'your choices'],
  ['contact', 'contact & changes'],
];
export default function Privacy() {
  return (
    <main className="standard-page privacy-page">
      <header className="page-intro">
        <p className="eyebrow">SMALL FOOTPRINT. GOOD COMPANY.</p>
        <h1>
          your audio
          <br />
          stays <em>yours.</em>
        </h1>
        <p>Here’s what {PRODUCT.name} does with your data. In plain words.</p>
        <p className="policy-date">Last updated: October 30, 2026</p>
      </header>
      <aside className="privacy-short" aria-labelledby="short-version">
        <h2 id="short-version">the short version.</h2>
        <ul>
          <li>
            Audio is processed on your computer. It is never recorded to a file
            or uploaded.
          </li>
          <li>Sharing is off unless you turn it on.</li>
          <li>
            Shared reactions are anonymous counts plus up to 3 approved words or
            phrases.
          </li>
          <li>No ads, no analytics trackers, no selling data.</li>
        </ul>
      </aside>
      <div className="policy-layout">
        <nav className="policy-toc" aria-label="privacy contents">
          <p className="eyebrow">ON THIS PAGE</p>
          {topics.map(([id, title]) => (
            <a key={id} href={`#${id}`}>
              {title}
            </a>
          ))}
        </nav>
        <div className="policy-body">
          <section id="on-your-pc">
            <h2>what happens on your computer.</h2>
            <p>
              When you start listening, the extension processes your microphone
              and the watched Twitch tab’s audio with bundled, on-device models.
              The tab audio helps distinguish your reactions from the stream.
              Your stream keeps playing through your speakers or headphones.
            </p>
            <p>
              Audio frames stay in temporary memory buffers holding up to 30
              seconds, then get overwritten or cleared. No audio files or full
              transcripts are saved. Personal reaction counts, selected words,
              moment times, recaps and settings stay in this browser’s local
              extension storage. They stay until you delete them or uninstall.
              Turn “listen for my laughs” off and neither mic nor tab audio is
              captured.
            </p>
            <p>
              To clear local data, open the extension → settings → “delete my
              data”. This also ends your current session.
            </p>
          </section>
          <section id="sharing">
            <h2>what we receive when sharing is on.</h2>
            <p>
              No viewer account is needed. The server receives the Twitch
              channel login being watched, a short-lived random session
              identifier, and reaction packets about every two seconds. A packet
              contains a laughing flag, intensity, scream, gasp, hype and
              masked-swear counts, plus up to 3 approved words or phrases. The
              server knows when the packet arrives. It receives no audio or full
              transcript.
            </p>
            <p>
              The channel watched corresponds to the store disclosure “web
              history”; approved reaction words correspond to “website content”.
              We do not send your wider browsing history, Twitch account
              identity or a permanent installation ID.
            </p>
            <p>
              Even with sharing off, the live fan view connects to the server
              for the channel you’re watching. That reveals channel presence and
              connection timing, but sends no reaction packets. Stop the session
              to disconnect.
            </p>
            <p>
              <strong>The three-person floor:</strong> fewer than 3 active
              anonymous contributors means no counts or words are shown—just “a
              few here”. A word or phrase must independently be contributed by 3
              sessions before it appears. These are anonymous sessions, not
              proof of three different humans.
            </p>
          </section>
          <section id="never">
            <h2>what we never collect.</h2>
            <p>
              No microphone recordings, stream audio, video, chat messages,
              passwords or browsing activity outside twitch.tv. We do not upload
              raw model inputs or full transcripts. Names and blocked terms are
              filtered; swear text is not shared. We do not create per-viewer
              database records.
            </p>
            <p>
              Hosting providers can see normal network information such as IP
              addresses, request URLs and connection times. Our application does
              not log or save viewer IPs, auth tokens or audio. Anonymous does
              not mean invisible to the network provider.
            </p>
          </section>
          <section id="streamers">
            <h2>your dashboard. your channel.</h2>
            <p>
              Streamer sign-in uses Twitch’s authorization-code OAuth flow with
              no additional scopes. You log in on twitch.tv; we never see your
              password or request your email. After verifying your identity with
              Twitch, we keep only your Twitch user ID, channel login and
              display name in an encrypted session cookie. Your login is needed
              to restrict access to your own channel.
            </p>
            <p>
              The cookie is httpOnly, Secure on our HTTPS site, SameSite=Lax,
              and lasts no longer than 8 hours (or the verified Twitch token
              lifetime, if shorter). The temporary login-state cookie lasts 10
              minutes. Your Twitch access token is used only for the login
              checks and is not put in the session; refresh tokens are not
              retained. A separate app access token for public VOD lookup is
              cached only in server memory until expiry.
            </p>
            <p>
              The live view is the same aggregate fan view viewers can see.
              Past-stream summaries belong to the signed-in channel owner. Both
              enforce the contributor floor; there is no individual fan history.
              We match available public Twitch VODs to moments, so a replay link
              may be absent if the VOD is unavailable.
            </p>
          </section>
          <section id="permissions">
            <h2>permissions, explained.</h2>
            <p>
              These come from the real extension manifest. Store packages omit
              the ZIP download permission.
            </p>
            <div className="permission-scroll">
              <table>
                <caption>Extension access and its purpose</caption>
                <thead>
                  <tr>
                    <th scope="col">permission</th>
                    <th scope="col">why it is needed</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <th scope="row">storage</th>
                    <td>
                      Keep settings, session checkpoints and update status in
                      your browser.
                    </td>
                  </tr>
                  <tr>
                    <th scope="row">tabs</th>
                    <td>
                      Identify the watched Twitch tab and stop safely when it
                      closes or changes channel.
                    </td>
                  </tr>
                  <tr>
                    <th scope="row">tabCapture</th>
                    <td>
                      Capture that tab’s audio after you press Start or the
                      keyboard shortcut.
                    </td>
                  </tr>
                  <tr>
                    <th scope="row">offscreen</th>
                    <td>
                      Process audio in an extension document while the popup is
                      closed.
                    </td>
                  </tr>
                  <tr>
                    <th scope="row">downloads · ZIP only</th>
                    <td>
                      Save an update ZIP you request. Browser store installs do
                      not use this permission.
                    </td>
                  </tr>
                  <tr>
                    <th scope="row">https://www.twitch.tv/*</th>
                    <td>
                      Put the reaction dot on Twitch streams. The content script
                      is limited to Twitch.
                    </td>
                  </tr>
                  <tr>
                    <th scope="row">microphone prompt</th>
                    <td>
                      Your browser separately asks before local microphone
                      access in Welcome.
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </section>
          <section id="retention">
            <h2>how long data is kept.</h2>
            <p>
              Raw audio lives only in the rolling memory buffer (up to 30
              seconds). Local recaps and settings remain until you clear them.
              Anonymous fan-session tokens expire after 2 hours; reconnecting
              gets a fresh random session. Live presence uses a 6-second
              activity window, laughs a 5-second window, and phrase activity a
              20-second window. Temporary connection metadata exists for the
              live connection.
            </p>
            <p>
              The Worker stores only aggregate minute summaries that meet the
              three-contributor floor, for up to 30 days, with automatic
              cleanup. It stores no audio or per-viewer rows. Past anonymous
              totals cannot be traced back or individually removed; they expire
              with the summaries. Providers apply their own infrastructure
              retention policies.
            </p>
            <p>
              ZIP installs fetch public version metadata when the popup opens,
              with a cache of up to an hour, and may check when the extension
              wakes. These requests contain no installation identifier. Store
              installs use their browser store’s update mechanism.
            </p>
          </section>
          <section id="services">
            <h2>the services we use.</h2>
            <p>
              <strong>Cloudflare</strong> runs the live fan connections and
              stores aggregate minute summaries. <strong>Vercel</strong> hosts
              this website, downloads, OAuth callback and dashboard server.{' '}
              <strong>Twitch</strong> handles streamer login, provides your
              channel identity, and provides public VOD information. These
              services receive the network requests needed to do those jobs and
              have their own privacy policies.
            </p>
            <p>
              We use no ad networks, marketing analytics or tracking pixels. The
              website sets only the essential streamer auth/state cookie when
              you use Twitch sign-in; Twitch manages its own cookies on Twitch.
            </p>
          </section>
          <section id="choices">
            <h2>you’re in control.</h2>
            <p>
              Leave sharing off, switch it off at any time, pause listening,
              stop a session, delete local data, or uninstall. To clear saved
              recaps before uninstalling, use “delete my data” in the extension.
              ZIP and store installs have separate browser storage.
            </p>
            <p>
              Streamers can log out here to end the session, and remove
              authorization in Twitch Settings → Connections. Revoking Twitch
              access stops future authorizations; an existing website session
              can remain valid until its short expiry, so log out here too.
              There is no fan account to delete.
            </p>
          </section>
          <section id="contact">
            <h2>children, changes & a real person.</h2>
            <p>
              {PRODUCT.name} is not designed for children. If you believe a
              child has shared personal information with us, contact us so we
              can help. Do not include passwords, login codes or recordings in
              your message.
            </p>
            <p>
              We’ll update this page and its “Last updated” date when these
              practices change. Questions or privacy requests?{' '}
              <a href="mailto:kayatuzair525@gmail.com">
                kayatuzair525@gmail.com
              </a>
              .
            </p>
          </section>
        </div>
      </div>
    </main>
  );
}
