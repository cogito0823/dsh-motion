import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "styles" / "whiteboard"))

import manimgx as m
from manimgx import *
from theme import (BLUE, BOARD, GHOST, INK, MUTED, ORANGE, apply_config, backdrop)


def f(x: float) -> float:
    return x * x / 2


class WhiteboardDerivative(Scene):
    """白板讲解：割线 Q→P，斜率从 2.50 落到 2.00。"""

    def construct(self):
        apply_config()
        self.add(backdrop())

        title = Text("割线为什么会变成切线", font="Chalkboard SE", font_size=40, color=INK)
        title.move_to([-4.35, 3.25, 0])
        underline = Line([-6.55, 2.95, 0], [-2.55, 2.95, 0], color=BLUE, stroke_width=2.2)

        ghost = Text("上次课：斜率 = Δy / Δx", font="Chalkboard SE", font_size=20, color=GHOST)
        ghost.move_to([4.7, -2.95, 0])

        ax = Axes(
            x_range=[0, 3.4, 0.5],
            y_range=[0, 4.8, 1],
            x_length=6.0,
            y_length=4.4,
            axis_config={"color": INK, "stroke_width": 2.0, "include_ticks": True},
            tips=False,
        ).move_to([-2.85, -0.62, 0])
        curve = ax.plot(f, x_range=[0, 3.1], color=INK, stroke_width=3.0)

        p_dot = Dot(ax.c2p(2, 2), radius=0.07, color=ORANGE)
        p_label = Text("P", font="Chalkboard SE", font_size=26, color=ORANGE).next_to(p_dot, UL, buff=0.10)
        q = ValueTracker(3.0)

        def q_point():
            return ax.c2p(q.get_value(), f(q.get_value()))

        q_dot = always_redraw(lambda: Dot(q_point(), radius=0.07, color=BLUE))

        def slope() -> float:
            d = 2 - q.get_value()
            return 2.0 if abs(d) < 1e-6 else (f(2) - f(q.get_value())) / d

        secant = always_redraw(lambda: Line(q_point(), ax.c2p(2, 2), color=BLUE, stroke_width=2.2))
        readout = always_redraw(lambda: Text(f"m = {slope():.2f}", font="Chalkboard SE",
                                            font_size=34, color=ORANGE).move_to([4.55, 0.25, 0]))
        readout_label = Text("割线斜率", font="Chalkboard SE", font_size=22, color=MUTED)
        readout_label.move_to([4.55, 1.05, 0])
        note = Text("Q 沿曲线滑向 P", font="Chalkboard SE", font_size=24, color=BLUE)
        note.move_to([4.55, -1.35, 0])
        tangent = Line(ax.c2p(1.15, 0.3), ax.c2p(3.0, 4.0), color=ORANGE, stroke_width=2.6)
        tangent_label = Text("切线", font="Chalkboard SE", font_size=24, color=ORANGE)
        tangent_label.move_to([4.55, -0.6, 0])

        self.play(Write(title), Create(underline), run_time=0.8)
        self.play(Create(ax), run_time=1.0)
        self.play(Create(curve), run_time=1.1)
        self.play(FadeIn(p_dot), Write(p_label), run_time=0.4)
        self.play(FadeIn(q_dot), Create(secant), Write(note), run_time=0.6)
        self.play(Write(readout_label), Write(readout), run_time=0.5)
        self.play(q.animate.set_value(2.0), run_time=3.0, rate_func=smooth)
        self.play(FadeOut(q_dot), FadeOut(note), Create(tangent), Write(tangent_label), run_time=0.8)
        self.play(FadeIn(ghost), run_time=0.4)
        self.wait(1.0)
