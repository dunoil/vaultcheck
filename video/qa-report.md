# VaultCheck Demo Video QA Report

Production date: 25 Nov 2026. Method: the proven BadgeGate v3 pipeline
(character presenter with amplitude driven lip sync), rebuilt for
VaultCheck with a new character, new scenes, and VaultCheck data only.

## Deliverable

- final/vaultcheck-demo.mp4 (measurements in the video section below)

## Narration and voice QA

Tool: built in TTS CLI (/opt/hatch/bin/tts speak), no account or
payment needed. Voice: Helio (voice id avocado_v2:MAI_03), one
consistent English voice, neutral professional tone. Speed setting 90,
chosen by probe render: S1 at speed 100 measured 168.5 wpm, too brisk;
at speed 90 the sections land in the middle of the band. The pace comes
from the synthesis speed setting, not from any post processing.

### Check 1: speaking rate (raw render duration versus word count)

| Section | Words | Raw duration | Rate |
| --- | --- | --- | --- |
| S1 | 45 | 18.12 s | 149.0 wpm |
| S2 | 61 | 24.12 s | 151.7 wpm |
| S3 | 66 | 25.87 s | 153.1 wpm |
| S4 | 58 | 22.30 s | 156.1 wpm |
| S5 | 51 | 20.57 s | 148.8 wpm |
| S6 | 60 | 22.56 s | 159.6 wpm |
| Total | 341 | 133.54 s (2:13.5) | 153.2 wpm |

PASS. Total rate 153.2 wpm is inside the required 140 to 175 wpm band,
and every section is inside the band on its own.

### Check 2: tempo fitting

PASS, zero tempo fitting. No time stretching, no atempo, no speed
change was applied to any rendered audio at any point. The only speed
control is the TTS synthesis speed parameter before rendering (100 for
the discarded probe, 90 for the final renders), which is a re render,
not a fit. Tempo fitting applied: 1.00x, under the 1.15x ceiling.

### Check 3: pause structure (ffmpeg silencedetect)

Command: ffmpeg -i narration-final.mp3 -af silencedetect=noise=-40dB:d=0.25 -f null -

- Pauses of at least 0.25 s detected: 57, spread across the whole narration.
- Pause durations: minimum 0.271 s, mean 0.570 s, maximum 0.947 s.
- Pauses of at least 0.5 s: 32.

PASS. Real sentence pauses exist throughout, including at every
section boundary and between sentences inside sections. This is not a
crushed, pause free render.

### Levels

Raw render integrated loudness: -28.41 LUFS, true peak -3.72 dBTP.
The assembly applies loudnorm to -16 LUFS integrated (TP -1.0), a
plain level normalization, not a tempo change. Final loudness is
measured on the finished mp4 in the video section below.

## Character and lip sync

- Character: the VaultCheck guardian, a teal and brass vault robot
  clerk with a key antenna, a vault door belly with keyhole, and a
  dark screen face with glowing amber eyes and mouth. Six poses
  generated with the image tool on a bright green screen (presenting,
  envelope, key, yes, stop, wave), background removed by border flood
  fill chroma keying plus a tight tolerance pass for enclosed pockets.
- Mouth variants: for each pose, the glowing crescent mouth was
  located by glow cluster analysis (bbox recorded in
  character/mouths.json), painted out by diffusion inpainting, and two
  open variants drawn at the identical center (verified numerically:
  drawn centroid within 0.5 px of the crescent center on sampled
  poses). Diff checks confirm every variant differs from its source
  only inside the mouth region.
- Lip sync: narration analyzed in 0.1 s windows, classified silent,
  soft, or loud from the file's own levels (silent at or below -40 dB,
  loud at or above the speech median of -28.2 dB), with single window
  flicker smoothing. Window counts: 415 closed, 572 half open, 349
  wide open, of 1336 windows. The mouth closes in measured pauses
  (verified at the 3.6 s pause midpoint: state closed) and opens wide
  at measured loud windows.
- Motion: the guardian slides in from the left at each scene start
  (0.9 s ease), has a gentle idle bob (7 px, 2.6 s period), and each
  scene background has a slow push in (2 to 3 percent) with 0.6 s
  crossfades between scenes. No scene is text only: the character is
  on screen for the entire video.

## Evidence accuracy

Every number, DID, and string on screen comes from STATUS.md records,
traction.json, or the verbatim flow-run-final.log lines quoted in the
terminal blocks (store result, getMemberDelegation readback, check
result JSON, rejection line). Scene 6 carries a live capture of the
real traction dashboard page (served locally so traction.json loads;
the capture shows "Loaded live from traction.json, generated from
activity.jsonl (11 events)").

## Video measurements and frame QA

Measured on the finished final/vaultcheck-demo.mp4:

- Duration: 133.54 s (2:13.5), inside the 2:00 to 2:45 target.
- Resolution: 1920x1080, 30 fps, H.264 High profile, AAC 192k.
- File size: 24,812,397 bytes (about 24.8 MB). The mp4 stays out of
  git; it lives at video/final/vaultcheck-demo.mp4 in the project
  folder.
- Final loudness: -16.96 LUFS integrated, true peak -0.94 dBTP
  (loudnorm measurement pass over the finished file). The plan target
  is about -16 LUFS; the single pass loudnorm landed within 1 dB.

Frame grabs saved in qa/frames/ (f-3.6, f-5, f-30, f-55, f-68.3,
f-85, f-100, f-120.5, f-125, plus qa-sheet.png, qa-faces.png, and the
final-100 and final-125 grabs from the shipped render). Visual pass
results:

- No clipped or overflowing text in any grabbed frame. Headlines,
  panel copy, DIDs, contract name, and terminal blocks all sit inside
  their panels. The long JSON strings wrap inside their terminal
  blocks by design (word-break on mono blocks).
- No broken words in narration (word count and section timing verified
  against the locked script; the TTS rendered the script verbatim).
- Mouth states match the audio at the grabbed timestamps: at the
  measured pause midpoint 3.6 s the mouth is the closed crescent; at
  5 s (speech) a small open oval; at 68.3 s the frame falls inside the
  scene 3 to 4 crossfade (expected ghosting at a transition, not a
  defect); at the measured loud window 120.5 s the mouth is wide open
  on the wave pose; at 100 s (softer passage) the crescent shows.
- Every figure on screen matches STATUS.md and traction.json:
  contract ID 1151, contract name, both DIDs, 90 day grant window with
  the exact epoch seconds from the readback, six rules all true, the
  HTTP 403 rejection line verbatim, 3 unique DIDs, 35 credits moved,
  4 funding entries, 1 documented check, 1 rejection, 1 record stored.
- One defect was found and fixed during production: the first scene 6
  dashboard inset was captured from the desk page opened as a local
  file, which shows a fallback note instead of live data. The inset
  was recaptured with the desk served over local HTTP and the capture
  waiting for the live status line, and the video was re-rendered.
  The shipped frame at 125 s shows the inset reading "Loaded live
  from traction.json, generated from activity.jsonl (11 events)."

## Shortfalls against the plan

- Final loudness is -16.96 LUFS rather than exactly -16 (within 1 dB,
  single pass loudnorm, same treatment as the proven BadgeGate v3).
- No background music or sound design track: the plan mentions sound
  design in the production order, but the narration plus loudnorm
  treatment was kept clean rather than risking an unlicensed or
  synthetic music bed under a deadline. Voice and picture carry the
  piece.
- The desk inset in scene 6 shows the top of the real dashboard only
  (header, live status line, headline metrics header), cropped to fit
  the panel; the full page is one click away at the URL on screen.

