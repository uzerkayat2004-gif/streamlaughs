import path from 'node:path';
import { chromium } from '@playwright/test';
export async function openEvaluator(backend = 'wasm') {
  const extension = path.resolve(
    'apps/extension/.output/chrome-mv3-audio-debug',
  );
  const context = await chromium.launchPersistentContext('', {
    channel: 'chromium',
    headless: false,
    args: [
      `--disable-extensions-except=${extension}`,
      `--load-extension=${extension}`,
    ],
  });
  const outbound = [];
  try {
    context.on('request', (request) => {
      if (!request.url().startsWith('chrome-extension://'))
        if (outbound.length < 40) outbound.push(request.url().split('?')[0]);
    });
    const sw =
      context.serviceWorkers()[0] ??
      (await context.waitForEvent('serviceworker'));
    const page = await context.newPage();
    await page.goto(`chrome-extension://${new URL(sw.url()).host}/debug.html`);
    const cdp = await context.browser().newBrowserCDPSession();
    const cpu = async () =>
      (await cdp.send('SystemInfo.getProcessInfo')).processInfo.map((p) => ({
        id: p.id,
        cpuTime: p.cpuTime,
      }));
    await page.evaluate(
      (backend) =>
        new Promise((resolve, reject) => {
          const w = new Worker(chrome.runtime.getURL('/inference-worker.js'));
          window.evalWorker = w;
          const timer = setTimeout(
            () => reject(new Error('Model initialization timed out')),
            90000,
          );
          w.onerror = () => {
            clearTimeout(timer);
            reject(new Error('Inference worker failed'));
          };
          w.onmessage = ({ data }) => {
            if (data.type === 'error') {
              clearTimeout(timer);
              reject(new Error('Model initialization failed'));
            } else if (data.type === 'status') {
              clearTimeout(timer);
              resolve(true);
            }
          };
          w.postMessage({
            type: 'init',
            base: chrome.runtime.getURL('').replace(/\/$/, ''),
            backend,
          });
        }),
      backend,
    );
    const run = async (type, payload = {}) =>
      page.evaluate(
        ({ type, payload }) =>
          new Promise((resolve, reject) => {
            const w = window.evalWorker;
            const timer = setTimeout(
              () => reject(new Error('Local evaluation timed out')),
              300000,
            );
            w.onmessage = ({ data }) => {
              if (data.type === 'error') {
                clearTimeout(timer);
                reject(new Error('Local inference failed'));
              } else if (
                data.type === 'evaluated' ||
                data.type === 'benchmarked'
              ) {
                clearTimeout(timer);
                resolve(data);
              }
            };
            if (payload.mic) payload.mic = Float32Array.from(payload.mic);
            if (payload.tab) payload.tab = Float32Array.from(payload.tab);
            w.postMessage({ type, ...payload });
          }),
        { type, payload },
      );
    return {
      run,
      page,
      cpu,
      outbound,
      close: async () => {
        await context.close();
        if (outbound.length)
          throw new Error('Unexpected network request from local evaluation');
      },
    };
  } catch (error) {
    await context.close();
    throw error;
  }
}
