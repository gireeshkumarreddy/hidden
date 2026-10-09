"""Procedural bougainvillea cut-outs (transparent WebP) for the Hidden Stories site.

Usage: python -I bougainvillea.py <out_dir> [preview]
Layers are drawn back-to-front at 2x and downsampled. Each bract is an ovate,
papery petal with a soft highlight, darker rim and veins; clusters of three
surround a tiny cream flower. Leaves and stems sit behind.
"""
import math, os, random, sys
import numpy as np
from PIL import Image, ImageDraw, ImageFilter

OUT = sys.argv[1]
SS = 2  # supersampling


def bezier(p0, p1, p2, p3, n=18):
    pts = []
    for i in range(n + 1):
        t = i / n
        a, b, c, d = (1 - t) ** 3, 3 * (1 - t) ** 2 * t, 3 * (1 - t) * t * t, t ** 3
        pts.append((a * p0[0] + b * p1[0] + c * p2[0] + d * p3[0], a * p0[1] + b * p1[1] + c * p2[1] + d * p3[1]))
    return pts


def petal_shape(length, width, tip=0.08):
    """Ovate bract pointing along +y from the origin."""
    w = width / 2
    right = bezier((0, 0), (w * 1.25, length * 0.12), (w * 1.05, length * 0.78), (0, length))
    left = bezier((0, length), (-w * 1.05, length * 0.78), (-w * 1.25, length * 0.12), (0, 0))
    return right + left[1:]


def transform(points, angle, origin, scale=1.0):
    ca, sa = math.cos(angle), math.sin(angle)
    ox, oy = origin
    return [(ox + (x * ca - y * sa) * scale, oy + (x * sa + y * ca) * scale) for x, y in points]


def hsv(h, s, v, a=255):
    import colorsys
    r, g, b = colorsys.hsv_to_rgb(h % 1, max(0, min(1, s)), max(0, min(1, v)))
    return (int(r * 255), int(g * 255), int(b * 255), a)


class Layer:
    def __init__(self, size):
        self.base = Image.new('RGBA', size, (0, 0, 0, 0))
        self.light = Image.new('RGBA', size, (0, 0, 0, 0))
        self.ink = Image.new('RGBA', size, (0, 0, 0, 0))
        self.db, self.dl, self.di = (ImageDraw.Draw(im) for im in (self.base, self.light, self.ink))

    def compose(self, blur=0.0, light_blur=6, darken=1.0):
        light = self.light.filter(ImageFilter.GaussianBlur(light_blur * SS))
        # Keep highlights inside the petals they belong to.
        la = np.array(light, dtype=np.float32)
        ba = np.array(self.base, dtype=np.float32)
        la[..., 3] *= ba[..., 3] / 255.0
        out = Image.alpha_composite(self.base, Image.fromarray(la.astype(np.uint8)))
        out = Image.alpha_composite(out, self.ink)
        if darken != 1.0:
            arr = np.array(out, dtype=np.float32)
            arr[..., :3] *= darken
            out = Image.fromarray(np.clip(arr, 0, 255).astype(np.uint8))
        if blur:
            out = out.filter(ImageFilter.GaussianBlur(blur * SS))
        return out


def draw_leaf(layer, origin, angle, size, rng):
    length, width = size, size * rng.uniform(0.42, 0.55)
    pts = transform(petal_shape(length, width), angle, origin)
    v = rng.uniform(0.28, 0.45)
    layer.db.polygon(pts, fill=hsv(rng.uniform(0.25, 0.31), rng.uniform(0.45, 0.65), v))
    inner = transform(petal_shape(length * 0.8, width * 0.45), angle, transform([(0, length * 0.08)], angle, origin)[0])
    layer.dl.polygon(inner, fill=hsv(0.24, 0.35, v + 0.22, 150))
    tip = transform([(0, length * 0.95)], angle, origin)[0]
    layer.di.line([origin, tip], fill=hsv(0.22, 0.3, v + 0.3, 140), width=max(1, int(size * 0.025)))


def draw_bract_group(layer, centre, size, hue, rng, value=1.0):
    spin = rng.uniform(0, math.tau)
    for k in range(3):
        angle = spin + k * math.tau / 3 + rng.uniform(-0.25, 0.25)
        length = size * rng.uniform(0.85, 1.15)
        width = length * rng.uniform(0.78, 0.95)
        pts = transform(petal_shape(length, width), angle, centre)
        h = hue + rng.uniform(-0.018, 0.018)
        s = rng.uniform(0.70, 0.90)
        v = rng.uniform(0.80, 1.0) * value
        layer.db.polygon(pts, fill=hsv(h, s, v, 246))
        # Highlight: a narrower inner petal, blurred later.
        inner = transform(petal_shape(length * 0.72, width * 0.5), angle, transform([(0, length * 0.12)], angle, centre)[0])
        layer.dl.polygon(inner, fill=hsv(h - 0.01, s * 0.55, min(1, v * 1.25), 170))
        # Rim and veins.
        layer.di.line(pts + [pts[0]], fill=hsv(h + 0.01, s, v * 0.55, 90), width=max(1, int(size * 0.035)))
        for side in (-0.28, 0, 0.28):
            vein = [transform([(side * width * t * (1 - t) * 2.2, length * t)], angle, centre)[0] for t in np.linspace(0.06, 0.82, 8)]
            layer.di.line(vein, fill=hsv(h + 0.015, s, v * 0.6, 70), width=max(1, int(size * 0.02)))
    # Tiny cream flower at the heart of the cluster.
    r = size * 0.16
    star = [(centre[0] + math.cos(spin + i * math.pi / 5) * (r if i % 2 == 0 else r * 0.45),
             centre[1] + math.sin(spin + i * math.pi / 5) * (r if i % 2 == 0 else r * 0.45)) for i in range(10)]
    layer.di.polygon(star, fill=(250, 244, 226, 235))
    layer.di.ellipse([centre[0] - r * 0.22, centre[1] - r * 0.22, centre[0] + r * 0.22, centre[1] + r * 0.22], fill=(232, 206, 120, 255))


def clump(layers, centre, radius, petal, hue, rng, leaves=True):
    """A loose panicle: bract groups scattered with a soft falloff, leaves around the edge."""
    back, mid, front = layers
    cx, cy = centre
    if leaves:
        for _ in range(rng.randint(4, 8)):
            a = rng.uniform(0, math.tau); d = radius * rng.uniform(0.55, 1.15)
            draw_leaf(back, (cx + math.cos(a) * d, cy + math.sin(a) * d), a + rng.uniform(-0.6, 0.6) - math.pi / 2, petal * rng.uniform(1.5, 2.2), rng)
    count = int(radius * radius / (petal * petal) * 1.15) + 3
    for _ in range(count):
        a = rng.uniform(0, math.tau); d = radius * math.sqrt(rng.random()) * rng.uniform(0.7, 1.05)
        x, y = cx + math.cos(a) * d, cy + math.sin(a) * d * 0.85
        edge = d / radius
        target = back if edge > 0.8 and rng.random() < 0.6 else (front if edge < 0.45 and rng.random() < 0.55 else mid)
        value = 0.78 if target is back else (0.92 if target is mid else 1.0)
        draw_bract_group(target, (x, y), petal * rng.uniform(0.75, 1.15), hue + rng.uniform(-0.01, 0.01), rng, value)


def spray(layers, start, control1, control2, end, size, hue, rng, density=1.0):
    """A branch drooping from its anchor, with clumps on short side shoots."""
    path = bezier(start, control1, control2, end, n=80)
    back = layers[0]
    back.di.line(path, fill=(96, 66, 46, 220), width=max(2, int(size * 0.12)))
    step = max(6, int(14 / density))
    for i in range(step // 2, len(path), step):
        x, y = path[i]
        t = i / len(path)
        radius = size * (2.6 + 1.6 * math.sin(min(1, t * 1.3) * math.pi)) * rng.uniform(0.8, 1.15)
        nx, ny = path[min(i + 1, len(path) - 1)][0] - x, path[min(i + 1, len(path) - 1)][1] - y
        norm = math.hypot(nx, ny) or 1
        side = rng.choice((-1, 1))
        off = radius * rng.uniform(0.3, 0.9)
        tip = (x + (-ny / norm) * off * side, y + (nx / norm) * off * side + radius * 0.35)
        back.di.line(bezier((x, y), (x, y + off * 0.3), tip, tip, n=10), fill=(96, 66, 46, 200), width=max(1, int(size * 0.07)))
        clump(layers, tip, radius, size, hue, rng)
    clump(layers, end, size * 2.2, size * 0.9, hue, rng)


def render(name, size, sprays, seed, hue=0.925):
    rng = random.Random(seed)
    W, H = size[0] * SS, size[1] * SS
    layers = [Layer((W, H)) for _ in range(3)]
    for (s, c1, c2, e, petal, density) in sprays:
        sc = lambda p: (p[0] * W, p[1] * H)
        spray(layers, sc(s), sc(c1), sc(c2), sc(e), petal * SS, hue, rng, density)
    back = layers[0].compose(blur=1.6, darken=0.82)
    mid = layers[1].compose(blur=0.4)
    front = layers[2].compose()
    image = Image.alpha_composite(Image.alpha_composite(back, mid), front)
    image = image.resize(size, Image.LANCZOS)
    path = os.path.join(OUT, f'{name}.webp')
    image.save(path, 'WEBP', quality=86, method=6)
    return path, image


if __name__ == '__main__':
    os.makedirs(OUT, exist_ok=True)
    outputs = []
    # Cascade hanging from the top-left corner.
    outputs.append(render('bougainvillea-cascade', (1400, 1100), [
        ((-0.05, -0.05), (0.25, 0.05), (0.35, 0.35), (0.30, 0.80), 30, 1.0),
        ((-0.05, 0.12), (0.18, 0.30), (0.14, 0.55), (0.10, 0.92), 26, 0.9),
        ((0.10, -0.05), (0.45, 0.02), (0.60, 0.15), (0.74, 0.38), 26, 0.9),
        ((-0.05, 0.30), (0.08, 0.45), (0.05, 0.62), (0.02, 0.75), 26, 0.9),
    ], seed=7))
    # Bush rising from the bottom edge.
    outputs.append(render('bougainvillea-bush', (1600, 900), [
        ((0.05, 1.05), (0.15, 0.70), (0.30, 0.45), (0.42, 0.30), 34, 1.25),
        ((0.30, 1.05), (0.40, 0.75), (0.55, 0.55), (0.70, 0.40), 32, 1.2),
        ((0.55, 1.05), (0.65, 0.80), (0.82, 0.62), (0.96, 0.55), 30, 1.1),
        ((-0.05, 0.90), (0.10, 0.80), (0.20, 0.75), (0.30, 0.70), 28, 1.0),
    ], seed=11))
    # A lighter spray for side edges.
    outputs.append(render('bougainvillea-spray', (900, 1200), [
        ((1.05, -0.05), (0.70, 0.15), (0.55, 0.40), (0.45, 0.70), 30, 1.15),
        ((1.05, 0.30), (0.80, 0.45), (0.70, 0.62), (0.62, 0.92), 26, 1.0),
    ], seed=23))
    for path, _ in outputs:
        print(path, os.path.getsize(path) // 1024, 'KB')
    if len(sys.argv) > 2:
        preview = Image.new('RGB', (1400 + 1600 + 900, 1200), (247, 242, 232))
        x = 0
        for _, im in outputs:
            preview.paste(im, (x, 0), im); x += im.width
        preview.thumbnail((1800, 1800)); preview.save(sys.argv[2], quality=85)
