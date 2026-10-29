import { afterEach, expect, it, vi } from 'vitest';
import { saveDownload } from './UpdateView';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

it.each([
  'fkdfjgnhifofdjpbenlkhpfhmmhglmkb',
  'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
])(
  'never touches the missing downloads namespace for store/unknown ID %s',
  async (id) => {
    const access = vi.fn(() => {
      throw new Error('downloads permission is missing');
    });
    vi.stubGlobal('chrome', {
      runtime: { id },
      get downloads() {
        return access();
      },
    });
    const create = vi.spyOn(URL, 'createObjectURL');
    await expect(saveDownload(new Blob(), 'unused.zip')).rejects.toThrow(
      'updates come from your browser’s store',
    );
    expect(access).not.toHaveBeenCalled();
    expect(create).not.toHaveBeenCalled();
  },
);

it('keeps the real downloads API path available for ZIP installs and releases its blob URL', async () => {
  const download = vi.fn(
    async (_options: chrome.downloads.DownloadOptions) => 7,
  );
  const removeListener = vi.fn();
  vi.stubGlobal('chrome', {
    runtime: { id: 'fkocldgggcmhihelohiicoakcfomhepg' },
    downloads: {
      download,
      search: vi.fn(async () => [{ state: 'complete' }]),
      onChanged: { addListener: vi.fn(), removeListener },
    },
  });
  const revoke = vi.spyOn(URL, 'revokeObjectURL');
  await saveDownload(new Blob(['verified archive']), 'streamlaughs-v0.6.4.zip');
  expect(download).toHaveBeenCalledWith({
    url: expect.stringMatching(/^blob:/),
    filename: 'streamlaughs-v0.6.4.zip',
    saveAs: false,
    conflictAction: 'uniquify',
  });
  expect(removeListener).toHaveBeenCalledOnce();
  expect(revoke).toHaveBeenCalledWith(download.mock.calls[0]![0].url);
});
