#!/usr/bin/env python3
"""Build the game's sound files from the picked sources.

    python3 _dealbreaker/tools/build-sounds.py

Reads _dealbreaker/sounds/src (the picked originals) and
_dealbreaker/sounds/voices (Bella's recorded lines), and writes
x/7a3797625d3c2330/sounds/{sfx,voice,music}. Needs ffmpeg.

Effects are trimmed, layered where a pick is a combination, levelled by
group (button taps quiet, the big moments loudest) and saved as small MP3s.
Change a pick by changing its line in SFX.

Licences: Freesound sounds are CC0 (each source's page is noted), Kenney
sounds are CC0, OpenGameArt music is CC0, the voices were made with Kokoro
(Apache 2.0; one voice, "Bella"). "Luxury Hotel Lounge" was supplied by the owner.
"""
import os
import shutil
import subprocess
import sys

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
SRC = os.path.join(ROOT, "_dealbreaker", "sounds", "src")
VOICES = os.path.join(ROOT, "_dealbreaker", "sounds", "voices")
OUT = os.path.join(ROOT, "x", "7a3797625d3c2330", "sounds")

# Average level per group (RMS, dB): quiet clicks, steady table sounds, loud
# big moments. (Loudness meters need seconds of audio; most of these are a
# fraction of one, so each is measured and set by its RMS, under a peak ceiling.)
UI, TABLE, BIG = -27, -22, -17
CEILING = -1.0

# name: (loudness, [(source file, start in seconds, volume), ...])
SFX = {
    # Cards (Kenney Casino Audio)
    "deal":      (TABLE, [("kenney-card-shuffle.ogg", 0, 1), ("kenney-card-fan-1.ogg", 0.55, 0.9)]),
    "draw":      (TABLE, [("kenney-card-slide-5.ogg", 0, 1), ("kenney-card-slide-6.ogg", 0.12, 1)]),
    "card":      (TABLE, [("kenney-card-place-1.ogg", 0, 1)]),
    "place":     (TABLE, [("kenney-card-place-4.ogg", 0, 1)]),
    "reshuffle": (TABLE, [("kenney-card-shuffle.ogg", 0, 1)]),
    "move":      (TABLE, [("kenney-card-slide-4.ogg", 0, 1)]),          # a card changing hands
    "flip":      (TABLE, [("fs585257.mp3", 0, 1)]),                     # swoosh-1 (freesound.org/s/585257)
    # Money
    "bank":      (TABLE, [("fs532861.mp3", 0, 1)]),                     # AllInPushChips (532861)
    "pay":       (TABLE, [("fs17502.mp3", 0, 1)]),                      # Coin dropping (17502)
    "coin":      (TABLE - 3, [("fs17502.mp3", 0, 1)]),
    "paid":      (TABLE, [("fs209578.mp3", 0, 1)]),                     # Cash Register Purchase (209578)
    # Action cards
    "rent":      (BIG, [("fs209578.mp3", 0, 1)]),
    "doubleRent": (BIG, [("fs656643.mp3", 0, 1)]),                      # Game Reward (656643)
    "sly":       (BIG, [("fs578807.mp3", 0, 1)]),                       # Pluck 1 (578807)
    "forced":    (BIG, [("fs60013.mp3", 0, 1)]),                        # Whoosh (60013)
    "jsn":       (BIG, [("fs648462.mp3", 0, 1)]),                       # Wrong Answer (648462)
    "dealBreaker": (BIG, [("fs671375.mp3", 0, 1)]),                     # FX Cinematic Impact (671375)
    "birthday":  (BIG, [("fs26349.mp3", 0, 1), ("fs170583.mp3", 0.15, 0.9), ("fs563845.mp3", 0.55, 0.85)]),  # party popper (26349) + Party horn (170583) + yay (563845)
    "complete":  (TABLE + 2, [("fs238855.mp3", 0, 1)]),                 # Collected Item (238855)
    # Turns and the clock
    "turn":      (TABLE, [("fs243701.mp3", 0, 1)]),                     # correct (243701)
    "tick":      (TABLE - 2, [("fs265577.mp3", 0, 1)]),                 # Tick Tock Clock 01 (265577): a tick and a tock, 2 s
    "win":       (BIG, [("fs521645.mp3", 0, 1)]),                       # WinFantasia (521645)
    "lose":      (BIG - 2, [("fs135831.mp3", 0, 1)]),                   # End Game - Fail (135831)
    "timeout":   (TABLE, [("fs619835.mp3", 0, 1)]),                     # Button UI App (619835)
    "skipped":   (UI + 2, [("fs67454.mp3", 0, 1)]),                     # negativebeep (67454)
    # Buttons and chat
    "error":     (UI + 2, [("fs67454.mp3", 0, 1)]),
    "send":      (UI, [("fs467951.mp3", 0, 1)]),                        # UI Button Click (467951)
    "receive":   (UI, [("fs221091.mp3", 0, 1)]),                        # cartoon pop or drip (221091)
}

# id: (source, bitrate). Long tracks stream, so they're kept lean.
MUSIC = {
    "lounge":      ("luxury-hotel-lounge.mp3", "64k"),
    "shop-theme":  ("oga-shop-theme.ogg", "128k"),
    "sunny-side-up": ("oga-sunny-side-up.wav", "128k"),
    "funky-menu":  ("oga-funky-menu.mp3", "128k"),
    "happy-clappy": ("oga-happy-clappy.wav", "128k"),
    "pollie-soft": ("fs21685.mp3", "128k"),                              # 04 pollie soft (freesound.org/s/21685)
}

TRIM = "silenceremove=start_periods=1:start_threshold=-55dB,areverse,silenceremove=start_periods=1:start_threshold=-60dB,areverse"


def run(args):
    subprocess.run(["ffmpeg", "-v", "error", "-y", *args], check=True)


def levels(path):
    """(RMS dB, peak dB) of a file."""
    r = subprocess.run(["ffmpeg", "-hide_banner", "-i", path, "-af", "volumedetect", "-f", "null", "-"], capture_output=True, text=True).stderr
    mean = float(r.split("mean_volume: ")[1].split(" dB")[0])
    peak = float(r.split("max_volume: ")[1].split(" dB")[0])
    return mean, peak


def sfx(name, target, layers):
    inputs, chains = [], []
    for i, (src, at, vol) in enumerate(layers):
        inputs += ["-i", os.path.join(SRC, src)]
        ms = int(at * 1000)
        chains.append(f"[{i}:a]aresample=44100,aformat=channel_layouts=stereo,{TRIM},volume={vol},adelay={ms}|{ms}[a{i}]")
    mix = "".join(f"[a{i}]" for i in range(len(layers)))
    graph = ";".join(chains) + f";{mix}amix=inputs={len(layers)}:normalize=0[out]"
    raw = os.path.join(OUT, "sfx", name + ".raw.wav")
    run([*inputs, "-filter_complex", graph, "-map", "[out]", "-ar", "44100", raw])
    mean, peak = levels(raw)
    gain = min(target - mean, CEILING - peak)
    run(["-i", raw, "-af", f"volume={gain:.2f}dB", "-ar", "44100", "-ac", "2", "-c:a", "libmp3lame", "-b:a", "128k",
         os.path.join(OUT, "sfx", name + ".mp3")])
    os.remove(raw)


def main():
    for d in ("sfx", "voice", "music"):
        os.makedirs(os.path.join(OUT, d), exist_ok=True)
    only = set(sys.argv[1:])
    for name, (lufs, layers) in SFX.items():
        if not only or name in only:
            sfx(name, lufs, layers)
            print("sfx", name)
    if not only or "voice" in only:
        shutil.rmtree(os.path.join(OUT, "voice"))
        os.makedirs(os.path.join(OUT, "voice"))
        for f in sorted(os.listdir(VOICES)):
            if f.endswith(".mp3"):
                run(["-i", os.path.join(VOICES, f), "-ac", "1", "-c:a", "libmp3lame", "-b:a", "96k", os.path.join(OUT, "voice", f)])
        print("voice lines", len(os.listdir(os.path.join(OUT, "voice"))))
    if not only or "music" in only:
        for name, (src, rate) in MUSIC.items():
            run(["-i", os.path.join(SRC, src), "-af", "loudnorm=I=-20:TP=-1.5:LRA=11", "-ar", "44100", "-ac", "2",
                 "-c:a", "libmp3lame", "-b:a", rate, os.path.join(OUT, "music", name + ".mp3")])
            print("music", name)


if __name__ == "__main__":
    if not shutil.which("ffmpeg"):
        sys.exit("ffmpeg is needed")
    main()
