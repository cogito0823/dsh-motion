"""swiss-motion 1.0.0 — Lemo-Opuscar 的 Swiss Motion Graphics，manimgx 实现层。

上游客服规范（MIT）：styles/swiss-motion/STYLE.md
实现只依赖 tokens.json；颜色/字号/网格从这里取，不散落在场景里。
"""

from __future__ import annotations

import json
from pathlib import Path

import manimgx as m

TOKENS = json.loads(Path(__file__).with_name("tokens.json").read_text(encoding="utf-8"))

# inspect 在 import 时读 config.frame_rate；必须放在模块层，不能只在 construct 里。
m.config.frame_rate = int(TOKENS["motion"]["fps"])

GROUND = TOKENS["colors"]["ground"]
PAPER = TOKENS["colors"]["paper"]
INK = TOKENS["colors"]["ink"]
MUTED = TOKENS["colors"]["muted"]
RULE = TOKENS["colors"]["rule"]
SIGNAL = TOKENS["colors"]["signal"]
FONT = TOKENS["typography"]["display"]["family"]
MOTION = TOKENS["motion"]
LAYOUT = TOKENS["layout"]


def apply_config(width: int = 1920, height: int = 1080, fps: int = 30) -> None:
    m.config.pixel_width = width
    m.config.pixel_height = height
    m.config.frame_rate = fps
    m.config.background_color = GROUND


def backdrop() -> m.Rectangle:
    """Flat paper ground. Swiss 规定无渐变、无投影、无颗粒。"""
    return (
        m.Rectangle(width=LAYOUT["frame"]["width"], height=LAYOUT["frame"]["height"], color=GROUND)
        .set_fill(GROUND, 1)
        .set_stroke(width=0)
    )


def columns(count: int = 12, margin: float = 0.5, opacity: float = 0.55) -> m.VGroup:
    """12 栏规矩线：只在上下页边距画短刻度，不穿过文字。"""
    width = LAYOUT["frame"]["width"] - margin * 2
    x0 = -LAYOUT["frame"]["width"] / 2 + margin
    marks = m.VGroup()
    for i in range(count + 1):
        x = x0 + width * i / count
        top = m.Line([x, 3.55, 0], [x, 3.78, 0], color=RULE, stroke_width=1.0)
        bottom = m.Line([x, -3.55, 0], [x, -3.32, 0], color=RULE, stroke_width=1.0)
        top.set_stroke(opacity=opacity)
        bottom.set_stroke(opacity=opacity)
        marks.add(top, bottom)
    return marks


def rule(y: float, width: float, x: float = 0.0, color: str = RULE, stroke_width: float = 1.2) -> m.Line:
    return m.Line([x - width / 2, y, 0], [x + width / 2, y, 0], color=color, stroke_width=stroke_width)
