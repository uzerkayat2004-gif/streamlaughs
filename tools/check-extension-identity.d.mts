export function extensionId(publicKey: string): string;
export function checkManifest(
  manifest: { key?: string },
  identity: { publicKey: string; id: string },
): void;
