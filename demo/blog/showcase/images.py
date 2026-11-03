"""
Procedural images for the showcase seed: landscapes, cityscapes and
abstract artwork drawn with Pillow. Generated on the fly, so the
repository ships no binary assets and every picture is free to use in
screenshots. Each scene is deterministic for a given seed.
"""

import io
import math
import random

from PIL import Image, ImageChops, ImageDraw, ImageFilter

WIDTH, HEIGHT = 1600, 1066
# Polygons are drawn on masks at this multiple, then scaled down, so
# their edges are antialiased.
SUPERSAMPLE = 3


def hex_to_rgb(value):
    value = value.lstrip("#")
    return tuple(int(value[i : i + 2], 16) for i in (0, 2, 4))


def mix(a, b, t):
    return tuple(round(x + (y - x) * t) for x, y in zip(a, b))


def vertical_gradient(size, stops):
    """A top-to-bottom gradient through (position, color) stops."""
    width, height = size
    column = Image.new("RGB", (1, height))
    pixels = column.load()
    stops = [(p, hex_to_rgb(c) if isinstance(c, str) else c) for p, c in stops]

    for y in range(height):
        t = y / max(1, height - 1)
        for (p0, c0), (p1, c1) in zip(stops, stops[1:]):
            if p0 <= t <= p1:
                pixels[0, y] = mix(c0, c1, (t - p0) / max(1e-6, p1 - p0))
                break
        else:
            pixels[0, y] = stops[-1][1] if t > stops[-1][0] else stops[0][1]

    return column.resize(size, Image.BILINEAR)


def polygon_mask(size, points):
    width, height = size
    big = Image.new("L", (width * SUPERSAMPLE, height * SUPERSAMPLE), 0)
    ImageDraw.Draw(big).polygon(
        [(x * SUPERSAMPLE, y * SUPERSAMPLE) for x, y in points], fill=255
    )
    return big.resize(size, Image.LANCZOS)


def ellipse_mask(size, box, blur=0):
    width, height = size
    big = Image.new("L", (width * SUPERSAMPLE, height * SUPERSAMPLE), 0)
    ImageDraw.Draw(big).ellipse([v * SUPERSAMPLE for v in box], fill=255)
    mask = big.resize(size, Image.LANCZOS)
    return mask.filter(ImageFilter.GaussianBlur(blur)) if blur else mask


def fill(img, mask, color, opacity=1.0):
    """Paint a color (or an image) through a mask."""
    layer = (
        Image.new("RGB", img.size, color)
        if not isinstance(color, Image.Image)
        else color
    )
    if opacity < 1:
        mask = mask.point(lambda v: round(v * opacity))
    img.paste(layer, (0, 0), mask)


def glow(img, center, radius, color, strength=0.8):
    cx, cy = center
    mask = ellipse_mask(
        img.size,
        (cx - radius, cy - radius, cx + radius, cy + radius),
        blur=radius * 0.6,
    )
    fill(img, mask, color, strength)


def ridge(rng, width, base, roughness, amplitude, steps=9):
    """A mountain ridge by midpoint displacement: (x, y) points."""
    points = [base + rng.uniform(-amplitude, amplitude) for _ in range(2)]
    spread = amplitude
    for _ in range(steps):
        nxt = []
        for a, b in zip(points, points[1:]):
            nxt += [a, (a + b) / 2 + rng.uniform(-spread, spread)]
        points = nxt + [points[-1]]
        spread *= roughness
    step = width / (len(points) - 1)
    return [(i * step, y) for i, y in enumerate(points)]


def fog(img, top, bottom, color, opacity):
    band = (
        vertical_gradient(
            (1, img.height),
            [
                (0, (0, 0, 0)),
                (top / img.height, (0, 0, 0)),
                (bottom / img.height, (255, 255, 255)),
                (1, (255, 255, 255)),
            ],
        )
        .convert("L")
        .resize(img.size)
    )
    fill(img, band, color, opacity)


def grain(img, amount=10, seed=0):
    """Film grain, so flat fills read like a photograph or a print."""
    random.seed(seed)
    noise = Image.effect_noise(img.size, 64).convert("RGB")
    noise = noise.point(lambda v: 128 + (v - 128) * amount // 64)
    return ImageChops.overlay(img, noise)


def stars(img, rng, count, max_y):
    draw = ImageDraw.Draw(img)
    for _ in range(count):
        x, y = rng.uniform(0, img.width), rng.uniform(0, max_y) ** 1.15 / max_y**0.15
        r = rng.choice((0.6, 0.8, 1.0, 1.0, 1.4, 1.8))
        b = rng.randint(150, 255)
        draw.ellipse((x - r, y - r, x + r, y + r), fill=(b, b, min(255, b + 10)))


# Scenes


def mountains(seed, sky, sun, layers, sun_at=(0.68, 0.38), with_stars=False):
    rng = random.Random(seed)
    img = vertical_gradient((WIDTH, HEIGHT), sky)
    if with_stars:
        stars(img, rng, 260, HEIGHT * 0.55)
    sx, sy = sun_at[0] * WIDTH, sun_at[1] * HEIGHT
    glow(img, (sx, sy), 260, hex_to_rgb(sun), 0.45)
    fill(
        img,
        ellipse_mask(img.size, (sx - 54, sy - 54, sx + 54, sy + 54)),
        hex_to_rgb(sun),
        0.95,
    )

    count = len(layers)
    for i, color in enumerate(layers):
        depth = i / max(1, count - 1)
        base = HEIGHT * (0.46 + 0.12 * i)
        amp = HEIGHT * (0.2 - 0.03 * i)
        line = ridge(rng, WIDTH, base, 0.58 + 0.04 * depth, amp, steps=10)
        mask = polygon_mask(img.size, line + [(WIDTH, HEIGHT), (0, HEIGHT)])
        fill(img, mask, hex_to_rgb(color))
        if i < count - 1:
            fog(img, base - amp, base + amp * 2.5, hex_to_rgb(layers[0]), 0.35)

    return grain(img, 9, seed)


def dunes(seed):
    rng = random.Random(seed)
    img = vertical_gradient(
        (WIDTH, HEIGHT),
        [(0, "#f6d9b8"), (0.45, "#f3b98d"), (0.6, "#ec9f73"), (1, "#c96c4a")],
    )
    sx, sy = WIDTH * 0.3, HEIGHT * 0.36
    glow(img, (sx, sy), 300, (255, 240, 214), 0.5)
    fill(
        img,
        ellipse_mask(img.size, (sx - 70, sy - 70, sx + 70, sy + 70)),
        (255, 246, 228),
    )

    colors = ["#e8a77a", "#dc8d61", "#c9744b", "#b05e3b", "#8f4a2f"]
    for i, color in enumerate(colors):
        base = HEIGHT * (0.5 + 0.1 * i)
        freq = rng.uniform(1.1, 2.2) / WIDTH
        phase = rng.uniform(0, math.tau)
        amp = HEIGHT * rng.uniform(0.03, 0.06)
        pts = [
            (
                x,
                base
                + amp * math.sin(x * freq * math.tau + phase)
                + amp * 0.4 * math.sin(x * freq * 3.1 * math.tau),
            )
            for x in range(0, WIDTH + 20, 20)
        ]
        mask = polygon_mask(img.size, pts + [(WIDTH, HEIGHT), (0, HEIGHT)])
        shade = vertical_gradient(
            (WIDTH, HEIGHT),
            [
                (0, mix(hex_to_rgb(color), (255, 230, 200), 0.25)),
                (1, hex_to_rgb(color)),
            ],
        )
        fill(img, mask, shade)
    return grain(img, 10, seed)


def ocean(seed, sky, sea, sun):
    rng = random.Random(seed)
    horizon = int(HEIGHT * 0.58)
    img = vertical_gradient((WIDTH, HEIGHT), sky)
    sea_img = vertical_gradient((WIDTH, HEIGHT - horizon), sea)
    img.paste(sea_img, (0, horizon))

    sx, sy = WIDTH * 0.5, horizon - 70
    glow(img, (sx, sy), 340, hex_to_rgb(sun), 0.5)
    sun_mask = ellipse_mask(img.size, (sx - 80, sy - 80, sx + 80, sy + 80))
    sun_mask.paste(0, (0, horizon, WIDTH, HEIGHT))
    fill(img, sun_mask, hex_to_rgb(sun))

    # The sun's reflection: short horizontal strokes that spread out
    # toward the viewer.
    streaks = Image.new("L", img.size, 0)
    draw = ImageDraw.Draw(streaks)
    for _ in range(420):
        t = rng.random() ** 1.6
        y = horizon + 4 + t * (HEIGHT - horizon)
        half = 30 + t * 260
        x = sx + rng.gauss(0, half * 0.5)
        length = rng.uniform(8, 40 + t * 120)
        draw.line(
            (x - length / 2, y, x + length / 2, y),
            fill=rng.randint(90, 230),
            width=1 + int(t * 3),
        )
    fill(img, streaks.filter(ImageFilter.GaussianBlur(1.2)), hex_to_rgb(sun), 0.85)

    # A far headland on the left.
    line = ridge(rng, WIDTH * 0.45, horizon - 28, 0.5, 26, steps=7)
    line = [(x, min(y, horizon)) for x, y in line] + [
        (WIDTH * 0.45, horizon),
        (0, horizon),
    ]
    fill(
        img,
        polygon_mask(img.size, line),
        mix(hex_to_rgb(sky[-1][1]), (40, 30, 60), 0.55),
    )
    return grain(img, 8, seed)


def forest(seed):
    rng = random.Random(seed)
    img = vertical_gradient(
        (WIDTH, HEIGHT), [(0, "#dfe8e4"), (0.5, "#b8cdc6"), (1, "#7e9c93")]
    )
    glow(img, (WIDTH * 0.75, HEIGHT * 0.2), 380, (255, 250, 235), 0.6)
    layers = ["#9db5ad", "#7c9a90", "#5a7a70", "#3c5a51", "#223b34"]
    for i, color in enumerate(layers):
        base = HEIGHT * (0.45 + 0.12 * i)
        scale = 0.6 + 0.35 * i
        mask = Image.new("L", (WIDTH * SUPERSAMPLE, HEIGHT * SUPERSAMPLE), 0)
        draw = ImageDraw.Draw(mask)
        s = SUPERSAMPLE
        x = rng.uniform(-40, 0)
        while x < WIDTH + 40:
            h = rng.uniform(120, 260) * scale
            w = h * rng.uniform(0.28, 0.36)
            top = base - h
            # A pine: stacked triangles that widen toward the ground.
            for tier in range(4):
                ty = top + tier * h * 0.2
                tw = w * (0.45 + tier * 0.2)
                draw.polygon(
                    [
                        (x * s, ty * s),
                        ((x - tw / 2) * s, (ty + h * 0.38) * s),
                        ((x + tw / 2) * s, (ty + h * 0.38) * s),
                    ],
                    fill=255,
                )
            draw.rectangle(
                (
                    (x - w * 0.05) * s,
                    (base - h * 0.1) * s,
                    (x + w * 0.05) * s,
                    HEIGHT * s,
                ),
                fill=255,
            )
            x += w * rng.uniform(0.35, 0.8)
        draw.rectangle((0, base * s, WIDTH * s, HEIGHT * s), fill=255)
        fill(img, mask.resize(img.size, Image.LANCZOS), hex_to_rgb(color))
        if i < len(layers) - 1:
            fog(img, base - 120 * scale, base + 60, (226, 234, 230), 0.4)
    return grain(img, 9, seed)


def city(seed):
    rng = random.Random(seed)
    img = vertical_gradient(
        (WIDTH, HEIGHT),
        [
            (0, "#0b1026"),
            (0.45, "#1f2456"),
            (0.7, "#5b3a7a"),
            (0.82, "#d36f6f"),
            (1, "#f2a65a"),
        ],
    )
    stars(img, rng, 180, HEIGHT * 0.4)
    mx, my = WIDTH * 0.2, HEIGHT * 0.18
    glow(img, (mx, my), 120, (230, 230, 255), 0.35)
    fill(
        img,
        ellipse_mask(img.size, (mx - 34, my - 34, mx + 34, my + 34)),
        (244, 240, 230),
    )

    for layer, (color, base, hmin, hmax) in enumerate(
        [
            ("#2a2350", 0.72, 80, 260),
            ("#191636", 0.8, 120, 420),
            ("#0c0a1d", 0.9, 60, 300),
        ]
    ):
        windows = Image.new("L", img.size, 0)
        wdraw = ImageDraw.Draw(windows)
        mask = Image.new("L", img.size, 0)
        draw = ImageDraw.Draw(mask)
        x = rng.uniform(-30, 0)
        while x < WIDTH:
            w = rng.uniform(50, 130)
            h = rng.uniform(hmin, hmax)
            top = HEIGHT * base - h
            draw.rectangle((x, top, x + w, HEIGHT), fill=255)
            if rng.random() < 0.25:
                draw.rectangle(
                    (x + w * 0.4, top - h * 0.15, x + w * 0.6, top), fill=255
                )
            if layer > 0:
                for wy in range(int(top + 12), HEIGHT, 16):
                    for wx in range(int(x + 8), int(x + w - 8), 12):
                        if rng.random() < 0.22:
                            wdraw.rectangle(
                                (wx, wy, wx + 5, wy + 7), fill=rng.randint(140, 255)
                            )
            x += w + rng.uniform(2, 14)
        fill(img, mask, hex_to_rgb(color))
        lit = ImageChops.multiply(windows, mask)
        fill(img, lit.filter(ImageFilter.GaussianBlur(3)), (255, 196, 110), 0.6)
        fill(img, lit, (255, 214, 140))
    return grain(img, 10, seed)


def blobs(seed, background, colors):
    rng = random.Random(seed)
    img = Image.new("RGB", (WIDTH, HEIGHT), hex_to_rgb(background))
    for color in colors:
        r = rng.uniform(260, 520)
        cx, cy = rng.uniform(0, WIDTH), rng.uniform(0, HEIGHT)
        mask = ellipse_mask(
            img.size, (cx - r, cy - r * rng.uniform(0.7, 1.2), cx + r, cy + r), blur=0
        )
        fill(img, mask, hex_to_rgb(color), 0.9)
    img = img.filter(ImageFilter.GaussianBlur(140))
    return grain(img, 14, seed)


def bauhaus(seed, background, palette):
    rng = random.Random(seed)
    img = Image.new("RGB", (WIDTH, HEIGHT), hex_to_rgb(background))
    cell = HEIGHT / 3
    cols = math.ceil(WIDTH / cell)
    for row in range(3):
        for col in range(cols):
            x0, y0 = col * cell, row * cell
            x1, y1 = x0 + cell, y0 + cell
            color = hex_to_rgb(rng.choice(palette))
            accent = hex_to_rgb(rng.choice(palette))
            kind = rng.choice(
                ("quarter", "half", "circle", "square", "stripe", "empty")
            )
            square = polygon_mask(img.size, [(x0, y0), (x1, y0), (x1, y1), (x0, y1)])
            if kind == "empty":
                continue
            if kind == "square":
                fill(img, square, color)
                inset = cell * 0.25
                fill(
                    img,
                    polygon_mask(
                        img.size,
                        [
                            (x0 + inset, y0 + inset),
                            (x1 - inset, y0 + inset),
                            (x1 - inset, y1 - inset),
                            (x0 + inset, y1 - inset),
                        ],
                    ),
                    accent,
                )
            elif kind == "circle":
                fill(img, square, color)
                pad = cell * 0.12
                fill(
                    img,
                    ellipse_mask(img.size, (x0 + pad, y0 + pad, x1 - pad, y1 - pad)),
                    accent,
                )
            elif kind == "quarter":
                corner = rng.choice(((x0, y0), (x1, y0), (x0, y1), (x1, y1)))
                m = ellipse_mask(
                    img.size,
                    (
                        corner[0] - cell,
                        corner[1] - cell,
                        corner[0] + cell,
                        corner[1] + cell,
                    ),
                )
                fill(img, ImageChops.multiply(m, square), color)
            elif kind == "half":
                m = ellipse_mask(
                    img.size, (x0, y0 + cell * 0.5 - cell * 0.5, x1, y1 + cell * 0.5)
                )
                top = polygon_mask(
                    img.size,
                    [(x0, y0 + cell / 2), (x1, y0 + cell / 2), (x1, y1), (x0, y1)],
                )
                fill(
                    img, ImageChops.multiply(ImageChops.multiply(m, top), square), color
                )
            else:
                for k in range(4):
                    sy = y0 + cell * (0.15 + k * 0.2)
                    fill(
                        img,
                        polygon_mask(
                            img.size,
                            [
                                (x0 + cell * 0.12, sy),
                                (x1 - cell * 0.12, sy),
                                (x1 - cell * 0.12, sy + cell * 0.09),
                                (x0 + cell * 0.12, sy + cell * 0.09),
                            ],
                        ),
                        color,
                    )
    return grain(img, 12, seed)


def sphere(seed, background, color, floor):
    """A soft-lit sphere on a seamless backdrop, like a product render."""
    img = vertical_gradient(
        (WIDTH, HEIGHT),
        [(0, background), (0.62, background), (0.72, floor), (1, floor)],
    )
    cx, cy, r = WIDTH * 0.5, HEIGHT * 0.5, HEIGHT * 0.25
    shadow = ellipse_mask(
        img.size, (cx - r * 1.1, cy + r * 0.82, cx + r * 1.1, cy + r * 1.12), blur=28
    )
    fill(img, shadow, (20, 20, 30), 0.35)

    base = hex_to_rgb(color)
    light = mix(base, (255, 255, 255), 0.55)
    dark = mix(base, (10, 10, 25), 0.55)
    # Shade the ball with a radial gradient offset toward the light.
    grad = Image.radial_gradient("L").resize((int(r * 2.6), int(r * 2.6)))
    shading = Image.new("L", img.size, 255)
    shading.paste(grad, (int(cx - r * 1.6), int(cy - r * 1.65)))
    ball = Image.composite(
        Image.new("RGB", img.size, dark), Image.new("RGB", img.size, light), shading
    )
    ball = Image.blend(ball, Image.new("RGB", img.size, base), 0.25)
    fill(img, ellipse_mask(img.size, (cx - r, cy - r, cx + r, cy + r)), ball)
    return grain(img, 7, seed)


SCENES = {
    "alpine-dawn": lambda: mountains(
        11,
        [(0, "#f7c8a9"), (0.35, "#f4a59a"), (0.6, "#c98aa6"), (1, "#7d6b9e")],
        "#fff1d6",
        ["#c79bb2", "#9c7aa0", "#6f5a8a", "#463d6b", "#2a2547"],
    ),
    "blue-ridge": lambda: mountains(
        23,
        [(0, "#e9f1f7"), (0.5, "#c3d8e8"), (1, "#8fb3cf")],
        "#ffffff",
        ["#a9c3d8", "#7fa1bf", "#5a7fa3", "#3b5f84", "#223f5f"],
        sun_at=(0.25, 0.3),
    ),
    "night-peaks": lambda: mountains(
        37,
        [(0, "#060a1f"), (0.5, "#14214a"), (0.85, "#2f4377"), (1, "#40568a")],
        "#f3f0dc",
        ["#2b3a66", "#1f2b4f", "#151f3b", "#0c1428"],
        sun_at=(0.78, 0.22),
        with_stars=True,
    ),
    "desert-dunes": lambda: dunes(41),
    "golden-coast": lambda: ocean(
        53,
        [(0, "#2d3561"), (0.4, "#c05c7e"), (0.8, "#f3826f"), (1, "#ffb961")],
        [(0, "#e2856f"), (0.25, "#9c4f6e"), (1, "#2d2a4f")],
        "#ffe2a8",
    ),
    "pale-sea": lambda: ocean(
        59,
        [(0, "#9fc5e8"), (0.7, "#dbe9f4"), (1, "#f7efe2")],
        [(0, "#a7c7d9"), (1, "#3f6f8f")],
        "#fffaf0",
    ),
    "misty-forest": lambda: forest(61),
    "city-dusk": lambda: city(71),
    "aurora": lambda: blobs(
        83, "#0f1530", ["#3dd6a4", "#2f80ed", "#7b5cff", "#14b8a6", "#1e3a8a"]
    ),
    "sorbet": lambda: blobs(
        89, "#fde2e4", ["#ff9a8b", "#ffd6a5", "#cdb4db", "#a0c4ff", "#ffafcc"]
    ),
    "ember": lambda: blobs(
        97, "#1b0b10", ["#ff6b35", "#f7c59f", "#d7263d", "#8c1c13", "#f46036"]
    ),
    "bauhaus-warm": lambda: bauhaus(
        101, "#f4ece1", ["#e4572e", "#f3a712", "#29335c", "#a8c686", "#1b1b1e"]
    ),
    "bauhaus-cool": lambda: bauhaus(
        107, "#eef1f4", ["#2364aa", "#3da5d9", "#73bfb8", "#fec601", "#ea7317"]
    ),
    "terracotta-sphere": lambda: sphere(113, "#efe3d6", "#d9734e", "#e2d2c1"),
    "lilac-sphere": lambda: sphere(127, "#e7e4f4", "#8e7cc3", "#d8d3ec"),
}


def render(name, quality=86):
    """The scene as JPEG bytes."""
    buffer = io.BytesIO()
    SCENES[name]().save(
        buffer, "JPEG", quality=quality, optimize=True, progressive=True
    )
    return buffer.getvalue()
