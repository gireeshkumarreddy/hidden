"""Procedural cumulus cloud banks (transparent WebP) that rise from the bottom edge.

Usage: python -I clouds.py <out_dir> [preview]
"""
import os, sys
import cv2
import numpy as np

OUT = sys.argv[1]
os.makedirs(OUT, exist_ok=True)


def fractal(w, h, seed, octaves=6, base=6, persistence=0.55):
    rng = np.random.default_rng(seed)
    total = np.zeros((h, w), np.float32)
    amp, norm = 1.0, 0.0
    for o in range(octaves):
        cells = base * 2 ** o
        grid = rng.random((max(2, int(cells * h / w)) + 1, cells + 1)).astype(np.float32)
        total += cv2.resize(grid, (w, h), interpolation=cv2.INTER_CUBIC) * amp
        norm += amp
        amp *= persistence
    return total / norm


def smoothstep(a, b, x):
    t = np.clip((x - a) / (b - a), 0, 1)
    return t * t * (3 - 2 * t)


def bank(name, w, h, seed, height=0.62, softness=0.12, puff=5):
    noise = fractal(w, h, seed, base=puff, persistence=0.6)
    billow = 1 - np.abs(fractal(w, h, seed + 3, base=puff * 2, persistence=0.5) * 2 - 1)
    y = np.linspace(0, 1, h, dtype=np.float32)[:, None]
    skyline = height + 0.22 * (fractal(w, 1, seed + 9, octaves=3, base=3)[0][None, :] - 0.5)
    shape = smoothstep(1 - skyline - 0.1, 1 - skyline + 0.45, y)
    field = shape * 1.05 + (noise - 0.5) * 1.1 + (billow - 0.5) * 0.35
    density = smoothstep(0.5, 0.5 + softness, field)
    density = cv2.GaussianBlur(density, (0, 0), 1.0)
    # Puffy relief: light from above on a blurred height map of the cloud.
    relief = cv2.GaussianBlur(density * 0.6 + billow * 0.4 * density, (0, 0), 16)
    k = max(2, int(h * 0.012))
    top_light = np.clip((relief - np.roll(relief, k * 2, axis=0)) * 3.2, -1, 1)
    depth = cv2.GaussianBlur(density, (0, 0), h * 0.04)
    light = np.clip(0.83 + 0.24 * top_light - 0.26 * depth * y + 0.08 * billow * density, 0.55, 1.0)
    white = np.array([255, 255, 255], np.float32)
    shadow = np.array([222, 208, 196], np.float32)  # BGR blue-grey underside
    tone = (light - 0.55) / 0.45
    bgr = shadow + (white - shadow) * tone[..., None]
    alpha = np.clip(density * 255, 0, 255)
    image = np.dstack([bgr, alpha]).astype(np.uint8)
    path = os.path.join(OUT, f'{name}.webp')
    cv2.imwrite(path, image, [cv2.IMWRITE_WEBP_QUALITY, 82])
    return path, image


outputs = [bank('clouds-back', 2400, 900, 4, height=0.72, softness=0.2, puff=3),
           bank('clouds-front', 2400, 900, 12, height=0.55, softness=0.14, puff=4)]
for path, _ in outputs:
    print(path, os.path.getsize(path) // 1024, 'KB')
if len(sys.argv) > 2:
    sky = np.zeros((900, 2400, 3), np.float32); sky[:] = (215, 160, 90)  # BGR blue sky
    for _, im in outputs:
        a = im[..., 3:4].astype(np.float32) / 255
        sky = sky * (1 - a) + im[..., :3].astype(np.float32) * a
    cv2.imwrite(sys.argv[2], cv2.resize(sky.astype(np.uint8), (1200, 450)), [cv2.IMWRITE_JPEG_QUALITY, 85])
