import type { ChannelCrowd } from './room';
export interface Env {
  CHANNELS: DurableObjectNamespace<ChannelCrowd>;
  HMAC_KEY: string;
  WORKER_OWNER_KEY?: string;
  SITE_ORIGINS?: string;
  EXTENSION_ORIGINS: string;
  CROWD_ENABLED: string;
  ALLOW_TEST_TRAFFIC: string;
  ENVIRONMENT: string;
}
export function enabled(env: Env) {
  return (
    env.CROWD_ENABLED === 'true' &&
    typeof env.HMAC_KEY === 'string' &&
    env.HMAC_KEY.length >= 32 &&
    (env.ENVIRONMENT !== 'production' || !env.HMAC_KEY.includes('development'))
  );
}
export const allowedOrigin = (env: Env, origin: string | null) =>
  !!origin &&
  `${env.EXTENSION_ORIGINS},${env.SITE_ORIGINS ?? ''}`
    .split(',')
    .map((x) => x.trim())
    .includes(origin);
