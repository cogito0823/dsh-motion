import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "styles" / "3b1b"))

import numpy as np
import manimgx as m
from manimgx import *
from theme import (AXIS, BG, BLUE, GRAY, GREEN, LABEL, MATH, RED, TEAL, TEXT, YELLOW,
                   apply_config, backdrop)


class UnitCircle(Scene):
    """3b1b 风格：先看旋转，再收束到 e^{iθ} = cosθ + i sinθ。"""

    def construct(self):
        apply_config(1920, 1080, 30)
        self.add(backdrop())

        title = Text("旋转，就是复数乘法", font="Noto Sans CJK SC", weight=BOLD,
                     font_size=36, color=TEXT).move_to([-4.9, 3.32, 0])
        sub = MathTex(r"e^{i\theta}", font_size=26, color=GRAY).move_to([-5.4, 2.86, 0])

        center = [-2.55, 0.0, 0]
        radius = 1.75
        ax = Axes(x_range=[-2.2, 2.2], y_range=[-1.4, 1.4], x_length=4.9, y_length=3.9,
                  axis_config={"color": AXIS, "stroke_width": 1.4}, tips=False)
        ax.move_to(center)
        circle = Circle(radius=radius, color=GRAY, stroke_width=1.4).move_to(center)

        theta = ValueTracker(0.0)

        def point():
            a = theta.get_value()
            return [center[0] + radius * np.cos(a), center[1] + radius * np.sin(a), 0]

        def origin():
            return [center[0], center[1], 0]

        vector = always_redraw(lambda: Arrow(origin(), point(), buff=0, color=BLUE,
                                             stroke_width=4.0, tip_length=0.18))
        dot = always_redraw(lambda: Dot(point(), radius=0.06, color=YELLOW))
        cos_bar = always_redraw(lambda: Line(origin(), [point()[0], center[1], 0],
                                             color=YELLOW, stroke_width=3.2))
        sin_bar = always_redraw(lambda: Line(origin(), [center[0], point()[1], 0],
                                             color=YELLOW, stroke_width=3.2))
        cos_guide = always_redraw(lambda: DashedLine(point(), [point()[0], center[1], 0],
                                                     color=GRAY, stroke_width=1.0, dash_length=0.08))
        sin_guide = always_redraw(lambda: DashedLine(point(), [center[0], point()[1], 0],
                                                     color=GRAY, stroke_width=1.0, dash_length=0.08))
        arc = always_redraw(lambda: Arc(radius=0.48, start_angle=0, angle=max(theta.get_value(), 0.01),
                                        color=TEAL, stroke_width=2.0).move_arc_center_to(origin()))
        cos_label = Text("cos θ", font="Menlo", font_size=18, color=YELLOW).move_to([-1.55, -0.42, 0])
        sin_label = Text("sin θ", font="Menlo", font_size=18, color=YELLOW).move_to([-2.0, 1.12, 0])

        formula = MathTex(r"e^{i\theta}=\cos\theta+i\sin\theta", font_size=54, color=TEXT)
        formula.move_to([4.55, 1.35, 0])
        note = Text("逆时针转一周，cos 与 sin 就是两条投影", font="Noto Sans CJK SC",
                    font_size=18, color=LABEL)
        note.move_to([4.55, 0.35, 0])

        self.play(Write(title), Write(sub), run_time=0.7)
        self.play(Create(ax), Create(circle), run_time=1.0)
        self.play(FadeIn(vector), FadeIn(dot), run_time=0.4)
        self.play(Create(arc), run_time=0.5)
        self.play(FadeIn(cos_bar), FadeIn(sin_bar), Create(cos_guide), Create(sin_guide),
                  Write(cos_label), Write(sin_label), run_time=0.7)
        self.play(Write(formula), Write(note), run_time=0.8)
        self.play(theta.animate.set_value(2 * np.pi), run_time=5.0, rate_func=linear)
        self.wait(1.2)
