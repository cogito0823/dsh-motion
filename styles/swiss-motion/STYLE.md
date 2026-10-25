---
name: swiss-motion
version: 1.0.0
source: https://github.com/lemomo-ai/lemo-opuscar/tree/main/styles/swiss-motion
license: MIT（上游风格文档）；demo 静帧 CC BY 4.0（LemoLab）
status: adapted
---

# Swiss Motion Graphics · 瑞士动态排版

> 上游：Lemo-Opuscar `styles/swiss-motion`（MIT）。本文件是**改编**，不是原样复制：
> 去掉了 WebGL/Canvas 专属实现，保留不变量与语法；数值落在 `tokens.json`。

## 1. 定位

国际主义排版风格在动：模块网格、一种字体、一个信号色，运动像印刷机一样精确。

- 适合：公式、定义、数据结论、品牌/活动信息；
- 不适合：角色叙事、手绘、颗粒质感、连续镜头。

## 2. 不变量

| 项 | 规则 |
|---|---|
| 底色 | 纸灰 `#EAE9E5`，纯平；不用渐变、投影、颗粒 |
| 墨色 | `#111111`；辅助灰 `#6B6B6B`；规矩线 `#C9C7C1` |
| 强调 | 全片只有一个信号色 `#E30613`，只给“例外/结论/正在动的东西” |
| 字体 | 一种无衬线，粗细分层；标题最多 3 级 |
| 网格 | 16:9 画 12 栏；栏线只在页边距露出短刻度 |
| 运动 | 两个曲线：精确 ease `cubic-bezier(.7,0,.2,1)` 与 linear；无回弹、无弹簧 |
| 入场 | 划入 / 裁切揭示；不用淡入淡出 |
| 声音 | 干净的节拍与印刷 Foley；−14 LUFS；不要颗粒 |

## 3. manimgx 映射

- `theme.py`：`apply_config()`、`backdrop()`、`columns()`、`rule()`；
- 字体替换：上游 Archivo/Inter → `Noto Sans`；等宽 → `Menlo`；公式 → `New Computer Modern`；
- manimgx 没有 clip-path 遮罩，入场用 `Create` / `Write` 代替裁切揭示；
- 网格用上下页边距刻度，避免版式检查把“线穿字”判成问题。

## 4. Do / Don't

**Do**

- 一个画面只讲一个结论；先有线，再有字；
- 信号色只出现一次，结论落在它上面；
- 大字号与小字号并置，中间留白。

**Don't**

- 不用第二个强调色；不用 Helvetica/Akzidenz 字体文件；
- 不用渐变球、辉光、投影、颗粒；
- 不让文字压网格线；不把每个点做成卡片。

## 5. 与上游的差异

- 上游用 WebGL/Canvas 做裁切揭示与精确网格；这里用 manimgx 的矢量对象近似；
- 上游 24 fps；本实现默认 30 fps（可在 `tokens.motion.fps` 改回 24）；
- 上游字体不随包分发；这里统一用系统/内置 Noto 与 Menlo，观感会有差异，验收以帧为准。
