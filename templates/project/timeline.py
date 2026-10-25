"""时间轴助手：cue 表 + 运行时落后告警。

复制到项目根后，scene.py 通过 `from timeline import TimedScene` 使用。
`TimedScene.cue("hook")` 会对比 `self.time` 与 timeline.json 里的 at：
落后超过 late_threshold 就打印 `[late]`，`strict_late=True` 时直接失败。
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

import manimgx as m


class Timeline:
    def __init__(self, data: dict, path: Path | None = None) -> None:
        self.data = data
        self.path = path
        cues = data.get("cues")
        if not isinstance(cues, list) or not cues:
            raise ValueError(f"{path or '<timeline>'} 缺少 cues")
        self.cues = {str(cue["id"]): cue for cue in cues if "id" in cue}
        self.late: list[dict] = []

    @classmethod
    def load(cls, path: Path | str) -> "Timeline":
        source = Path(path)
        return cls(json.loads(source.read_text(encoding="utf-8")), source)

    def cue(self, cue_id: str) -> dict:
        item = self.cues.get(str(cue_id))
        if item is None:
            raise KeyError(f"timeline 里没有 cue: {cue_id}")
        return item


class TimedScene(m.Scene):
    """带 cue 校验的 Scene。

    - `timeline_file`：相对 scene.py 的 timeline 文件；
    - `late_threshold`：允许落后多少秒才告警；
    - `strict_late`：True 时落后直接抛错，适合最终渲染。
    """

    timeline_file = "timeline.json"
    late_threshold = 0.35
    strict_late = False

    def setup(self) -> None:
        self.timeline = Timeline.load(Path(__file__).with_name(self.timeline_file))

    def cue(self, cue_id: str) -> dict:
        item = self.timeline.cue(cue_id)
        expected = float(item["at"])
        drift = float(self.time) - expected
        if drift > self.late_threshold:
            message = (
                f"[late] cue={cue_id} expected={expected:.2f}s "
                f"now={float(self.time):.2f}s drift={drift:+.2f}s"
            )
            print(message, file=sys.stderr, flush=True)
            self.timeline.late.append(
                {
                    "id": str(cue_id),
                    "expected": expected,
                    "actual": float(self.time),
                    "drift": round(drift, 3),
                }
            )
            if self.strict_late:
                raise RuntimeError(message)
        return item
