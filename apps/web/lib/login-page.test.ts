import { Children, isValidElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, expect, it, vi } from 'vitest';
import Streamers from '../app/streamers/page';

afterEach(() => vi.unstubAllEnvs());

it('renders a distinct retry error page with a full-navigation retry link', async () => {
  const html = renderToStaticMarkup(
    await Streamers({ searchParams: Promise.resolve({ login: 'retry' }) }),
  );
  expect(html).toContain('role="alert"');
  expect(html).toContain('sign-in didn’t finish');
  expect(html).toContain('href="/auth/login"');
  expect(html).toContain('try Twitch again');
});
it('keeps the initial OAuth button a plain anchor instead of a prefetching Link', async () => {
  vi.stubEnv('TWITCH_CLIENT_ID', 'local-client');
  vi.stubEnv('TWITCH_CLIENT_SECRET', 'local-client-secret');
  vi.stubEnv(
    'SESSION_SECRET',
    'local-session-fixture-key-000000000000000000000000',
  );
  let found = false;
  const visit = (node: ReactNode) => {
    Children.forEach(node, (child) => {
      if (!isValidElement<{ href?: string; children?: ReactNode }>(child))
        return;
      if (child.props.href === '/auth/login') {
        expect(child.type).toBe('a');
        found = true;
      }
      visit(child.props.children);
    });
  };
  visit(await Streamers({ searchParams: Promise.resolve({}) }));
  expect(found).toBe(true);
});
