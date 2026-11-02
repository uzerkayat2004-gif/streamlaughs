import { afterEach, expect, it, vi } from 'vitest';
import {
  contentInstallKind,
  getInstallKind,
  installPresentation,
} from './install-type';

afterEach(() => vi.unstubAllGlobals());
it.each(['normal', 'development', 'other'])(
  'uses real getSelf installType %s rather than the extension ID',
  async (kind) => {
    vi.stubGlobal('chrome', {
      runtime: { id: 'fkocldgggcmhihelohiicoakcfomhepg' },
      management: { getSelf: async () => ({ installType: kind }) },
    });
    expect(await getInstallKind()).toBe(kind);
    expect(installPresentation(kind as 'normal').switchBanner).toBe(
      kind === 'development',
    );
  },
);
it('hides ZIP UI and save history for store/unknown installs, while import remains independent', async () => {
  expect(installPresentation('normal')).toEqual({
    switchBanner: false,
    saveHistory: false,
    zipUpdates: false,
  });
  expect(installPresentation('development')).toEqual({
    switchBanner: true,
    saveHistory: true,
    zipUpdates: false,
  });
  vi.stubGlobal('chrome', {});
  expect(await getInstallKind()).toBe('other');
  expect(installPresentation('other').switchBanner).toBe(false);
});

it('asks the background for install type when running in a content script without management access', async () => {
  const sendMessage = vi.fn(async () => ({ installType: 'normal' }));
  vi.stubGlobal('chrome', { runtime: { sendMessage } });
  expect(await contentInstallKind()).toBe('normal');
  expect(sendMessage).toHaveBeenCalledWith({ type: 'INSTALL_IDENTITY' });
});
