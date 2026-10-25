import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "styles" / "blueprint"))

import manimgx as m
from manimgx import *
from theme import (LINE, MUTED, PAPER, STAMP, TABLE, apply_config, backdrop, sheet, title_block)


class BlueprintPythagoras(Scene):
    """蓝图 / 工程制图：3-4-5 直角三角形，按制图顺序画出来。"""

    def construct(self):
        apply_config()
        self.add(backdrop(), sheet(), title_block())

        header = Text("FIG. 1 — RIGHT TRIANGLE", font="Menlo", font_size=16, color=LINE)
        header.move_to([-5.2, 3.32, 0])
        header_rule = Line([-6.55, 3.12, 0], [-2.4, 3.12, 0], color=LINE, stroke_width=0.9)

        A, B, C = [-3.2, -1.7, 0], [0.4, -1.7, 0], [0.4, 1.0, 0]
        ab = Line(A, B, color=LINE, stroke_width=2.4)
        bc = Line(B, C, color=LINE, stroke_width=2.4)
        ca = Line(C, A, color=LINE, stroke_width=2.4)

        right = VGroup(
            Line([0.12, -1.7, 0], [0.12, -1.46, 0], color=LINE, stroke_width=1.0),
            Line([0.12, -1.46, 0], [0.4, -1.46, 0], color=LINE, stroke_width=1.0),
        )

        l4 = Text("4", font="Menlo", font_size=22, color=LINE).move_to([-1.4, -2.02, 0])
        l3 = Text("3", font="Menlo", font_size=22, color=LINE).move_to([0.66, -0.35, 0])
        l5 = Text("5", font="Menlo", font_size=22, color=LINE).move_to([-1.55, -0.15, 0])

        dim_ab = DoubleArrow([-3.2, -2.35, 0], [0.4, -2.35, 0], buff=0, color=MUTED, stroke_width=1.0,
                             tip_length=0.12)
        dim_bc = DoubleArrow([0.95, -1.7, 0], [0.95, 1.0, 0], buff=0, color=MUTED, stroke_width=1.0,
                             tip_length=0.12)
        dim_ca = DoubleArrow([-3.35, -1.55, 0], [0.55, 0.85, 0], buff=0, color=MUTED, stroke_width=1.0,
                             tip_length=0.12)

        eq = MathTex(r"3^2 + 4^2 = 5^2", font_size=54, color=LINE).move_to([4.55, 0.55, 0])
        eq_note = Text("PYTHAGOREAN TRIPLE", font="Menlo", font_size=20, color=MUTED).move_to([4.55, -0.1, 0])
        eq_rule = Line([3.2, 0.05, 0], [5.9, 0.05, 0], color=LINE, stroke_width=0.8)

        stamp_ring = Circle(radius=0.72, color=STAMP, stroke_width=2.6).move_to([4.55, -1.50, 0])
        stamp_text = Text("Q.E.D.", font="Chalkboard SE", font_size=34, color=STAMP).move_to([4.55, -1.50, 0])

        self.play(Write(header), Create(header_rule), run_time=0.7)
        self.play(Create(ab), run_time=0.5)
        self.play(Create(bc), run_time=0.5)
        self.play(Create(ca), run_time=0.6)
        self.play(Create(right), Write(l3), Write(l4), Write(l5), run_time=0.6)
        self.play(Create(dim_ab), Create(dim_bc), Create(dim_ca), run_time=0.9)
        self.play(Create(eq_rule), Write(eq), Write(eq_note), run_time=1.0)
        self.play(Create(stamp_ring), Write(stamp_text), run_time=0.7)
        self.wait(1.4)
