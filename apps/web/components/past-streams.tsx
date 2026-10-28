import type { StreamStory } from '../lib/stories';
export function utc(ts: number) {
  return `${new Intl.DateTimeFormat('en', {
    timeZone: 'UTC',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(ts)} UTC`;
}
function offset(seconds: number) {
  return [
    Math.floor(seconds / 3600),
    Math.floor((seconds % 3600) / 60),
    seconds % 60,
  ]
    .map((x, i) => (i ? String(x).padStart(2, '0') : String(x)))
    .join(':');
}
export function LaughWave({ values }: { values: number[] }) {
  const levels = values.length === 1 ? [values[0]!, values[0]!] : values;
  const max = Math.max(1, ...levels),
    points = levels.map((n, i) => ({
      x: 20 + (i / Math.max(1, levels.length - 1)) * 960,
      y: 160 - (n / max) * 120,
    }));
  let d = points[0] ? `M${points[0].x},${points[0].y}` : '';
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1]!,
      b = points[i]!;
    const mid = (a.x + b.x) / 2;
    d += ` C${mid},${a.y} ${mid},${b.y} ${b.x},${b.y}`;
  }
  return (
    <svg
      className="laugh-wave"
      viewBox="0 0 1000 200"
      role="img"
      aria-label="laugh wave across this stream"
    >
      <defs>
        <linearGradient id="wave-line">
          <stop stopColor="#2EE6C5" />
          <stop offset=".65" stopColor="#FFD23F" />
          <stop offset="1" stopColor="#FF5C5C" />
        </linearGradient>
        <linearGradient id="wave-fill" x2="0" y2="1">
          <stop stopColor="#2EE6C5" stopOpacity=".18" />
          <stop offset="1" stopColor="#2EE6C5" stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={`${d} L980 200 L20 200 Z`} fill="url(#wave-fill)" />
      <path d={d} className="wave-glow" />
      <path d={d} className="wave-line" />
    </svg>
  );
}
export function PastStreams({
  streams,
  unavailable = false,
  vodsUnavailable = false,
}: {
  streams: StreamStory[];
  unavailable?: boolean;
  vodsUnavailable?: boolean;
}) {
  if (!streams.length)
    return (
      <div className="quiet-empty">
        <span>◡</span>
        <h2>
          {unavailable
            ? 'your crowd’s taking a breather.'
            : 'the next stream is a new story.'}
        </h2>
        <p>
          {unavailable
            ? 'History couldn’t load. Refresh to try again.'
            : 'Finish a minute with 3+ people sharing to find it here.'}
        </p>
      </div>
    );
  return (
    <div className="past-streams">
      {vodsUnavailable && (
        <p className="soft-note">
          VOD lookup is taking a break. Your moments are safe; links will return
          when Twitch does.
        </p>
      )}
      {streams.map((stream) => (
        <article key={stream.id} className="stream-story">
          <header>
            <div>
              <p className="eyebrow">
                {utc(stream.start)}{' '}
                {stream.test && <span className="test-tag">test</span>}
              </p>
              <h2>{stream.title}</h2>
            </div>
            <p className="peak-line">
              <b>{stream.peak}</b> laughing together at the peak
            </p>
          </header>
          <LaughWave values={stream.wave} />
          <div className="wave-caption">
            <span>the room, in laughs</span>
            <span>
              {stream.approximate
                ? 'grouped by activity · no matched VOD'
                : 'matched Twitch archive'}{' '}
              · minute peaks
            </span>
          </div>
          <div className="moment-heading">
            <h3>the moments that got everyone.</h3>
            <span>up to three, a minute apart</span>
          </div>
          <div className="moments">
            {stream.moments.map((m, i) => (
              <article className="moment" key={m.ts}>
                <p className="eyebrow">
                  moment {String(i + 1).padStart(2, '0')}{' '}
                  {m.test && <span className="test-tag">test</span>}
                </p>
                <h4>{m.vod ? offset(m.vod.seconds) : utc(m.ts)}</h4>
                <p>{m.laughingNow} laughing together</p>
                <div className="word-chips">
                  {m.words.map((word) => (
                    <span key={word}>{word}</span>
                  ))}
                </div>
                {m.minuteWords && m.words.length > 0 && (
                  <small>words from this minute</small>
                )}
                {m.vod ? (
                  <a
                    href={m.vod.url}
                    target="_blank"
                    rel="noreferrer"
                    className="text-link"
                  >
                    watch the moment ↗
                  </a>
                ) : (
                  <small className="no-vod">time only · no available VOD</small>
                )}
              </article>
            ))}
          </div>
          <div className="stream-words">
            <span>the words that stayed</span>
            <div className="word-chips">
              {stream.words.length ? (
                stream.words.map((word) => <span key={word}>{word}</span>)
              ) : (
                <small>all laughter, no eligible words.</small>
              )}
            </div>
          </div>
        </article>
      ))}
    </div>
  );
}
