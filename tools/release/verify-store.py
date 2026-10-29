"""Read-only checks of the finished store archives before CI upload."""
import json
import sys
import zipfile
from pathlib import PurePosixPath


def verify(filename):
    with zipfile.ZipFile(filename) as archive:
        manifests = [name for name in archive.namelist()
                     if PurePosixPath(name).name.lower() == 'manifest.json']
        assert manifests == ['manifest.json'], 'Store ZIP needs exactly one root manifest.json'
        manifest = json.loads(archive.read('manifest.json'))
        assert 'key' not in manifest, 'Store manifest must not contain key'
        assert 'downloads' not in manifest.get('permissions', []), 'Unneeded downloads permission'
        assert 'downloads' not in manifest.get('optional_permissions', []), 'Unneeded optional downloads permission'
    print(f'Verified store ZIP: {PurePosixPath(filename).name}; one manifest, no key, no downloads')


if __name__ == '__main__':
    assert len(sys.argv) > 1, 'Pass at least one store ZIP'
    for filename in sys.argv[1:]:
        verify(filename)
