import { pageWatchContext } from '../src/watch-context';
import { createRoot } from 'react-dom/client';
import { Overlay } from '../src/Overlay';
import css from '../src/styles.css?inline';

export default defineContentScript({
  matches: [
    'https://www.twitch.tv/*',
    'https://twitch.tv/*',
    'https://m.twitch.tv/*',
  ],
  main(ctx) {
    const previous = globalThis as typeof globalThis & {
      streamlaughsCleanup?: () => void;
    };
    previous.streamlaughsCleanup?.();
    document.querySelector('laughline-overlay')?.remove();
    const channelInfo = (
      message: { type?: string },
      sender: chrome.runtime.MessageSender,
      reply: (value: unknown) => void,
    ) => {
      if (sender.id !== chrome.runtime.id) return;
      if (message?.type === 'GET_WATCH_CONTEXT') reply(pageWatchContext());
      if (message?.type === 'STREAMER_CONTEXT') {
        const context = pageWatchContext();
        if (context.channel) reply(context);
      }
    };
    chrome.runtime.onMessage.addListener(channelInfo);
    const host = document.createElement('laughline-overlay');
    host.dataset.streamlaughsVersion = chrome.runtime.getManifest().version;
    host.dataset.streamlaughsUi = 'glass-v080';
    host.style.cssText =
      'position:fixed;inset:0;z-index:2147483646;pointer-events:none;';
    const shadow = host.attachShadow({ mode: 'open' });
    const style = document.createElement('style');
    style.textContent = css.replaceAll(
      '/fonts/',
      chrome.runtime.getURL('/fonts/'),
    );
    shadow.append(style);
    // Chromium discovers font faces at document scope; only locally bundled font declarations cross the shadow boundary.
    const fontStyle = document.createElement('style');
    fontStyle.textContent = [
      ...style.textContent.matchAll(/@font-face\s*\{[^}]*\}/g),
    ]
      .map((match) => match[0])
      .join('\n');
    document.head.append(fontStyle);
    const mount = document.createElement('div');
    shadow.append(mount);
    const root = createRoot(mount);
    const getPlayer = () =>
      document.querySelector<HTMLElement>(
        '[data-a-target="video-player"], .video-player, [data-testid="video-player"]',
      ) ??
      document.querySelector('video')?.parentElement ??
      null;
    const placeHost = () =>
      (document.fullscreenElement ?? document.documentElement).append(host);
    placeHost();
    root.render(<Overlay getPlayer={getPlayer} />);
    ctx.addEventListener(document, 'fullscreenchange', placeHost);
    const cleanup = () => {
      chrome.runtime.onMessage.removeListener(channelInfo);
      root.unmount();
      host.remove();
      fontStyle.remove();
    };
    previous.streamlaughsCleanup = cleanup;
    ctx.onInvalidated(cleanup);
  },
});
