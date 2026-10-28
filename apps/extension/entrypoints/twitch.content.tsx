import { createRoot } from 'react-dom/client';
import { Overlay } from '../src/Overlay';
import css from '../src/styles.css?inline';

export default defineContentScript({
  matches: ['https://www.twitch.tv/*'],
  main(ctx) {
    const host = document.createElement('laughline-overlay');
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
    ctx.onInvalidated(() => {
      root.unmount();
      host.remove();
      fontStyle.remove();
    });
  },
});
