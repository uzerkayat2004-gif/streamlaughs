# Rebuild test-only montages from the attributed PCM sources; never from captured user audio.
from pathlib import Path
import numpy as np, json, hashlib
from scipy.signal import butter,sosfilt
from scipy.io.wavfile import read,write
root=Path(__file__).resolve().parents[2];out=root/'tests/fixtures/audio/accuracy'
rate=16000;rng=np.random.default_rng(8606)
def load(name):
 r,a=read(out/(name+'.wav'));assert r==rate and a.ndim==1
 return a.astype(np.float32)/32768
speech=load('normal-human-source');laugh=load('laugh-source');bro=load('bro-source');no_way=load('no-way-source');cough=load('cough-source');sneeze=load('sneeze-source')
def level(a,rms):return a*(rms/max(1e-8,np.sqrt(np.mean(a*a))))
def put(dst,clip,t):
 i=round(t*rate);n=min(len(clip),len(dst)-i)
 if n>0:dst[i:i+n]+=clip[:n]
def save(name,a):write(out/(name+'.wav'),rate,np.int16(np.clip(a,-.99,.99)*32767))
def room(n):return rng.normal(0,0.0002,n).astype(np.float32)
def fixture(body_seconds,body,bleed=False):
 a=room((8+body_seconds+12)*rate)
 if bleed:
  raw=np.tile(speech,3)[:len(a)].copy()
  for t in [15,30,45,60]:put(raw,laugh,t)
  raw=sosfilt(butter(3,[500,3000],btype='bandpass',fs=rate,output='sos'),raw)
  reverbed=raw.copy()
  for delay,g in [(.041,.5),(.087,.35),(.149,.2)]:
   n=int(delay*rate);reverbed[n:]+=raw[:-n]*g
  a+=level(reverbed,0.0065)
 put(a,body,8)
 return a
save('normal-60s',fixture(60,speech))
talk=speech.copy()
for t in [9,27,45]:
 talk[int(t*rate):int((t+4)*rate)]*=0
 put(talk,laugh,t)
save('talk-three-laughs',fixture(60,talk))
body=np.zeros(60*rate,dtype=np.float32)
for t in [9,27,45]:put(body,laugh,t)
save('bleed-60s',fixture(60,np.zeros_like(body),True))
save('bleed-three-laughs',fixture(60,body,True))
words=np.zeros(30*rate,dtype=np.float32)
for clip,t in [(bro,3),(bro,11),(no_way,19)]:put(words,clip,t)
save('reaction-words',fixture(30,words))
noises=np.zeros(30*rate,dtype=np.float32)
for t in np.arange(.2,5,.13):
 n=300;x=rng.normal(0,.12,n)*np.exp(-np.arange(n)/25);put(noises,x,t)
for t in [5.5,6.1,6.8]:put(noises,np.exp(-np.arange(100)/12)*.3,t)
put(noises,cough,8);put(noises,sneeze,20)
breath=sosfilt(butter(2,1500,fs=rate,output='sos'),rng.normal(0,1,3*rate))*np.sin(np.linspace(0,np.pi,3*rate))
put(noises,level(breath,.015),22)
t=np.arange(3*rate)/rate;put(noises,np.sin(2*np.pi*(200*t+130*t*t))*np.sin(np.pi*t/3)*.03,26)
save('room-noises-30s',fixture(30,noises))
cases=[{'name':'normal-60s','seconds':77,'laughs':0,'words':{}},{'name':'room-noises-30s','seconds':47,'laughs':0,'words':{}},{'name':'talk-three-laughs','seconds':77,'laughs':3,'words':{}}, {'name':'bleed-60s','seconds':77,'laughs':0,'words':{}},{'name':'bleed-three-laughs','seconds':77,'laughs':3,'words':{}},{'name':'reaction-words','seconds':47,'laughs':0,'words':{'bro':2,'no way':1}}]
for c in cases:c['sha256']=hashlib.sha256((out/(c['name']+'.wav')).read_bytes()).hexdigest()
(out/'cases.json').write_text(json.dumps(cases,indent=2)+'\n')
print(json.dumps(cases))

# Preserve the original real-human regression byte-for-byte, with the same quiet
# calibration prelude used by every other case. No threshold or sample injection.
import wave as _wave, hashlib as _hashlib, json as _json, math as _math
_existing_source = Path(__file__).resolve().parents[2] / 'tests/fixtures/audio/laugh-lets-go.wav'
_existing_target = _existing_source.parent / 'accuracy/existing-laugh-word.wav'
with _wave.open(str(_existing_source), 'rb') as _r:
    _params = _r.getparams(); _pcm = _r.readframes(_r.getnframes())
with _wave.open(str(_existing_target), 'wb') as _w:
    _w.setparams(_params)
    _w.writeframes(bytes(8*_params.framerate*_params.nchannels*_params.sampwidth)+_pcm+bytes(12*_params.framerate*_params.nchannels*_params.sampwidth))
_cases_path = _existing_target.parent / 'cases.json'
_rows = [r for r in _json.loads(_cases_path.read_text()) if r['name'] != 'existing-laugh-word']
_rows.append({'name':'existing-laugh-word','seconds':_math.ceil(20+_params.nframes/_params.framerate),'sha256':_hashlib.sha256(_existing_target.read_bytes()).hexdigest(),'originalSha256':_hashlib.sha256(_existing_source.read_bytes()).hexdigest()})
_cases_path.write_text(_json.dumps(_rows,indent=2)+'\n',encoding='utf-8')
