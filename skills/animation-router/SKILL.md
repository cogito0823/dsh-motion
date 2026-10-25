---
name: animation-router
description: 做代码动画/科普视频的总入口：先判题材（关系还是意象），再选画面层与交付管线。任何"做个动画/视频/讲清楚一个概念"的请求都先看这里。
---

# 总入口：先分题材，再选画面层

## 0. 需求卡点（硬门：先问，再落账）

**时长、画幅、交付**这三项必须有个明确的来源——用户说的，或者用户点头过的推断。不能替他默认。

```bash
node scripts/plan-questions.mjs "<brief>" --json
```

拿到答案先落账，没落账 `motion_frames` 会拒绝出帧：

```bash
node scripts/approvals.mjs set <project> requirements approved \
  --duration 30s --aspect 1920x1080 --delivery silent \
  --confirmation q_... --note "用户确认"   # delivery 三选一：frames / silent / narrated
```

把返回的 `questions` 原样交给 `ask_user_question`，`assumptions` 作为默认值。
`requirements` / `start` 的 `approved` 必须带 `--confirmation`，填 `ask_user_question` 返回的 question id；`briefHash` 由脚本自动生成，手改 brief 会被拒。规则：

- **画幅**：brief 已说"竖屏/横屏/16:9"就不再单独出题，但落账前要在回复里回显确认；没说才问，只给推断出的 2 个；
- **交付**：brief 已说"要旁白"或"静音"同样回显确认；没说才问；
- **风格**：从 `styles/registry.json` 路由出的 top 2–3；用户点名则跳过；
- **受众**：只对数学/科学题材、且 brief 没提"高中/大学/大众"时问；选项按平台排（抖音→大众科普，B站→高中）；
- **旁白**：只在交付为旁白、且 brief 没说"中文/英文/双语"时问；选项是"语言 + 声音"；
- **时长**：从 brief 提取（"30 秒"/"1 分钟"），不单独问；
- 最多 4 题，问完不再追问；没回答的按 `assumptions` 执行。**问完不等于开工**，接着进 §4 确认门。

两条底线：

- **推断 ≠ 确认**：brief 里的线索只用来生成选项和默认值。回复里要把「30 s / 1920×1080 / 成片+字幕」这类结论写出来，让用户点头或改；
- 宁可多问一句「30 秒、横屏、带旁白，对吗？」，也不要问都没问就先出帧。

选项是**推出来的**，不是固定清单：画幅看平台线索，交付看有无旁白，风格看 registry 命中，受众看题材与平台。
用户也可以直接在 `Other` 里写别的。

## 0.5 环境预检：跑一次，别再拆

开工前只调用**一次** `motion_doctor`。它返回：

- 运行时：Node / FFmpeg / venv / manimgx / sympy / Chrome / HyperFrames；
- **字体**：`fonts.cjk` 是通过“缺字体基线”校验的真实可用家族；`fonts.latin` / `fonts.display` / `fonts.unavailable` 同理；
- **公式**：`formulas.samples` 三条样本的 Typst 转换；
- **API**：`api`（类）、`functions`（动画）、`rates`（缓动名）；完整表见 [references/api.md](references/api.md)。

规则：

- `ready.math` / `ready.delivery` / `ready.fonts` / `ready.formulas` 全为 true 才开工；
- `ready.math=false` 或缺 manimgx/sympy：调用**一次** `motion_setup`（必要时 `force=true`），**不要**用 bash 跑 `python3 -m venv`——venv 在 workspace 外，会被沙箱拒绝；
- `ready.fonts=false`：先 `motion_setup`；仍失败再看 `fonts.unavailable`。**不要** `fc-list` / `ls /System/Library/Fonts` 猜字体；
- 选字体只用 `fonts.cjk`。manimgx 对不存在的字体**静默回退**：`Text(...)` 构造成功不代表字体存在；
- 结果按文件指纹缓存 12 h，且不再按 Node 版本分叉。`cached.hit: true` 直接信；要手动重测用 `MOTION_PREFLIGHT=force`；
- 要库 API 先看 `api` / `functions` / `rates` 和 [references/api.md](references/api.md)，**不要读 site-packages 源码**；
- 构造通过 ≠ 画面没问题：排版仍以第一帧（`motion_frames`）为准；
- 所以**不要再单独写 probe 场景做冒烟渲染**：项目的第一帧就是冒烟，一次就够。

## 0.6 项目根、时间轴、VFR 与度量口径

- **项目根**：`motion.project.json` 是唯一标识；新项目用 `scaffold` 建在
  `~/dsh-motion-projects/<slug>`（或 `MOTION_PROJECTS_HOME`），不要建在插件包内；
  老项目用 `project-adopt` 补 manifest。正式 `motion_render` 必须有项目根；
- **输出位置**：frames/render/probe 默认落 `<project>/out/...`，不要用 cwd 决定；
  同一项目并发由 `.dsh-motion/project.lock` 挡住；
- **时间轴契约**：项目里的 `timeline.json` 是 cue 的唯一来源；场景继承
  [templates/project/timeline.py](../../templates/project/timeline.py) 的 `TimedScene`，
  用 `self.cue("hook")` 对照 `self.time`，落后超过 0.35s 会打印 `[late]`；
- **定稿前自检**：`node scripts/timeline-check.mjs <project> --strict`，检查 cue 重复/乱序/越界、
  旁白晚于画面、旁白压到下一拍；error 或 strict 下的 warn 都不许进 `motion_render`；
- **layout 定位**：`motion_frames` 的 `layoutIssues[].index` 对应 storyboard 第几格，直接改那一格，
  不要把整张 sheet 重看一遍；
- **VFR**：`motion_probe` 会报 `fps/avgFps/frames/vfr/cfr`。`vfr:true` 的 raw 只是中间片，
  不要当固定帧率素材给剪辑软件；交付前用 `assemble.py` 或 `motion_render` 归一成 CFR；
- **度量口径**：`node scripts/run-report.mjs <project> --wall <端到端秒数>` 输出 active/wall；
  “TTS 省 61.6%”这类数字默认只指 active 切片，不能当端到端收益；
- **TTS 缓存**：`narrate` 默认按文本/音色/语速哈希缓存，重复渲染不会重复走网络；
  多句默认并发 3（`--concurrency`），失败由 `tts_edge.py` 重试。

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

用账本记录，别靠上下文记忆（完整命令见 [references/commands.md](references/commands.md)）：

```bash
node scripts/approvals.mjs init <project> --mode light
node scripts/approvals.mjs set <project> requirements approved \
  --duration 30s --aspect 1920x1080 --delivery silent \
  --confirmation q_... --note "用户确认"  # frames / silent / narrated
node scripts/approvals.mjs set <project> script_storyboard approved --note "用户确认"
node scripts/approvals.mjs check <project>   # 未全部 approved 时退出 1
```

- `check` 不通过，不进入执行；
- `requirements` 是硬门：`--duration / --aspect / --delivery` 必须落值，否则 `motion_frames` 拒绝出帧（没有账本的临时场景不拦）；**改需求会把下游全部重置为 pending**，旧的确认不能复用；
- `start` 是独立阶段，只有用户**明确**说“可以开始 / 开始做 / 按这个执行 / 开工”才能置为 approved；
- “好 / 可以 / 行”如果只是回答某个选项，**不算**整体开工；
- 不确定就问：“脚本、分镜、风格帧都确认了，现在开始执行吗？”

模板与清单见 [references/confirmation.md](references/confirmation.md)。

## 5. 执行顺序（确认后才开始）

```
0. 时间轴自检：node scripts/timeline-check.mjs <project> --strict
0.5 最小场景：只放 6–8 个关键构图，motion_frames 出 sheet（首帧预算 ≤60s）
1. 补全场景代码 + formula_check
2. motion_frames（3–6 帧，局部改动后）
3. 确认过的分镜帧（6–9 帧，若要）
4. motion_render（draft → final）
5. HyperFrames composition（字幕/旁白/混音；需要时才进）
   - 旁白：`node scripts/narrate.mjs <project> --provider edge --voice zh-CN-XiaoxiaoNeural`
   - 混音：`node scripts/mix.mjs <project> --music assets/bed.wav --mux out/clip.mp4 --report-gaps`
   - 先 `motion_setup({tts:true})` 或 `node scripts/setup.mjs --tts`；模板见 [references/commands.md](references/commands.md)
6. hyperframes check / motion_probe（只对最终成片跑一次；`vfr:true` 的 raw 先归一成 CFR）
7. node scripts/run-report.mjs <project> --wall <端到端秒数>（记录 active/wall，不混口径）
```

`motion_frames` 内部是 `manimgx inspect`，只画请求的时刻并做版式检查；
`motion_probe` 是给已有 mp4 做体检的，不要用它替代看帧。

## 6. 硬规则（逐条对照）

1. **先锁需求再动手**：时长/画幅/交付没问过、没落进 `requirements.brief`，不出帧也不出片；
2. **没有明确开工指令，不执行**：没听到“可以开始”就不写完整场景、不出全片；
3. **没有 DESIGN.md 或参考语法，不开工**——否则每次都是同一个默认 look；
4. **默认先帧后片**：先用 `motion_frames` 把画面改对，再决定要不要渲染；
5. **字幕放在 composition 层**，不烧进 Manim 或 canvas；
6. **公式先过 `formula_check`**，再进画面；
7. **首帧预算 ≤60s**：先最小场景 + 构图 sheet，60s 看不到第一帧就停；
8. **只做局部 edit**：改动 <50% 不重写整个文件；
9. **图片/上下文预算**：每次迭代 1 张 sheet（约 960px），上下文 ≤100k；
10. **预检只跑一次**：`motion_doctor` 已含字体/公式/API/rate 并缓存 12 h；缺环境用 `motion_setup`，不拆成多条 bash，也不读库源码；
11. **时间轴先过再渲染**：`timeline-check --strict` 通过；cue 落后、旁白压拍、VFR raw 都不带进成片；
12. **度量写清口径**：active/compute 与 wall/端到端分开记；`run-report` 是唯一汇总入口。
