import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, expect, it, vi } from 'vitest';
import { Popup } from './Popup';

afterEach(() => vi.unstubAllGlobals());
it('links the header to the configured website and keeps the three saved/mic actions as buttons', () => {
  vi.stubGlobal('chrome', {
    runtime: {
      id: 'fkocldgggcmhihelohiicoakcfomhepg',
      getManifest: () => ({ version: '0.8.1' }),
      getURL: (p: string) =>
        `chrome-extension://fkocldgggcmhihelohiicoakcfomhepg${p}`,
    },
  });
  const html = renderToStaticMarkup(createElement(Popup));
  expect(html).toContain('StreamLaughs website');
  expect(html).toContain('https://streamlaughs.vercel.app');
  for (const label of ['last recap', 'my streamers', 'test my mic'])
    expect(html).toContain(`>${label}</button>`);
  expect(html).toContain('finding your Twitch tab');
  expect(html).toContain('streamer? see your fans');
  expect(html).toContain('/dashboard?from=extension');
  expect(html).not.toContain('>open Twitch');
});
