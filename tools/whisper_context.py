"""Deterministic local specialization of the pinned Whisper encoder to 20 s.
The application segments speech at <=2.4 s. Keep the first 1,000 positional
vectors and update sequence shape annotations; learned layers/decoder stay intact.
Ordinary builds use the bundled receipt-checked files and need no Python packages.
"""
import hashlib
import json

ENCODER_SOURCE_SHA = 'e93ec822f16a8fd264e7de972ad17d615ea7334b75a52d54c50c2e18dd503a25'

def varint(s,i=0):
 n=0;k=0
 while True:
  b=s[i];i+=1;n|=(b&127)<<k
  if b<128:return n,i
  k+=7

def fields(s):
 i=0
 while i<len(s):
  t,i=varint(s,i);w=t&7;n=t>>3
  if w==0:v,i=varint(s,i)
  elif w==2:
   size,i=varint(s,i);v=s[i:i+size];i+=size
  elif w in [1,5]:l={1:8,5:4}[w];v=s[i:i+l];i+=l
  else:raise Exception(w)
  yield n,w,v

def vint(x):
 b=bytearray()
 while x>=128:b.append((x&127)|128);x>>=7
 b.append(x);return bytes(b)
def encode(f):
 out=bytearray()
 for n,w,v in f:
  out+=vint(n*8+w)
  out+=vint(v) if w==0 else vint(len(v))+v if w==2 else v
 return bytes(out)
def tensor(v):
 f=list(fields(v));dims=[x for n,w,x in f if n==1 and w==0]
 if dims!=[1500,384]:return v
 assert next(x for n,w,x in f if n==8)==b'embed_positions.weight'
 return encode((n,w,1000 if n==1 and w==0 and x==1500 else x[:1000*384*4] if n==9 else x) for n,w,x in f)
def nested(v,path):
 if not path:return encode((n,w,1000 if n==1 and w==0 and x==1500 else x) for n,w,x in fields(v))
 return encode((n,w,nested(x,path[1:]) if n==path[0] and w==2 else x) for n,w,x in fields(v))
def graph(v):return encode((n,w,tensor(x) if n==5 else nested(x,[2,1,2,1]) if n in [11,12,13] else x) for n,w,x in fields(v))

def specialize_encoder(data):
    if hashlib.sha256(data).hexdigest() != ENCODER_SOURCE_SHA:
        raise ValueError('Whisper encoder source differs from the pinned upstream export')
    return encode((n,w,graph(x) if n==7 else x) for n,w,x in fields(data))

def transform_asset(name, data):
    if name.endswith('/onnx/encoder_model_quantized.onnx'):
        return specialize_encoder(data)
    if name.endswith('/preprocessor_config.json'):
        value=json.loads(data);value.update(n_samples=320000,nb_max_frames=2000,chunk_length=20)
        return (json.dumps(value,indent=2)+'\n').encode()
    if name.endswith('/config.json'):
        value=json.loads(data);value['max_source_positions']=1000
        return (json.dumps(value,indent=2)+'\n').encode()
    return data
