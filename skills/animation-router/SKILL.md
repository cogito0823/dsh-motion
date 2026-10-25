---
name: animation-router
description: 做代码动画/科普视频的总入口：先判题材（关系还是意象），再选画面层与交付管线。任何"做个动画/视频/讲清楚一个概念"的请求都先看这里。
---

# 总入口：先分题材，再选画面层

## 0. 需求卡点（只问一次）

开工前先推断；能从 brief 看出来的，不要问。需要问时：

```bash
node scripts/plan-questions.mjs "<brief>" --json
```

把返回的 `questions` 原样交给 `ask_user_question`，`assumptions` 作为默认值。规则：

- **画幅**：brief 已说"竖屏/横屏/16:9"就跳过；没说才问，只给推断出的 2 个；
- **交付**：brief 已说"要旁白"或"静音"就跳过；没说才问；
- **风格**：从 `styles/registry.json` 路由出的 top 2–3；用户点名则跳过；
- **受众**：只对数学/科学题材、且 brief 没提"高中/大学/大众"时问；选项按平台排（抖音→大众科普，B站→高中）；
- **旁白**：只在交付为旁白、且 brief 没说"中文/英文/双语"时问；选项是"语言 + 声音"；
- **时长**：从 brief 提取（"30 秒"/"1 分钟"），不单独问；
- 最多 4 题，问完一次就开做，不追问；没回答的按 `assumptions` 执行。

选项是**推出来的**，不是固定清单：画幅看平台线索，交付看有无旁白，风格看 registry 命中，受众看题材与平台。
用户也可以直接在 `Other` 里写别的。

## 1. 判题材

| 题材 | 观众记住 | 判据 |
|---|---|---|
| 数学讲解 | 一个**关系** | 公式、坐标、推导、表格 |
| 科普叙事 | 一个**意象** | 画面、比喻、节奏、材质 |

## 2. 选风格

先读 `styles/registry.json`，再按顺序：

1. **用户点名**（"用 3b1b / 瑞士动态排版"）→ 直接用，不再打分；
2. 没有点名 → `node scripts/route-style.mjs "<题材>" --json`；
3. `confidence: high` → 写进 `DESIGN.md` 的 `style:`；
4. `medium` / `low` / `needsConfirmation: true` → 给用户 top 2–3 和理由，等确认；
5. 完全不命中 → 默认 `swiss-motion`，并说明这是默认。

不要用"感觉像"选风格；理由是 registry 的关键词/uses 命中，不是形容词。

## 3. 选画面层

| 画面层 | 适合 | 不用它的理由 |
|---|---|---|
| Manim 片段（clip） | 公式、坐标系、几何变换 | 纯叙事片会显得呆板 |
| Canvas 2D 逐帧 | 光、影、粒子、材质、转场 | 文字排版成本高 |
| HTML / SVG | 排版、图文、简单图示 | 做不出辉光与颗粒 |

三者都只是素材层；**需要交付时**再统一进 HyperFrames 工程，默认的极简模式不经过 HF。

## 4. 固定顺序（默认极简，先帧后片）

```
1. DESIGN.md（design spec）      ← 先定颜色/字体/禁用项/参考
2. formula_check（数学题材）      ← 每条上屏公式先验
3. 画面 + motion_frames           ← 默认：按秒出 3–6 帧，看帧改，不渲染视频
4. 分镜表（仅用户要时）            ← 关键镜头，用真实代码出帧，等确认
5. motion_render                  ← 定稿后才编码 mp4
6. HyperFrames composition        ← 字幕/旁白/混音/排版（需要时才进）
7. hyperframes check / motion_probe ← 只检查已经生成的成片
```

**默认不使用 HyperFrames**：只有需要字幕、旁白、混音、复杂图文编排时才进第 6 步。
`motion_frames` 内部是 `manimgx inspect`，只画请求的时刻并做版式检查，几秒出图；
`motion_probe` 是给已有 mp4 做体检的，不要用它替代看帧。

## 5. 四条硬规则

1. **没有 DESIGN.md 或参考语法，不开工**——否则每次都是同一个默认 look；
2. **默认先帧后片**：先用 `motion_frames` 把画面改对，再决定要不要渲染；
3. **字幕放在 composition 层**，不烧进 Manim 或 canvas；
4. **公式先过 `formula_check`**，再进画面。
