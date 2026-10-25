"""Derivative: a secant settles into the tangent at x = 1.

f(x) = x^2 / 2, the fixed point P = (1, 1/2), and a second point Q that
slides along the curve until the secant's slope reaches f'(1) = 1.

10.0 s · 1920×1080 · 60 fps
"""

import sys
from pathlib import Path

import numpy as np

import manimgx as m

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "styles" / "dark-editorial"))
from theme import ACCENT, AXIS, CIRCLE, FONT, INK, MUTED, apply_config, backdrop  # noqa: E402

apply_config(fps=60)

X0, Y0, S = -3.90, -2.30, 1.30
X_MIN, X_MAX = -2.04, 2.30
Y_MIN, Y_MAX = 0.00, 2.75
X_P = 1.0
Q_START = -0.80


def f(x: float) -> float:
    return 0.5 * x * x


def slope_at(q: float) -> float:
    """Slope of the secant through P = (1, 1/2) and Q = (q, f(q)).

    The difference quotient simplifies to (1 + q) / 2, so the limit at q = 1
    (the tangent's slope) is read directly instead of dividing by zero.
    """
    return 0.5 * (1.0 + q)


def screen(x: float, y: float) -> np.ndarray:
    return np.array([X0 + S * x, Y0 + S * y, 0.0])


def on_curve(x: float) -> np.ndarray:
    return screen(x, f(x))


P = on_curve(X_P)


def clipped(slope: float) -> tuple[np.ndarray, np.ndarray]:
    """The chord through P of the given slope, clipped to the plot window."""
    px, py = X_P, f(X_P)
    pts: list[tuple[float, float]] = []
    for x in (X_MIN, X_MAX):
        y = py + slope * (x - px)
        if Y_MIN - 1e-9 <= y <= Y_MAX + 1e-9:
            pts.append((x, y))
    if abs(slope) > 1e-9:
        for y in (Y_MIN, Y_MAX):
            x = px + (y - py) / slope
            if X_MIN - 1e-9 <= x <= X_MAX + 1e-9:
                pts.append((x, y))
    unique: list[tuple[float, float]] = []
    for p in pts:
        if all(abs(p[0] - u[0]) > 1e-6 or abs(p[1] - u[1]) > 1e-6 for u in unique):
            unique.append(p)
    if len(unique) < 2:
        raise ValueError("secant is outside the plot window")
    a, b = max(
        ((a, b) for i, a in enumerate(unique) for b in unique[i + 1:]),
        key=lambda ab: (ab[0][0] - ab[1][0]) ** 2 + (ab[0][1] - ab[1][1]) ** 2,
    )
    return screen(*a), screen(*b)


class SecantToTangent(m.Scene):
    def construct(self) -> None:
        self.add(backdrop(center=(-3.40, -0.90)))

        # ------------------------------------------------------------- left column
        kicker = m.Text("数学速写  /  002", font=FONT, font_size=21, color=ACCENT)
        title = m.Text("导数", font=FONT, font_size=64, weight=m.BOLD, color=INK)
        subtitle = m.Text("割线如何变成切线", font=FONT, font_size=26, color=MUTED)

        title_block = m.VGroup(kicker, title, subtitle).arrange(
            m.DOWN, buff=0.20, aligned_edge=m.LEFT
        )
        title_block.move_to([-6.55, 2.60, 0], aligned_edge=m.LEFT)

        hairline = m.Line(
            [-6.55, 1.52, 0], [-4.83, 1.52, 0],
            stroke_color=ACCENT, stroke_width=1.4, stroke_opacity=0.55,
        )

        # ---------------------------------------------------------------- the plot
        x_axis = m.Arrow(
            screen(X_MIN, 0), screen(X_MAX, 0), buff=0,
            stroke_color=AXIS, stroke_width=1.4,
            tip_length=0.13, max_tip_length_to_length_ratio=0.06,
        )
        y_axis = m.Arrow(
            screen(0, Y_MIN), screen(0, Y_MAX), buff=0,
            stroke_color=AXIS, stroke_width=1.4,
            tip_length=0.13, max_tip_length_to_length_ratio=0.06,
        )
        x_label = m.Text("x", font="serif", slant=m.ITALIC, font_size=24, color=MUTED)
        x_label.move_to([-0.68, -2.06, 0])
        y_label = m.Text("y", font="serif", slant=m.ITALIC, font_size=24, color=MUTED)
        y_label.move_to([-3.55, 1.33, 0])
        curve = m.ParametricFunction(
            lambda t: screen(t, f(t)),
            t_range=[X_MIN, X_MAX, 0.01],
            color=INK, stroke_width=2.4, use_smoothing=True,
        )

        tick_one = m.Line(
            screen(1.0, -0.05), screen(1.0, 0.05),
            stroke_color=MUTED, stroke_width=1.6,
        )
        label_one = m.Text("1", font="serif", font_size=21, color=MUTED)
        label_one.move_to(screen(1.0, 0) + np.array([0.0, -0.32, 0.0]))

        guide = m.DashedLine(
            screen(1.0, 0.0), P,
            dash_length=0.05, dashed_ratio=0.40,
            stroke_color=MUTED, stroke_width=1.2, stroke_opacity=0.32,
        )

        # --------------------------------------------------------------- the points
        p_dot = m.Dot(P, radius=0.085, color=INK)
        p_ring = m.Circle(
            radius=0.16, arc_center=P, stroke_color=ACCENT,
            stroke_width=1.8, stroke_opacity=0.70,
        )
        p_label = m.Text("P", font="serif", slant=m.ITALIC, font_size=22, color=MUTED)
        p_label.move_to(P + np.array([0.36, -0.40, 0.0]))

        q = m.ValueTracker(Q_START)

        def q_point() -> np.ndarray:
            return on_curve(q.get_value())

        q_dot = m.Dot(q_point(), radius=0.075, color=ACCENT)

        def follow_q(dot: m.Dot) -> None:
            dot.move_to(q_point())

        q_dot.add_updater(follow_q)

        start_a, start_b = clipped(slope_at(Q_START))
        secant_intro = m.Line(
            start_a, start_b,
            stroke_color=CIRCLE, stroke_width=2.4, stroke_opacity=0.92,
        )

        secant = m.Line(
            start_a, start_b,
            stroke_color=CIRCLE, stroke_width=2.4, stroke_opacity=0.92,
        )

        def redraw_secant(line: m.Line) -> None:
            a, b = clipped(slope_at(q.get_value()))
            line.put_start_and_end_on(a, b)

        secant.add_updater(redraw_secant)

        # ------------------------------------------------------------ final tangent
        tan_a, tan_b = clipped(1.0)
        tangent = m.Line(
            tan_a, tan_b, stroke_color=ACCENT, stroke_width=3.0, stroke_opacity=0.95,
        )
        tangent_glow = m.Line(
            tan_a, tan_b, stroke_color=ACCENT, stroke_width=12, stroke_opacity=0.10,
        )

        # ------------------------------------------------------------- right column
        def_label = m.Text("定义", font=FONT, font_size=18, color=MUTED)
        def_label.move_to([4.00, 3.08, 0])
        definition = m.MathTex(
            r"f'(x) = \lim_{h \to 0} \frac{f(x+h) - f(x)}{h}",
            font_size=32, color=INK,
        ).move_to([4.00, 2.44, 0])

        divider = m.Line(
            [0.82, 3.40, 0], [0.82, -2.92, 0],
            stroke_color=AXIS, stroke_width=1.0, stroke_opacity=0.75,
        )

        special_line = m.Line(
            [1.32, 1.70, 0], [6.68, 1.70, 0],
            stroke_color=AXIS, stroke_width=1.2,
        )
        section_label = m.Text("本例", font=FONT, font_size=18, color=MUTED)
        section_label.move_to([1.32, 1.88, 0], aligned_edge=m.LEFT)
        function_label = m.MathTex(r"f(x) = x^2/2", font_size=21, color=MUTED)
        function_label.move_to([6.68, 1.88, 0], aligned_edge=m.RIGHT)

        equation = m.MathTex("f'(1)", "=", "1", font_size=80, color=INK)
        equation.move_to([4.00, 0.62, 0])
        equation[-1].set_color(ACCENT)

        annotation = m.Text("割线斜率  →  切线斜率", font=FONT, font_size=26, color=INK)
        annotation.set_opacity(0.85)
        annotation.move_to([4.00, -0.52, 0])

        footnote = m.MathTex(r"\frac{\Delta y}{\Delta x} \;\to\; f'(x)", font_size=21, color=MUTED)
        footnote.set_opacity(0.80)
        footnote.move_to([4.00, -1.14, 0])

        page = m.Text("10 s  /  SECANT TO TANGENT", font="sans-serif",
                      font_size=17, color=MUTED)
        page.set_opacity(0.65)
        page.move_to([6.68, -2.70, 0], aligned_edge=m.RIGHT)

        # ---------------------------------------------------------------- timeline
        # 0.0 – 1.2 : title, definition
        self.play(
            m.Write(kicker, run_time=0.9),
            m.Write(title, run_time=1.05),
            m.FadeIn(subtitle, shift=0.10 * m.UP, run_time=0.8),
            m.Create(hairline, run_time=0.9),
            m.FadeIn(def_label, run_time=0.6),
            m.FadeIn(definition, shift=0.08 * m.UP, run_time=0.9),
            m.Create(divider, run_time=1.0),
            run_time=1.2,
        )

        # 1.2 – 2.2 : axes, curve
        self.play(
            m.Create(x_axis, run_time=0.9),
            m.Create(y_axis, run_time=0.9),
            m.FadeIn(x_label, run_time=0.6),
            m.FadeIn(y_label, run_time=0.6),
            m.Create(curve, run_time=1.0),
            m.Create(tick_one, run_time=0.5),
            m.FadeIn(label_one, run_time=0.5),
            run_time=1.0,
        )

        # 2.2 – 2.9 : P, Q and the secant appear
        self.play(
            m.FadeIn(p_dot, run_time=0.4),
            m.FadeIn(p_ring, run_time=0.4),
            m.FadeIn(p_label, run_time=0.4),
            m.Create(guide, run_time=0.5),
            m.FadeIn(q_dot, run_time=0.4),
            m.FadeIn(secant_intro, run_time=0.5),
            run_time=0.7,
        )
        self.remove(secant_intro)
        self.add(secant)

        # 2.9 – 6.0 : Q slides toward P, the secant turns
        self.play(
            q.animate.set_value(1.0),
            run_time=3.1,
            rate_func=m.smooth,
        )

        # 6.0 – 6.5 : land; the secant gives way to the tangent
        pulse = m.Circle(
            radius=0.10, arc_center=P, stroke_color=ACCENT, stroke_width=2.0,
        )
        self.play(
            m.FadeIn(pulse, run_time=0.15),
            pulse.animate.scale(2.8).fade(1),
            m.FadeOut(secant, run_time=0.45),
            m.FadeOut(q_dot, run_time=0.30),
            m.Create(tangent, run_time=0.5),
            m.FadeIn(tangent_glow, run_time=0.4),
            definition.animate.set_opacity(0.35),
            def_label.animate.set_opacity(0.45),
            run_time=0.55,
        )
        self.remove(pulse)

        # 6.55 – 7.15 : the worked case
        self.play(
            m.Create(special_line, run_time=0.6),
            m.FadeIn(section_label, shift=0.06 * m.UP, run_time=0.5),
            m.FadeIn(function_label, shift=0.06 * m.UP, run_time=0.5),
            run_time=0.6,
        )

        # 7.15 – 8.95 : the answer
        self.play(
            m.Write(equation, run_time=1.2),
            m.FadeIn(annotation, shift=0.08 * m.UP, run_time=0.8),
            m.FadeIn(footnote, shift=0.08 * m.UP, run_time=0.8),
            m.FadeIn(page, run_time=0.6),
            run_time=1.8,
        )

        # 8.95 – 10.0 : hold
        self.wait(1.05)
