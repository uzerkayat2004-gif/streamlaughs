import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'wxt';
import product from '../../product.config.json';
import identity from './extension-identity.json';

const offlinePreview = process.env.OFFLINE_PREVIEW === 'true';
const configuredApi = offlinePreview
  ? undefined
  : process.env.VITE_CROWD_API_URL?.trim();
let apiConnections = '';
const configuredSite = offlinePreview
  ? undefined
  : process.env.SITE_URL?.trim() || product.siteUrl;
let siteConnections = '';
if (configuredSite) {
  const url = new URL(configuredSite);
  if (
    url.username ||
    url.password ||
    url.pathname !== '/' ||
    url.search ||
    url.hash ||
    !(
      url.protocol === 'https:' ||
      (url.protocol === 'http:' &&
        ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname))
    )
  )
    throw new Error(
      'SITE_URL must be an HTTPS origin (HTTP localhost allowed).',
    );
  siteConnections = ` ${url.origin}`;
}
if (configuredApi) {
  const url = new URL(configuredApi);
  if (
    url.pathname !== '/' ||
    url.search ||
    url.hash ||
    url.username ||
    url.password ||
    !(
      url.protocol === 'https:' ||
      (url.protocol === 'http:' &&
        ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname))
    )
  )
    throw new Error(
      'VITE_CROWD_API_URL must be an HTTPS origin (HTTP localhost allowed).',
    );
  apiConnections = ` ${url.origin} ${url.origin.replace(/^http/, 'ws')}`;
}

export default defineConfig({
  modules: ['@wxt-dev/module-react'],
  hooks: {
    'build:manifestGenerated'(_wxt, manifest) {
      // WXT derives the action title before Vite replaces the HTML title token.
      if (manifest.action) manifest.action.default_title = product.name;
    },
    'entrypoints:resolved'(wxt, entrypoints) {
      if (
        wxt.config.mode !== 'development' &&
        wxt.config.mode !== 'audio-debug'
      )
        for (const entry of entrypoints)
          if (entry.name === 'debug') entry.skipped = true;
    },
  },
  outDirTemplate: '{{browser}}-mv{{manifestVersion}}{{modeSuffix}}',
  vite: () => ({
    define: {
      'import.meta.env.VITE_CROWD_API_URL': JSON.stringify(configuredApi ?? ''),
      'import.meta.env.VITE_SITE_URL': JSON.stringify(
        configuredSite ? new URL(configuredSite).origin : '',
      ),
    },
    plugins: [
      tailwindcss(),
      {
        name: 'product-titles',
        transformIndexHtml(html) {
          const name = product.name
            .replaceAll('&', '&amp;')
            .replaceAll('<', '&lt;')
            .replaceAll('>', '&gt;');
          return html.replace(
            /<title>(.*?)<\/title>/s,
            (_match, title: string) =>
              `<title>${title.replaceAll('__PRODUCT_NAME__', name)}</title>`,
          );
        },
      },
    ],
    css: { postcss: { plugins: [] } },
    resolve: {
      conditions: [
        'onnxruntime-web-use-extern-wasm',
        'browser',
        'module',
        'import',
      ],
    },
    optimizeDeps: {
      exclude: [
        '@mediapipe/tasks-audio',
        'onnxruntime-web',
        '@huggingface/transformers',
      ],
    },
  }),
  manifest: {
    name: product.name,
    version: product.version,
    key: identity.publicKey,
    description: `${product.name} — ${product.pitch}. Local audio processing and anonymous fan counts.`,
    minimum_chrome_version: '120',
    permissions: [
      'storage',
      'tabs',
      'tabCapture',
      'offscreen',
      'downloads',
      'scripting',
    ],
    host_permissions: ['https://www.twitch.tv/*'],
    optional_host_permissions: configuredSite
      ? [
          `${new URL(configuredSite).protocol}//${new URL(configuredSite).hostname}/*`,
        ]
      : [],
    icons: {
      16: '/icon/16.png',
      32: '/icon/32.png',
      48: '/icon/48.png',
      128: '/icon/128.png',
    },
    action: {
      default_title: product.name,
      default_icon: { 16: '/icon/16.png', 32: '/icon/32.png' },
    },
    commands: {
      'toggle-recording': {
        suggested_key: { default: 'Alt+Shift+L' },
        description: `Start or stop your ${product.name} session`,
      },
    },
    content_security_policy: {
      extension_pages: `script-src 'self' 'wasm-unsafe-eval'; object-src 'none'; connect-src 'self'${apiConnections}${siteConnections}; worker-src 'self'; font-src 'self'; img-src 'self' data: blob:; style-src 'self' 'unsafe-inline'`,
    },
    web_accessible_resources: [
      { resources: ['fonts/*'], matches: ['https://www.twitch.tv/*'] },
    ],
  },
});
