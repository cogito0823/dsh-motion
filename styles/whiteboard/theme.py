"""whiteboard 1.0.0 — Lemo-Opuscar 的 Whiteboard Explainer，manimgx 实现层。

上游规范（MIT）：styles/whiteboard/STYLE.md
暖白板 + 三支马克笔；manimgx 版省掉笔/手/相机旅行，只保留书写与结构。
"""

from __future__ import annotations

import json
from pathlib import Path

import numpy as np

import manimgx as m

TOKENS = json.loads(Path(__file__).with_name("tokens.json").read_text(encoding="utf-8"))

BOARD = TOKENS["colors"]["board"]
BOARD_EDGE = TOKENS["colors"]["board_edge"]
INK = TOKENS["colors"]["ink"]
BLUE = TOKENS["colors"]["blue"]
ORANGE = TOKENS["colors"]["orange"]
MUTED = TOKENS["colors"]["muted"]
GHOST = TOKENS["colors"]["ghost"]
LAYOUT = TOKENS["layout"]


def apply_config(width: int = 1920, height: int = 1080, fps: int = 30) -> None:
    m.config.pixel_width = width
    m.config.pixel_height = height
    m.config.frame_rate = fps
    m.config.background_color = BOARD


def backdrop(seed: int = 5) -> m.ImageMobject:
    """暖白板：轻微渐变 + 细噪点，避免大块纯白。"""
    w, h = m.config.pixel_width, m.config.pixel_height
    yy, xx = np.mgrid[0:h, 0:w]
    u = xx / (w - 1)
    v = yy / (h - 1)
    glow = np.exp(-(((u - 0.45) ** 2) / 0.30 + ((v - 0.42) ** 2) / 0.30))
    rgb = np.empty((h, w, 3), dtype=float)
    base = np.array([247, 245, 239], dtype=float)
    edge = np.array([233, 228, 216], dtype=float)
    rgb[:] = edge + glow[..., None] * (base - edge)
    rng = np.random.default_rng(seed)
    rgb = np.clip(rgb + rng.normal(0, 1.0, rgb.shape), 0, 255).astype(np.uint8)
    img = m.ImageMobject(rgb, scale_to_resolution=min(w, h), resampling_algorithm=3)
    return img.move_to(m.ORIGIN)


def board_line(y: float, x0: float, x1: float, color: str = INK, width: float = 2.4) -> m.Line:
    return m.Line([x0, y, 0], [x1, y, 0], color=color, stroke_width=width)
