---
name: design-spec
description: 为动画片写 DESIGN.md（设计规范）：配色、字体、间距、禁用清单，以及从参考片/主题世界取语法。觉得画面丑、要统一系列风格、或开工前，读这个。
---

# 写一份 DESIGN.md

## 从模板开始

新项目先跑 `node scripts/scaffold.mjs <目录名> --title "片名" --duration 30`，
会生成 `DESIGN.md`、`timeline.json`、`timeline.py`（`TimedScene.cue` 落后告警）、
`scene.py`、`narration.json`、`assemble.py`。在本文件基础上改，不要从空白开始。

## 为什么必须写

HyperFrames 的 look 文档原话：**不给外部输入，相同的 brief 每次都会得到同一个 look；禁掉它只会滑到下一个默认。**

外部输入按优先级：

| 顺位 | 来源 | 科普片适用性 |
|---|---|---|
| 1 | 项目根 `DESIGN.md` / `frame.md` | ✅ 首选 |
| 2 | 真实品牌 | ❌ 一般不适用 |
| 3 | 参考片 / 参考图 | ✅ 只取语法，不取内容 |
| 4 | 主题自身的世界 | ✅ 年代、材质、展示场景 |
| 5 | 官方预设（preset） | ⚠️ 幻灯片语言，仅点名或做 deck 时用 |

## 先路由

写 spec 之前先过需求卡点：`node scripts/plan-questions.mjs "<brief>" --json`。它会推断画幅、交付、风格的候选项（选项来自 `styles/registry.json`，不是固定清单），能推断的不问。

风格：点名优先；没有点名就按 `styles/registry.json` 打分；`high` 才直接写，`medium`/`low` 先给用户 top 2–3 确认。

## 确认门

`DESIGN.md` 和 3 张风格帧属于确认门的“视觉”阶段：先有确认过的脚本与分镜，再做视觉。按 `gateMode` 分档（`light` 合并脚本+分镜，`standard` 分开，`full` 加 animatic）。用户明确说“可以开始”之前，不要写完整场景、不要渲染成片。流程与账本见 [animation-router](../animation-router/SKILL.md) 的 §4。

## 最小形态

```markdown
---
colors:
  ground: "#F3ECDD"
  ink: "#20302A"
  accent: "#B8442A"
typography:
  display: { family: "Georgia", weight: 400 }
  body:    { family: "Helvetica Neue", weight: 400 }
spacing: { margin: 140, rule: 2 }
---

# <片名> · <语言>

## Do
- 图形先有墨线，再有填充；线宽 2–3px
- 只用 3–5 个颜色
- 运动是"生长"，缓动一律 ease-out

## Don't
- 不用高饱和色、渐变球、发光、投影
- 不把整段文字堆成卡片
- 不用 Inter / Space Grotesk 做标题（生成式默认字体）

## 版面
- 页边距、标题基线、图注与字幕不重叠

## 参考
- 具体到某类图版、某支片、某个年代的印刷品
```

## 选字体：只信 `motion_doctor.fonts.cjk`

不要在 `DESIGN.md` 里写一个“希望存在”的字体，也不要用 `fc-list` / `ls /System/Library/Fonts` 猜：

- `motion_doctor` 的 `fonts.cjk` 是**实测解析成功**的中文家族（用“缺字体基线”排除 manimgx 的静默回退）；
- `fonts.latin` / `fonts.display` 是可用的拉丁/展示字体；`fonts.unavailable` 是明确不存在的；
- 常用组合：正文 `PingFang SC`，标题 `Songti SC` / `Yuanti SC` / `Hannotate SC`，白板 `Chalkboard SE`；
- 公式仍用 `MathTex`，中文注释用 `Text`；不要把中文塞进公式；
- 如果 `fonts.cjk` 为空：先 `motion_setup`（会装 `manimgx-fonts-cjk`），再重跑 `motion_doctor`。

`DESIGN.md` 的 typography 只写 `fonts.cjk` 里出现过的 family；换字体时同步改 `tokens.json` 的 `typography`。

## 先出三张风格帧

DESIGN.md 写完不等于风格成立。挑 3 个关键时刻（开场、转折、结论），用**真实绘制代码**出帧，对照 spec 检查：

- 用 `motion_frames` 直接出帧，不渲染视频；
- 三张里至少一张是 signature shot；
- 两轮还不对，就换更接近的参考语法，而不是继续调参。

## 八种已验证的语言

| 语言 | 适合 | 关键手段 |
|---|---|---|
| 纸感植物图版 | 生物 / 博物 | 纸纤维、水洗叠色、墨线、引线标注 |
| 暗场发光 | 物理 / 天文 / 微观 | 近黑底、细线辉光、粒子、颗粒 + 暗角 |
| 编辑排版 | 数学 / 数据 / 概念 | 网格、字阶、单一强调色 |
| 瑞士动态排版 | 公式 / 概念 | 12 栏网格、单一信号色、精确缓动 |
| 数据叙事 | 数据 / 科学 | 图表操作即转场、注释钉在数据上、蓝红语义 |
| 蓝图工程制图 | 几何 / 工程 | 青晒纸、白线、制图顺序、一次红印章 |
| 白板讲解 | 科学 / 课程 | 暖白板、三色马克笔、书写顺序 |
| 3b1b 暗场数学 | 线代 / 微积分 | 近黑底、蓝黄语义、先直觉后公式 |

本仓库现有五套，除 `3b1b` 外均改编自 [Lemo-Opuscar](https://github.com/lemomo-ai/lemo-opuscar)（MIT）：

- [`styles/swiss-motion/`](../../styles/swiss-motion/)：公式/排版，默认；
- [`styles/dataviz/`](../../styles/dataviz/)：图表/数据；
- [`styles/blueprint/`](../../styles/blueprint/)：几何/工程；
- [`styles/whiteboard/`](../../styles/whiteboard/)：科学/白板讲解；
- [`styles/3b1b/`](../../styles/3b1b/)：暗场数学（Manim 社区 3b1b skill）。

规范在 `STYLE.md`，数值在 `tokens.json`，`theme.py` 提供 `apply_config()` 与 `backdrop()`。
项目 `DESIGN.md` 里写 `style: swiss-motion`（或 `dataviz` / `blueprint` / `whiteboard` / `3b1b`）与 `style_version: 1.0.0`。

参考与示例统一从 HyperFrames 取：[examples](https://hyperframes.heygen.com/examples)、
[catalog](https://hyperframes.heygen.com/catalog)、[frame.md](https://hyperframes.heygen.com/prompting/design-systems)。
本仓库不再内置分集/样片。
