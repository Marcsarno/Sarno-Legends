#!/usr/bin/env python3
"""Record the bark lines (tools/voice/lines.json) with Kokoro-82M and write them as small MP3s for the game.

    python tools/voice/generate.py                                  # everything, with the voices named in lines.json
    python tools/voice/generate.py --marc am_fenrir --yola af_bella # everything again with other voices
    python tools/voice/generate.py --marc am_michael:70,am_fenrir:30  # a blend of two voices (weights)
    python tools/voice/generate.py --only marc                      # one speaker (marc | yola | guard), the rest kept
    python tools/voice/generate.py --audition-only                  # just the 4-line samples per candidate voice
    python tools/voice/generate.py --list-voices

Needs: pip install kokoro-onnx soundfile (Python 3.10+), and ffmpeg on the PATH (or --ffmpeg). The model files
(~330 MB, Kokoro-82M v1.0 ONNX) are downloaded once from the kokoro-onnx GitHub release into --models
(default: $KOKORO_MODELS or ~/.cache/kokoro-onnx). Never put them in the repo.

Each line: Kokoro (24 kHz) -> silence trimmed -> (the guard: pitched down, slowed, radio band, a little grit,
wobble and echo) -> loudness measured with ffmpeg loudnorm and set to --lufs (default -18 LUFS) with a -1 dBTP
limiter -> mono MP3 (--bitrate, default 40k). Writes public/assets/voice/<speaker>/<trigger>_<n>.mp3,
public/assets/voice/audition/<hero>_<voice>_<n>.mp3 and public/assets/voice/manifest.json (what src/audio/voice.js
and labs/voice.html read). Don't hand-edit the MP3s or the manifest: change lines.json and run this again.
"""
import argparse
import datetime
import json
import os
import re
import shutil
import subprocess
import sys
import tempfile
import time
import urllib.request

ROOT = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..'))
LINES = os.path.join(ROOT, 'tools', 'voice', 'lines.json')
OUT = os.path.join(ROOT, 'public', 'assets', 'voice')
RELEASE = 'https://github.com/thewh1teagle/kokoro-onnx/releases/download/model-files-v1.0/'
MODEL_FILES = ['kokoro-v1.0.onnx', 'voices-v1.0.bin']
SR = 24000

# Kokoro's own grades for the American English voices (hexgrad/Kokoro-82M VOICES.md), shown in the lab
GRADES = {
    'af_heart': 'A', 'af_bella': 'A-', 'af_nicole': 'B-', 'af_aoede': 'C+', 'af_kore': 'C+', 'af_sarah': 'C+',
    'af_alloy': 'C', 'af_nova': 'C', 'af_sky': 'C-', 'af_jessica': 'D', 'af_river': 'D',
    'am_fenrir': 'C+', 'am_michael': 'C+', 'am_puck': 'C+', 'am_echo': 'D', 'am_eric': 'D', 'am_liam': 'D',
    'am_onyx': 'D', 'am_adam': 'F+', 'am_santa': 'D-',
}

# the Shield Guard: down ~3 semitones and slower (the formants drop too), a radio band, soft-clipped grit, a slow
# sickly wobble and a hallway echo. Input and output 24 kHz mono.
ZOMBIE_FX = ','.join([
    'asetrate=%d' % int(SR * 0.85), 'aresample=%d' % SR,
    'highpass=f=160', 'lowpass=f=3400',
    'volume=6dB', 'asoftclip=type=tanh', 'volume=-4dB',
    'acrusher=bits=11:mix=0.14:mode=log',
    'vibrato=f=4.2:d=0.1',
    'apad=pad_dur=0.6',
    'aecho=0.85:0.55:55|110|190:0.3|0.18|0.09',
])
HERO_FX = 'highpass=f=70'


def log(*a):
    print(*a, flush=True)


def parse_voice(spec, kokoro):
    """'am_michael' or a blend 'am_michael:70,am_fenrir:30' -> (style array or name, label)."""
    parts = [p.strip() for p in spec.split(',') if p.strip()]
    if len(parts) == 1 and ':' not in parts[0]:
        name = parts[0]
        if name not in kokoro.voices:
            sys.exit(f'Unknown voice {name!r}. Try --list-voices.')
        return name, name
    total, style = 0.0, None
    for p in parts:
        name, _, w = p.partition(':')
        w = float(w or 1)
        if name not in kokoro.voices:
            sys.exit(f'Unknown voice {name!r} in blend {spec!r}. Try --list-voices.')
        s = kokoro.get_voice_style(name) * w
        style = s if style is None else style + s
        total += w
    return style / total, spec.replace(':', '').replace(',', '+')


def ensure_models(models):
    os.makedirs(models, exist_ok=True)
    for f in MODEL_FILES:
        path = os.path.join(models, f)
        if os.path.exists(path) and os.path.getsize(path) > 1_000_000:
            continue
        log(f'Downloading {f} (once) into {models} ...')
        tmp = path + '.part'
        with urllib.request.urlopen(RELEASE + f) as r, open(tmp, 'wb') as out:
            shutil.copyfileobj(r, out, 1 << 20)
        os.replace(tmp, path)
    return [os.path.join(models, f) for f in MODEL_FILES]


def trim(audio, head=0.02, tail=0.09):
    """Cut the silence before and after the speech (relative to the peak), keep a short breath of room."""
    import numpy as np
    a = np.asarray(audio, dtype=np.float32)
    if not len(a):
        return a
    peak = float(np.max(np.abs(a))) or 1.0
    win = int(SR * 0.01)
    env = np.convolve(np.abs(a), np.ones(win) / win, mode='same')
    on = np.where(env > peak * 0.02)[0]
    if not len(on):
        return a
    s = max(0, on[0] - int(SR * head))
    e = min(len(a), on[-1] + int(SR * tail))
    a = a[s:e].copy()
    fi, fo = int(SR * 0.004), int(SR * 0.03)
    if len(a) > fi + fo:
        a[:fi] *= np.linspace(0, 1, fi, dtype=np.float32)
        a[-fo:] *= np.linspace(1, 0, fo, dtype=np.float32)
    return a


def ffmpeg(ff, args, capture=False):
    r = subprocess.run([ff, '-hide_banner', '-nostdin', '-y', *args], capture_output=True, text=True)
    if r.returncode != 0:
        raise RuntimeError('ffmpeg failed: ' + ' '.join(args) + '\n' + r.stderr[-1500:])
    return r.stderr if capture else None


def loudness(ff, path, pre=''):
    """Integrated loudness (LUFS) and true peak of a file, via ffmpeg loudnorm's measuring pass. Short clips are padded
    with silence to 3 s first (gating ignores the silence) so even a one-word bark gets a real reading."""
    chain = (pre + ',' if pre else '') + 'apad=whole_dur=3,loudnorm=I=-18:TP=-1:LRA=11:print_format=json'
    err = ffmpeg(ff, ['-i', path, '-af', chain, '-f', 'null', '-'], capture=True)
    m = re.findall(r'\{[^{}]*"input_i"[^{}]*\}', err, re.S)
    if not m:
        return None, None
    j = json.loads(m[-1])
    try:
        i, tp = float(j['input_i']), float(j['input_tp'])
    except ValueError:
        return None, None
    return (i if i > -70 else None), tp


def render(ff, wav, mp3, fx, lufs, bitrate):
    """fx -> loudness to `lufs` (measured gain, then a -1 dBTP limiter) -> mono MP3. Returns the final LUFS."""
    pre = fx or ''
    i, _ = loudness(ff, wav, pre)
    gain = (lufs - i) if i is not None else 0.0
    for _ in range(3):
        gain = max(-20.0, min(24.0, gain))
        chain = ','.join([c for c in [pre, f'volume={gain:.2f}dB', 'alimiter=limit=0.89:attack=2:release=40:level=disabled'] if c])
        ffmpeg(ff, ['-i', wav, '-af', chain, '-ac', '1', '-ar', str(SR), '-c:a', 'libmp3lame', '-b:a', bitrate, mp3])
        out_i, out_tp = loudness(ff, mp3)
        # the limiter (or the effect's grit) can pull a peaky line under the target: nudge the gain and do it again
        if out_i is None or abs(out_i - lufs) <= 0.4:
            break
        gain += lufs - out_i
    return out_i, out_tp


def duration(ff, path):
    err = ffmpeg(ff, ['-i', path, '-f', 'null', '-'], capture=True)
    m = re.findall(r'time=(\d+):(\d+):([\d.]+)', err)
    if not m:
        return None
    h, mi, s = m[-1]
    return round(int(h) * 3600 + int(mi) * 60 + float(s), 3)


def as_line(x):
    return {'text': x, 'say': x} if isinstance(x, str) else {'text': x['text'], 'say': x.get('say') or x['text']}


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('--marc', help="Marc's voice (default: lines.json). A blend: am_michael:70,am_fenrir:30")
    ap.add_argument('--yola', help="Yola's voice (default: lines.json)")
    ap.add_argument('--guard', '--boss', dest='guard', help="the Shield Guard's voice before the zombie effect (default am_adam: the clearest once processed)")
    ap.add_argument('--speed', type=float, help='speaking speed for Marc and Yola (0.5-2, default lines.json, ~1.05)')
    ap.add_argument('--only', help='comma list of speakers to regenerate (marc,yola,guard); the others are kept')
    ap.add_argument('--audition-only', action='store_true', help='only the candidate-voice samples')
    ap.add_argument('--no-audition', action='store_true', help='skip the candidate-voice samples')
    ap.add_argument('--lufs', type=float, default=-18.0, help='loudness of every line (default -18 LUFS)')
    ap.add_argument('--bitrate', default='40k', help='MP3 bitrate, mono 24 kHz (default 40k)')
    ap.add_argument('--models', default=os.environ.get('KOKORO_MODELS') or os.path.join(os.path.expanduser('~'), '.cache', 'kokoro-onnx'))
    ap.add_argument('--ffmpeg', default=shutil.which('ffmpeg') or '/usr/bin/ffmpeg')
    ap.add_argument('--lines', default=LINES)
    ap.add_argument('--out', default=OUT)
    ap.add_argument('--list-voices', action='store_true')
    args = ap.parse_args()

    try:
        import numpy  # noqa: F401
        import soundfile as sf
        from kokoro_onnx import Kokoro
    except ImportError as e:
        sys.exit(f'{e}. Install with: pip install kokoro-onnx soundfile')
    if not args.list_voices and not os.path.exists(args.ffmpeg or ''):
        sys.exit('ffmpeg not found: install it or pass --ffmpeg /path/to/ffmpeg')

    model, voices = ensure_models(args.models)
    kokoro = Kokoro(model, voices)
    if args.list_voices:
        for v in sorted(kokoro.voices):
            if v[:2] in ('af', 'am', 'bf', 'bm'):
                log(f'{v:12s} {GRADES.get(v, "")}')
        return

    with open(args.lines, encoding='utf-8') as f:
        script = json.load(f)
    speakers = script['speakers']
    picks = {'marc': args.marc, 'yola': args.yola, 'guard': args.guard}
    only = set((args.only or ','.join(speakers)).split(','))
    os.makedirs(args.out, exist_ok=True)
    man_path = os.path.join(args.out, 'manifest.json')
    try:
        with open(man_path, encoding='utf-8') as f:
            manifest = json.load(f)
    except (OSError, ValueError):
        manifest = {}
    manifest.setdefault('speakers', {})
    manifest.setdefault('audition', {})

    tmp = tempfile.mkdtemp(prefix='sl-voice-')
    t0 = time.time()
    count = 0

    def say(text, style, speed, fx, mp3):
        nonlocal count
        audio, sr = kokoro.create(text, voice=style, speed=speed, lang='en-us')
        assert sr == SR, sr
        wav = os.path.join(tmp, 'line.wav')
        sf.write(wav, trim(audio), SR, subtype='PCM_16')
        lufs, tp = render(args.ffmpeg, wav, mp3, fx, args.lufs, args.bitrate)
        count += 1
        return {'dur': duration(args.ffmpeg, mp3), 'lufs': None if lufs is None else round(lufs, 1),
                'tp': None if tp is None else round(tp, 1), 'bytes': os.path.getsize(mp3)}

    try:
        if not args.audition_only:
            for who, sp in speakers.items():
                if who not in only:
                    continue
                spec = picks.get(who) or sp['voice']
                style, label = parse_voice(spec, kokoro)
                speed = args.speed if (args.speed and who != 'guard') else sp.get('speed', 1.0)
                fx = ZOMBIE_FX if sp.get('fx') == 'zombie' else HERO_FX
                d = os.path.join(args.out, who)
                if os.path.isdir(d):
                    for old in os.listdir(d):
                        if old.endswith('.mp3'):
                            os.remove(os.path.join(d, old))
                os.makedirs(d, exist_ok=True)
                entry = {'name': sp.get('name', who), 'voice': label, 'speed': speed, 'triggers': {}}
                for trig, tdef in sp['triggers'].items():
                    rows = []
                    for n, raw in enumerate(tdef['lines'], 1):
                        line = as_line(raw)
                        rel = f'voice/{who}/{trig}_{n}.mp3'
                        info = say(line['say'], style, speed, fx, os.path.join(args.out, who, f'{trig}_{n}.mp3'))
                        rows.append({'file': rel, 'text': line['text'], **info})
                        log(f'  {who:5s} {trig:12s} {info["dur"]:5.2f}s {str(info["lufs"]):>6s} LUFS  {line["text"]}')
                    entry['triggers'][trig] = rows
                manifest['speakers'][who] = entry
                log(f'{who}: {label}, {sum(len(v) for v in entry["triggers"].values())} lines')

        aud = script.get('audition') or {}
        if not args.no_audition and aud:
            d = os.path.join(args.out, 'audition')
            if os.path.isdir(d):
                for old in os.listdir(d):
                    if old.endswith('.mp3'):
                        os.remove(os.path.join(d, old))
            os.makedirs(d, exist_ok=True)
            manifest['audition'] = {}
            for who in ('marc', 'yola'):
                a = aud.get(who)
                if not a:
                    continue
                sp = speakers[who]
                speed = args.speed or sp.get('speed', 1.0)
                cands = list(dict.fromkeys(a['candidates'] + ([picks[who]] if picks.get(who) and ':' not in picks[who] and ',' not in picks[who] else [])))
                out = {'lines': a['lines'], 'voices': []}
                for v in cands:
                    style, label = parse_voice(v, kokoro)
                    files = []
                    for n, text in enumerate(a['lines'], 1):
                        rel = f'voice/audition/{who}_{label}_{n}.mp3'
                        info = say(text, style, speed, HERO_FX, os.path.join(args.out, 'audition', f'{who}_{label}_{n}.mp3'))
                        files.append({'file': rel, 'text': text, **info})
                    out['voices'].append({'voice': label, 'grade': GRADES.get(label, ''), 'files': files})
                    log(f'audition {who}: {label}')
                manifest['audition'][who] = out
    finally:
        shutil.rmtree(tmp, ignore_errors=True)

    def total(rows):
        return sum(r['bytes'] for r in rows)
    line_rows = [r for s in manifest['speakers'].values() for t in s['triggers'].values() for r in t]
    aud_rows = [f for a in manifest['audition'].values() for v in a['voices'] for f in v['files']]
    louds = [r['lufs'] for r in line_rows if r.get('lufs') is not None]
    manifest.update({
        '_note': 'Generated by tools/voice/generate.py from tools/voice/lines.json. Do not edit by hand.',
        'version': 1,
        'generated': datetime.date.today().isoformat(),
        'engine': 'Kokoro-82M v1.0 (Apache-2.0, hexgrad) via kokoro-onnx (MIT, thewh1teagle)',
        'target_lufs': args.lufs, 'bitrate': args.bitrate,
        'voices': {k: v['voice'] for k, v in manifest['speakers'].items()},
        'grades': {k: GRADES.get(v['voice'], '') for k, v in manifest['speakers'].items()},
        'totals': {'lines': len(line_rows), 'bytes': total(line_rows), 'audition_bytes': total(aud_rows),
                   'lufs_min': min(louds) if louds else None, 'lufs_max': max(louds) if louds else None},
    })
    order = ['_note', 'version', 'generated', 'engine', 'voices', 'grades', 'target_lufs', 'bitrate', 'totals', 'speakers', 'audition']
    manifest = {k: manifest[k] for k in order if k in manifest}
    with open(man_path, 'w', encoding='utf-8') as f:
        json.dump(manifest, f, indent=1, ensure_ascii=False)
        f.write('\n')
    tt = manifest['totals']
    log(f'\n{count} files in {time.time() - t0:.0f} s. Game lines: {tt["lines"]}, {tt["bytes"] / 1024:.0f} KB '
        f'(loudness {tt["lufs_min"]}..{tt["lufs_max"]} LUFS); audition samples {tt["audition_bytes"] / 1024:.0f} KB.')
    log(f'Voices: {manifest["voices"]}')


if __name__ == '__main__':
    main()
