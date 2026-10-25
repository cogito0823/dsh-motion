import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "styles" / "swiss-motion"))

import manimgx as m
from manimgx import *
from theme import (GROUND, INK, MUTED, RULE, SIGNAL, apply_config, backdrop, columns, rule)


class SwissEuler(Scene):
    """欧拉公式 · 瑞士动态排版：一个结论，一条动线，一个信号色。"""

    def construct(self):
        apply_config(1920, 1080, 30)
        self.add(backdrop())

        grid = columns(12, margin=0.55, opacity=0.30)
        kicker = Text("FORMULA / 001", font="Noto Sans", weight=BOLD,
                      font_size=18, color=SIGNAL).move_to([-5.95, 3.18, 0])
        title = Text("欧拉公式", font="Noto Sans CJK SC", weight=BOLD,
                     font_size=54, color=INK).move_to([-5.25, 2.34, 0])
        sub = Text("单位圆上的半圈", font="Noto Sans CJK SC",
                   font_size=24, color=MUTED).move_to([-5.05, 1.72, 0])
        head_rule = rule(1.42, width=5.9, x=-3.55, color=SIGNAL, stroke_width=3.0)

        eq_left = MathTex(r"e^{i\pi}+1=", font_size=104, color=INK).move_to([-1.35, 0.35, 0])
        eq_zero = MathTex("0", font_size=104, color=SIGNAL).move_to([1.55, 0.35, 0])

        divider = m.Line([3.95, 2.55, 0], [3.95, -2.45, 0], color=RULE, stroke_width=1.0)
        note_a = Text("五个常数", font="Noto Sans CJK SC",
                      font_size=24, color=INK).move_to([5.45, 0.35, 0])
        note_b = Text("一个等式", font="Noto Sans CJK SC",
                      font_size=24, color=INK).move_to([5.45, -0.18, 0])
        note_rule = rule(-0.85, width=2.4, x=5.45, color=RULE, stroke_width=1.0)
        foot = Text("SWISS MOTION / 12 COL", font="Menlo", font_size=14,
                    color=MUTED).move_to([-5.95, -2.95, 0])

        self.play(Write(kicker), Write(title), run_time=0.8)
        self.play(Create(grid), Create(head_rule), Create(divider), run_time=0.6)
        self.play(Write(sub), FadeIn(foot), run_time=0.5)
        self.play(Write(eq_left), run_time=1.1)
        self.play(Write(eq_zero), run_time=0.5)
        self.play(Create(note_rule), Write(note_a), Write(note_b), run_time=0.7)
        self.wait(2.0)
