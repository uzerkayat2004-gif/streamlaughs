// Self-contained: Chrome serializes this function into an existing Twitch tab.
export function showUpdatedNote(name: string, version: string) {
  document.getElementById('streamlaughs-refresh-note')?.remove();
  const host = document.createElement('div');
  host.id = 'streamlaughs-refresh-note';
  host.dataset.version = version;
  host.style.cssText =
    'position:fixed;right:24px;bottom:88px;z-index:2147483647;';
  const root = host.attachShadow({ mode: 'open' });
  const style = document.createElement('style');
  style.textContent =
    'section{padding:12px 16px;border-radius:14px;background:rgba(15,15,20,.35);backdrop-filter:blur(16px) saturate(140%);border:1px solid #ffffff1a;box-shadow:0 8px 32px #0003;color:#ffffffd9;font:13px/1.4 system-ui;max-width:290px}p{margin:0 0 8px}button{border:1px solid #ffffff30;background:#ffffff0a;color:#fff;border-radius:8px;padding:6px 12px;cursor:pointer}button:focus-visible{outline:2px solid #FFD23F;outline-offset:3px}small{margin-left:10px;opacity:.6}';
  const section = document.createElement('section');
  section.setAttribute('role', 'status');
  const message = document.createElement('p');
  message.textContent = `${name} updated, refresh this tab`;
  const button = document.createElement('button');
  button.type = 'button';
  button.textContent = 'refresh';
  button.onclick = () => location.reload();
  const label = document.createElement('small');
  label.textContent = `v${version}`;
  section.append(message, button, label);
  root.append(style, section);
  document.documentElement.append(host);
}
export async function notifyUpdatedTabs(name: string, version: string) {
  const tabs = await chrome.tabs.query({ url: 'https://www.twitch.tv/*' });
  await Promise.allSettled(
    tabs
      .filter((tab) => tab.id !== undefined)
      .map((tab) =>
        chrome.scripting.executeScript({
          target: { tabId: tab.id! },
          func: showUpdatedNote,
          args: [name, version],
        }),
      ),
  );
}
