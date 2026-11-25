#!/usr/bin/env python3
"""VaultCheck demo: chroma key the guardian poses and locate mouths.

Background removal is a border flood fill with color tolerance (the
green screen is one connected region; a global color key would eat
the green checkmark on the YES card). After keying, the face glow
clusters (warm bright pixels on the dark screen face) are measured:
the two eye clusters sit high, the mouth cluster is the lowest,
horizontally central one. Mouth bboxes are printed and a debug image
with boxes is saved for visual verification.
"""
import json
from collections import deque
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw
from scipy import ndimage

HERE = Path(__file__).resolve().parent
CHAR = HERE.parent / "character"
RAW = {
    "presenting": "media-generation-guardian-presenting-raw-0-49d956b2-87aa-4940-b1de-678c73ef2dc9.png",
    "envelope": "media-generation-guardian-envelope-raw-0-3000cf94-5b34-4d34-88c8-589a216487f3.png",
    "key": "media-generation-guardian-key-raw-0-5ff59f46-685c-4149-803c-4a57f8669477.png",
    "yes": "media-generation-guardian-yes-raw-0-d2d6ad80-9061-48b6-8d23-79f9c269b0c2.png",
    "stop": "media-generation-guardian-stop-raw-0-edb25993-9231-48e3-bd5d-353db39aa781.png",
    "wave": "media-generation-guardian-wave-raw-0-6626b86d-c877-45d1-8501-79855be8bb35.png",
}


def flood_key(img: Image.Image, tol: float = 60.0) -> Image.Image:
    """Alpha 0 for the border connected green background."""
    rgb = np.asarray(img.convert("RGB")).astype(np.int32)
    h, w, _ = rgb.shape
    # reference background color: median of the four corners
    corners = np.array([rgb[0, 0], rgb[0, -1], rgb[-1, 0], rgb[-1, -1]])
    ref = np.median(corners, axis=0)
    dist = np.sqrt(((rgb - ref) ** 2).sum(axis=2))
    cand = dist < tol
    # flood fill over candidate pixels from the borders
    seen = np.zeros((h, w), bool)
    dq = deque()
    for x in range(w):
        for y in (0, h - 1):
            if cand[y, x] and not seen[y, x]:
                seen[y, x] = True
                dq.append((y, x))
    for y in range(h):
        for x in (0, w - 1):
            if cand[y, x] and not seen[y, x]:
                seen[y, x] = True
                dq.append((y, x))
    while dq:
        y, x = dq.popleft()
        for ny, nx in ((y - 1, x), (y + 1, x), (y, x - 1), (y, x + 1)):
            if 0 <= ny < h and 0 <= nx < w and cand[ny, nx] and not seen[ny, nx]:
                seen[ny, nx] = True
                dq.append((ny, nx))
    alpha = np.where(seen, 0, 255).astype(np.uint8)
    # soften the edge: alpha from distance for near background pixels
    edge = ndimage.binary_dilation(seen) & ~seen
    alpha[edge] = np.clip(255 - (dist[edge] / tol) * 255, 60, 255).astype(np.uint8)
    out = img.convert("RGBA")
    out.putalpha(Image.fromarray(alpha))
    # crop to content bbox with a small margin
    ys, xs = np.where(alpha > 10)
    m = 6
    box = (max(0, xs.min() - m), max(0, ys.min() - m), min(w, xs.max() + m), min(h, ys.max() + m))
    return out.crop(box)


def find_mouth(img: Image.Image):
    """Return (bbox, center) of the mouth glow cluster."""
    rgb = np.asarray(img.convert("RGB")).astype(np.int32)
    r, g, b = rgb[:, :, 0], rgb[:, :, 1], rgb[:, :, 2]
    glow = (r > 175) & (g > 115) & (b < 150) & (r > b + 60)
    lab, n = ndimage.label(glow)
    objs = ndimage.find_objects(lab)
    clusters = []
    for i, sl in enumerate(objs, start=1):
        area = int((lab[sl] == i).sum())
        if area < 120:
            continue
        ys, xs = sl
        clusters.append(dict(bbox=(xs.start, ys.start, xs.stop, ys.stop), area=area,
                             cy=(ys.start + ys.stop) / 2, cx=(xs.start + xs.stop) / 2))
    clusters.sort(key=lambda c: c["cy"])
    print("  glow clusters:", [(c["bbox"], c["area"]) for c in clusters])
    # eyes are the top pair; the mouth is the lowest cluster
    mouth = clusters[-1]
    return mouth["bbox"], (int(mouth["cx"]), int(mouth["cy"]))


mouths = {}
debug = []
for pose, fname in RAW.items():
    src = Image.open(CHAR / fname)
    print(pose, "raw size", src.size)
    keyed = flood_key(src)
    keyed.save(CHAR / f"guardian-{pose}.png")
    print(pose, "keyed size", keyed.size)
    bbox, center = find_mouth(keyed)
    mouths[pose] = dict(bbox=bbox, center=center, size=keyed.size)
    print(pose, "mouth bbox", bbox, "center", center)
    dbg = keyed.copy()
    d = ImageDraw.Draw(dbg)
    d.rectangle(bbox, outline=(255, 0, 0), width=4)
    dbg.thumbnail((360, 360))
    debug.append(dbg)

sheet = Image.new("RGBA", (360 * 3, 360 * 2), (40, 40, 40, 255))
for i, im in enumerate(debug):
    sheet.paste(im, ((i % 3) * 360, (i // 3) * 360), im)
sheet.convert("RGB").save(CHAR / "mouth-debug.png")
(CHAR / "mouths.json").write_text(json.dumps(mouths, indent=1))
print("saved mouths.json and mouth-debug.png")
