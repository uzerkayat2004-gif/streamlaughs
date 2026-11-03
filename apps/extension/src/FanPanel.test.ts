import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { FanPanel } from './FanPanel';
const props = {
  room: {
    channel: 'grimm',
    state: 'live' as const,
    source: 'live' as const,
    laughingNow: 12,
    laughlineViewers: 18,
    topWords: [{ word: 'lets go', count: 4 }],
    updatedAt: 1,
  },
  count: 3,
  status: 'recording' as const,
  micLevel: 0.04,
  micProblem: false,
  listen: true,
  onPause: () => {},
  onStop: () => {},
  onMic: () => {},
};
it('renders readable fan, personal, mic and control content with the approved words', () => {
  const html = renderToStaticMarkup(createElement(FanPanel, props));
  for (const text of [
    'fans laughing now',
    '12',
    'fan words · last minute',
    'lets go',
    '<strong>3</strong> laughs',
    'microphone hearing you',
    'stop session',
    'pause',
  ])
    expect(html).toContain(text);
});
it('hides fan words below the floor and shows a friendly first-fan state', () => {
  const html = renderToStaticMarkup(
    createElement(FanPanel, {
      ...props,
      room: { ...props.room, state: 'few', laughlineViewers: 2 },
      micProblem: true,
    }),
  );
  expect(html).toContain('fan reactions show when 3+ fans are here');
  expect(html).not.toContain('lets go');
  expect(html).toContain('microphone problem');
});
it('shows the first personal word but no fans row or floor message during a replay', () => {
  const html = renderToStaticMarkup(
    createElement(FanPanel, { ...props, replay: true, word: 'bro' }),
  );
  expect(html).toContain('replay · personal only');
  expect(html).toContain('your word');
  expect(html).toContain('bro');
  expect(html).not.toMatch(/fan reactions|fans laughing|FANS|top fan word/);
});
it('locks opaque panel and visible launcher styling and keeps audio APIs off the Twitch page', () => {
  const css = readFileSync('src/styles.css', 'utf8');
  expect(css.replace(/\s/g, '')).toMatch(/rgba\(20,20,26,0?\.94\)/);
  expect(css.replace(/\s/g, '')).toContain('opacity:1!important');
  const source =
    readFileSync('entrypoints/twitch.content.tsx', 'utf8') +
    readFileSync('src/Overlay.tsx', 'utf8');
  expect(source).not.toMatch(
    /new AudioContext|createMediaStreamSource|\.volume\s*=|\.muted\s*=/,
  );
});
