"""dataviz 1.0.0 — Lemo-Opuscar 的 Data Storytelling，manimgx 实现层。

上游规范（MIT）：styles/dataviz/STYLE.md
纸、墨、蓝红铅笔；颜色与字号只从 tokens.json 取。
"""

from __future__ import annotations

import json
from pathlib import Path

import manimgx as m

TOKENS = json.loads(Path(__file__).with_name("tokens.json").read_text(encoding="utf-8"))

PAPER = TOKENS["colors"]["paper"]
PAPER_SHADOW = TOKENS["colors"]["paper_shadow"]
INK = TOKENS["colors"]["ink"]
GRID = TOKENS["colors"]["grid"]
MUTED = TOKENS["colors"]["muted"]
BLUE = TOKENS["colors"]["blue"]
RED = TOKENS["colors"]["red"]
FONT = TOKENS["typography"]["display"]["family"]
MONO = TOKENS["typography"]["mono"]["family"]
LAYOUT = TOKENS["layout"]


def apply_config(background: str = PAPER) -> None:
    """只设背景色；分辨率/帧率由 CLI（-r / --fps）或调用方决定。

    不要在场景里写死 1920x1080/30：那会覆盖 motion_render 的 width/height/fps，
    也是 1280x720 崩溃与 --fps 60 静默变 5s 的根因。
    """
    m.config.background_color = background


def backdrop() -> m.Rectangle:
    """一张平整的奶油纸；不要渐变、不要投影。"""
    return (
        m.Rectangle(width=LAYOUT["frame"]["width"], height=LAYOUT["frame"]["height"], color=PAPER)
        .set_fill(PAPER, 1)
        .set_stroke(width=0)
    )


def rule(y: float, width: float, x: float = 0.0, color: str = GRID, stroke_width: float = 1.0) -> m.Line:
    return m.Line([x - width / 2, y, 0], [x + width / 2, y, 0], color=color, stroke_width=stroke_width)


def leader(start, end, color: str = MUTED, stroke_width: float = 1.0) -> m.DashedLine:
    return m.DashedLine(start, end, color=color, stroke_width=stroke_width, dash_length=0.08)
