"""Flat deterministic extension ZIPs only; no repository, home or secret directory is traversed."""
import hashlib
import json
import sys
import zipfile
from pathlib import Path

def pack(source, target, extras):
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
    target.parent.mkdir(parents=True, exist_ok=True)
    with zipfile.ZipFile(target, 'w', compression=zipfile.ZIP_DEFLATED, compresslevel=6) as out:
        for name, file in entries:
            info = zipfile.ZipInfo(name, date_time=(2026, 1, 1, 0, 0, 0))
            info.compress_type = zipfile.ZIP_DEFLATED
            info.external_attr = 0o100644 << 16
            out.writestr(info, Path(file).read_bytes())
    with zipfile.ZipFile(target) as out:
        assert out.testzip() is None
        assert 'manifest.json' in out.namelist()
        assert 'LICENSE' in out.namelist() and 'THIRD_PARTY_NOTICES.md' in out.namelist()
    return hashlib.sha256(target.read_bytes()).hexdigest()

if __name__ == '__main__':
    print(pack(sys.argv[1], sys.argv[2], json.loads(Path(sys.argv[3]).read_text(encoding='utf-8'))))
