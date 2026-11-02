import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, expect, it, vi } from 'vitest';
import { initialSnapshot } from '@laughline/shared';
import { CompactSettings } from './CompactSettings';
afterEach(() => vi.unstubAllGlobals());
it('keeps compact controls and history transfer without the removed prose or store migration', () => {
  vi.stubGlobal('chrome', {
    runtime: { getManifest: () => ({ version: '0.8.8' }) },
  });
  const html = renderToStaticMarkup(
    createElement(CompactSettings, {
      settings: initialSnapshot().settings,
      change: () => {},
      remove: () => {},
    }),
  );
  for (const label of [
    'reaction sensitivity',
    'share with the fans',
    'send stream ratings',
    'Audio stays on your PC. Nothing is recorded.',
    'streamer? see your fans',
    'save my history',
    'load history',
    'privacy',
    'delete my data',
    'version 0.8.8',
  ])
    expect(html).toContain(label);
  for (const removed of [
    'Sharing sends counts',
    'local JSON only',
    'Switch to the store',
    'see how your fans laughed',
    'listen for my laughs',
  ])
    expect(html).not.toContain(removed);
  expect(html).toContain('hold for microphone diagnostics');
});
