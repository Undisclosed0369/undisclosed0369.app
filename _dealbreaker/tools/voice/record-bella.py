#!/usr/bin/env python3
"""Record Bella's lines (the game's announcer) with Kokoro, then polish them.

Writes _dealbreaker/sounds/voices/<moment>.mp3; then run
_dealbreaker/tools/build-sounds.py voice to copy them into the game.

One-time setup, in this folder (none of it is committed):
    /opt/homebrew/bin/python3.14 -m venv venv     # onnxruntime has no wheels for newer Pythons yet
    ./venv/bin/pip install kokoro-onnx soundfile
    curl -LO https://github.com/thewh1teagle/kokoro-onnx/releases/download/model-files-v1.0/kokoro-v1.0.onnx
    curl -LO https://github.com/thewh1teagle/kokoro-onnx/releases/download/model-files-v1.0/voices-v1.0.bin

Then:
    ./venv/bin/python record-bella.py              # every line
    ./venv/bin/python record-bella.py debt jsn     # just these

Kokoro is Apache 2.0. Needs ffmpeg. A line given as a list is spoken in
parts with a real pause between them (the engine's own pauses are short).
Write "Humph", never "Hmph": the engine spells that one out letter by letter.
"""
import os
import shutil
import subprocess
import sys
import tempfile

import numpy as np
import soundfile as sf
from kokoro_onnx import EspeakConfig, Kokoro

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.abspath(os.path.join(HERE, "..", "..", "sounds", "voices"))

# moment: line, or [(phrase, pause after in seconds), ...]  (see sounds/VOICE-SCRIPT.md)
LINES = {
    "start": "Welcome to the table. Good luck, everyone!",
    "rent": "Time to pay the rent!",
    "doubleRent": "Double rent!",
    "debt": [("Debt Collector!", 0.5), ("Pay up, please.", 0.4), ("Cash, property, or tears.", 0)],
    "dealBreaker": "Deal Breaker! Say goodbye to that set!",
    "sly": "Sly Deal! That one's mine now.",
    "forced": "Forced Deal! Swap it!",
    "jsn": [("Nope!", 0.75), ("Denied.", 0)],
    "birthday": [("Surprise! It's my birthday again.", 0.5), ("Somehow.", 0)],
    "oneAway": "One set away from victory!",
    "hurry": "Clock's ticking! Make your move!",
    "timeout": [("Time's up!", 0.6), ("The robot's got this one now.", 0)],
    "win": "You win! Congratulations!",
    "lose": "Game over. Better luck next time!",
}
VOICE, SPEED = "af_bella", 1.05


def engine():
    # espeak-ng (the pronouncer) only takes a short data path, so its data is
    # copied to /tmp once.
    import espeakng_loader
    short = "/tmp/kesp/espeak-ng-data"
    if not os.path.isdir(short):
        shutil.copytree(espeakng_loader.get_data_path(), short)
    return Kokoro(os.path.join(HERE, "kokoro-v1.0.onnx"), os.path.join(HERE, "voices-v1.0.bin"),
                  espeak_config=EspeakConfig(data_path=short))


def room(sr, seconds, decay, seed):
    """A soft, dark impulse response: decaying noise, low-passed."""
    rng = np.random.default_rng(seed)
    t = np.arange(int(sr * seconds)) / sr
    ir = rng.standard_normal(len(t)) * np.exp(-t * decay)
    out, acc = np.empty_like(ir), 0.0
    for i, x in enumerate(ir):
        acc += 0.18 * (x - acc)
        out[i] = acc
    return out / (np.sqrt(np.sum(out ** 2)) + 1e-9)


def convolve(x, ir):
    n = len(x) + len(ir) - 1
    size = 1 << (n - 1).bit_length()
    return np.fft.irfft(np.fft.rfft(x, size) * np.fft.rfft(ir, size), size)[:n]


def record(k, key, line):
    parts = line if isinstance(line, list) else [(line, 0)]
    chunks, sr = [], 24000
    for text, pause in parts:
        s, sr = k.create(text, voice=VOICE, speed=SPEED, lang="en-us")
        loud = np.where(np.abs(s) > 0.01)[0]   # trim the engine's own silence, so the pauses are exactly ours
        if len(loud):
            s = s[max(0, loud[0] - 200): loud[-1] + 2000]
        chunks += [s, np.zeros(int(sr * pause))]
    x = np.concatenate(chunks)
    # A short room, a little air, gentle compression.
    wet = convolve(x, room(sr, 0.45, 9, 3))[: len(x) + int(sr * 0.35)]
    y = np.concatenate([x, np.zeros(len(wet) - len(x))]) * 0.9 + wet * 0.14
    with tempfile.TemporaryDirectory() as tmp:
        mid = os.path.join(tmp, "mid.wav")
        sf.write(mid, y / (np.max(np.abs(y)) + 1e-9) * 0.9, sr)
        subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", mid, "-af",
                        "equalizer=f=4500:t=q:w=1.2:g=2.5,equalizer=f=220:t=q:w=1:g=1.5,"
                        "acompressor=threshold=-16dB:ratio=3:attack=4:release=100,"
                        "areverse,silenceremove=start_periods=1:start_threshold=-55dB,areverse,loudnorm=I=-16:TP=-1.5:LRA=11",
                        "-ar", "44100", "-c:a", "libmp3lame", "-q:a", "2", os.path.join(OUT, key + ".mp3")], check=True)
    return len(y) / sr


def main():
    only = sys.argv[1:] or list(LINES)
    unknown = [m for m in only if m not in LINES]
    if unknown:
        sys.exit("unknown moment: " + ", ".join(unknown))
    if not os.path.exists(os.path.join(HERE, "kokoro-v1.0.onnx")):
        sys.exit("The Kokoro model isn't here yet: see the setup at the top of this file.")
    os.makedirs(OUT, exist_ok=True)
    k = engine()
    for key in only:
        print(f"{key}: {record(k, key, LINES[key]):.2f} s")


if __name__ == "__main__":
    main()
