#!/usr/bin/env python3
"""VaultCheck demo video assembly: the guardian presenter talks.

Scene frames (scenes/scene1..6.png, 1920x1080) get a slow push in and
0.6 s crossfades. The guardian overlay is a 10 fps image sequence
built by mouth-track.py, switching between the closed, half open, and
wide open mouth variants of each pose in sync with the narration
amplitude, so the mouth moves with the speech and closes in the
pauses. The guardian slides in from the left at each scene start and
has a gentle idle bob. Narration treatment: loudnorm to -16 LUFS
only, no tempo change of any kind.
"""
import subprocess
import sys
from pathlib import Path
from PIL import Image

HERE = Path(__file__).resolve().parent
VIDEO = HERE.parent
SCENES = VIDEO / "scenes"
FRAMES = VIDEO / "frames"
NARRATION = VIDEO / "narration" / "narration-final.mp3"
OUT = VIDEO / "final" / "vaultcheck-demo.mp4"
CMDLOG = VIDEO / "final" / "ffmpeg-command.log"

FPS = 30
FADE = 0.6
AGENT_H = 770
FEET_Y = 1012
CENTER_X = 332
TOP_Y = FEET_Y - AGENT_H

POSES = ["presenting", "envelope", "key", "yes", "stop", "wave"]
ZOOMS = [0.03, 0.02, 0.03, 0.02, 0.03, 0.02]

base_durations = []
for n in range(1, 7):
    out = subprocess.check_output(["ffprobe", "-v", "error", "-show_entries",
                                   "format=duration", "-of", "csv=p=0",
                                   str(VIDEO / "narration" / f"S{n}.mp3")])
    base_durations.append(float(out))

durations = [d + (FADE if i < 5 else 0.0) for i, d in enumerate(base_durations)]
total = sum(durations) - FADE * 5
print(f"planned total duration: {total:.2f} s")

n = len(POSES)
inputs = []
for i in range(n):
    inputs += ["-i", str(SCENES / f"scene{i + 1}.png")]
for i in range(n):
    inputs += ["-framerate", "10", "-i", str(FRAMES / f"seg{i}" / "f%03d.png")]
inputs += ["-i", str(NARRATION)]

filters = []
for i, pose in enumerate(POSES):
    frames = round(durations[i] * FPS)
    aw = Image.open(FRAMES / f"scaled-{pose}.png").width
    target_x = CENTER_X - aw // 2
    filters.append(
        f"[{i}:v]scale=2400:1350:flags=lanczos,"
        f"zoompan=z='1+{ZOOMS[i]}*on/{frames - 1}':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)'"
        f":d={frames}:s=1920x1080:fps={FPS},setsar=1[vb{i}]"
    )
    filters.append(f"[{n + i}:v]fps={FPS},setsar=1[ag{i}]")
    filters.append(
        f"[vb{i}][ag{i}]overlay="
        f"x='{target_x}-600*pow(1-min(t/0.9\\,1)\\,2)'"
        f":y='{TOP_Y}+7*sin(2*PI*t/2.6)'"
        f":eof_action=repeat,trim=end_frame={frames},setpts=PTS-STARTPTS[v{i}]"
    )

prev = "v0"
elapsed = durations[0]
for k in range(1, n):
    offset = elapsed - FADE * k
    label = f"x{k}"
    filters.append(
        f"[{prev}][v{k}]xfade=transition=fade:duration={FADE}:offset={offset:.2f}[{label}]"
    )
    prev = label
    elapsed += durations[k]

filters.append(f"[{prev}]fade=t=in:st=0:d=0.5,fade=t=out:st={total - 1.0:.2f}:d=1.0,format=yuv420p[vout]")
filters.append(f"[{2 * n}:a]loudnorm=I=-16:TP=-1.0:LRA=11,aresample=48000[aout]")

cmd = [
    "ffmpeg", "-y",
    *inputs,
    "-filter_complex", ";".join(filters),
    "-map", "[vout]", "-map", "[aout]",
    "-c:v", "libx264", "-preset", "medium", "-crf", "19", "-profile:v", "high",
    "-r", str(FPS),
    "-c:a", "aac", "-b:a", "192k",
    "-movflags", "+faststart",
    "-t", f"{total:.2f}",
    str(OUT),
]
CMDLOG.write_text(" ".join(cmd) + "\n")
print("running ffmpeg, command logged to", CMDLOG)
res = subprocess.run(cmd)
sys.exit(res.returncode)
