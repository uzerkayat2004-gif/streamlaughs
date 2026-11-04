import { PRODUCT } from '@laughline/shared';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it } from 'vitest';
import { ZipDownload } from '../components/zip-download';

it('offers the latest ZIP from the site, with its version, as a second option', () => {
  const html = renderToStaticMarkup(createElement(ZipDownload));
  expect(html).toContain('href="/download/zip"');
  expect(html).toContain('Download ZIP');
  expect(html).toContain(`v${PRODUCT.version}`);
  expect(html).not.toMatch(/judge/i);
  expect(html).not.toContain('github.com');
});
