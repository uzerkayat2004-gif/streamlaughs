import type { Metadata } from 'next';
export const metadata: Metadata = { title: 'your audio stays yours' };
export default function Privacy() {
  return (
    <main className="standard-page privacy-page">
      <header className="page-intro">
        <p className="eyebrow">small footprint. big feelings.</p>
        <h1>
          your audio
          <br />
          stays <em>yours.</em>
        </h1>
        <p>No recordings. No transcripts sent. No quiet little trackers.</p>
      </header>
      <div className="privacy-lines">
        <section>
          <span>01</span>
          <div>
            <h2>your PC does the listening.</h2>
            <p>
              Laughs and words are detected on your computer. Audio stays in
              short memory buffers, then disappears. We never save it or send it
              anywhere.
            </p>
          </div>
        </section>
        <section>
          <span>02</span>
          <div>
            <h2>sharing is a switch. yours.</h2>
            <p>
              Switch sharing on to send anonymous reaction counts and up to
              three approved words or phrases every two seconds. Names and
              blocked terms are filtered out. Swears become one number, never
              words. Leave sharing off and the socket sends no application
              messages.
            </p>
          </div>
        </section>
        <section>
          <span>03</span>
          <div>
            <h2>three’s a crowd.</h2>
            <p>
              Fewer than three anonymous contributors? No numbers. No words.
              Just “a few here.” A phrase needs three distinct contributors too.
              Anonymous sessions aren’t proof of three different humans.
            </p>
          </div>
        </section>
        <section>
          <span>04</span>
          <div>
            <h2>watching still makes a connection.</h2>
            <p>
              The server learns that someone is viewing a Twitch channel, even
              with sharing off. Cloudflare and Vercel can see IP addresses and
              connection timing. Our app doesn’t log or save viewer IPs, signed
              tokens, install IDs, audio or full transcripts. Temporary tokens
              are checked in memory to keep live connections working.
            </p>
            <p>
              Only floored minute summaries are kept for streamers, for 30 days.
              There are no per-viewer database rows. Fresh anonymous sessions
              avoid persistent IDs, but cannot hide network-level connections
              from providers.
            </p>
          </div>
        </section>
        <section>
          <span>05</span>
          <div>
            <h2>you can leave it behind.</h2>
            <p>
              Use “delete my data” in the extension to end the session and
              remove local recaps and preferences. Disable sharing to stop
              sending immediately. Completed anonymous crowd summaries cannot be
              traced back or subtracted individually; they expire after 30 days.
            </p>
          </div>
        </section>
        <section>
          <span>06</span>
          <div>
            <h2>no analytics. really.</h2>
            <p>
              No trackers, advertising pixels or analytics cookies. The
              extension requests public version metadata at most once a day when
              it wakes, without an identifier. Streamers who log in get one
              encrypted, essential session cookie, including during the Twitch
              login flow. Log out to remove it. Twitch handles its own login
              cookies on Twitch. Our server checks your Twitch login and user ID
              to verify that the channel is yours; no viewer accounts are
              created.
            </p>
          </div>
        </section>
      </div>
    </main>
  );
}
