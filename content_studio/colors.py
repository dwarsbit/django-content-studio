"""
Color parsing and conversion for ColorField and ColorValidator.

Colors are read in the CSS hex, rgb() and hsl() notations (the legacy
comma syntax and the modern space syntax with "/ alpha") and written in
one canonical form per format:

- hex: "#rrggbb", or "#rrggbbaa" with alpha
- rgb: "rgb(255, 0, 0)", or "rgba(255, 0, 0, 0.5)" with alpha
- hsl: "hsl(0, 100%, 50%)", or "hsla(0, 100%, 50%, 0.5)" with alpha

The admin's picker (frontend/src/lib/colors.ts) writes the same forms.
"""

import math
import re
from dataclasses import dataclass
from typing import Optional

COLOR_FORMATS = ("hex", "rgb", "hsl")

_HEX = re.compile(r"\A#([0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})\Z", re.IGNORECASE)
_FUNCTION = re.compile(r"\A(rgba?|hsla?)\((.*)\)\Z", re.IGNORECASE | re.DOTALL)
_NUMBER = r"[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?"
_ARGUMENT = re.compile(rf"\A({_NUMBER})(%|deg|grad|rad|turn)?\Z", re.IGNORECASE)

# Degrees per unit of a hue.
_HUE_UNITS = {None: 1, "deg": 1, "grad": 0.9, "rad": 180 / math.pi, "turn": 360}


@dataclass(frozen=True)
class Color:
    """
    A parsed color. space is "rgb" (channels 0-255) or "hsl" (hue
    0-360, saturation and lightness 0-100), as it was written, so a
    color is not converted when its format does not change. alpha is
    0-1.
    """

    space: str
    values: tuple
    alpha: float = 1.0
    # The format it was written in: "hex", "rgb" or "hsl".
    source: str = "rgb"


def _split_arguments(body: str) -> Optional[tuple[list[str], Optional[str]]]:
    """The channel arguments and the alpha argument of a color function."""
    body = body.strip()

    if "," in body:
        parts = [part.strip() for part in body.split(",")]

        if len(parts) not in (3, 4) or not all(parts):
            return None

        return parts[:3], parts[3] if len(parts) == 4 else None

    alpha = None
    if "/" in body:
        body, _, alpha = body.partition("/")
        alpha = alpha.strip()

        if not alpha or "/" in alpha:
            return None

    parts = body.split()

    if len(parts) != 3:
        return None

    return parts, alpha


def _argument(value: str) -> Optional[tuple[float, Optional[str]]]:
    match = _ARGUMENT.match(value)

    if not match:
        return None

    unit = match.group(2).lower() if match.group(2) else None

    return float(match.group(1)), unit


def _alpha(value: Optional[str]) -> Optional[float]:
    if value is None:
        return 1.0

    parsed = _argument(value)

    if parsed is None:
        return None

    number, unit = parsed

    if unit == "%":
        number /= 100
    elif unit is not None:
        return None

    return number if 0 <= number <= 1 else None


def parse_color(value) -> Optional[Color]:
    """The color value is, or None when it is not a hex, rgb or hsl color."""
    if not isinstance(value, str):
        return None

    value = value.strip()
    match = _HEX.match(value)

    if match:
        digits = match.group(1).lower()

        if len(digits) in (3, 4):
            digits = "".join(digit * 2 for digit in digits)

        channels = tuple(float(int(digits[i : i + 2], 16)) for i in (0, 2, 4))
        alpha = int(digits[6:8], 16) / 255 if len(digits) == 8 else 1.0

        return Color("rgb", channels, alpha, source="hex")

    match = _FUNCTION.match(value)

    if not match:
        return None

    space = match.group(1).lower()[:3]
    split = _split_arguments(match.group(2))

    if split is None:
        return None

    parts, alpha_part = split
    alpha = _alpha(alpha_part)
    arguments = [_argument(part) for part in parts]

    if alpha is None or None in arguments:
        return None

    if space == "rgb":
        channels = []

        for number, unit in arguments:
            if unit == "%":
                number *= 2.55
            elif unit is not None:
                return None

            if not 0 <= number <= 255:
                return None

            channels.append(number)

        return Color("rgb", tuple(channels), alpha, source="rgb")

    (hue, hue_unit), *rest = arguments

    if hue_unit == "%":
        return None

    hue = (hue * _HUE_UNITS[hue_unit]) % 360
    percentages = []

    for number, unit in rest:
        if unit not in (None, "%") or not 0 <= number <= 100:
            return None

        percentages.append(number)

    return Color("hsl", (hue, *percentages), alpha, source="hsl")


def _hsl_to_rgb(h: float, s: float, l: float) -> tuple:
    s, l = s / 100, l / 100
    a = s * min(l, 1 - l)

    def channel(n):
        k = (n + h / 30) % 12
        return (l - a * max(-1, min(k - 3, 9 - k, 1))) * 255

    return channel(0), channel(8), channel(4)


def _rgb_to_hsl(r: float, g: float, b: float) -> tuple:
    r, g, b = r / 255, g / 255, b / 255
    high, low = max(r, g, b), min(r, g, b)
    l = (high + low) / 2
    d = high - low

    if d == 0:
        return 0.0, 0.0, l * 100

    s = d / (1 - abs(2 * l - 1))

    if high == r:
        h = ((g - b) / d) % 6
    elif high == g:
        h = (b - r) / d + 2
    else:
        h = (r - g) / d + 4

    return (h * 60) % 360, s * 100, l * 100


def _number(value: float, places: int) -> str:
    """A number rounded to places, without trailing zeros: 0.5, 210, 33.3."""
    text = f"{round(value, places):.{places}f}".rstrip("0").rstrip(".")

    return "0" if text in ("-0", "") else text


def to_format(color: Color, color_format: str, alpha: bool) -> str:
    """The color in the canonical form of color_format, with alpha or not."""
    if color_format not in COLOR_FORMATS:
        raise ValueError(f"Unknown color format {color_format!r}.")

    if color_format == "hsl":
        if color.space == "hsl":
            h, s, l = color.values
        else:
            h, s, l = _rgb_to_hsl(*color.values)

        # A hue that rounds to 360 is 0.
        h = 0 if round(h, 1) >= 360 else h
        values = f"{_number(h, 1)}, {_number(s, 1)}%, {_number(l, 1)}%"

        if alpha:
            return f"hsla({values}, {_number(color.alpha, 3)})"

        return f"hsl({values})"

    if color.space == "hsl":
        channels = _hsl_to_rgb(*color.values)
    else:
        channels = color.values

    r, g, b = (min(255, max(0, round(channel))) for channel in channels)

    if color_format == "hex":
        text = f"#{r:02x}{g:02x}{b:02x}"

        return f"{text}{round(color.alpha * 255):02x}" if alpha else text

    if alpha:
        return f"rgba({r}, {g}, {b}, {_number(color.alpha, 3)})"

    return f"rgb({r}, {g}, {b})"


def normalize_color(value, color_format: str, alpha: bool = False) -> Optional[str]:
    """
    value in the canonical form of color_format, or None when it is not
    a color, or is translucent while alpha is off.
    """
    color = parse_color(value)

    if color is None or (not alpha and color.alpha < 1):
        return None

    return to_format(color, color_format, alpha)
