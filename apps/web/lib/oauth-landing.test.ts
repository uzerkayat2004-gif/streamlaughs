import { NextRequest } from 'next/server';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, expect, it, vi } from 'vitest';
import Streamers from '../app/streamers/page';
import { proxy } from '../proxy';

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

it('routes the actual Twitch homepage error to setup help without forwarding provider state or text', () => {
  const warnings = vi.spyOn(console, 'warn').mockImplementation(() => {});
  const response = proxy(
    new NextRequest(
      'https://streamlaughs.vercel.app/?error=redirect_mismatch&state=private-state-fixture&error_description=untrusted-description',
    ),
  );
  expect(response.status).toBe(307);
  expect(response.headers.get('Location')).toBe(
    'https://streamlaughs.vercel.app/streamers?login=retry&reason=redirect_mismatch',
  );
  expect(response.headers.get('Cache-Control')).toBe('no-store');
  expect(response.headers.get('Referrer-Policy')).toBe('no-referrer');
  expect(response.cookies.getAll()).toEqual([]);
  const output = JSON.stringify([[...response.headers], warnings.mock.calls]);
  expect(output).not.toContain('private-state-fixture');
  expect(output).not.toContain('untrusted-description');
});

it('leaves ordinary home visits and the canonical callback route alone', () => {
  for (const path of [
    '/',
    '/?error=unrecognized',
    '/auth/callback?error=redirect_mismatch',
  ]) {
    const response = proxy(new NextRequest(`https://example.test${path}`));
    expect(response.headers.get('Location')).toBeNull();
    expect(response.headers.get('x-middleware-next')).toBe('1');
  }
});

it('shows the configurable callback registration instead of the homepage pitch', async () => {
  vi.stubEnv('SITE_URL', 'https://renamed-project.vercel.app');
  const html = renderToStaticMarkup(
    await Streamers({
      searchParams: Promise.resolve({
        login: 'retry',
        reason: 'redirect_mismatch',
      }),
    }),
  );
  expect(html).toContain('role="alert"');
  expect(html).toContain('Twitch rejected this app’s callback URL');
  expect(html).toContain('https://renamed-project.vercel.app/auth/callback');
  expect(html).toContain('OAuth Redirect URLs');
  expect(html).not.toContain('see who');
});
