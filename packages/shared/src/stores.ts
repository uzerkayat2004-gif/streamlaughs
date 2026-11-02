import { PRODUCT } from './product';

export type StoreBrowser = 'chrome' | 'edge' | 'unsupported' | 'unknown';
export type BrowserHints = {
  userAgent?: string;
  maxTouchPoints?: number;
  userAgentData?: {
    mobile?: boolean;
    brands?: readonly { brand: string; version: string }[];
  };
};

/** No fingerprinting, network lookup or persistent browser identifier. */
export function storeBrowser(hints: BrowserHints): StoreBrowser {
  const ua = hints.userAgent ?? '';
  if (
    hints.userAgentData?.mobile ||
    /Android|iPhone|iPad|iPod|Mobile|Tablet/i.test(ua) ||
    (/Macintosh/.test(ua) && (hints.maxTouchPoints ?? 0) > 1)
  )
    return 'unsupported';
  const brands =
    hints.userAgentData?.brands?.map((b) => b.brand).join(' ') ?? '';
  if (/Microsoft Edge/i.test(brands)) return 'edge';
  if (/Chromium|Google Chrome|Brave|Opera|Comet|Arc/i.test(brands)) return 'chrome';
  // Use the legacy user agent only when feature brands do not identify the browser.
  if (/Firefox\//i.test(ua)) return 'unsupported';
  if (/Edg\//i.test(ua)) return 'edge';
  if (/Chrome\/|Chromium\/|Brave\/|OPR\/|Comet\/|Arc\//i.test(ua)) return 'chrome';
  if (/Safari\//i.test(ua)) return 'unsupported';
  return 'unknown';
}

export function storeBehind(latest: string, approved: string): boolean {
  if (![latest, approved].every((v) => /^\d+(?:\.\d+){2,3}$/.test(v)))
    return false;
  const a = latest.split('.').map(Number),
    b = approved.split('.').map(Number);
  for (let i = 0; i < 4; i++) {
    if ((a[i] ?? 0) !== (b[i] ?? 0)) return (a[i] ?? 0) > (b[i] ?? 0);
  }
  return false;
}

export function storeChoice(target: StoreBrowser) {
  return target === 'edge'
    ? {
        label: 'Get it for Edge',
        url: PRODUCT.edgeStoreUrl,
        version: PRODUCT.edgeStoreVersion,
      }
    : {
        label: 'Add to Chrome',
        url: PRODUCT.chromeStoreUrl,
        version: PRODUCT.chromeStoreVersion,
      };
}
