'use client';
import { ratingColor } from '@laughline/shared';
import { useEffect, useRef, useState } from 'react';
import { SAMPLE_FAN_REPORT } from '../lib/sample-ratings';
import { FanRatings } from './fan-ratings';
import { FunBits, Smile } from './fans-playground';

export function RatingsPreview() {
  const root = useRef<HTMLElement>(null);
  const [step, setStep] = useState(0);
  const [score, setScore] = useState<number | null>(null);
  const [touched, setTouched] = useState(false);
  const [reasons, setReasons] = useState<string[]>([]);
  const [userSent, setUserSent] = useState(false);
  useEffect(() => {
    if (touched) return;
    const reduce = matchMedia('(prefers-reduced-motion: reduce)');
    let visible = false;
    let timer: ReturnType<typeof setInterval> | undefined;
    const sync = () => {
      clearInterval(timer);
      if (reduce.matches) {
        setStep(3);
        setScore(8);
      } else if (visible && !document.hidden) {
        timer = setInterval(() => {
          setStep((s) => (s + 1) % 6);
        }, 1500);
      }
    };
    const observer = new IntersectionObserver(
      ([entry]) => {
        visible = entry?.isIntersecting ?? false;
        sync();
      },
      { threshold: 0.2 },
    );
    if (root.current) observer.observe(root.current);
    document.addEventListener('visibilitychange', sync);
    reduce.addEventListener('change', sync);
    return () => {
      observer.disconnect();
      clearInterval(timer);
      document.removeEventListener('visibilitychange', sync);
      reduce.removeEventListener('change', sync);
    };
  }, [touched]);
  useEffect(() => {
    if (touched) return;
    setScore(step > 0 ? 8 : null);
    setReasons(
      step >= 3 ? ['funny', 'chill vibes'] : step >= 2 ? ['funny'] : [],
    );
  }, [step, touched]);
  const sent = touched ? userSent : step >= 4;
  const take = () => {
    if (!touched) {
      setTouched(true);
      setUserSent(false);
    }
  };
  return (
    <section
      ref={root}
      className="full-screen ratings-feature"
      aria-labelledby="ratings-feature-title"
    >
      <FunBits variant="ratings" />
      <div className="section-content" data-reveal>
        <h2 id="ratings-feature-title">
          your fans <em>rate the stream.</em>
        </h2>
        <p className="ratings-feature-sub">
          real reviews from your own fans, not random people.
        </p>
        <div className="ratings-preview-grid">
          <div className="rating-story-mock">
            <span className="sample-label">sample recap</span>
            <h3>rate tonight’s stream</h3>
            <div
              className="mock-score"
              style={{ color: score ? ratingColor(score) : '#FFD23F' }}
            >
              <Smile
                tone={
                  score && score < 5
                    ? 'coral'
                    : score && score >= 8
                      ? 'teal'
                      : 'yellow'
                }
                expression={
                  score && score < 5
                    ? 'sad'
                    : score && score < 8
                      ? 'meh'
                      : 'happy'
                }
              />
              <strong>
                {score ?? '—'}
                <small>/ 10</small>
              </strong>
            </div>
            <fieldset
              className="mock-number-pills"
              aria-label="try a sample rating"
            >
              {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => (
                <button
                  type="button"
                  key={n}
                  aria-pressed={score === n}
                  style={
                    { '--pill-color': ratingColor(n) } as React.CSSProperties
                  }
                  onClick={() => {
                    take();
                    setUserSent(false);
                    setScore(n);
                  }}
                >
                  {n}
                </button>
              ))}
            </fieldset>
            <div className="mock-reason-pills">
              {['funny', 'chill vibes', 'hype moments', 'good chat'].map(
                (r) => (
                  <button
                    type="button"
                    key={r}
                    aria-pressed={reasons.includes(r)}
                    className={reasons.includes(r) ? 'picked' : ''}
                    onClick={() => {
                      take();
                      setUserSent(false);
                      setReasons((list) =>
                        list.includes(r)
                          ? list.filter((x) => x !== r)
                          : list.length < 3
                            ? [...list, r]
                            : list,
                      );
                    }}
                  >
                    {r}
                  </button>
                ),
              )}
            </div>
            <button
              type="button"
              className="button yellow"
              onClick={() => {
                take();
                setScore(score ?? 8);
                setUserSent(true);
              }}
            >
              {sent ? 'sent ✓' : 'send'}
            </button>
            <p className="mock-thanks">
              {sent
                ? 'sent anonymously. thanks!'
                : 'your rating. their little boost.'}
            </p>
          </div>
          <FanRatings
            initial={SAMPLE_FAN_REPORT}
            channel="pixelcamp"
            sample
            animate
            compact
          />
        </div>
        <div className="ratings-trust">
          <span>anonymous</span>
          <span>5+ fans before anything shows</span>
          <span>only the streamer sees it</span>
        </div>
      </div>
    </section>
  );
}
