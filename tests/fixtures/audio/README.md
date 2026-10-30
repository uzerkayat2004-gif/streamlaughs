# Production microphone regression fixtures

`laugh-speech.wav` contains **recorded human audio**, mono PCM16 at 16 kHz: the 0.584 s spoken phrase “you know what” repeated three times with 1 s gaps; 16.48325 s laughter; 2 s silence. Speech starts immediately so Welcome's short level check is deterministic. It is test data, never captured user audio and never included in an extension or website download.

- Laughter: ezwa, [Laughter.ogg](https://commons.wikimedia.org/wiki/File:Laughter.ogg), released worldwide into the public domain. Original file: `https://upload.wikimedia.org/wikipedia/commons/c/c6/Laughter.ogg`.
- Speech: Steve Shives, [En-us-you know what.ogg](https://commons.wikimedia.org/wiki/File:En-us-you_know_what.ogg), Commons lists CC0 1.0. Original file: `https://upload.wikimedia.org/wikipedia/commons/e/e9/En-us-you_know_what.ogg`.
- Each source was converted locally with `ffmpeg -i SOURCE -ac 1 -ar 16000 -c:a pcm_s16le OUTPUT.wav`, then concatenated as above without changing its level.
- WAV SHA-256: `be8707fa8b2d613cba607355a09d7e6d34479220fb693da3d18f0de0c109d966` (743,572 bytes; 23.23525 s).

`stream.mp4` is a generated 4 s video (solid background, 317 Hz sine audio, looping in the Twitch-like test tab). Recreate with `ffmpeg -f lavfi -i color=c=0x12171b:s=960x540:r=25 -f lavfi -i sine=frequency=317:sample_rate=48000 -t 4 -c:v libx264 -pix_fmt yuv420p -c:a aac stream.mp4`. No third-party content or license is needed for the generated fixture.

These are smoke/regression inputs, not a representative accuracy dataset. A fake microphone does not simulate a real room, Windows drivers, or hardware echo cancellation.

## v0.8.0 exact-phrase proof

`laugh-lets-go.wav` contains recorded human “let’s go” repeated three times with 1 s silence, followed by the same public-domain laughter above and silence. Mono PCM16, 16 kHz, 26.960375 s. SHA-256: `07db93dd56f67020abfa7eb2850eb16c1ee364d2bff581402f4d1c414666cd71`.

Speech: Daniel Alvarez / dastudiospr, [Let’s Go (male), Freesound 529817](https://freesound.org/people/dastudiospr/sounds/529817/), [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/). Public preview source: `https://cdn.freesound.org/previews/529/529817_10761583-hq.mp3`, converted with `ffmpeg -i SOURCE -ac 1 -ar 16000 -c:a pcm_s16le lets-go.wav`. The spoken recording is unchanged apart from resampling; it is not synthesized speech.

The loud integration case adds a generated 317 Hz spill signal to the microphone fixture while the tab plays its own video/audio. This checks that independent human reactions survive additive speaker-like spill. It does not replace physical Windows/room/AEC checks. All fixtures are test-only and excluded from packages.
