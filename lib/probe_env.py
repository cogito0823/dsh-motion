#!/usr/bin/env python3
"""环境探针：一个进程内回答「字体能不能排、公式能不能转、API 长什么样」。

由 lib/doctor.js 调用（venv 里的 python），不单独给用户跑。
只构造对象，不渲染、不写盘：通常 0.3–0.8 s。真正的渲染验证留给项目自己的最小场景。

字体验证为什么要做“负样本”：
  manimgx 对不存在的字体是静默回退的——Text(font="NoSuchFontXYZ") 仍然
  返回宽高 > 0。旧探针用 width>0 判断，于是永远通过。现在先量一个故意
  不存在的家族作为基线；目标家族与基线宽高完全一致，就说明它也回退了。

stdout 必须是单行 JSON。任何未捕获异常都由 JS 侧兜成 "probe failed"。
"""

import inspect
import json
import sys

# 代表三条最容易踩的路径：极限/分式、微分记号、积分。
MATH_SAMPLES = [
    ("lim", r"f'(x)=\lim_{\Delta x\to 0}\frac{f(x+\Delta x)-f(x)}{\Delta x}"),
    ("differential", r"dy=f'(x)\,dx"),
    ("integral", r"\int_0^1 x^2\,dx"),
]

# 常用家族巡检：中文片选字体时真正需要的是“有哪些可用的”，不是只验两个。
FONT_INVENTORY = [
    ("PingFang SC", "cjk"),
    ("PingFang TC", "cjk"),
    ("Hiragino Sans GB", "cjk"),
    ("Songti SC", "cjk"),
    ("Kaiti SC", "cjk"),
    ("Yuanti SC", "cjk"),
    ("STHeiti", "cjk"),
    ("Heiti SC", "cjk"),
    ("Noto Sans CJK SC", "cjk"),
    ("Noto Serif CJK SC", "cjk"),
    ("Source Han Sans SC", "cjk"),
    ("Microsoft YaHei", "cjk"),
    ("SimHei", "cjk"),
    ("Arial Unicode MS", "cjk"),
    ("Chalkboard SE", "display"),
    ("Hannotate SC", "display"),
    ("HanziPen SC", "display"),
    ("Helvetica Neue", "latin"),
    ("Noto Sans", "latin"),
]

MISSING_FAMILY = "__dsh_motion_missing_family__"
SAMPLE_TEXT = {
    "cjk": "微分：把曲线拉成直线 abc 0123",
    "display": "微分：把曲线拉成直线",
    "latin": "ABC abc 0123",
}
EPSILON = 1e-6

# agent 常为这几个去翻 site-packages 源码；签名直接放进报告。
# 完整清单在 skills/animation-router/references/api.md，这里只放高频入口。
API_CLASSES = [
    "MathTex",
    "Text",
    "Paragraph",
    "DecimalNumber",
    "ValueTracker",
    "Axes",
    "NumberPlane",
    "Line",
    "Arrow",
    "Circle",
    "Dot",
    "Rectangle",
    "Polygon",
    "Arc",
    "ImageMobject",
    "VGroup",
]

API_FUNCTIONS = [
    "Create",
    "Write",
    "FadeIn",
    "FadeOut",
    "Transform",
    "ReplacementTransform",
    "TransformMatchingTex",
    "Indicate",
    "MoveAlongPath",
    "always_redraw",
]

RATE_NAMES = [
    "smooth",
    "linear",
    "ease_in_sine",
    "ease_out_sine",
    "ease_in_out_sine",
    "ease_in_quad",
    "ease_out_quad",
    "ease_in_out_quad",
    "ease_in_cubic",
    "ease_out_cubic",
    "ease_in_out_cubic",
    "there_and_back",
    "there_and_back_with_pause",
    "rush_into",
    "rush_from",
    "slow_into",
    "double_smooth",
    "running_start",
    "squish_rate_func",
]


def package_version(name):
    try:
        from importlib.metadata import version

        return version(name)
    except Exception:
        return None


def measure(text_cls, family, sample):
    """构造一次并返回 (width, height)；失败时抛异常。"""
    obj = text_cls(sample, font=family, font_size=34)
    return float(obj.width), float(obj.height)


def check_fonts(text_cls):
    """巡检常见家族，用“缺字体基线”识别静默回退。

    返回 rows（每行一个家族）与 resolved 列表。宽高同时与基线一致才算回退；
    只差一个维度仍视为解析成功，避免把字形差异误判成缺字体。
    """
    baselines = {}
    for kind, sample in SAMPLE_TEXT.items():
        try:
            baselines[kind] = measure(text_cls, MISSING_FAMILY, sample)
        except Exception as exc:  # noqa: BLE001 - 基线失败就没法判断
            return [], [], f"字体基线构造失败: {type(exc).__name__}: {exc}"[:200]

    rows = []
    for family, kind in FONT_INVENTORY:
        row = {"family": family, "kind": kind, "ok": False, "resolved": False}
        try:
            width, height = measure(text_cls, family, SAMPLE_TEXT[kind])
            base_width, base_height = baselines[kind]
            resolved = not (
                abs(width - base_width) <= EPSILON and abs(height - base_height) <= EPSILON
            )
            row.update(
                {
                    "ok": resolved,
                    "resolved": resolved,
                    "width": round(width, 3),
                    "height": round(height, 3),
                }
            )
        except Exception as exc:  # noqa: BLE001 - 报告里要原文
            row["error"] = f"{type(exc).__name__}: {exc}"[:160]
        rows.append(row)

    cjk = [row["family"] for row in rows if row["kind"] == "cjk" and row["resolved"]]
    return rows, cjk, None


def check_formulas(math_tex_cls):
    rows = []
    for label, tex in MATH_SAMPLES:
        row = {"label": label, "ok": False}
        try:
            obj = math_tex_cls(tex, font_size=40)
            row["ok"] = float(obj.width) > 0
        except Exception as exc:  # noqa: BLE001
            row["error"] = f"{type(exc).__name__}: {exc}"[:160]
        rows.append(row)
    return rows


def signature_of(obj):
    try:
        target = obj.__init__ if inspect.isclass(obj) else obj
        sig = str(inspect.signature(target))
    except (TypeError, ValueError):
        sig = "(signature unavailable)"
    # 去掉 self，太长就截断：要的是参数名，不是注解全文。
    sig = sig.removeprefix("(self, ").removeprefix("(self)")
    return sig[:320]


def api_signatures(module):
    classes = {}
    functions = {}
    for name in API_CLASSES:
        obj = getattr(module, name, None)
        if obj is not None:
            classes[name] = signature_of(obj)
    for name in API_FUNCTIONS:
        obj = getattr(module, name, None)
        if callable(obj):
            functions[name] = signature_of(obj)
    return classes, functions


def main():
    out = {"ok": True, "python": sys.version.split()[0], "errors": []}

    try:
        import manimgx as motion
        from manimgx import MathTex, Text  # noqa: F401
    except Exception as exc:  # noqa: BLE001
        out["ok"] = False
        out["errors"].append(f"import manimgx: {type(exc).__name__}: {exc}"[:300])
        print(json.dumps(out, ensure_ascii=False))
        return 0

    out["manimgx"] = package_version("manimgx")
    out["sympy"] = package_version("sympy")

    fonts, cjk_fonts, font_error = check_fonts(Text)
    out["fonts"] = fonts
    out["cjkFonts"] = cjk_fonts
    out["fontsOk"] = bool(cjk_fonts)
    if font_error:
        out["errors"].append(font_error)

    out["formulas"] = check_formulas(MathTex)
    out["formulasOk"] = bool(out["formulas"]) and all(row["ok"] for row in out["formulas"])

    classes, functions = api_signatures(motion)
    out["api"] = classes
    out["functions"] = functions
    out["rates"] = [name for name in RATE_NAMES if callable(getattr(motion, name, None))]

    if not out["fontsOk"]:
        out["ok"] = False
        out["errors"].append("没有任何中文字体通过“缺字体基线”校验")
    if not out["formulasOk"]:
        out["ok"] = False

    print(json.dumps(out, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    sys.exit(main())
