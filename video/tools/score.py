"""Build the film's score from video/score/cues.json.

    python video/tools/score.py            # writes video/audio/score.wav and checks it against the grid
    python video/tools/score.py --check    # only re-checks an existing score.wav

Each generated take (video/audio/takes/<id>.wav) is measured, time-stretched to exactly the film's tempo and
cut into whole bars, which are placed on film bars. Sound effects are synthesized on exact beats. The film is
the clock: nothing here trusts a take to have the right tempo or structure on its own.
Needs numpy, scipy, soundfile and ffmpeg (with the rubberband filter) on PATH.
"""
import json, os, subprocess, sys, tempfile
import numpy as np
import soundfile as sf
from scipy import signal

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..")
SR = 48000
spec = json.load(open(os.path.join(ROOT, "score", "cues.json"), encoding="utf-8"))
grid = json.load(open(os.path.join(ROOT, "beats.json"), encoding="utf-8"))
timeline = json.load(open(os.path.join(ROOT, "timeline.json"), encoding="utf-8"))
BPM = grid["bpm"]
assert BPM == spec["bpm"], "cues.json and beats.json disagree on the tempo"
BEAT = 60.0 / BPM
BAR = 4 * BEAT
TOTAL = timeline["total"]
N = int(round(TOTAL * SR))
rng = np.random.default_rng(7)


def t_of(bar, beat=1.0):
    return ((bar - 1) * 4 + (beat - 1)) * BEAT


def s_of(t):
    return int(round(t * SR))


# ---------------------------------------------------------------- measuring
def onset_flux(mono):
    hop, win = 512, 2048
    n = (len(mono) - win) // hop
    fr = np.lib.stride_tricks.as_strided(mono, (n, win), (mono.strides[0] * hop, mono.strides[0]))
    mag = np.log1p(100 * np.abs(np.fft.rfft(fr * np.hanning(win), axis=1)))
    flux = np.maximum(np.diff(mag, axis=0), 0).sum(1)
    # flux[i] rises when an onset reaches the centre of frame i+1: that is time i*hop + hop + win/2
    return (flux - flux.mean()) / (flux.std() + 1e-9), SR / hop, (hop + win / 2) / SR


def measure(x, lo_bpm=118, hi_bpm=138):
    """Beat length and phase of a stereo signal, searched only near the film tempo (no half/double time)."""
    mono = np.ascontiguousarray(x.mean(1) if x.ndim > 1 else x).astype(np.float64)
    mono /= np.abs(mono).max() + 1e-9
    flux, fps, lag = onset_flux(mono)
    dur = len(mono) / SR

    def fit(beat):
        best = (-1e9, 0.0)
        for o in np.arange(0, beat, 0.002):
            i = np.round((np.arange(o, dur, beat) - lag) * fps).astype(int)
            i = i[(i >= 0) & (i < len(flux))]
            best = max(best, (flux[i].mean(), o))
        return best

    cands = np.arange(60 / hi_bpm, 60 / lo_bpm, 0.001)
    beat = max(cands, key=lambda b: fit(b)[0])
    for step in (0.0002, 0.00002):
        beat = max(np.arange(beat - 10 * step, beat + 10 * step, step), key=lambda b: fit(b)[0])
    score, phase = fit(beat)
    return beat, phase, score


def downbeat_offset(x, beat, phase):
    """Which of the 4 beats is beat 1: where the bass and harmony change. Each beat is compared with the bar
    before it against the bar after it, so a snare on 2 and 4 (in both windows) cannot win."""
    mono = x.mean(1)
    times = np.arange(phase, len(mono) / SR - beat, beat)
    nfft = 8192
    lo, hi = int(30 * nfft / SR), int(600 * nfft / SR)
    def spec_at(t):
        seg = mono[s_of(t):s_of(t + beat)]
        return np.log1p(np.abs(np.fft.rfft(seg, nfft))[lo:hi]) if len(seg) > 64 else np.zeros(hi - lo)
    sp = np.array([spec_at(t) for t in times])
    nov = np.zeros(len(sp))
    for j in range(4, len(sp) - 4):
        nov[j] = np.linalg.norm(sp[j:j + 4].mean(0) - sp[j - 4:j].mean(0))
    s = np.array([nov[k::4].sum() for k in range(4)])
    best = int(np.argmax(s))
    # A generated take almost always opens on beat 1. Only move off the first beat on clear evidence.
    if s[best] < 1.15 * s[0]:
        best = 0
    return best, s / s.max()


def ffmpeg_stretch(x, tempo):
    """Change speed by `tempo` (>1 faster) without changing pitch."""
    if abs(tempo - 1) < 1e-4:
        return x
    with tempfile.TemporaryDirectory() as d:
        a, b = os.path.join(d, "a.wav"), os.path.join(d, "b.wav")
        sf.write(a, x, SR, subtype="FLOAT")
        subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", a, "-af",
                        f"rubberband=tempo={tempo:.6f}:transients=crisp:detector=percussive:phase=independent",
                        "-c:a", "pcm_f32le", b], check=True)
        y, _ = sf.read(b, dtype="float32", always_2d=True)
    return y


def load(path):
    x, sr = sf.read(path, dtype="float32", always_2d=True)
    if x.shape[1] == 1:
        x = np.repeat(x, 2, 1)
    x = x[:, :2]
    if sr != SR:
        g = np.gcd(sr, SR)
        x = signal.resample_poly(x, SR // g, sr // g, axis=0).astype(np.float32)
    return x


TAKES = {}


def take(name):
    """A take conformed to the grid: (audio, time of its first full downbeat, number of full bars)."""
    if name in TAKES:
        return TAKES[name]
    path = os.path.join(ROOT, "audio", "takes", name + ".wav")
    if not os.path.exists(path):
        sys.exit(f"missing take: {path} (generate it first; see video/score/cues.json)")
    x = load(path)
    beat, _, _ = measure(x)
    y = ffmpeg_stretch(x, beat / BEAT)          # measured beat longer than the grid's -> speed up
    beat2, phase2, fitq = measure(y)
    k, ev = downbeat_offset(y, BEAT, phase2)
    if "downbeat" in spec["takes"][name]:     # set by ear when the detector is wrong (seconds into the take)
        d0 = spec["takes"][name]["downbeat"]
    else:
        d0 = phase2 + k * BEAT
    bars = int((len(y) / SR - d0) // BAR)
    print(f"  take {name:6s}: {60 / beat:6.2f} BPM -> {60 / beat2:6.2f} after stretch, first downbeat {d0:5.2f} s (beat evidence {' '.join(f'{v:.2f}' for v in ev)}), {bars} bars, fit {fitq:.2f}")
    TAKES[name] = (y, d0, bars)
    return TAKES[name]


def bars_from(name, nbars, where):
    y, d0, have = take(name)
    usable = list(range(1, max(2, have - 1)))  # skip the take's first and last bar (its own intro / ending)
    if isinstance(where, int):  # a bar number of the take (1-based, counted from its first downbeat)
        first = min(max(usable[0], where - 1), max(usable[0], usable[-1] - nbars + 1))
    elif where == "start":
        first = usable[0]
    elif where == "end":
        first = max(usable[0], usable[-1] - nbars + 1)
    else:
        first = max(usable[0], usable[0] + (len(usable) - nbars) // 2)
    idx = [usable[0] + (first - usable[0] + i) % len(usable) for i in range(nbars)]  # loops if the take is short
    out = np.zeros((s_of(nbars * BAR), 2), np.float32)
    L = s_of(BAR)
    for i, b in enumerate(idx):
        seg = y[s_of(d0 + b * BAR): s_of(d0 + b * BAR) + L]
        out[i * L: i * L + len(seg)] += seg
    return out


# ---------------------------------------------------------------- processing
def fade_edges(x, ms=4):
    n = min(len(x) // 2, int(SR * ms / 1000))
    if n:
        r = np.linspace(0, 1, n, dtype=np.float32)[:, None]
        x[:n] *= r
        x[-n:] *= r[::-1]
    return x


def lowpass(x, hz, order=4):
    return signal.sosfilt(signal.butter(order, hz, "low", fs=SR, output="sos"), x, axis=0).astype(np.float32)


def highpass(x, hz, order=4):
    return signal.sosfilt(signal.butter(order, hz, "high", fs=SR, output="sos"), x, axis=0).astype(np.float32)


def bandpass(x, lo, hi, order=2):
    return signal.sosfilt(signal.butter(order, [lo, hi], "band", fs=SR, output="sos"), x, axis=0).astype(np.float32)


def sweep_lowpass(x, f0, f1, block=512):
    """Low-pass whose cutoff glides from f0 to f1 (Hz) across x."""
    out = np.zeros_like(x)
    zi = None
    nb = (len(x) + block - 1) // block
    for i in range(nb):
        f = f0 * (f1 / f0) ** (i / max(1, nb - 1))
        sos = signal.butter(2, min(f, SR / 2 - 100), "low", fs=SR, output="sos")
        if zi is None:
            zi = np.zeros((sos.shape[0], 2, 2))
        seg = x[i * block:(i + 1) * block]
        y, zi = signal.sosfilt(sos, seg, axis=0, zi=zi)
        out[i * block:(i + 1) * block] = y
    return out


def sweep_highpass(x, f0, f1, block=512):
    out = np.zeros_like(x)
    zi = None
    nb = (len(x) + block - 1) // block
    for i in range(nb):
        f = f0 * (f1 / f0) ** (i / max(1, nb - 1))
        sos = signal.butter(2, f, "high", fs=SR, output="sos")
        if zi is None:
            zi = np.zeros((sos.shape[0], 2, 2))
        seg = x[i * block:(i + 1) * block]
        y, zi = signal.sosfilt(sos, seg, axis=0, zi=zi)
        out[i * block:(i + 1) * block] = y
    return out


_IR = {}


def reverb(x, seconds=2.2, wet=0.35):
    if seconds not in _IR:
        n = s_of(seconds)
        t = np.arange(n) / SR
        env = np.exp(-6.9 * t / seconds)[:, None]
        ir = rng.standard_normal((n, 2)).astype(np.float32) * env
        ir = lowpass(ir, 7000, 2)
        ir /= np.sqrt((ir ** 2).sum(0)) + 1e-9
        _IR[seconds] = ir
    ir = _IR[seconds]
    tail = np.stack([signal.fftconvolve(x[:, c], ir[:, c]) for c in range(2)], 1).astype(np.float32)
    out = np.zeros((len(tail), 2), np.float32)
    out[:len(x)] += x * (1 - wet)
    out += tail * wet
    return out


def stutter(x, every):
    """Beat repeat: every beat is replaced by its first `every` beats, repeated to fill the beat."""
    L, B = s_of(every * BEAT), s_of(BEAT)
    out = x.copy()
    for b0 in range(0, len(x), B):
        piece = fade_edges(x[b0:b0 + L].copy(), 2)
        for k in range(b0, min(b0 + B, len(x)), L):
            n = min(L, len(x) - k, b0 + B - k)
            out[k:k + n] = piece[:n]
    return out


def db(g):
    return 10 ** (g / 20)


# ---------------------------------------------------------------- sound effects
def env_exp(n, decay_s):
    return np.exp(-np.arange(n) / SR / decay_s).astype(np.float32)


def stereo(m):
    return np.stack([m, m], 1).astype(np.float32)


def fx_blip():
    n = s_of(0.07)
    t = np.arange(n) / SR
    f = 1400 + 1400 * t / t[-1]
    m = np.sin(2 * np.pi * np.cumsum(f) / SR) * env_exp(n, 0.02) * 0.25
    return reverb(stereo(m), 1.2, 0.3)


def fx_tick():
    n = s_of(0.02)
    m = rng.standard_normal(n).astype(np.float32) * env_exp(n, 0.004)
    return highpass(stereo(m), 5000) * 0.5


def fx_pulse():
    n = s_of(0.35)
    t = np.arange(n) / SR
    m = np.sin(2 * np.pi * (55 + 40 * np.exp(-t / 0.02)) * t) * env_exp(n, 0.12)
    return stereo(m) * 0.5


def fx_hit():
    n = s_of(0.6)
    t = np.arange(n) / SR
    f = 45 + 110 * np.exp(-t / 0.03)
    body = np.sin(2 * np.pi * np.cumsum(f) / SR) * env_exp(n, 0.18)
    snap = highpass(stereo(rng.standard_normal(n).astype(np.float32) * env_exp(n, 0.03)), 1500)[:, 0]
    return reverb(stereo(body * 0.8 + snap * 0.35), 1.8, 0.3)


def fx_impact():
    n = s_of(2.5)
    t = np.arange(n) / SR
    f = 30 + 90 * np.exp(-t / 0.08)
    sub = np.sin(2 * np.pi * np.cumsum(f) / SR) * env_exp(n, 0.7)
    crash = lowpass(stereo(rng.standard_normal(n).astype(np.float32) * env_exp(n, 0.5)), 9000)
    x = stereo(sub) * 0.9 + crash * 0.3
    return reverb(x, 3.0, 0.4)


def fx_swell(bars):
    """Reverse reverb swell that ends exactly at its anchor."""
    n = s_of(bars * BAR)
    t = np.arange(n) / SR
    noise = rng.standard_normal((n, 2)).astype(np.float32)
    x = sweep_lowpass(noise, 400, 12000) * ((t / t[-1]) ** 3)[:, None] * 0.35
    return x


def fx_whoosh():
    return fx_swell(0.25) * 0.8


def fx_riser(bars):
    n = s_of(bars * BAR)
    t = np.arange(n) / SR
    p = t / t[-1]
    f = 200 * (8 ** p)
    tone = np.sin(2 * np.pi * np.cumsum(f) / SR) * 0.15
    noise = sweep_highpass(rng.standard_normal((n, 2)).astype(np.float32), 300, 6000) * 0.25
    return (noise + stereo(tone)) * (p ** 2)[:, None]


def fx_ring():
    n = s_of(BAR)
    t = np.arange(n) / SR
    m = (np.sin(2 * np.pi * 880 * t) + 0.5 * np.sin(2 * np.pi * 1320 * t * (1 + 0.01 * t))) * (0.5 + 0.5 * np.sin(2 * np.pi * 8 * t))
    m *= np.minimum(1, t / 0.3) * env_exp(n, 1.2) * 0.08
    return reverb(stereo(m), 2.0, 0.5)


def fx_chord(bars):
    """A minor supersaw chord that decays to silence over `bars`."""
    n = s_of(bars * BAR)
    t = np.arange(n) / SR
    notes = [55.0, 110.0, 130.81, 164.81, 220.0, 261.63]
    x = np.zeros((n, 2), np.float32)
    for i, f in enumerate(notes):
        for v, det in enumerate(np.linspace(-0.012, 0.012, 7)):
            ph = rng.random()
            saw = 2 * ((f * (1 + det) * t + ph) % 1) - 1
            pan = (v / 6) if i % 2 else 1 - v / 6
            x[:, 0] += saw * (1 - pan) * 0.03
            x[:, 1] += saw * pan * 0.03
    x = sweep_lowpass(x, 5000, 300)
    life = n - s_of(0.15)
    envl = np.ones(n, np.float32)
    envl[:life] = np.exp(-4.0 * t[:life] / t[life])
    envl[life:] = 0
    x *= envl[:, None]
    return reverb(x, 3.5, 0.45)[:n]


# ---------------------------------------------------------------- build
def place(bus, x, t0, gain=0.0):
    a = s_of(t0)
    if a >= len(bus) or a + len(x) <= 0:
        return
    if a < 0:
        x, a = x[-a:], 0
    n = min(len(x), len(bus) - a)
    bus[a:a + n] += x[:n] * db(gain)


def build():
    music = np.zeros((N, 2), np.float32)
    fxbus = np.zeros((N, 2), np.float32)
    print("takes:")
    for c in spec["cues"]:
        b0, b1 = c["bars"]
        nb = b1 - b0 + 1
        x = bars_from(c["take"], nb, c.get("from", "middle"))
        rel = lambda bar: s_of((bar - b0) * BAR)
        for col in c.get("colour", []):
            a, b = rel(col["bars"][0]), rel(col["bars"][1] + 1)
            seg = x[a:b]
            if col["do"] == "dark":
                seg = lowpass(seg, 700) * db(1.5)
            elif col["do"] == "pingpong":
                B = s_of(BEAT)
                for k in range(0, len(seg), B):
                    side = (k // B) % 2
                    seg[k:k + B, side] *= 0.15
                seg = seg * db(1.0)
            elif col["do"] == "wide":
                m, s = (seg[:, 0] + seg[:, 1]) / 2, (seg[:, 0] - seg[:, 1]) / 2
                seg = np.stack([m + 2 * s, m - 2 * s], 1)
                seg = reverb(seg, 2.5, 0.45)[:len(seg)]
            elif col["do"] == "duck":
                seg = lowpass(seg, 900) * db(-14)
            x[a:b] = seg
        if c.get("do") == "close":
            x = sweep_lowpass(x, 16000, 250)
        for i, sb in enumerate(c.get("steps", [])):
            a = rel(sb)
            x[a:] *= db(1.0)
            # each step adds a layer of 16th-note hats
            hat = fx_tick() * (0.35 + 0.2 * i)
            for k in range(a, len(x), s_of(BEAT / 4)):
                n = min(len(hat), len(x) - k)
                x[k:k + n] += hat[:n]
        for st in c.get("stutter", []):
            a, b = rel(st["bars"][0]), rel(st["bars"][1] + 1)
            x[a:b] = stutter(x[a:b], st["every"])
        if any(c.get("stutter", [])):
            a = rel(c["stutter"][0]["bars"][0])
            x[a:] = sweep_highpass(x[a:], 30, 900)
        if c.get("fadeInBars"):
            n = s_of(c["fadeInBars"] * BAR)
            x[:n] *= np.linspace(0, 1, n, dtype=np.float32)[:, None] ** 2
        place(music, fade_edges(x, 3), t_of(b0), c.get("gain", 0))

    # the rewind: the last four bars of music, reversed and squeezed into one bar
    for f in spec["fx"]:
        if f["do"] == "rewind":
            t0 = t_of(*f["at"])
            src = music[s_of(t0 - 4 * BAR):s_of(t0 - 0.5 * BAR)][::-1]
            sq = signal.resample_poly(src, 2, 7, axis=0).astype(np.float32)[: s_of(f["bars"] * BAR)]
            sq *= np.linspace(0.3, 1.0, len(sq), dtype=np.float32)[:, None]
            place(fxbus, fade_edges(highpass(sq, 120)), t0, -3)

    makers = {"blip": fx_blip, "tick": fx_tick, "pulse": fx_pulse, "hit": fx_hit, "impact": fx_impact,
              "whoosh": fx_whoosh, "ring": fx_ring}
    for f in spec["fx"]:
        d, t0, g = f["do"], t_of(*f["at"]), f.get("gain", -6)
        if d == "rewind":
            continue
        if d == "swell":
            x = fx_swell(f["bars"])
            place(fxbus, x, t0 - len(x) / SR, g)
        elif d == "whoosh":
            x = fx_whoosh()
            place(fxbus, x, t0 - len(x) / SR, g)
            place(fxbus, fx_hit(), t0, g - 4)
        elif d == "riser":
            place(fxbus, fx_riser(f["bars"]), t0, g)
        elif d == "chord":
            place(fxbus, fx_chord(f["bars"]), t0, f.get("gain", -2))
        elif "every" in f:
            end = t_of(*f["until"])
            k = 0
            while t0 + k * f["every"] * BEAT <= end + 1e-9:
                place(fxbus, makers[d](), t0 + k * f["every"] * BEAT, g)
                k += 1
        else:
            place(fxbus, makers[d](), t0, g)

    mix = music + fxbus * db(-2)
    for c in spec["cues"]:
        for bar, beat, nbeats in c.get("muteBeats", []):
            a, b = s_of(t_of(bar, beat)), s_of(t_of(bar, beat + nbeats))
            r = s_of(0.01)
            mix[a - r:a] *= np.linspace(1, 0, r, dtype=np.float32)[:, None]
            mix[a:b] = 0
    # clips: finished audio dropped in at a beat, at the score's own level
    ref = np.sqrt(np.mean(music[music != 0] ** 2)) + 1e-9
    for cl in spec.get("clips", []):
        path = os.path.join(ROOT, cl["file"])
        if not os.path.exists(path):
            if cl.get("optional"):
                print(f"clip {cl['file']}: not there yet, skipped")
                continue
            raise FileNotFoundError(path)
        y = load(path)
        if cl.get("bars"):   # play only this many bars, then a short fade (the next clip takes over)
            y = fade_edges(y[: s_of(cl["bars"] * BAR)].copy(), 10)
        y = y * (ref / (np.sqrt(np.mean(y ** 2)) + 1e-9)) * db(cl.get("gain", 0))
        a = s_of(t_of(*cl["at"]))
        y = y[: N - a]
        mix[a:a + len(y)] += y
    # loudness: one gain for the whole film, a soft limiter, then a peak ceiling
    rms = np.sqrt(np.mean(mix[mix != 0] ** 2)) + 1e-9
    mix *= 0.16 / rms
    mix = np.tanh(mix * 1.2) / np.tanh(1.2)
    mix *= 0.89 / (np.abs(mix).max() + 1e-9)
    end = s_of(0.02)
    mix[-end:] *= np.linspace(1, 0, end, dtype=np.float32)[:, None]
    return mix


def check(mix):
    """Every cue's span of the finished score must sit on the film grid."""
    print("check (each cue's span of score.wav against the grid):")
    bad = 0
    for c in spec["cues"]:
        b0, b1 = c["bars"]
        if b1 - b0 + 1 < 2:
            continue
        seg = mix[s_of(t_of(b0)):s_of(t_of(b1 + 1))]
        if c.get("stutter"):
            seg = seg[: s_of(2 * BAR)]   # stuttered bars repeat on purpose; measure the plain part
        beat, phase, q = measure(seg)
        off = min(phase, BEAT - phase) * 1000
        ok = abs(beat - BEAT) < 0.002 and off < 25
        bad += not ok
        print(f"  cue {str(c['id']):4s} bars {b0:2d}-{b1:2d}: {60 / beat:6.2f} BPM, beat 1 off by {off:4.1f} ms  {'ok' if ok else 'OFF GRID'}")
    return bad


if __name__ == "__main__":
    out = os.path.join(ROOT, "audio", "score.wav")
    if "--check" in sys.argv:
        mix = load(out)
    else:
        mix = build()
        sf.write(out, mix, SR, subtype="PCM_24")
        print(f"wrote video/audio/score.wav ({len(mix) / SR:.3f} s, film {TOTAL:.3f} s)")
    sys.exit(1 if check(mix) else 0)
