# Part 2 plan

1. Review the existing UI/session contracts and current browser capture/offscreen requirements.
2. Add a tested capture reducer, microphone permission onboarding and one offscreen audio owner. Keep tab replay independent of processing.
3. Add a worklet for each input, streaming 16 kHz resampling, 20 ms frames, 30-second memory-only buffers and numeric telemetry.
4. Integrate pause/resume, device/permission loss and retry, tab changes, singleton capture and worker recovery without changing the existing session store/DB responsibilities.
5. Verify DSP/state/privacy contracts with unit tests and real browser microphone processing with fake media devices. Retain the Part 1 UI smoke test in crowd-only mode, and document real tabCapture/manual checks and Part 3.
