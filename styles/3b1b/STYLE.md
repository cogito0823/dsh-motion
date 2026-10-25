---
name: 3b1b
version: 1.0.0
source: https://github.com/subinium/3b1b-style-animation-skill
license: MIT（上游风格 skill）；非 3Blue1Brown 官方项目
status: adapted
---

# 3Blue1Brown Style · 3b1b

> 配色表取自 [subinium/3b1b-style-animation-skill](https://github.com/subinium/3b1b-style-animation-skill)（MIT）；
> 教学法与动画模式参考 [adithya-s-k/manim_skill](https://github.com/adithya-s-k/manim_skill)（MIT，约 1.2k stars，是这类 skill 里用得最多的）。
> 本文件是改编，不是原样复制；只保留不变量，实现换成 manimgx。

## 1. 定位

先建立直觉，再给公式。画面为“暗场 + 蓝黄高亮”的数学解释：

- 适合：线性代数、微积分、概率、神经网络、算法；
- 不适合：没有“为什么”的产品宣传、角色叙事。

## 2. 不变量

| 项 | 规则 |
|---|---|
| 底色 | `#1c1c1c`（近黑灰，**不用纯黑**） |
| 主色 | 蓝 `#3b82f6`：主对象、向量、节点 |
| 强调 | 黄 `#fbbf24`：高亮、结论、公式 |
| 语义色 | 绿 `#22c55e` 正 / 红 `#ef4444` 负 / 灰 `#9ca3af` 非活动 |
| 公式 | 黄色 `#fde047` 或白色；一屏最多 4–5 种颜色 |
| 字体 | 无衬线（Noto Sans）；公式 New Computer Modern |
| 运动 | `Create` / `FadeIn` / `Transform`；相关元素**同时**出现（`LaggedStartMap` 式级联），不要一个个 `play()` |
| 收尾 | 结尾至少 `wait(2)`，给结论停留 |

## 3. 教学法

1. **Hook**：先问一个有意思的问题；
2. **Intuition**：用图形建立直觉，先不写公式；
3. **Concrete**：用一个具体数字走一遍；
4. **Formalization**：最后才给公式/命名。

## 4. manimgx 映射

- `theme.py`：`apply_config()` 设 `#1c1c1c`、`backdrop()` 返回平涂底；
- 用 `Axes`、`Dot`、`Arrow`、`Line`、`always_redraw` 做旋转/投影/变换；
- 用 `MathTex` 排版公式，`Text` 做标题与注释；
- manimgx 的 `Write` 已经足够接近 Manim 的 `Write`；不需要 LaTeX 环境。

## 5. Do / Don't

**Do**

- 先画“正在发生什么”，再写“它叫什么”；
- 蓝=对象，黄=高亮/结论；颜色有语义；
- 一次只讲一个变换；结尾停 2 秒。

**Don't**

- 不用纯黑 `#000000`；
- 不用高饱和纯红/纯绿/纯蓝；
- 不在建立直觉前抛公式；
- 不把每个元素拆成单独的 `play()`。

## 6. 与上游的差异

- 上游是 ManimCE/ManimGL skill，包含 40+ 条规则；这里只抽取配色、运动与教学法；
- 上游使用 Manim 的 `LaggedStartMap` 等 API；manimgx 用 `AnimationGroup`/`LaggedStart` 近似；
- 不是 3Blue1Brown 官方风格指南，只是社区通行做法的整理。
