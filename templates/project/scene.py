"""{{TITLE}} · {{DURATION}}s · 1080p / 30fps

先跑 node scripts/timeline-check.mjs .，再出帧：
  motion_frames times=["0.2","3.0","7.0","end"]
"""
from __future__ import annotations

from timeline import TimedScene

import manimgx as m


class Main(TimedScene):
    def construct(self) -> None:
        self.cue("hook")
        title = m.Text("{{TITLE}}", font="PingFang SC", font_size=56).move_to(m.UP * 1.2)
        subtitle = m.Text("一个可以讲清楚的关系", font="PingFang SC", font_size=28, color=m.GRAY)
        subtitle.next_to(title, m.DOWN, buff=0.4)
        self.play(m.FadeIn(title), m.FadeIn(subtitle), run_time=0.6)
        self.wait(max(0.0, {{AT_POINT}} - float(self.time)))

        self.cue("point")
        relation = m.MathTex(r"a^2+b^2=c^2", font_size=64, color=m.YELLOW).move_to(m.ORIGIN)
        self.play(m.Transform(subtitle, relation), run_time=0.8)
        self.wait(max(0.0, {{AT_CLOSE}} - float(self.time)))

        self.cue("close")
        note = m.Text("先画关系，再写公式。", font="PingFang SC", font_size=32)
        note.next_to(relation, m.DOWN, buff=0.7)
        self.play(m.FadeIn(note), run_time=0.5)
        self.wait(max(0.0, {{DURATION}} - float(self.time) - 0.2))
