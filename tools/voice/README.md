# Voice barks

Short spoken lines during fights: Marc and Yola talk a little (and to each other), and the Shield Guard mutters
fragments of his old job. Regular zombies never speak; they have their groans.

**Every line is a placeholder.** Marc decides the dialogue. Change the words in `lines.json` and run the generator.

## Files

| File | What |
|---|---|
| `tools/voice/lines.json` | the script: speaker -> trigger -> lines (plus the voices, speed, and the audition lines) |
| `tools/voice/generate.py` | records every line with Kokoro-82M, trims, levels and encodes it |
| `public/assets/voice/<speaker>/<trigger>_<n>.mp3` | the game's lines (mono MP3, 40 kbps, 24 kHz, all at -18 LUFS) |
| `public/assets/voice/audition/` | 4 sample lines in every candidate voice (the lab plays them; the game never loads them) |
| `public/assets/voice/manifest.json` | what was generated (voices, text, durations, loudness); written by the generator |
| `src/audio/voice.js` | the bark director: which event says what, how often (`RULES`), one line at a time |
| `labs/voice.html` | the audition page |

## Listen and choose

```
npx vite --port 5188
```
then open http://localhost:5188/labs/voice.html, tap "Tap to enable sound".

- **Pick the voices**: the same four lines in each candidate voice. "Use" writes the regenerate command for you.
- **Every line**: every speaker, trigger and line, each on a button.
- **Try the rules**: a busy made-up fight, a real fight played by the engine, or the boss, with a log of what was said
  and what was held back. Switch Voices off, 1.5x / 2x speed, the voice volume and the music to hear the ducking.

## Regenerate

Once: Python 3.10+, `pip install kokoro-onnx soundfile` (a virtualenv is fine), and ffmpeg (`brew install ffmpeg`).
The model files (about 330 MB) download themselves on the first run into `~/.cache/kokoro-onnx` (or `--models DIR`,
or `$KOKORO_MODELS`). Never put them in the repo.

```
python tools/voice/generate.py --marc am_michael --yola af_heart       # everything (the current default)
python tools/voice/generate.py --marc am_fenrir --yola af_bella        # everything with other voices
python tools/voice/generate.py --marc am_michael:70,am_fenrir:30       # a blend of two voices
python tools/voice/generate.py --only yola --yola af_bella             # just Yola; Marc and the guard are kept
python tools/voice/generate.py --audition-only                         # just the audition samples
python tools/voice/generate.py --list-voices                           # every voice, with Kokoro's grade
```

Other options: `--speed 1.1` (Marc and Yola; default 1.05), `--guard am_adam` (the boss, before his zombie effect; am_adam stayed the clearest once processed),
`--lufs -18`, `--bitrate 40k`, `--no-audition`. A full run is about 160 files, ~15 minutes on a laptop CPU.

To make the choice stick for later runs, also change `"voice"` for that speaker in `lines.json`.

## How a line is made

Kokoro (24 kHz) -> silence trimmed (a 20 ms lead-in, 90 ms tail) -> the guard only: pitched down ~3 semitones and
slowed (asetrate), a radio band (160-3400 Hz), soft-clipped grit, a slow wobble and a hallway echo -> loudness measured
with ffmpeg `loudnorm` and set to -18 LUFS (then a -1 dBTP limiter, re-measured until within 0.4 LU) -> mono MP3.

## The voices

Kokoro's own grades (hexgrad/Kokoro-82M `VOICES.md`): women af_heart A, af_bella A-, af_nicole B- (whispery),
af_sarah C+; men am_fenrir C+, am_michael C+, am_puck C+, am_eric D. The game uses **am_michael** for Marc (warm,
natural mid range; am_fenrir is deeper and harder) and **af_heart** for Yola (the best-graded voice), picked by grade
and description, not by ear: listen in the lab and choose.

## When the game speaks

`src/audio/voice.js` `RULES`, per trigger: priority, chance, gap since the last line, its own cooldown, delay after
the event. One line at a time; at least 2 s between fresh lines and 3.5-9 s for chatter (kills and finishers sooner,
the boss, victory and defeat always); no variant repeats until the others have played; when either hero could answer,
the one who didn't speak last does; at 2x speed the chatter is skipped. Settings: "Voices" On / Off; the volume
follows the master volume (the voice bus has its own level, `audio.setVolume({ voice })`).

## Licences

Kokoro-82M: Apache-2.0 (hexgrad). kokoro-onnx: MIT (thewh1teagle). The generated audio is ours to ship. See CREDITS.md.
