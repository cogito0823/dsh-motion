"""Euler's identity, in one half turn around the unit circle.

10.0 s · 1920×1080 · 60 fps
"""

import numpy as np

import manimgx as m

m.config.pixel_width, m.config.pixel_height = 1920, 1080
m.config.frame_rate = 60
m.config.background_color = "#0B0F16"

GROUND = "#0B0F16"
INK = "#EFEAE0"
MUTED = "#8791A3"
AXIS = "#344054"
ACCENT = "#E3A857"

FONT = "Noto Sans CJK SC"

RADIUS = 2.05
CENTER = np.array([-2.50, -0.60, 0.0])


def polar(angle: float, radius: float = RADIUS) -> np.ndarray:
    return CENTER + radius * np.array([np.cos(angle), np.sin(angle), 0.0])


class EulerHalfTurn(m.Scene):
    def construct(self) -> None:
        # ---------------------------------------------------------------- backdrop
        # a smooth, dithered pool of light instead of a hard-edged halo disc
        h, w = 1080, 1920
        yy, xx = np.mgrid[0:h, 0:w]
        sx = (xx / (w - 1) - 0.5) * m.config.frame_width
        sy = (0.5 - yy / (h - 1)) * m.config.frame_height
        dist = np.hypot(sx - CENTER[0], sy - CENTER[1])
        glow = np.exp(-((dist / 3.4) ** 2))
        edge = np.array([11.0, 15.0, 22.0])
        core = np.array([21.0, 26.0, 36.0])
        rgb = edge + glow[..., None] * (core - edge)
        rng = np.random.default_rng(7)
        pixels = np.clip(
            rgb + rng.integers(-1, 2, rgb.shape), 0, 255
        ).astype(np.uint8)
        backdrop = m.ImageMobject(
            pixels, scale_to_resolution=1080, resampling_algorithm=3
        )
        backdrop.move_to(m.ORIGIN)
        self.add(backdrop)

        # ------------------------------------------------------------- left column
        kicker = m.Text(
            "数学速写  /  001", font=FONT, font_size=21, color=ACCENT
        ).move_to([0, 0, 0])
        title = m.Text(
            "欧拉公式", font=FONT, font_size=64, weight=m.BOLD, color=INK
        )
        subtitle = m.Text("单位圆上的半圈", font=FONT, font_size=26, color=MUTED)

        title_block = m.VGroup(kicker, title, subtitle).arrange(
            m.DOWN, buff=0.20, aligned_edge=m.LEFT
        )
        title_block.move_to([-6.55, 2.62, 0], aligned_edge=m.LEFT)
        # keep the block's left edge on the page margin
        title_block.shift([-6.55 - title_block.get_left()[0], 0, 0])

        hairline = m.Line(
            [-6.55, 1.62, 0], [-4.83, 1.62, 0], stroke_color=ACCENT,
            stroke_width=1.4, stroke_opacity=0.55,
        )

        # ------------------------------------------------------------- axes & unit circle
        re_axis = m.Arrow(
            [CENTER[0] - 2.62, CENTER[1], 0],
            [CENTER[0] + 2.62, CENTER[1], 0],
            buff=0, stroke_color=AXIS, stroke_width=1.4,
            tip_length=0.13, max_tip_length_to_length_ratio=0.06,
        )
        im_axis = m.Arrow(
            [CENTER[0], CENTER[1] - 2.50, 0],
            [CENTER[0], CENTER[1] + 2.62, 0],
            buff=0, stroke_color=AXIS, stroke_width=1.4,
            tip_length=0.13, max_tip_length_to_length_ratio=0.06,
        )
        re_label = m.Text("Re", font="serif", slant=m.ITALIC, font_size=21, color=MUTED)
        re_label.move_to([CENTER[0] + 2.93, CENTER[1] + 0.28, 0])
        im_label = m.Text("Im", font="serif", slant=m.ITALIC, font_size=21, color=MUTED)
        im_label.move_to([CENTER[0] - 0.34, CENTER[1] + 2.83, 0])

        tick_one = m.Line(
            [CENTER[0] + RADIUS, CENTER[1] - 0.07, 0],
            [CENTER[0] + RADIUS, CENTER[1] + 0.07, 0],
            stroke_color=MUTED, stroke_width=1.6,
        )
        tick_neg = m.Line(
            [CENTER[0] - RADIUS, CENTER[1] - 0.07, 0],
            [CENTER[0] - RADIUS, CENTER[1] + 0.07, 0],
            stroke_color=MUTED, stroke_width=1.6,
        )
        label_one = m.Text("1", font="serif", font_size=22, color=MUTED)
        label_one.move_to([CENTER[0] + RADIUS + 0.26, CENTER[1] - 0.30, 0])
        label_neg = m.Text("−1", font="serif", font_size=22, color=MUTED)
        label_neg.move_to([CENTER[0] - RADIUS - 0.35, CENTER[1] + 0.30, 0])

        origin_dot = m.Dot([CENTER[0], CENTER[1], 0], radius=0.035, color=MUTED)

        circle = m.Circle(
            radius=RADIUS, arc_center=CENTER, stroke_color="#6E7C93",
            stroke_width=2.2, stroke_opacity=0.90,
        )
        # ------------------------------------------------------------- rotation
        theta = m.ValueTracker(0.0)

        def tip() -> np.ndarray:
            return polar(theta.get_value())

        def arm_glow() -> m.Arrow:
            return m.Arrow(
                [CENTER[0], CENTER[1], 0], tip(), buff=0,
                stroke_color=ACCENT, stroke_width=13,
                stroke_opacity=0.11, fill_opacity=0.11,
                tip_length=0.19, max_tip_length_to_length_ratio=0.20,
            )

        def arm() -> m.Arrow:
            return m.Arrow(
                [CENTER[0], CENTER[1], 0], tip(), buff=0,
                stroke_color=ACCENT, stroke_width=4.2,
                tip_length=0.19, max_tip_length_to_length_ratio=0.20,
            )

        # a still copy for the grow-in, then the updater-driven arm takes over
        start_glow = arm_glow()
        start_arm = arm()

        vector_glow = m.always_redraw(arm_glow)
        vector = m.always_redraw(arm)
        dot = m.Dot(tip(), radius=0.085, color=INK)
        dot.add_updater(lambda d: d.move_to(tip()))
        dot_ring = m.Circle(
            radius=0.16, arc_center=tip(), stroke_color=ACCENT,
            stroke_width=1.8, stroke_opacity=0.70,
        )
        dot_ring.add_updater(lambda c: c.move_to(tip()))

        angle_arc = m.always_redraw(
            lambda: m.Arc(
                radius=0.56, start_angle=0.0,
                angle=max(theta.get_value(), 0.001), arc_center=CENTER,
                stroke_color=ACCENT, stroke_width=2.2,
            )
        )
        theta_label = m.Text(
            "θ", font="serif", slant=m.ITALIC, font_size=25, color=ACCENT
        )
        theta_label.set_opacity(0)

        def follow_arc(label: m.Mobject) -> None:
            a = theta.get_value()
            angle = a / 2 - 0.28
            label.move_to(
                CENTER + 0.98 * np.array([np.cos(angle), np.sin(angle), 0.0])
            )
            label.set_opacity(max(0.0, min(1.0, (a - 0.22) / 0.45)))

        theta_label.add_updater(follow_arc)

        trail_glow = m.TracedPath(
            tip, stroke_color=ACCENT, stroke_width=15, stroke_opacity=0.10
        )
        trail = m.TracedPath(
            tip, stroke_color=ACCENT, stroke_width=4.6, stroke_opacity=0.95
        )

        # ------------------------------------------------------------- right column
        general_label = m.Text("一般形式", font=FONT, font_size=18, color=MUTED)
        general_label.move_to([4.00, 3.08, 0])
        general = m.MathTex(
            r"e^{i\theta} = \cos\theta + i\sin\theta",
            font_size=36, color=INK,
        ).move_to([4.00, 2.50, 0])

        divider = m.Line(
            [0.82, 3.40, 0], [0.82, -2.92, 0],
            stroke_color=AXIS, stroke_width=1.0, stroke_opacity=0.75,
        )

        special_line = m.Line(
            [1.32, 1.76, 0], [6.68, 1.76, 0],
            stroke_color=AXIS, stroke_width=1.2,
        )
        special_label = m.Text("特例", font=FONT, font_size=18, color=MUTED)
        special_label.move_to([1.32, 1.94, 0], aligned_edge=m.LEFT)
        special_angle = m.MathTex(r"\theta = \pi", font_size=23, color=ACCENT)
        special_angle.move_to([6.68, 1.94, 0], aligned_edge=m.RIGHT)

        equation = m.MathTex(
            "e^{i\\pi}", "+", "1", "=", "0",
            font_size=80, color=INK,
        ).move_to([4.00, 0.64, 0])
        equation[-1].set_color(ACCENT)

        caption = m.Text("五个常数，一个等式", font=FONT, font_size=26, color=INK)
        caption.set_opacity(0.85)
        caption.move_to([4.00, -0.55, 0])

        constants = m.Text("e   ·   i   ·   π   ·   1   ·   0", font="serif",
                           font_size=22, color=MUTED)
        constants.set_opacity(0.80)
        constants.move_to([4.00, -1.12, 0])

        # small page mark, bottom right
        page = m.Text("10 s  /  ONE HALF TURN", font="sans-serif",
                      font_size=17, color=MUTED)
        page.set_opacity(0.65)
        page.move_to([6.68, -2.70, 0], aligned_edge=m.RIGHT)

        # ---------------------------------------------------------------- timeline
        # 0.0 – 1.2 : title, right-column statement
        self.play(
            m.Write(kicker, run_time=0.9),
            m.Write(title, run_time=1.05),
            m.FadeIn(subtitle, shift=0.10 * m.UP, run_time=0.8),
            m.FadeIn(general_label, run_time=0.7),
            m.FadeIn(general, shift=0.10 * m.UP, run_time=0.9),
            m.Create(divider, run_time=1.0),
            run_time=1.2,
        )

        # 1.2 – 2.2 : coordinate frame and unit circle
        self.play(
            m.Create(re_axis, run_time=0.9),
            m.Create(im_axis, run_time=0.9),
            m.FadeIn(re_label, run_time=0.6),
            m.FadeIn(im_label, run_time=0.6),
            m.Create(tick_one, run_time=0.5),
            m.Create(tick_neg, run_time=0.5),
            m.FadeIn(label_one, run_time=0.5),
            m.FadeIn(label_neg, run_time=0.5),
            m.FadeIn(origin_dot, run_time=0.4),
            m.Create(circle, run_time=1.0),
            m.Create(hairline, run_time=0.7),
            run_time=1.0,
        )

        # 2.2 – 2.9 : the arm grows to the unit circle
        self.play(
            m.GrowArrow(start_arm, run_time=0.7),
            m.FadeIn(start_glow, run_time=0.5),
            m.FadeIn(dot, run_time=0.4),
            m.FadeIn(dot_ring, run_time=0.4),
            run_time=0.7,
        )
        self.remove(start_arm, start_glow)

        # 2.9 – 6.2 : half a turn, with the traced arc
        self.add(vector_glow, vector, trail_glow, trail, angle_arc, theta_label)
        self.play(
            theta.animate.set_value(np.pi),
            run_time=3.3,
            rate_func=m.smooth,
        )

        # 6.2 – 6.9 : land on −1
        pulse = m.Circle(
            radius=0.10, arc_center=polar(np.pi), stroke_color=ACCENT,
            stroke_width=2.0,
        )
        self.play(
            m.FadeIn(pulse, run_time=0.15),
            pulse.animate.scale(2.6).fade(1),
            label_neg.animate.set_color(ACCENT),
            general.animate.set_opacity(0.30),
            general_label.animate.set_opacity(0.45),
            run_time=0.7,
            rate_func=m.rush_from,
        )
        self.remove(pulse)

        # 6.9 – 8.4 : the special case
        self.play(
            m.Create(special_line, run_time=0.6),
            m.FadeIn(special_label, shift=0.06 * m.UP, run_time=0.5),
            m.FadeIn(special_angle, shift=0.06 * m.UP, run_time=0.5),
            run_time=0.6,
        )
        self.play(
            m.Write(equation, run_time=1.2),
            m.FadeIn(caption, shift=0.08 * m.UP, run_time=0.8),
            m.FadeIn(constants, shift=0.08 * m.UP, run_time=0.8),
            m.FadeIn(page, run_time=0.6),
            run_time=1.5,
        )

        # 8.4 – 10.0 : hold
        self.wait(1.0)
