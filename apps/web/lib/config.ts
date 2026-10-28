import 'server-only';
import { PRODUCT } from '@laughline/shared';
export function origin(value: string | undefined, fallback?: string) {
  const url = new URL(value || fallback || 'http://localhost:3000');
  const local = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
  if (
    url.username ||
    url.password ||
    url.pathname !== '/' ||
    url.search ||
    url.hash ||
    !(url.protocol === 'https:' || (local && url.protocol === 'http:'))
  )
    throw new Error('Use an HTTPS origin (HTTP localhost is allowed)');
  return url.origin;
}
export function siteUrl() {
  return origin(process.env.SITE_URL, PRODUCT.siteUrl);
}
export function releaseUrl() {
  const owner = process.env.RELEASE_REPO_OWNER || PRODUCT.releaseRepoOwner,
    name = process.env.RELEASE_REPO_NAME ?? PRODUCT.releaseRepoName;
  return /^[A-Za-z0-9_-]+$/.test(owner) &&
    name &&
    /^[A-Za-z0-9_.-]+$/.test(name)
    ? `https://github.com/${owner}/${name}/releases/latest`
    : null;
}
export function workerUrl() {
  return process.env.WORKER_API_URL ? origin(process.env.WORKER_API_URL) : '';
}
export function secret(
  name:
    | 'SESSION_SECRET'
    | 'TWITCH_CLIENT_SECRET'
    | 'TWITCH_CLIENT_ID'
    | 'WORKER_OWNER_KEY',
) {
  const value = process.env[name];
  if (
    !value ||
    ((name === 'SESSION_SECRET' || name === 'WORKER_OWNER_KEY') &&
      value.length < 32)
  )
    throw new Error('Server configuration incomplete');
  return value;
}
export function twitchOrigin() {
  if (
    process.env.AUTH_TEST_MODE === 'true' &&
    process.env.NODE_ENV !== 'production'
  ) {
    const site = new URL(siteUrl()),
      mock = new URL(process.env.TWITCH_TEST_ORIGIN ?? '');
    if (
      ['localhost', '127.0.0.1'].includes(site.hostname) &&
      ['localhost', '127.0.0.1'].includes(mock.hostname) &&
      mock.protocol === 'http:'
    )
      return mock.origin;
    throw new Error(
      'Mock identity provider is limited to local development tests',
    );
  }
  return 'https://id.twitch.tv';
}
export function helixOrigin() {
  return twitchOrigin() === 'https://id.twitch.tv'
    ? 'https://api.twitch.tv'
    : twitchOrigin();
}
export const callbackUrl = () => `${siteUrl()}/auth/callback`;

export function dashboardConfigured() {
  try {
    for (const name of [
      'TWITCH_CLIENT_ID',
      'TWITCH_CLIENT_SECRET',
      'SESSION_SECRET',
      'WORKER_OWNER_KEY',
    ] as const)
      if (!secret(name).trim()) return false;
    return Boolean(workerUrl());
  } catch {
    return false;
  }
}
