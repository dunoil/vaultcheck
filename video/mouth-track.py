#!/usr/bin/env python3
"""VaultCheck demo: build the lip sync mouth track.

Analyzes narration/narration-final.mp3 in 0.1 s windows and classifies
each window as silent, soft, or loud, calibrated from the file's own
levels (speech windows are those above the -40 dB silencedetect floor;
the loud threshold sits at their median). Silent maps to the closed
mouth (the original pose, glowing crescent), soft to the half open
variant, loud to the wide open variant. A light smoothing pass removes
single window flicker while preserving real pauses (the narration has
dozens of measured sentence pauses of 0.25 s or longer, so closed runs
of 3 or more windows are genuine).

Outputs, per video segment: a 10 fps image sequence of the guardian at
the exact overlay size used by the assembly (height 770 px), frames as
symlinks to the scaled mouth state images, under frames/. Also prints
the mouth state at candidate QA timestamps and saves mouth-states.npy.
"""
import subprocess
import wave
from pathlib import Path

import numpy as np
from PIL import Image

HERE = Path(__file__).resolve().parent
VIDEO = HERE.parent
CHAR = VIDEO / "character"
FRAMES = VIDEO / "frames"
NARR = VIDEO / "narration"
WAV = "/tmp/vaultcheck-narration.wav"

POSES = ["presenting", "envelope", "key", "yes", "stop", "wave"]

# section durations measured from the rendered mp3 files
durations = []
for n in range(1, 7):
    out = subprocess.check_output(["ffprobe", "-v", "error", "-show_entries",
                                   "format=duration", "-of", "csv=p=0",
                                   str(NARR / f"S{n}.mp3")])
    durations.append(float(out))
starts = [0.0]
for d in durations[:-1]:
    starts.append(starts[-1] + d)
print("section durations:", [round(d, 2) for d in durations], "total", round(sum(durations), 2))

subprocess.run(["ffmpeg", "-y", "-v", "error", "-i", str(NARR / "narration-final.mp3"),
                "-ac", "1", "-ar", "16000", WAV], check=True)

# --- amplitude analysis ------------------------------------------------------
w = wave.open(WAV)
sr = w.getframerate()
data = np.frombuffer(w.readframes(w.getnframes()), dtype=np.int16).astype(np.float32) / 32768.0
WIN = int(sr * 0.1)
NW = int(np.ceil(len(data) / WIN))
rms = np.array([np.sqrt(np.mean(data[i * WIN:(i + 1) * WIN] ** 2)) for i in range(NW)])
db = 20 * np.log10(rms + 1e-7)

SIL_DB = -40.0
speech = db[db > SIL_DB]
LOUD_DB = float(np.median(speech))
print(f"windows {NW}: speech median {LOUD_DB:.1f} dB, loud threshold {LOUD_DB:.1f} dB")
state = np.where(db < SIL_DB, 0, np.where(db < LOUD_DB, 1, 2)).astype(int)

# --- smoothing: remove isolated single window flicker ------------------------
for i in range(1, NW - 1):
    if state[i] == 2 and state[i - 1] == 1 and state[i + 1] == 1:
        state[i] = 1
    elif state[i] == 0 and state[i - 1] > 0 and state[i + 1] > 0:
        state[i] = 1
counts = {s: int((state == s).sum()) for s in (0, 1, 2)}
print(f"states: closed {counts[0]}, half {counts[1]}, wide {counts[2]}")

# --- per segment frame sequences ----------------------------------------------
FADE = 0.6
AGENT_H = 770
STATE_FILE = {0: "", 1: "-half", 2: "-wide"}
FRAMES.mkdir(exist_ok=True)

scaled = {}
for pose in POSES:
    scaled[pose] = {}
    for s, suffix in STATE_FILE.items():
        im = Image.open(CHAR / f"guardian-{pose}{suffix}.png")
        aw = round(im.width * AGENT_H / im.height)
        out = FRAMES / f"scaled-{pose}{suffix}.png"
        im.resize((aw, AGENT_H), Image.LANCZOS).save(out)
        scaled[pose][s] = out

for i, pose in enumerate(POSES):
    dur = durations[i] + (FADE if i < len(POSES) - 1 else 0.0)
    nframes = int(dur * 10) + 1
    segdir = FRAMES / f"seg{i}"
    segdir.mkdir(exist_ok=True)
    for old in segdir.glob("f*.png"):
        old.unlink()
    for j in range(nframes):
        t = starts[i] + (j + 0.5) / 10.0
        idx = min(int(t / 0.1), NW - 1)
        link = segdir / f"f{j:03d}.png"
        link.symlink_to(scaled[pose][state[idx]])
    print(f"seg{i} {pose}: {nframes} frames")

# --- QA candidates --------------------------------------------------------------
def state_at(t):
    return int(state[min(int(t / 0.1), NW - 1)])

# first long pause inside S1 (silencedetect: 3.25 to 3.94)
print("pause midpoint 3.6 s:", state_at(3.6))
for target in (30.0, 70.0, 120.0):
    lo, hi = int(target * 10) - 20, int(target * 10) + 20
    best = max(range(lo, min(hi, NW)), key=lambda k: db[k])
    print(f"loudest window near {target:.0f} s: t={best / 10:.1f} dB={db[best]:.1f} state={state[best]}")
np.save(VIDEO / "frames" / "mouth-states.npy", state)
print("saved frames/mouth-states.npy")
