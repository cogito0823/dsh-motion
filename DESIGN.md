---
style: swiss-motion
style_version: 1.0.0
updated: 2026-10-26
---

# dsh-motion · 默认视觉风格

本项目默认采用 **瑞士动态排版（swiss-motion）**：纸灰底、墨黑字、一个红色信号色、12 栏网格；运动像印刷机一样精确。

> 这是视觉风格契约，不是代码架构；模块边界见 [ARCHITECTURE.md](ARCHITECTURE.md)。

这套语言改编自 [Lemo-Opuscar 的 Swiss Motion Graphics](https://github.com/lemomo-ai/lemo-opuscar/tree/main/styles/swiss-motion)（MIT），不是自创；另外四套可用风格是 `dataviz`、`blueprint`、`whiteboard`、`3b1b`；选择规则在 `styles/registry.json`。

## 使用规则

1. 先跑 `node scripts/route-style.mjs "<题材>"`：**点名风格优先**，其次按 `styles/registry.json` 的 `keywords` / `uses` 打分，最后才回退默认 `swiss-motion`。分数并列或为 0 时先问用户，不自动拍板。
   常用映射：公式/排版 → `swiss-motion`；数据/图表 → `dataviz`；几何/工程 → `blueprint`；科学讲解 → `whiteboard`；线代/微积分/复数/神经网络 → `3b1b`。
2. 在项目自己的 `DESIGN.md` 头部写 `style: <slug>` + `style_version: 1.0.0`；风格元数据以 `styles/<slug>/style.json` 为准，`styles/README.md` 与 `registry.json` 用 `npm run styles:index` 生成。
3. 需要改语言时在项目 `DESIGN.md` 里覆盖，不要改风格包；换全项目默认才改本文件并升版本。
4. 上屏公式先过 `formula_check`；场景先过 `motion_frames`（默认，不生成视频），定稿后再 `motion_render`。
5. 参考与示例统一用 HyperFrames 的 [examples](https://hyperframes.heygen.com/examples) / [catalog](https://hyperframes.heygen.com/catalog) / [frame.md](https://hyperframes.heygen.com/prompting/design-systems)。

## 风格入口

| 风格 | 规范 | Tokens | 主题工具 |
|---|---|---|---|
| `swiss-motion` | [STYLE](styles/swiss-motion/STYLE.md) | [tokens](styles/swiss-motion/tokens.json) | [theme.py](styles/swiss-motion/theme.py) |
| `dataviz` | [STYLE](styles/dataviz/STYLE.md) | [tokens](styles/dataviz/tokens.json) | [theme.py](styles/dataviz/theme.py) |
| `blueprint` | [STYLE](styles/blueprint/STYLE.md) | [tokens](styles/blueprint/tokens.json) | [theme.py](styles/blueprint/theme.py) |
| `whiteboard` | [STYLE](styles/whiteboard/STYLE.md) | [tokens](styles/whiteboard/tokens.json) | [theme.py](styles/whiteboard/theme.py) |
| `3b1b` | [STYLE](styles/3b1b/STYLE.md) | [tokens](styles/3b1b/tokens.json) | [theme.py](styles/3b1b/theme.py) |

五个参考帧：`styles/<slug>/preview.jpg`。除 `3b1b` 来自 Manim 社区外，其余四套改编自 Lemo-Opuscar；许可与差异写在各 `STYLE.md` 顶部。

## 演示

`showcase/` 里有五个类别的短片（公式 / 数据 / 几何 / 白板 / 暗场数学），每个都记录出帧与渲染耗时，见 [showcase/README.md](showcase/README.md)。
