import {
  orderedReasons,
  ratingColor,
  ratingId,
  ratingLocked,
  RATING_REASONS,
  type RatingReason,
  type Recap,
  type LocalRating,
} from '@laughline/shared';
import { useEffect, useState, type CSSProperties } from 'react';
import { db } from './db';
import { sendStreamRating } from './ratings';

export function RatingFace({
  score,
  size = 76,
}: {
  score: number;
  size?: number;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      role="img"
      aria-label={score <= 4 ? 'sad' : score <= 7 ? 'meh' : 'laughing'}
    >
      <circle cx="32" cy="32" r="30" fill={ratingColor(score ?? 6)} />
      {score >= 8 ? (
        <path
          d="M15 25Q21 17 27 25M37 25Q43 17 49 25"
          fill="none"
          stroke="#14141A"
          strokeWidth="4"
          strokeLinecap="round"
        />
      ) : (
        <g fill="#14141A">
          <ellipse cx="22" cy="24" rx="3" ry="5" />
          <ellipse cx="42" cy="24" rx="3" ry="5" />
        </g>
      )}
      <path
        d={
          score <= 4
            ? 'M19 45Q32 31 45 45'
            : score <= 7
              ? 'M20 41H44'
              : 'M14 34H50C49 56 15 56 14 34Z'
        }
        fill={score >= 8 ? '#14141A' : 'none'}
        stroke="#14141A"
        strokeWidth="3.5"
        strokeLinecap="round"
      />
    </svg>
  );
}
export function RatingSlide({
  recap,
  next,
}: {
  recap: Recap;
  next: () => void;
}) {
  const [score, setScore] = useState<number | null>(null),
    [reasons, setReasons] = useState<RatingReason[]>([]),
    [rating, setRating] = useState<LocalRating | null>(null),
    [sent, setSent] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  useEffect(() => {
    let alive = true;
    void db.ratings
      .get(ratingId(recap.channel, recap.streamKey ?? ''))
      .then((r) => {
        if (alive && r) {
          setRating(r);
          setScore(r.score);
          setReasons(r.reasons);
        }
      });
    return () => {
      alive = false;
    };
  }, [recap.channel, recap.streamKey]);
  const locked = !!rating && ratingLocked(rating);
  return (
    <div
      className="rating-slide"
      style={{ '--rating-color': ratingColor(score ?? 6) } as CSSProperties}
    >
      <h1>rate tonight’s stream</h1>
      {sent ? (
        <div className="rating-sent" role="status">
          <div className="rating-confetti" aria-hidden="true">
            ✦ · ✧ · ✦
          </div>
          <RatingFace score={score ?? 6} />
          <h2>
            sent anonymously to {recap.displayName ?? recap.channel}. thanks!
          </h2>
          <button type="button" className="rating-send" onClick={next}>
            keep going
          </button>
          <button
            type="button"
            className="rating-skip"
            onClick={() => setSent(false)}
          >
            change rating
          </button>
        </div>
      ) : (
        <>
          <div className="rating-score">
            <RatingFace score={score ?? 6} />
            <strong aria-live="polite">
              {score ?? '—'}
              <small>/10</small>
            </strong>
          </div>
          <fieldset
            className="rating-numbers"
            aria-label="stream score from 1 to 10"
          >
            {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => (
              <button
                type="button"
                key={n}
                disabled={locked || busy}
                className={score === n ? 'is-picked' : ''}
                aria-pressed={score === n}
                aria-label={`rate ${n} out of 10`}
                style={{ '--pill-color': ratingColor(n) } as CSSProperties}
                onClick={() => {
                  setScore(n);
                  setError('');
                }}
              >
                {n}
              </button>
            ))}
          </fieldset>
          <p className="rating-hint">
            what made it feel that way? pick up to 3.
          </p>
          <fieldset
            className="rating-reasons"
            aria-label="optional rating reasons"
          >
            {orderedReasons(score ?? 6).map((id) => (
              <button
                type="button"
                key={id}
                aria-pressed={reasons.includes(id)}
                disabled={
                  locked ||
                  busy ||
                  (!reasons.includes(id) && reasons.length >= 3)
                }
                onClick={() =>
                  setReasons((v) =>
                    v.includes(id) ? v.filter((x) => x !== id) : [...v, id],
                  )
                }
              >
                {RATING_REASONS[id]}
              </button>
            ))}
          </fieldset>
          <p className="rating-hint">
            {locked
              ? 'your rating is locked. thanks for being here.'
              : 'anonymous · averages appear with 5+ fans · edit for 24h'}
          </p>
          {error && (
            <p role="alert" className="rating-error">
              {error}
            </p>
          )}
          <div className="rating-actions">
            <button
              type="button"
              className="rating-send"
              disabled={locked || busy || score === null}
              onClick={async () => {
                if (score === null) return;
                setBusy(true);
                setError('');
                try {
                  setRating(await sendStreamRating(recap.id, score, reasons));
                  setSent(true);
                } catch (e) {
                  setError(
                    e instanceof Error
                      ? e.message
                      : 'couldn’t send · try again',
                  );
                } finally {
                  setBusy(false);
                }
              }}
            >
              {busy ? 'sending…' : rating ? 'save changes' : 'send'}
            </button>
            <button type="button" className="rating-skip" onClick={next}>
              {locked ? 'next' : 'skip'}
            </button>
          </div>
        </>
      )}
    </div>
  );
}
