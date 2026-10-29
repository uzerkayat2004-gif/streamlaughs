# Production microphone regression fixtures

`laugh-speech.wav` contains **recorded human audio**, mono PCM16 at 16 kHz: the 0.584 s spoken phrase “you know what” repeated three times with 1 s gaps; 16.48325 s laughter; 2 s silence. Speech starts immediately so Welcome's short level check is deterministic. It is test data, never captured user audio and never included in an extension or website download.

- Laughter: ezwa, [Laughter.ogg](https://commons.wikimedia.org/wiki/File:Laughter.ogg), released worldwide into the public domain. Original file: `https://upload.wikimedia.org/wikipedia/commons/c/c6/Laughter.ogg`.
- Speech: Steve Shives, [En-us-you know what.ogg](https://commons.wikimedia.org/wiki/File:En-us-you_know_what.ogg), Commons lists CC0 1.0. Original file: `https://upload.wikimedia.org/wikipedia/commons/e/e9/En-us-you_know_what.ogg`.
- Each source was converted locally with `ffmpeg -i SOURCE -ac 1 -ar 16000 -c:a pcm_s16le OUTPUT.wav`, then concatenated as above without changing its level.
- WAV SHA-256: `be8707fa8b2d613cba607355a09d7e6d34479220fb693da3d18f0de0c109d966` (743,572 bytes; 23.23525 s).

`stream.mp4` is a generated 4 s video (solid background, 317 Hz sine audio, looping in the Twitch-like test tab). Recreate with `ffmpeg -f lavfi -i color=c=0x12171b:s=960x540:r=25 -f lavfi -i sine=frequency=317:sample_rate=48000 -t 4 -c:v libx264 -pix_fmt yuv420p -c:a aac stream.mp4`. No third-party content or license is needed for the generated fixture.

These are smoke/regression inputs, not a representative accuracy dataset. A fake microphone does not simulate a real room, Windows drivers, or hardware echo cancellation.
