#!/usr/bin/env python3
"""环境探针：一个进程内回答「字体能不能排、公式能不能转、API 长什么样」。

由 lib/doctor.js 调用（venv 里的 python），不单独给用户跑。
只构造对象，不渲染、不写盘：约 0.25 s。真正的渲染验证留给项目自己的最小场景。

stdout 必须是单行 JSON。任何未捕获异常都由 JS 侧兜成 "probe failed"。
"""

import json
import sys

# 代表三条最容易踩的路径：极限/分式、微分记号、积分。
MATH_SAMPLES = [
    ("lim", r"f'(x)=\lim_{\Delta x\to 0}\frac{f(x+\Delta x)-f(x)}{\Delta x}"),
    ("differential", r"dy=f'(x)\,dx"),
    ("integral", r"\int_0^1 x^2\,dx"),
]

FONT_SAMPLES = [
    ("PingFang SC", "微分：把曲线拉成直线", "cjk"),
    ("Helvetica Neue", "ABC 123", "latin"),
]

# agent 常为这几个去翻 site-packages 源码；签名直接放进报告。
API_NAMES = ["MathTex", "Text", "DecimalNumber", "ValueTracker", "Axes"]


def package_version(name):
    try:
        from importlib.metadata import version

        return version(name)
    except Exception:
        return None


def check_fonts(text_cls):
    rows = []
    for family, sample, kind in FONT_SAMPLES:
        row = {"family": family, "kind": kind, "ok": False}
        try:
            obj = text_cls(sample, font=family, font_size=34)
            row["ok"] = float(obj.width) > 0 and float(obj.height) > 0
            row["width"] = round(float(obj.width), 2)
        except Exception as exc:  # noqa: BLE001 - 报告里要原文
            row["error"] = f"{type(exc).__name__}: {exc}"[:160]
        rows.append(row)
    return rows


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


def api_signatures(module):
    import inspect

    out = {}
    for name in API_NAMES:
        cls = getattr(module, name, None)
        if cls is None:
            continue
        try:
            sig = str(inspect.signature(cls.__init__))
        except (TypeError, ValueError):
            sig = "(signature unavailable)"
        # 去掉 self，太长就截断：要的是参数名，不是注解全文。
        sig = sig.removeprefix("(self, ").removeprefix("(self)")
        out[name] = sig[:320]
    return out


def main():
    out = {"ok": True, "python": sys.version.split()[0], "errors": []}

    try:
        import manimgx as motion
        from manimgx import Axes, DecimalNumber, MathTex, Text, ValueTracker  # noqa: F401
    except Exception as exc:  # noqa: BLE001
        out["ok"] = False
        out["errors"].append(f"import manimgx: {type(exc).__name__}: {exc}"[:300])
        print(json.dumps(out, ensure_ascii=False))
        return 0

    out["manimgx"] = package_version("manimgx")
    out["sympy"] = package_version("sympy")
    out["fonts"] = check_fonts(Text)
    out["formulas"] = check_formulas(MathTex)
    out["api"] = api_signatures(motion)

    if not any(row["ok"] for row in out["fonts"]):
        out["ok"] = False
        out["errors"].append("字体全部构造失败：检查 manimgx-fonts 与系统字体")
    if not all(row["ok"] for row in out["formulas"]):
        out["ok"] = False

    print(json.dumps(out, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    sys.exit(main())
