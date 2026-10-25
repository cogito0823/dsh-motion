# manimgx 常用 API 速查

> `motion_doctor` 的 `api` / `functions` / `rates` 只放高频入口；本表覆盖场景里最常写的其余部分。
> **不要为了查签名去读 `site-packages` 源码。** 这里没有再列的类，先用 `motion_doctor` 的返回，
> 或在项目里用一条命令补：`python -c "import inspect, manimgx as m; print(inspect.signature(m.X))"`。

## 0. 入口与配置

```python
import numpy as np
import manimgx as m
from manimgx import *          # 与 Manim CE 习惯一致

class Demo(m.Scene):
    def construct(self):
        m.config.pixel_width = 1920
        m.config.pixel_height = 1080
        m.config.frame_rate = 30
        m.config.background_color = "#0B1020"
        self.play(Write(Text("你好", font="PingFang SC")))
        self.wait(0.5)
```

- 风格包用 `styles/<slug>/theme.py` 的 `apply_config()` / `backdrop()`，不要在每个场景里重抄 token。
- 颜色常量：`WHITE/BLACK/RED/BLUE/GREEN/YELLOW/GRAY` 及 `*_A`–`*_E` 梯度；自定义用 `ManimColor("#RRGGBB")`。
- 方向：`UP/DOWN/LEFT/RIGHT/ORIGIN/UL/UR/DL/DR`；角度：`PI/TAU/DEGREES`。

## 1. 文字与公式

| 类 | 用途 | 关键参数 |
|---|---|---|
| `Text(text, font=..., font_size=..., weight=..., slant=...)` | 中文/普通文字 | `font` 用 `motion_doctor` 的 `fonts.cjk` |
| `Paragraph(*text, alignment="left")` | 多段/多行 | 继承 `TextOptions` |
| `MathTex(*tex, tex_to_color_map={...}, substrings_to_isolate=[...])` | 公式（Typst，无需 LaTeX） | `font_size` |
| `DecimalNumber(value, num_decimal_places=2, unit="")` | 动态数字 | 配 `ValueTracker` |
| `Integer(value)` | 动态整数 | 同上 |

```python
title = Text("欧拉公式", font="PingFang SC", font_size=48, weight=BOLD)
eq = MathTex(r"e^{i\pi}+1=0", font_size=64, color=YELLOW)
num = DecimalNumber(0, num_decimal_places=2).next_to(eq, DOWN)
tracker = ValueTracker(0)
num.add_updater(lambda mob: mob.set_value(tracker.get_value()))
```

- 中文不要塞进 `MathTex`；公式里的中文用 `Text` 单独放。
- 字体不存在时 manimgx **静默回退**；只信 `motion_doctor.fonts.cjk`，不要用 `fc-list` 猜。
- 字距/行距：`line_spacing`（em）、`t2c/t2g/t2s/t2w` 按子串改色/渐变/样式/权重。

## 2. 形状与布局

| 类 | 常用参数 |
|---|---|
| `Line(start, end, buff=0, path_arc=0)` | 直线/弧线 |
| `Arrow(start, end, buff=0.25, tip_shape=...)` | 箭头 |
| `DoubleArrow(start, end)` | 双向箭头 |
| `DashedLine(start, end, dash_length=...)` | 虚线 |
| `Circle(radius=..., color=...)` | 圆 |
| `Dot(point, radius=0.08)` | 点 |
| `Rectangle(width=4, height=2)` | 矩形 |
| `RoundedRectangle(corner_radius=0.2)` | 圆角矩形 |
| `Polygon(*vertices)` | 多边形 |
| `Arc(radius=1, start_angle=0, angle=PI/2)` | 圆弧 |
| `Brace(mobject, direction=DOWN)` | 花括号 |
| `VGroup(*mobjects)` / `Group(*mobjects)` | 成组变换 |

布局方法（所有 Mobject 通用）：`move_to(point, aligned_edge=...)`、`next_to(other, direction, buff=...)`、
`shift(vector)`、`scale(factor)`、`rotate(angle)`、`set_color(...)`、`set_stroke(color, width)`、
`set_fill(color, opacity)`、`arrange(direction, buff=...)`、`get_center()`、`get_left()`、`width/height`。

```python
axes = Axes(x_range=[-4, 4, 1], y_range=[-2, 2, 1], x_length=9, y_length=4.5)
graph = axes.plot(lambda x: np.sin(x), color=BLUE)
label = Text("sin x", font="PingFang SC", font_size=24).next_to(graph, UP)
self.play(Create(axes), Create(graph), FadeIn(label))
```

坐标：`axes.c2p(x, y)` 把数据坐标转画面坐标；`axes.plot` / `axes.get_graph` 画函数；
`NumberPlane` 画网格；`ComplexPlane` 画复平面。

## 3. 动画

| 动画 | 用途 |
|---|---|
| `Create(mobject)` / `Uncreate` | 描边生长 |
| `Write(text)` / `Unwrite` | 书写 |
| `FadeIn(*mobs, shift=UP)` / `FadeOut` | 淡入淡出 |
| `Transform(a, b)` / `ReplacementTransform(a, b)` | 变形（后者保留目标） |
| `TransformMatchingTex(a, b)` | 公式项匹配变形 |
| `Indicate(mob, color=YELLOW)` | 强调 |
| `GrowArrow(arrow)` / `GrowFromCenter` | 生长 |
| `MoveAlongPath(mob, path)` | 沿路径 |
| `Rotate(mob, angle=...)` | 旋转 |
| `UpdateFromFunc(mob, func)` | 每帧更新 |
| `always_redraw(lambda: ...)` | 每帧重建（贵，少用） |

```python
self.play(Create(circle), run_time=1.2, rate_func=smooth)
self.play(TransformMatchingTex(eq1, eq2), run_time=0.8)
self.play(circle.animate.shift(RIGHT * 2).set_color(YELLOW))
```

- `self.play(*animations, run_time=..., rate_func=...)`；`self.wait(seconds)`。
- `self.add(...)` / `self.remove(...)` 立即上/下屏；`self.camera` 默认跟随配置。
- 缓动：`smooth`、`linear`、`ease_in_out_sine`、`ease_out_cubic`、`rush_into`、`there_and_back` 等（完整名单见 `motion_doctor.rates`）。
- 局部更新优先 `ValueTracker` + `add_updater`，不要整段 `always_redraw`。

## 4. 常用组合

```python
# 坐标系 + 动点 + 动态数值
t = ValueTracker(0)
dot = always_redraw(lambda: Dot(axes.c2p(t.get_value(), np.sin(t.get_value())), color=YELLOW))
self.add(dot, num)
self.play(t.animate.set_value(2 * PI), run_time=3, rate_func=linear)

# 高亮公式中的一项
eq = MathTex(r"e^{i\pi}+1=0", substrings_to_isolate=[r"e^{i\pi}"], tex_to_color_map={r"e^{i\pi}": BLUE})
self.play(Indicate(eq, color=YELLOW))
```

## 5. 输出与检查

```bash
# 只出帧（最快，默认先走这个）
motion_frames  # 工具内是 manimgx inspect <scene.py> -t 0.5,2.0,end
# 命令行等价
manimgx inspect scene.py -t 0.5,2.0,end

# 渲染
manimgx render scene.py SceneName -r 1920x1080 --fps 30 -o out/clip.mp4
```

- `inspect` 的 storyboard 每格顶部有 caption 条，不是画面裁切。
- 有 layout 问题时退出码 1，但 stdout 仍是完整报告；`motion_frames` 会照常返回。
- 首帧预算 ≤60 s：先用 6–8 个关键构图出 sheet，再补时间轴。
