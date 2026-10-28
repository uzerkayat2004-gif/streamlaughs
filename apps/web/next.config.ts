import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import type { NextConfig } from 'next';
import product from '../../product.config.json';

const manifestPath = path.join(process.cwd(), 'public/downloads/manifest.json');
const download = existsSync(manifestPath)
  ? JSON.parse(readFileSync(manifestPath, 'utf8'))
  : null;
const filename = `${product.name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}.zip`;

const config: NextConfig = {
  transpilePackages: ['@laughline/shared'],
  poweredByHeader: false,
  devIndicators: false,
  logging: { incomingRequests: false },
  outputFileTracingExcludes: { '/*': ['./public/downloads/**'] },
  env: {
    EXTENSION_DOWNLOAD_VERSION: download?.version || '',
    EXTENSION_DOWNLOAD_SHA256: download?.sha256 || '',
    EXTENSION_DOWNLOAD_BYTES: String(download?.bytes || ''),
  },
  async rewrites() {
    return [{ source: '/download', destination: `/downloads/${filename}` }];
  },
  async headers() {
    return [
      {
        source: '/download',
        headers: [
          {
            key: 'Content-Disposition',
            value: `attachment; filename="${filename}"`,
          },
          { key: 'Content-Type', value: 'application/zip' },
          { key: 'Cache-Control', value: 'public, max-age=0, must-revalidate' },
        ],
      },
      {
        source: '/downloads/:filename(.*\\.zip)',
        headers: [
          {
            key: 'Content-Disposition',
            value: 'attachment; filename=":filename"',
          },
          { key: 'Cache-Control', value: 'public, max-age=0, must-revalidate' },
        ],
      },
      {
        source: '/:path*',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          {
            key: 'Permissions-Policy',
            value: 'camera=(), microphone=(), geolocation=()',
          },
          {
            key: 'Content-Security-Policy',
            value:
              "frame-ancestors 'none'; object-src 'none'; base-uri 'self'; form-action 'self'",
          },
        ],
      },
    ];
  },
};
export default config;
