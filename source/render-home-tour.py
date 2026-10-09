"""Render the Hidden Stories home-tour hero film from the site's own photographs.

Smooth sub-pixel Ken Burns moves (cv2.warpAffine), eased crossfades, a seamless
loop and a warm vintage grade. Raw frames are piped into ffmpeg (libx264).
Usage: python -I render_tour.py <assets_dir> <out_mp4> <width> <height> <crf> [poster_path]
"""
import math, subprocess, sys
import cv2
import numpy as np

assets, out_path, W, H, crf = sys.argv[1], sys.argv[2], int(sys.argv[3]), int(sys.argv[4]), sys.argv[5]
poster = sys.argv[6] if len(sys.argv) > 6 else None
FPS, D, X = 30, 4.6, 1.15  # clip length, crossfade length (seconds)

# (photo id, start (cx, cy, zoom), end (cx, cy, zoom)) — centres in 0..1 of the source.
CLIPS = [
    ('1505843513577-22bb7d21e455', (0.50, 0.55, 1.00), (0.50, 0.50, 1.20)),  # dusk arrival, push in
    ('1613977257363-707ba9348227', (0.38, 0.52, 1.14), (0.62, 0.52, 1.14)),  # pool lawn, glide right
    ('1600585154340-be6161a56a0c', (0.52, 0.50, 1.22), (0.48, 0.52, 1.03)),  # facade under the tree, pull out
    ('1600566753086-00f18fb6b3ea', (0.62, 0.55, 1.12), (0.40, 0.55, 1.12)),  # living room, glide left
    ('1600607687920-4e2a09cf159d', (0.42, 0.58, 1.02), (0.45, 0.62, 1.18)),  # dining, push in
    ('1616594039964-ae9021a400a0', (0.50, 0.36, 1.06), (0.50, 0.62, 1.10)),  # master suite, tilt down
    ('1600596542815-ffad4c1539a9', (0.44, 0.50, 1.04), (0.56, 0.54, 1.16)),  # poolside, drift in
]


def load(photo_id):
    for width in (3840, 3024, 2400, 1600):
        image = cv2.imread(f'{assets}/{photo_id}-{width}.webp', cv2.IMREAD_COLOR)
        if image is not None:
            return image
    raise FileNotFoundError(photo_id)


def grade(image):
    """Warm, slightly faded 'vintage professional' look, applied once per source."""
    f = image.astype(np.float32) / 255.0  # BGR
    luma = f @ np.array([0.114, 0.587, 0.299], np.float32)
    f = f * 0.86 + luma[..., None] * 0.14                      # gentle desaturation
    f = 0.5 + (f - 0.5) * 1.06                                 # soft contrast
    f = f * np.array([0.90, 0.99, 1.06], np.float32)           # warm: less blue, more red
    shadows = np.clip(1 - luma * 2.2, 0, 1)[..., None]
    f = f + shadows * np.array([0.020, 0.010, 0.000], np.float32)  # faintly cool-lifted shadows
    f = 0.035 + f * 0.93                                       # lifted blacks, softened whites
    return np.clip(f * 255, 0, 255).astype(np.uint8)


def prepare(image):
    """Downscale so the widest zoom maps roughly 1:1 onto the output (sharp, no aliasing)."""
    h, w = image.shape[:2]
    cover = max(W / w, H / h) * 1.25
    return cv2.resize(image, (round(w * cover), round(h * cover)), interpolation=cv2.INTER_AREA)


ease_motion = lambda t: 0.5 - 0.5 * math.cos(math.pi * min(1, max(0, t)))
ease_fade = lambda t: t * t * (3 - 2 * t)


def render(source, start, end, t):
    h, w = source.shape[:2]
    k = ease_motion(t / D) * 0.85 + (t / D) * 0.15
    cx, cy, zoom = (a + (b - a) * k for a, b in zip(start, end))
    scale = max(W / w, H / h) * zoom                 # output px per source px
    vw, vh = W / scale, H / scale                    # visible source window
    x0 = min(max(cx * w - vw / 2, 0), w - vw)
    y0 = min(max(cy * h - vh / 2, 0), h - vh)
    matrix = np.float32([[scale, 0, -x0 * scale], [0, scale, -y0 * scale]])
    return cv2.warpAffine(source, matrix, (W, H), flags=cv2.INTER_CUBIC, borderMode=cv2.BORDER_REFLECT)


sources = [prepare(grade(load(photo))) for photo, _, _ in CLIPS]
n = len(CLIPS)
L = n * (D - X)
starts = [i * (D - X) - X for i in range(n)]
yy, xx = np.mgrid[0:H, 0:W].astype(np.float32)
radius = np.sqrt(((xx - W / 2) / (W / 2)) ** 2 + ((yy - H / 2) / (H / 2)) ** 2)
vignette = (1 - 0.42 * np.clip((radius - 0.45) / 0.95, 0, 1) ** 1.6)[..., None].astype(np.float32)

ffmpeg = subprocess.Popen([
    'ffmpeg', '-v', 'error', '-y', '-f', 'rawvideo', '-pix_fmt', 'bgr24', '-s', f'{W}x{H}', '-r', str(FPS), '-i', '-',
    '-an', '-c:v', 'libx264', '-preset', 'slow', '-crf', crf, '-pix_fmt', 'yuv420p', '-profile:v', 'high',
    '-tune', 'film', '-movflags', '+faststart', out_path], stdin=subprocess.PIPE)

frames = round(L * FPS)
for index in range(frames):
    t = index / FPS
    layers = []
    for i in range(n):
        for offset in (0, L):  # clip 0 also re-enters at the end for a seamless loop
            local = t - (starts[i] + offset)
            if 0 <= local < D:
                layers.append((starts[i] + offset, i, local))
    layers.sort()
    frame = None
    for begin, i, local in layers:
        image = render(sources[i], CLIPS[i][1], CLIPS[i][2], local)
        if frame is None:
            frame = image
        else:
            alpha = ease_fade(min(1, (t - begin) / X))
            frame = cv2.addWeighted(image, alpha, frame, 1 - alpha, 0)
    frame = np.clip(frame.astype(np.float32) * vignette, 0, 255).astype(np.uint8)
    if index == 0 and poster:
        cv2.imwrite(poster, frame, [cv2.IMWRITE_WEBP_QUALITY, 82])
    ffmpeg.stdin.write(frame.tobytes())

ffmpeg.stdin.close()
ffmpeg.wait()
print(f'{out_path}: {frames} frames, {L:.2f}s loop, chapter starts:',
      ', '.join(f'{max(0, s):.2f}' for s in starts))
