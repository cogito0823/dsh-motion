"""blueprint 1.0.0 — Lemo-Opuscar 的 Blueprint，manimgx 实现层。

上游规范（MIT）：styles/blueprint/STYLE.md
普鲁士蓝纸 + 白线 + 一次红色印章；不做 3D、不做辉光。
"""

from __future__ import annotations

import json
from pathlib import Path

import numpy as np

import manimgx as m

TOKENS = json.loads(Path(__file__).with_name("tokens.json").read_text(encoding="utf-8"))

TABLE = TOKENS["colors"]["table"]
PAPER = TOKENS["colors"]["paper"]
PAPER_LIGHT = TOKENS["colors"]["paper_light"]
LINE = TOKENS["colors"]["line"]
MUTED = TOKENS["colors"]["muted"]
STAMP = TOKENS["colors"]["stamp"]
LAYOUT = TOKENS["layout"]


def apply_config(background: str = TABLE) -> None:
    """只设背景色；分辨率/帧率由 CLI（-r / --fps）或调用方决定。

    不要在场景里写死 1920x1080/30：那会覆盖 motion_render 的 width/height/fps，
    也是 1280x720 崩溃与 --fps 60 静默变 5s 的根因。
    """
    m.config.background_color = background


def backdrop(seed: int = 11) -> m.ImageMobject:
    """青晒纸：两档普鲁士蓝 + 轻微噪点，压在深色绘图桌上。"""
    w, h = m.config.pixel_width, m.config.pixel_height
    yy, xx = np.mgrid[0:h, 0:w]
    u = xx / (w - 1)
    v = yy / (h - 1)
    glow = np.exp(-(((u - 0.48) ** 2) / 0.16 + ((v - 0.44) ** 2) / 0.10))
    dark = np.array([24, 51, 107], dtype=float)
    light = np.array([42, 88, 166], dtype=float)
    rgb = dark + glow[..., None] * (light - dark)
    rng = np.random.default_rng(seed)
    rgb = np.clip(rgb + rng.normal(0, 2.1, rgb.shape), 0, 255).astype(np.uint8)
    img = m.ImageMobject(rgb, scale_to_resolution=min(w, h), resampling_algorithm=3)
    return img.move_to(m.ORIGIN)


def sheet() -> m.Rectangle:
    """纸边：一条细白线，标出图幅。"""
    return m.Rectangle(
        width=LAYOUT["frame"]["width"] - 0.9,
        height=LAYOUT["frame"]["height"] - 0.9,
        color=LINE,
        stroke_width=1.2,
    )


def title_block() -> m.VGroup:
    x, y = LAYOUT["title_block"]["x"], LAYOUT["title_block"]["y"]
    box = m.Rectangle(width=3.3, height=1.15, color=LINE, stroke_width=1.0).move_to([x, y, 0])
    name = m.Text("DRAWING 001", font="Menlo", font_size=21, color=LINE).move_to([x - 0.35, y + 0.27, 0])
    status = m.Text("STATUS: VERIFIED", font="Menlo", font_size=20, color=MUTED).move_to([x - 0.05, y - 0.27, 0])
    return m.VGroup(box, name, status)
