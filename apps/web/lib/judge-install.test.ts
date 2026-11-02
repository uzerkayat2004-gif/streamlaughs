import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it } from 'vitest';
import { PRODUCT } from '@laughline/shared';
import { JudgeInstall } from '../components/judge-install';
it('points judges directly to the latest ZIP with four setup steps and the current version', () => {
  const html = renderToStaticMarkup(createElement(JudgeInstall));
  expect(html).toContain('href="/download/zip"');
  expect(html).toContain(`v${PRODUCT.version} ZIP`);
  expect(html.match(/<li>/g)).toHaveLength(4);
  expect(html).toContain('chrome://extensions');
  expect(html).toContain('edge://extensions');
  expect(html).toContain('Load unpacked');
  expect(html).toContain('Twitch stream');
  expect(html).not.toContain('github.com');
});
