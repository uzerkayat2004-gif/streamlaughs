import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { GET } from '../app/api/dashboard/[channel]/route';
import { authenticated } from './auth';
import { report } from './report';

vi.mock('./auth', () => ({ authenticated: vi.fn() }));
vi.mock('./report', () => ({ report: vi.fn() }));

beforeEach(() => {
  vi.stubEnv('WORKER_API_URL', '');
  vi.stubEnv('WORKER_OWNER_KEY', '');
  vi.mocked(authenticated).mockResolvedValue({
    login: 'mychannel',
    userId: '123',
  });
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});
const get = (channel: string) =>
  GET(new Request(`https://streamlaughs.vercel.app/api/dashboard/${channel}`), {
    params: Promise.resolve({ channel }),
  });

it('shows a signed-in owner a setup-pending response without invoking the Worker report', async () => {
  const response = await get('mychannel');
  expect(response.status).toBe(503);
  expect(response.headers.get('Cache-Control')).toBe('no-store');
  expect(await response.json()).toEqual({
    error: 'crowd features aren’t set up yet',
  });
  expect(report).not.toHaveBeenCalled();
});
it('rejects a foreign channel and unauthenticated request before revealing setup status', async () => {
  expect((await get('anotherchannel')).status).toBe(403);
  vi.mocked(authenticated).mockResolvedValue(null);
  expect((await get('mychannel')).status).toBe(403);
  expect(report).not.toHaveBeenCalled();
});
