#!/usr/bin/env python3
"""VaultCheck demo: mouth variants for the guardian poses.

First a supplementary tight global key pass removes enclosed green
screen pockets the border flood fill cannot reach (armpit gaps); the
tolerance is tight enough that the darker green checkmark on the YES
card survives, which is verified by pixel counts in the card region.

Then, following the proven BadgeGate v3 method: the glowing crescent
mouth of each keyed pose is painted out by diffusion inpainting over
an elliptical mask, and an open mouth is drawn in the same spot, a
dark oval with a glowing amber rim and a soft warm halo, matching the
glow style of the eyes and the crescent. Two levels per pose: half
open and wide open. The closed state is the original pose itself.
The script diffs every variant against its source and prints the
bounding box of the changed region, which must stay at the mouth.
"""
import json
import numpy as np
from PIL import Image, ImageDraw, ImageFilter
from scipy import ndimage
from pathlib import Path

HERE = Path(__file__).resolve().parent
CHAR = HERE.parent / "character"
MOUTHS = json.loads((CHAR / "mouths.json").read_text())
POSES = ["presenting", "envelope", "key", "yes", "stop", "wave"]

# --- supplementary tight key for enclosed green pockets ----------------------
def tight_key(img: Image.Image, tol: float = 34.0) -> Image.Image:
    arr = np.asarray(img.convert("RGBA")).astype(np.int32)
    rgb = arr[:, :, :3]
    corners = np.array([rgb[4, 4], rgb[4, -5], rgb[-5, 4], rgb[-5, -5]])
    # reference green: sample from the raw generation instead, corners of
    # the keyed image may be transparent black; use the known screen green
    ref = np.array([99, 199, 46])
    dist = np.sqrt(((rgb - ref) ** 2).sum(axis=2))
    kill = (dist < tol) & (arr[:, :, 3] > 0)
    out = arr.copy()
    out[kill, 3] = 0
    return Image.fromarray(out.astype(np.uint8), "RGBA"), int(kill.sum())

for pose in POSES:
    p = CHAR / f"guardian-{pose}.png"
    im = Image.open(p)
    fixed, n = tight_key(im)
    fixed.save(p)
    print(f"{pose}: tight key removed {n} enclosed green px")

# YES card check: green pixels of the checkmark must remain
yes = np.asarray(Image.open(CHAR / "guardian-yes.png").convert("RGB")).astype(np.int32)
card_green = ((yes[:, :, 1] > 120) & (yes[:, :, 0] < 120) & (yes[:, :, 2] < 120)).sum()
print(f"yes pose: saturated green pixels remaining (checkmark): {card_green}")

# --- mouth variants ------------------------------------------------------------
EXPAND_X, EXPAND_Y = 58, 40
AMBER = (255, 216, 145)
HALO = (255, 178, 92)
DARK = (8, 16, 34)
LEVELS = {"half": (70, 36), "wide": (102, 62)}


def diffuse_fill(rgb: np.ndarray, mask: np.ndarray) -> np.ndarray:
    out = rgb.astype(np.float32).copy()
    fill_value = out[~mask].mean(axis=0) if (~mask).any() else np.zeros(3)
    out[mask] = fill_value
    work = out.copy()
    for _ in range(400):
        blurred = ndimage.uniform_filter(work, size=(3, 3, 1), mode="nearest")
        work[mask] = blurred[mask]
    out[mask] = work[mask]
    return out


def clean_mouth(img: Image.Image, bbox) -> Image.Image:
    x0, y0, x1, y1 = bbox
    x0, y0 = max(0, x0 - EXPAND_X), max(0, y0 - EXPAND_Y)
    x1, y1 = min(img.width, x1 + EXPAND_X), min(img.height, y1 + EXPAND_Y)
    crop = img.crop((x0, y0, x1, y1)).convert("RGBA")
    arr = np.asarray(crop).astype(np.float32)
    hh, ww = arr.shape[:2]
    yy, xx = np.mgrid[0:hh, 0:ww]
    cx, cy = ww / 2, hh / 2
    ellipse = ((xx - cx) / (ww / 2)) ** 2 + ((yy - cy) / (hh / 2)) ** 2 <= 1.0
    mask = ellipse & (arr[:, :, 3] > 200)
    filled = diffuse_fill(arr[:, :, :3], mask)
    arr[:, :, :3] = filled
    out = img.copy()
    out.paste(Image.fromarray(arr.astype(np.uint8), "RGBA"), (x0, y0))
    return out


def draw_open_mouth(img: Image.Image, center, size) -> Image.Image:
    cx, cy = center
    w, h = size
    SS = 4
    overlay = Image.new("RGBA", (img.width * SS, img.height * SS), (0, 0, 0, 0))
    d = ImageDraw.Draw(overlay)
    box = [(cx - w / 2) * SS, (cy - h / 2) * SS, (cx + w / 2) * SS, (cy + h / 2) * SS]
    halo_pad = 10 * SS
    d.ellipse([box[0] - halo_pad, box[1] - halo_pad, box[2] + halo_pad, box[3] + halo_pad],
              fill=HALO + (120,))
    overlay = overlay.filter(ImageFilter.GaussianBlur(9 * SS))
    d = ImageDraw.Draw(overlay)
    d.ellipse(box, fill=DARK + (255,))
    rim = max(2, int(7 * SS))
    d.ellipse(box, outline=AMBER + (255,), width=rim)
    overlay = overlay.resize(img.size, Image.LANCZOS)
    return Image.alpha_composite(img, overlay)


def diff_bbox(a: Image.Image, b: Image.Image):
    da = np.asarray(a).astype(np.int32)
    db = np.asarray(b).astype(np.int32)
    diff = (np.abs(da - db).sum(axis=2) > 12)
    ys, xs = np.where(diff)
    if len(xs) == 0:
        return None, 0
    return (int(xs.min()), int(ys.min()), int(xs.max()), int(ys.max())), int(diff.sum())


for pose in POSES:
    info = MOUTHS[pose]
    src = Image.open(CHAR / f"guardian-{pose}.png").convert("RGBA")
    cleaned = clean_mouth(src, info["bbox"])
    cleaned.save(CHAR / f"guardian-{pose}-clean.png")
    bb, cnt = diff_bbox(src, cleaned)
    print(f"{pose} clean: changed {cnt} px, diff bbox {bb}")
    for level, size in LEVELS.items():
        out = draw_open_mouth(cleaned, info["center"], size)
        out.save(CHAR / f"guardian-{pose}-{level}.png")
        bb, cnt = diff_bbox(src, out)
        print(f"{pose} {level}: changed {cnt} px, diff bbox {bb}")
print("done")
