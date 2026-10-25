"""3b1b 1.0.0 — 3Blue1Brown 风格（Manim 社区通行做法）的 manimgx 实现层。

来源与许可：subinium/3b1b-style-animation-skill（MIT），配色表取自其 color-scheme.md；
方法论参考 adithya-s-k/manim_skill（MIT，1.2k stars）。不是 3Blue1Brown 官方项目。
"""

from __future__ import annotations

import json
from pathlib import Path

import manimgx as m

TOKENS = json.loads(Path(__file__).with_name("tokens.json").read_text(encoding="utf-8"))

BG = TOKENS["colors"]["bg"]
TEXT = TOKENS["colors"]["text"]
LABEL = TOKENS["colors"]["label"]
BLUE = TOKENS["colors"]["blue"]
YELLOW = TOKENS["colors"]["yellow"]
TEAL = TOKENS["colors"]["teal"]
GREEN = TOKENS["colors"]["green"]
RED = TOKENS["colors"]["red"]
GRAY = TOKENS["colors"]["gray"]
MATH = TOKENS["colors"]["math"]
AXIS = TOKENS["colors"]["axis"]
LAYOUT = TOKENS["layout"]


def apply_config(background: str = BG) -> None:
    """只设背景色；分辨率/帧率由 CLI（-r / --fps）或调用方决定。

    不要在场景里写死 1920x1080/30：那会覆盖 motion_render 的 width/height/fps，
    也是 1280x720 崩溃与 --fps 60 静默变 5s 的根因。
    """
    m.config.background_color = background


def backdrop() -> m.Rectangle:
    """近黑灰底；3b1b 规定不用纯黑。"""
    return (
        m.Rectangle(width=LAYOUT["frame"]["width"], height=LAYOUT["frame"]["height"], color=BG)
        .set_fill(BG, 1)
        .set_stroke(width=0)
    )
