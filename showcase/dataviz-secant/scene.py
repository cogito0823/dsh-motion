import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "styles" / "dataviz"))

import manimgx as m
from manimgx import *
from theme import (BLUE, GRID, INK, MONO, MUTED, PAPER, RED, apply_config, backdrop, leader, rule)


def f(x: float) -> float:
    return x * x / 2


class SecantToTangent(Scene):
    """数据叙事：割线 Q→P，斜率从 2.50 落到 2.00。"""

    def construct(self):
        apply_config(1920, 1080, 30)
        self.add(backdrop())

        kicker = Text("DATA STORY / 002", font=MONO, font_size=16, color=BLUE)
        kicker.move_to([-5.95, 3.28, 0])
        title = Text("割线如何变成切线", font="Songti SC", weight=BOLD, font_size=40, color=INK)
        title.move_to([-4.5, 2.78, 0])
        sub = Text("f(x) = x²/2   P(2, 2)   Q(q, f(q))", font=MONO, font_size=17, color=MUTED)
        sub.move_to([-4.35, 2.34, 0])
        head = rule(2.08, width=4.6, x=-4.35, color=GRID, stroke_width=1.2)

        ax = Axes(
            x_range=[0, 3.4, 0.5],
            y_range=[0, 4.8, 1],
            x_length=6.0,
            y_length=4.4,
            axis_config={"color": INK, "stroke_width": 1.4, "include_ticks": True},
            tips=False,
        ).move_to([-2.85, -0.62, 0])
        curve = ax.plot(f, x_range=[0, 3.1], color=INK, stroke_width=2.0)
        p_dot = Dot(ax.c2p(2, 2), radius=0.075, color=RED)
        p_ring = Circle(radius=0.12, color=RED, stroke_width=1.4).move_to(ax.c2p(2, 2))
        p_label = Text("P", font=MONO, font_size=20, color=RED).next_to(p_dot, UL, buff=0.10)

        q = ValueTracker(3.0)

        def q_point():
            return ax.c2p(q.get_value(), f(q.get_value()))

        q_dot = always_redraw(lambda: Dot(q_point(), radius=0.075, color=BLUE))
        q_ring = always_redraw(lambda: Circle(radius=0.12, color=BLUE, stroke_width=1.4).move_to(q_point()))
        legend = Text("Q → P", font=MONO, font_size=18, color=BLUE).move_to([4.75, -2.25, 0])
        x_label = Text("x", font=MONO, font_size=22, color=MUTED).move_to([0.40, -3.12, 0])
        y_label = Text("y", font=MONO, font_size=22, color=MUTED).move_to([-5.95, 1.42, 0])

        def slope() -> float:
            d = 2 - q.get_value()
            return 2.0 if abs(d) < 1e-6 else (f(2) - f(q.get_value())) / d

        secant = always_redraw(lambda: Line(q_point(), ax.c2p(2, 2), color=BLUE, stroke_width=1.6))
        guides = always_redraw(lambda: m.VGroup(
            leader(q_point(), [q_point()[0], ax.c2p(0, 0)[1], 0], color=GRID, stroke_width=0.9),
            leader(q_point(), [ax.c2p(0, 0)[0], q_point()[1], 0], color=GRID, stroke_width=0.9),
        ))

        readout = always_redraw(lambda: Text(f"m = {slope():.2f}", font=MONO, font_size=34, color=RED)
                                .move_to([4.75, 0.35, 0]))
        readout_label = Text("Δy / Δx", font=MONO, font_size=16, color=MUTED).move_to([4.75, 1.05, 0])
        readout_rule = rule(-0.25, width=2.3, x=4.75, color=GRID, stroke_width=1.0)
        note_a = Text("q → 2 时", font="Songti SC", font_size=21, color=INK).move_to([4.45, -0.95, 0])
        note_b = Text("secant → tangent", font=MONO, font_size=18, color=INK).move_to([4.45, -1.45, 0])
        note_rule = rule(-1.90, width=2.6, x=4.45, color=GRID, stroke_width=1.0)

        tangent = Line(ax.c2p(1.15, 0.3), ax.c2p(3.0, 4.0), color=RED, stroke_width=2.2)

        self.play(Write(kicker), Write(title), run_time=0.7)
        self.play(Create(head), Create(ax), Write(x_label), Write(y_label), run_time=1.0)
        self.play(Create(curve), run_time=1.1)
        self.play(FadeIn(p_dot), Create(p_ring), Write(p_label), run_time=0.5)
        self.play(FadeIn(q_dot), Create(q_ring), Write(legend), run_time=0.5)
        self.add(secant, guides)
        self.play(Write(readout_label), Create(readout_rule), Write(readout), run_time=0.6)
        self.play(q.animate.set_value(2.0), run_time=3.2, rate_func=smooth)
        self.play(FadeOut(q_dot), FadeOut(q_ring), FadeOut(legend), Create(tangent), run_time=0.7)
        self.play(Write(note_a), Write(note_b), Create(note_rule), run_time=0.6)
        self.wait(1.2)
