// The prerelease exports map omits its types condition. Load the supplied declarations explicitly.
declare module 'onnxruntime-web/webgpu' {
  export { env, InferenceSession, Tensor } from 'onnxruntime-common';
}
