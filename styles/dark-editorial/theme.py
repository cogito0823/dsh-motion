"""dark-editorial 1.0.0 — reusable tokens and helpers for manimgx.

`tokens.json` is the single source of truth. This module only reads it and
turns the backdrop recipe into a mobject.

Usage in a scene beside this directory:

    import manimgx as m
    from theme import apply_config, backdrop, GROUND, INK, ACCENT

    apply_config()
    self.add(backdrop())

If the scene lives elsewhere, either copy `theme.py` and `tokens.json`
together, or prepend this directory to `sys.path`.
"""

from __future__ import annotations

import json
from pathlib import Path

import numpy as np

import manimgx as m

TOKENS = json.loads(Path(__file__).with_name("tokens.json").read_text(encoding="utf-8"))

STYLE_NAME: str = TOKENS["name"]
STYLE_VERSION: str = TOKENS["version"]

GROUND: str = TOKENS["colors"]["ground"]
INK: str = TOKENS["colors"]["ink"]
MUTED: str = TOKENS["colors"]["muted"]
AXIS: str = TOKENS["colors"]["axis"]
ACCENT: str = TOKENS["colors"]["accent"]
CIRCLE: str = TOKENS["colors"]["circle"]

FONT: str = TOKENS["typography"]["display"]["family"]
MATH_SIZE: int = TOKENS["typography"]["math"]["size"]

PALETTE: dict[str, str] = dict(TOKENS["colors"])
TYPE: dict[str, dict] = dict(TOKENS["typography"])
LAYOUT: dict = dict(TOKENS["layout"])
MOTION: dict = dict(TOKENS["motion"])
AUDIO: dict = dict(TOKENS["audio"])

__all__ = [
    "ACCENT",
    "AUDIO",
    "AXIS",
    "CIRCLE",
    "FONT",
    "GROUND",
    "INK",
    "LAYOUT",
    "MATH_SIZE",
    "MOTION",
    "MUTED",
    "PALETTE",
    "STYLE_NAME",
    "STYLE_VERSION",
    "TOKENS",
    "TYPE",
    "apply_config",
    "backdrop",
]


def apply_config(
    width: int = 1920,
    height: int = 1080,
    fps: int = 60,
    background: str = GROUND,
) -> None:
    """Set the scene size, frame rate and ground color for this style."""
    m.config.pixel_width = width
    m.config.pixel_height = height
    m.config.frame_rate = fps
    m.config.background_color = background


def backdrop(
    center: tuple[float, float] | None = None,
    width: int = 1920,
    height: int = 1080,
) -> m.ImageMobject:
    """Build the smooth radial ground used by dark-editorial.

    A dithered 1920×1080 gradient replaces a hard-edged halo disc. The glow
    is centered on the unit circle, not on the frame, so the illustration
    sits in a pool of light while the text column stays calm.
    """
    spec = TOKENS["backdrop"]
    if center is None:
        center = tuple(LAYOUT["circle"]["center"])
    cx, cy = float(center[0]), float(center[1])

    yy, xx = np.mgrid[0:height, 0:width]
    sx = (xx / (width - 1) - 0.5) * m.config.frame_width
    sy = (0.5 - yy / (height - 1)) * m.config.frame_height
    dist = np.hypot(sx - cx, sy - cy)
    glow = np.exp(-((dist / spec["radius"]) ** 2))

    edge = np.asarray(spec["edge_rgb"], dtype=float)
    core = np.asarray(spec["core_rgb"], dtype=float)
    rgb = edge + glow[..., None] * (core - edge)

    rng = np.random.default_rng(spec["seed"])
    dither = int(spec["dither"])
    pixels = np.clip(
        rgb + rng.integers(-dither, dither + 1, rgb.shape), 0, 255
    ).astype(np.uint8)

    image = m.ImageMobject(
        pixels,
        scale_to_resolution=min(width, height),
        resampling_algorithm=3,
    )
    return image.move_to(m.ORIGIN)
