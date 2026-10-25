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
- 最多 4 题，问完不再追问；没回答的按 `assumptions` 执行。**问完不等于开工**，接着进 §4 确认门。

选项是**推出来的**，不是固定清单：画幅看平台线索，交付看有无旁白，风格看 registry 命中，受众看题材与平台。
用户也可以直接在 `Other` 里写别的。

## 0.5 环境预检：跑一次，别再拆

开工前只调用**一次** `motion_doctor`。它一口气返回：

- 运行时：Node / FFmpeg / venv / manimgx / sympy / Chrome / HyperFrames；
- **字体**：PingFang SC、Helvetica Neue 的构造结果；
- **公式**：`\lim_{}\frac{}{}`、微分记号、积分三条样本的 Typst 转换；
- **API 签名**：`probe.api` 里的 MathTex / Text / DecimalNumber / ValueTracker / Axes。

规则：

- `ready.math` / `ready.delivery` / `ready.fonts` / `ready.formulas` 全为 true 才开工；
- **不要**把字体、公式、模块版本拆成多条 bash 去查：每条都是一次模型往返（5–15 s），而这次预检本身约 0.5 s；
- 结果按文件指纹缓存 12 h。`cached.hit: true` 表示环境没变，直接信；升级 venv / manimgx 会自动失效，要手动重测用 `MOTION_PREFLIGHT=force`；
- 要库 API 先看 `probe.api`，**不要读 site-packages 源码**；签名不够时用一条命令补：`python -c "import inspect, manimgx; print(inspect.signature(manimgx.DecimalNumber.__init__))"`；
- 构造通过 ≠ 画面没问题：排版仍以第一帧（`motion_frames`）为准；
- 所以**不要再单独写 probe 场景做冒烟渲染**：项目的第一帧就是冒烟，一次就够。

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

## 4. 确认门（阻塞，分档）

写完整场景、出全片之前，按项目体量选一档，逐项确认。**不要跳步，不要用“我先做起来”代替确认。**

| 模式 | 适用 | 阶段 |
|---|---|---|
| `light`（默认） | ≤15 s、无旁白、一个结论 | 需求 → **脚本+分镜（合并）** → 视觉 → 开工 |
| `standard` | 15–60 s，或有旁白 | 需求 → 脚本 → 分镜 → 视觉 → 交付 → 开工 |
| `full` | >60 s、多段、复杂旁白 | 需求 → 脚本 → 分镜 → **animatic** → 视觉 → 交付 → 开工 |

- 脚本：逐句旁白、上屏文字、公式（先过 `formula_check`）；
- 分镜：镜头号、起止秒、画面、运动、字幕/旁白、验收点；
- 视觉：`DESIGN.md` + 3 张风格帧（真实代码，只出帧）；
- 交付清单：画幅 / fps / 时长 / 文件 / 音频 / 字幕；
- animatic：带时长的分镜 + 临时旁白，只在 `full` 或用户要求时做。

用账本记录，别靠上下文记忆：

```bash
node scripts/approvals.mjs init <project> --mode light
node scripts/approvals.mjs set <project> script_storyboard approved --note "用户确认"
node scripts/approvals.mjs check <project>   # 未全部 approved 时退出 1
```

- `check` 不通过，不进入执行；
- `start` 是独立阶段，只有用户**明确**说“可以开始 / 开始做 / 按这个执行 / 开工”才能置为 approved；
- “好 / 可以 / 行”如果只是回答某个选项，**不算**整体开工；
- 不确定就问：“脚本、分镜、风格帧都确认了，现在开始执行吗？”

模板与清单见 [references/confirmation.md](references/confirmation.md)。

## 5. 执行顺序（确认后才开始）

```
0. 最小场景：只放 6–8 个关键构图，motion_frames 出 sheet（首帧预算 ≤60s）
1. 补全场景代码 + formula_check
2. motion_frames（3–6 帧，局部改动后）
3. 确认过的分镜帧（6–9 帧，若要）
4. motion_render（draft → final）
5. HyperFrames composition（字幕/旁白/混音；需要时才进）
6. hyperframes check / motion_probe（只对最终成片跑一次）
```

`motion_frames` 内部是 `manimgx inspect`，只画请求的时刻并做版式检查；
`motion_probe` 是给已有 mp4 做体检的，不要用它替代看帧。

## 6. 硬规则（逐条对照）

1. **没有明确开工指令，不执行**：没听到“可以开始”就不写完整场景、不出全片；
2. **没有 DESIGN.md 或参考语法，不开工**——否则每次都是同一个默认 look；
3. **默认先帧后片**：先用 `motion_frames` 把画面改对，再决定要不要渲染；
4. **字幕放在 composition 层**，不烧进 Manim 或 canvas；
5. **公式先过 `formula_check`**，再进画面；
6. **首帧预算 ≤60s**：先最小场景 + 构图 sheet，60s 看不到第一帧就停；
7. **只做局部 edit**：改动 <50% 不重写整个文件；
8. **图片/上下文预算**：每次迭代 1 张 sheet（约 960px），上下文 ≤100k；
9. **预检只跑一次**：`motion_doctor` 已含字体/公式/API 签名并缓存 12 h，不拆成多条 bash，也不读库源码。
