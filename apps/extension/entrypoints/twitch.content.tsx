import { replayPage } from '@laughline/shared';
import { createRoot } from 'react-dom/client';
import { createInstallGuard, readInstallMarkers } from '../src/install-guard';
import { contentInstallKind } from '../src/install-type';
import { Overlay } from '../src/Overlay';
import css from '../src/styles.css?inline';
import { pageWatchContext } from '../src/watch-context';

export default defineContentScript({
  matches: [
    'https://www.twitch.tv/*',
    'https://twitch.tv/*',
    'https://m.twitch.tv/*',
    'https://clips.twitch.tv/*',
  ],
  allFrames: true,
  async main(ctx) {
    if (window !== top) {
      const tick = () => {
        const page = replayPage(location.href),
          context = pageWatchContext();
        if (page && context.seconds !== undefined)
          void chrome.runtime
            .sendMessage({
              type: 'REPLAY_POSITION',
              replay: {
                ...page,
                seconds: context.seconds,
                at: Date.now(),
                rate: context.rate ?? 1,
                paused: context.paused ?? false,
              },
            })
            .catch(() => {});
      };
      const timer = setInterval(tick, 500);
      const events = ['seeked', 'ratechange', 'pause', 'play'];
      for (const event of events) document.addEventListener(event, tick, true);
      ctx.onInvalidated(() => {
        clearInterval(timer);
        for (const event of events)
          document.removeEventListener(event, tick, true);
      });
      return;
    }
    const previous = globalThis as typeof globalThis & {
      streamlaughsCleanup?: () => void;
    };
    previous.streamlaughsCleanup?.();
    document
      .querySelector(
        `laughline-overlay[data-streamlaughs-id="${chrome.runtime.id}"]`,
      )
      ?.remove();
    let guard: ReturnType<typeof createInstallGuard> | undefined;
    const channelInfo = (
      message: { type?: string },
      sender: chrome.runtime.MessageSender,
      reply: (value: unknown) => void,
    ) => {
      if (sender.id !== chrome.runtime.id) return;
      if (message?.type === 'INSTALL_GUARD') {
        const respond = (allowed: boolean) =>
          reply({
            allowed,
            storePresent: readInstallMarkers(document.documentElement).some(
              (m) => m.kind === 'normal',
            ),
          });
        if ((message as { claim?: boolean }).claim && guard) {
          void guard.claim().then(respond);
          return true;
        }
        respond(guard?.owns() ?? false);
        return;
      }
      if (message?.type === 'GET_WATCH_CONTEXT') reply(pageWatchContext());
      if (message?.type === 'STREAMER_CONTEXT') {
        const context = pageWatchContext();
        if (context.channel) reply(context);
      }
    };
    chrome.runtime.onMessage.addListener(channelInfo);
    const host = document.createElement('laughline-overlay');
    host.dataset.streamlaughsId = chrome.runtime.id;
    host.dataset.streamlaughsVersion = chrome.runtime.getManifest().version;
    host.dataset.streamlaughsUi = 'solid-v081';
    host.style.cssText =
      'display:none;position:fixed;inset:0;z-index:2147483646;pointer-events:none;';
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
    const kind = await contentInstallKind();
    guard = createInstallGuard(
      document.documentElement,
      chrome.runtime.id,
      kind,
      {
        visible: (value) => {
          host.style.display = value ? '' : 'none';
        },
        stop: async () => {
          const reply = await chrome.runtime.sendMessage({
            type: 'INSTALL_SUPERSEDED',
          });
          if (!reply?.ok) throw new Error('handoff not ready');
        },
        tip: () => {
          void (async () => {
            const key = 'streamlaughs:store-copy-tip';
            if ((await chrome.storage.session.get(key))[key]) return;
            await chrome.storage.session.set({ [key]: true });
            const tip = document.createElement('streamlaughs-install-tip');
            const shadow = tip.attachShadow({ mode: 'open' });
            const button = document.createElement('button');
            button.textContent =
              'You have the store version. You can remove this manual copy. ×';
            button.style.cssText =
              'position:fixed;bottom:24px;right:24px;z-index:2147483647;max-width:320px;background:#171b21;color:#ffd23f;border:1px solid #ffd23f;border-radius:12px;padding:14px;font:14px/1.5 sans-serif;cursor:pointer';
            button.setAttribute(
              'aria-label',
              'You have the store version. You can remove this manual copy. Dismiss',
            );
            button.onclick = () => tip.remove();
            shadow.append(button);
            document.documentElement.append(tip);
            ctx.onInvalidated(() => tip.remove());
          })();
        },
      },
    );
    const cleanup = () => {
      guard?.cleanup();
      chrome.runtime.onMessage.removeListener(channelInfo);
      root.unmount();
      host.remove();
      fontStyle.remove();
    };
    previous.streamlaughsCleanup = cleanup;
    ctx.onInvalidated(cleanup);
  },
});
