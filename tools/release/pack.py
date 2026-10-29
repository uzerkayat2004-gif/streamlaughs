"""Flat deterministic extension ZIPs only; no repository, home or secret directory is traversed."""
import hashlib
import json
import sys
import zipfile
from pathlib import Path

def pack(source, target, extras, edge_store=False):
    source, target = Path(source).resolve(), Path(target).resolve()
    files = sorted(p for p in source.rglob('*') if p.is_file())
    assert (source / 'manifest.json') in files
    entries = [(p.relative_to(source).as_posix(), p) for p in files]
    entries.extend(extras.items())
    for name, file in entries:
        assert not Path(file).is_symlink()
        assert all(not p.startswith('.') for p in Path(name).parts)
        assert not any(word in name.lower() for word in ['.pem', '.key', '.p12', '.pfx', 'private-key', 'debug', '.env', '.map', '.log', 'simulation'])
        assert Path(file).resolve().is_file()
    assert len({name for name, _ in entries}) == len(entries)
    assert sum(Path(name).name.lower() == 'manifest.json' for name, _ in entries) == 1, 'Only the root manifest.json may be packaged'
    target.parent.mkdir(parents=True, exist_ok=True)
    with zipfile.ZipFile(target, 'w', compression=zipfile.ZIP_DEFLATED, compresslevel=6) as out:
        for name, file in entries:
            info = zipfile.ZipInfo(name, date_time=(2026, 1, 1, 0, 0, 0))
            info.compress_type = zipfile.ZIP_DEFLATED
            info.external_attr = 0o100644 << 16
            data = Path(file).read_bytes()
            if edge_store and name == 'manifest.json':
                manifest = json.loads(data)
                manifest.pop('key', None)
                for field in ('permissions', 'optional_permissions'):
                    if field in manifest:
                        manifest[field] = [permission for permission in manifest[field] if permission != 'downloads']
                data = (json.dumps(manifest, indent=2) + '\n').encode('utf-8')
            out.writestr(info, data)
    with zipfile.ZipFile(target) as out:
        assert out.testzip() is None
        assert 'manifest.json' in out.namelist()
        assert 'LICENSE' in out.namelist() and 'THIRD_PARTY_NOTICES.md' in out.namelist()
        assert sum(Path(name).name.lower() == 'manifest.json' for name in out.namelist()) == 1
        if edge_store:
            manifest = json.loads(out.read('manifest.json'))
            assert 'key' not in manifest
            assert 'downloads' not in manifest.get('permissions', [])
            assert 'downloads' not in manifest.get('optional_permissions', [])
    return hashlib.sha256(target.read_bytes()).hexdigest()

if __name__ == '__main__':
    assert len(sys.argv) == 4 or (len(sys.argv) == 5 and sys.argv[4] == '--edge-store')
    print(pack(sys.argv[1], sys.argv[2], json.loads(Path(sys.argv[3]).read_text(encoding='utf-8')), edge_store='--edge-store' in sys.argv))
