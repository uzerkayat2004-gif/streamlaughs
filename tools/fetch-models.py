"""Build-time downloads only. The extension never uses these remote URLs at runtime."""
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
import hashlib
import json
import urllib.request

ROOT = Path(__file__).resolve().parents[1]
BASE = ROOT / 'apps/extension/public/models'
MANIFEST = BASE / 'manifest.json'
EXPECTED = {entry['path']: entry for entry in json.loads(MANIFEST.read_text(encoding='utf-8'))['files']} if MANIFEST.exists() else {}
REVISION = '2575352d61be1bf7225cf8f8b268a4678025fc58'
SOURCES = [
 ('silero-v5.onnx', 'https://raw.githubusercontent.com/snakers4/silero-vad/v5.1.2/src/silero_vad/data/silero_vad.onnx', 'MIT'),
 ('yamnet.tflite', 'https://storage.googleapis.com/mediapipe-models/audio_classifier/yamnet/float32/1/yamnet.tflite', 'Apache-2.0'),
 ('licenses/silero-MIT.txt', 'https://raw.githubusercontent.com/snakers4/silero-vad/v5.1.2/LICENSE', 'MIT'),
 ('licenses/YAMNet-Apache-2.0.txt', 'https://raw.githubusercontent.com/tensorflow/models/master/LICENSE', 'Apache-2.0'),
 ('licenses/Whisper-MIT.txt', 'https://raw.githubusercontent.com/openai/whisper/main/LICENSE', 'MIT'),
 ('licenses/Whisper-model-card.md', 'https://huggingface.co/openai/whisper-tiny.en/raw/main/README.md', 'Apache-2.0'),
]
for file in ['config.json', 'generation_config.json', 'preprocessor_config.json', 'tokenizer.json', 'tokenizer_config.json', 'special_tokens_map.json', 'onnx/encoder_model_quantized.onnx', 'onnx/decoder_model_merged_quantized.onnx']:
    SOURCES.append(('whisper-tiny.en/' + file, f'https://huggingface.co/onnx-community/whisper-tiny.en/resolve/{REVISION}/{file}', 'Apache-2.0'))

def download(item):
    name, url, license_name = item
    path = BASE / name
    path.parent.mkdir(parents=True, exist_ok=True)
    generation = None
    if not path.exists():
        print('Downloading ' + name, flush=True)
        with urllib.request.urlopen(url, timeout=120) as response, path.with_suffix(path.suffix + '.download').open('wb') as out:
            generation = response.headers.get('x-goog-generation')
            while chunk := response.read(1024 * 1024): out.write(chunk)
        path.with_suffix(path.suffix + '.download').replace(path)
    digest = hashlib.sha256(path.read_bytes()).hexdigest()
    expected = EXPECTED.get(name)
    if expected and (digest != expected['sha256'] or path.stat().st_size != expected['bytes']):
        raise ValueError(f'Asset does not match the pinned receipt: {name}')
    source = expected['url'] if expected else url + ('?generation=' + generation if generation else '')
    return dict(path=name, url=source, bytes=path.stat().st_size, sha256=digest, license=license_name)

if __name__ == '__main__':
    with ThreadPoolExecutor(max_workers=4) as pool: receipts = list(pool.map(download, SOURCES))
    (BASE / 'manifest.json').write_text(json.dumps({'whisperRevision': REVISION, 'files': receipts}, indent=2) + '\n', encoding='utf-8')
    print(f'Models and notices: {sum(x["bytes"] for x in receipts):,} bytes; SHA-256 manifest written.', flush=True)
