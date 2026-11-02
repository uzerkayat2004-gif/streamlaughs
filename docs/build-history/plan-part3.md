# Part 3 plan

1. Pin and bundle Silero VAD v5.1.2 (upstream snakers4/silero-vad, MIT), Google's YAMNet AudioClassifier float32/1 TFLite (TensorFlow Models/MediaPipe, Apache-2.0), and the ONNX Community quantized Whisper tiny.en conversion of OpenAI's Apache-2.0 model release. Preserve licences and SHA-256 receipts. Verify MediaPipe in an MV3 worker before choosing a fallback.
2. Add one offscreen-owned inference worker with local-only model/WASM loading, bounded transport and task queues, activity segmentation, sound classification, envelope correlation and privacy-filtered phrase counting.
3. Send validated personal events only to the background, remove the production fake generator, update bounded session aggregates and real personal recaps, and display warming/low-power state.
4. Extend dev diagnostics without persisting transcripts. Add deterministic unit tests and a real-model synthetic-audio browser test. Preserve Part 1/2 behavior and checks.
5. Run the same pipeline from a local WAV evaluation CLI; measure available CPU/WebGPU paths on this machine, document model/package sizes and limitations, provide a ten-minute recording guide and real-stream checklist, then propose Part 4.

Model sources:
- https://github.com/snakers4/silero-vad/tree/v5.1.2
- https://storage.googleapis.com/mediapipe-models/audio_classifier/yamnet/float32/1/yamnet.tflite
- https://huggingface.co/onnx-community/whisper-tiny.en
- https://huggingface.co/openai/whisper-tiny.en
