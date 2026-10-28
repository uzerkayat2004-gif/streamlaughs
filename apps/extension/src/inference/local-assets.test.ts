import { afterEach, expect, it, vi } from 'vitest';
import { installLocalAssetPolicy } from './local-assets';

afterEach(() => vi.unstubAllGlobals());
it('blocks remote fetches and request bodies before any transport, with a bounded local asset audit', async () => {
  const fetch = vi.fn(async () => new Response('local asset'));
  vi.stubGlobal('fetch', fetch);
  const audit = installLocalAssetPolicy('chrome-extension://test');
  await expect(
    globalThis.fetch('https://example.com/model.onnx'),
  ).rejects.toThrow('bundled');
  await expect(
    globalThis.fetch('chrome-extension://test/models/a', {
      method: 'POST',
      body: 'private',
    }),
  ).rejects.toThrow('bundled');
  expect(fetch).not.toHaveBeenCalled();
  for (let i = 0; i < 100; i++)
    await globalThis.fetch(`chrome-extension://test/models/${i}.onnx`);
  expect(audit).toHaveLength(40);
  expect(fetch).toHaveBeenCalledTimes(100);
});
