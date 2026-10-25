# 风格库

可复用的视觉语言。当前有 5 套：4 套改编自 [Lemo-Opuscar](https://github.com/lemomo-ai/lemo-opuscar)（MIT），1 套来自 Manim 社区的 3b1b skill。都不是自创：

| 风格 | 适合 | 来源 | 入口 |
|---|---|---|---|
| `swiss-motion` / 瑞士动态排版（默认） | 公式、定义、数据结论 | [Lemo](https://github.com/lemomo-ai/lemo-opuscar/tree/main/styles/swiss-motion) | [STYLE](swiss-motion/STYLE.md) · [tokens](swiss-motion/tokens.json) · [theme](swiss-motion/theme.py) |
| `dataviz` / 数据叙事 | 趋势、比较、分布、科学数据 | [Lemo](https://github.com/lemomo-ai/lemo-opuscar/tree/main/styles/dataviz) | [STYLE](dataviz/STYLE.md) · [tokens](dataviz/tokens.json) · [theme](dataviz/theme.py) |
| `blueprint` / 蓝图工程制图 | 几何证明、结构、尺寸关系 | [Lemo](https://github.com/lemomo-ai/lemo-opuscar/tree/main/styles/blueprint) | [STYLE](blueprint/STYLE.md) · [tokens](blueprint/tokens.json) · [theme](blueprint/theme.py) |
| `whiteboard` / 白板讲解 | 科学解释、课程、机制说明 | [Lemo](https://github.com/lemomo-ai/lemo-opuscar/tree/main/styles/whiteboard) | [STYLE](whiteboard/STYLE.md) · [tokens](whiteboard/tokens.json) · [theme](whiteboard/theme.py) |
| `3b1b` / 3b1b 数学动画 | 线代、微积分、概率、神经网络 | [subinium](https://github.com/subinium/3b1b-style-animation-skill) · [manim_skill](https://github.com/adithya-s-k/manim_skill) | [STYLE](3b1b/STYLE.md) · [tokens](3b1b/tokens.json) · [theme](3b1b/theme.py) |

## 约定

- 每个风格目录：`style.json`（元数据）+ `STYLE.md`（不变量）+ `tokens.json` + `theme.py` + `preview.jpg`；
- `STYLE.md` 是**改编**，必须在上游基础上写清楚差异；不复制 demo 代码；
- 颜色、字体、时间表、音频以 `tokens.json` 为准；版面坐标与组件配方写在 `STYLE.md`；
- 新片在自己的项目目录写 `DESIGN.md`，头部 `style: swiss-motion` + `style_version: 1.0.0`；
- 参考与示例统一用 HyperFrames 的 [examples](https://hyperframes.heygen.com/examples) / [catalog](https://hyperframes.heygen.com/catalog)，不在仓库里放样片（`showcase/` 只放可复现的演示）。

## 许可

- 上游风格文档：Lemo-Opuscar / subinium / adithya-s-k 均为 MIT，分别署名；
- 上游 demo 静帧：CC BY 4.0，商用需署名；
- 本仓库的 `theme.py` / `tokens.json` / 场景代码：MIT。
