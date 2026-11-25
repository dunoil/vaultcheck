# VaultCheck Demo Video, Asset List

The finished video and its production assets live in the project
folder at ~/workspace/terminal3-micro-grant/video/ (outside this repo,
because the binaries are large). This file records what exists and
where, so the submission can be reproduced.

## Finished video

- video/final/vaultcheck-demo.mp4: 1920x1080, 133.54 s, about 24.8 MB.
- video/final/ffmpeg-command.log: the exact assembly command.

## Character assets (video/character/)

Generated with the image tool on a bright green screen, chroma keyed
by border flood fill plus a tight tolerance pass.

- Raw generations: media-generation-guardian-{presenting,envelope,key,yes,stop,wave}-raw-0-*.png (1600x1600)
- Keyed poses: guardian-{presenting,envelope,key,yes,stop,wave}.png
- Mouth variants per pose: guardian-POSE-clean.png (mouth painted out),
  guardian-POSE-half.png, guardian-POSE-wide.png. The closed state is
  the keyed pose itself.
- character/mouths.json: measured mouth bounding boxes and centers.
- Debug sheets: contact-sheet.png, mouth-debug.png, mouth-variants-check.png.

## Scenes (video/scenes/)

- scenes.html: the six 1920x1080 scene frames (evidence panels).
- scene1.png to scene6.png: captured frames (puppeteer-core, Chromium).
- dashboard-full.png and dashboard-top.png: the real traction
  dashboard, captured over local HTTP so traction.json loads live;
  dashboard-top.png is the cropped inset used in scene 6.

## Narration (video/narration/)

- S1.txt to S6.txt: locked section texts (see narration-script.md).
- S1.mp3 to S6.mp3: raw TTS renders (Helio, avocado_v2:MAI_03, speed 90).
- narration-final.mp3: concatenation, no gaps added, no edits.

## Production scripts (video/scripts/, copies in this repo folder)

- key-and-locate.py: chroma keying and mouth location.
- make-mouth-variants.py: enclosed pocket key pass and mouth variants.
- capture-scenes.js: scene frame and dashboard captures.
- mouth-track.py: 0.1 s amplitude analysis and per segment frame sequences.
- build-video.py: ffmpeg assembly (push ins, crossfades, guardian
  overlay with slide in and idle bob, loudnorm to -16 LUFS target).

## QA (video/qa/)

- qa-report.md (copy in this repo folder): all measured gates.
- frames/: frame grabs from the shipped render, qa-sheet.png,
  qa-faces.png, and inset verification crops.
