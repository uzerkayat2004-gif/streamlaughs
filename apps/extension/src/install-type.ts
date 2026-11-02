import { PRODUCT, storeBrowser, storeChoice } from '@laughline/shared';
export type InstallKind = 'normal' | 'development' | 'other';

export function installKind(value: unknown): InstallKind {
  return value === 'development' || value === 'normal' ? value : 'other';
}
/** getSelf is explicitly exempt from the management permission. Unknown fails closed. */
export async function getInstallKind(): Promise<InstallKind> {
  try {
    return installKind((await chrome.management.getSelf()).installType);
  } catch {
    return 'other';
  }
}
export function installPresentation(kind: InstallKind) {
  return {
    switchBanner: kind === 'development',
    saveHistory: kind === 'development',
    zipUpdates: false,
  };
}
export function browserStoreUrl() {
  return storeChoice(storeBrowser(navigator)).url || PRODUCT.chromeStoreUrl;
}

/** Content scripts cannot call management; ask our own background, not the page. */
export async function contentInstallKind(): Promise<InstallKind> {
  try {
    return installKind(
      (await chrome.runtime.sendMessage({ type: 'INSTALL_IDENTITY' }))
        ?.installType,
    );
  } catch {
    return 'other';
  }
}
