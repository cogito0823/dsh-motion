#!/usr/bin/env python3
"""探针单测：不依赖 manimgx，用假 Text 复现“静默回退”。

关键断言：不存在的字体即使 width>0，也必须被判为未解析；
只差一个维度（宽度相同、高度不同）仍算解析成功。
"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "lib"))

import probe_env as probe  # noqa: E402

BASELINE = (1.0, 0.4)
VALID = (1.25, 0.43)
HALF_MATCH = (1.0, 0.43)


class FakeText:
    def __init__(self, sample, font="", font_size=34):
        self.width, self.height = {
            "PingFang SC": VALID,
            "Noto Sans CJK SC": (1.1, 0.41),
            "HalfMatch": HALF_MATCH,
        }.get(font, BASELINE)


def main():
    probe.FONT_INVENTORY = [
        ("PingFang SC", "cjk"),
        ("NoSuchFontXYZ", "cjk"),
        ("Noto Sans CJK SC", "cjk"),
        ("HalfMatch", "cjk"),
        ("Helvetica Neue", "latin"),
    ]
    rows, cjk, error = probe.check_fonts(FakeText)
    assert error is None, error

    by_family = {row["family"]: row for row in rows}

    # 真字体：解析成功
    assert by_family["PingFang SC"]["resolved"] is True
    assert by_family["Noto Sans CJK SC"]["resolved"] is True

    # 假字体：必须判为回退，即使 width>0（旧探针就是在这里误判）
    assert by_family["NoSuchFontXYZ"]["width"] == BASELINE[0] > 0
    assert by_family["NoSuchFontXYZ"]["resolved"] is False
    assert by_family["NoSuchFontXYZ"]["ok"] is False

    # 只差高度：仍算解析成功，避免误杀字形差异
    assert by_family["HalfMatch"]["resolved"] is True

    assert cjk == ["PingFang SC", "Noto Sans CJK SC", "HalfMatch"], cjk
    assert "NoSuchFontXYZ" not in cjk

    print("ok  probe fonts: fallback baseline / resolve / half-match")


if __name__ == "__main__":
    main()
