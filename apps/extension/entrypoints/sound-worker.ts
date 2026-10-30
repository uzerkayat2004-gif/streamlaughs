import { modelState, safeError } from '../src/diagnostics';
import { installLocalAssetPolicy } from '../src/inference/local-assets';
import { LocalModels } from '../src/inference/models';

// MediaPipe classification is synchronous; keep it off the realtime/VAD event loop.
export default defineUnlistedScript(() => {
  installLocalAssetPolicy(self.location.origin);
  const models = new LocalModels();
  let ready = false;
  const status = () =>
    self.postMessage({
      type: 'sound_status',
      model: models.status.yamnet ?? modelState(),
    });
  self.onmessage = async ({ data }) => {
    if (data.type === 'init') {
      try {
        const loading = models.loadSound(data.base);
        status();
        await loading;
        ready = true;
      } catch (error) {
        models.loadFailed(error);
      }
      status();
    } else if (data.type === 'sound') {
      const samples = data.samples as Float32Array,
        reference = data.reference as Float32Array | undefined;
      try {
        if (
          !ready ||
          !(samples instanceof Float32Array) ||
          samples.length !== 15600 ||
          (reference &&
            (!(reference instanceof Float32Array) || reference.length > 32000))
        )
          throw new Error('local sound model unavailable');
        const scores = models.sound(samples, reference);
        self.postMessage({
          type: 'sound_result',
          id: data.id,
          scores,
          echo: models.echo,
          topClass: models.topClass,
        });
      } catch (error) {
        self.postMessage({
          type: 'sound_result',
          id: data.id,
          error: safeError(error),
        });
      } finally {
        samples?.fill(0);
        reference?.fill(0);
      }
    }
  };
  status();
});
