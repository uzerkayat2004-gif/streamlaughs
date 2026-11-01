const path = { 16: 'icon/toolbar-16.png', 32: 'icon/toolbar-32.png' };
/** Global defaults do not clear per-tab overrides left by an earlier version. */
export async function clearToolbar() {
  if (!chrome.action) return;
  await Promise.allSettled([
    chrome.action.setBadgeText({ text: '' }),
    chrome.action.setIcon({ path }),
  ]);
  const tabs = await chrome.tabs.query({}).catch(() => []);
  await Promise.allSettled(
    tabs
      .filter((t) => t.id !== undefined)
      .flatMap((t) => [
        chrome.action.setBadgeText({ tabId: t.id!, text: '' }),
        chrome.action.setIcon({ tabId: t.id!, path }),
      ]),
  );
}
