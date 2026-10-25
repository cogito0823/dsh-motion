# dsh-motion 架构

版本：0.10.0 · 更新：2026-10-26

本文描述**当前实现边界**：谁注册什么、数据怎么流、哪些不变量不能破。
“为什么这样设计”的调研与取舍见 [docs/ai-native-motion.md](docs/ai-native-motion.md)；
安装/切换/发版见 [MAINTAINING.md](MAINTAINING.md)。

---

## 1. 运行时拓扑

```text
┌─────────────────────────────────────────────────────────────┐
│ DeepSeek Harness（宿主进程）                                 │
│                                                             │
│  lib/index.js  apply(ctx)                                   │
│    ├─ ctx.tools.register × 6                                │
│    └─ ctx.inject(['skills']) → lib/skills.js provider       │
│                                                             │
│  lib/doctor.js  lib/setup.js  lib/ops.js  lib/metrics.js    │
│  lib/project.js  lib/approvals.js  lib/timeline.js           │
│  lib/preflight.js                                            │
└───────────────┬──────────────────────────────┬──────────────┘
                │ spawn                        │ spawn
                ▼                              ▼
┌──────────────────────────────┐   ┌───────────────────────────┐
│ venv Python                  │   │ 外部二进制                 │
│  probe_env.py                │   │  ffmpeg / ffprobe          │
│  manimgx / sympy             │   │  manim（可选）             │
│  edge-tts / numpy（可选）    │   │  Chrome / HyperFrames      │
└──────────────────────────────┘   └───────────────────────────┘

模型 bash（workspace-write 沙箱）只用于项目内命令；
venv 创建/装包由宿主进程的 motion_setup 完成，避开该沙箱。
```

三条进程边界：

| 边界 | 能做什么 | 不能做什么 |
|---|---|---|
| 宿主插件 | 读写 `~/.dsh`、建 venv、注册工具/skill、写项目账本 | 不直接渲染画面 |
| 模型 bash | 项目内读写、跑脚本/渲染器 | 写 workspace 外的 venv（EPERM） |
| venv Python | 探针、manimgx、sympy、TTS/混音依赖 | 不持有 Harness 工具注册 |

---

## 2. 模块地图

### 2.1 `lib/`（插件实现）

| 文件 | 职责 | 关键约束 |
|---|---|---|
| `index.js` | 插件入口：注册 6 个工具；`ctx.inject(['skills'])` 注册 3 个 skill | 改工具名/schema 必须重启 |
| `env.js` | 路径与外部命令解析：motionHome / venv / ffmpeg / Chrome / HyperFrames | 不写死本机路径 |
| `cache.js` | 极简 JSON 缓存：指纹 + TTL | 坏文件/写失败不抛 |
| `preflight.js` | 指纹、缓存落点、spawn `probe_env.py` | 指纹计算只 stat；探针另起进程 |
| `probe_env.py` | 字体、公式、API/rate 探针 | 只构造，不渲染 |
| `doctor.js` | 预检报告、缓存命中、`ready/summary` | 不自动装环境 |
| `setup.js` | venv 创建/修复、缺包安装、版本校验 | 幂等；`force` 有路径保护 |
| `ops.js` | `frames/render/probe/formula_check` 的执行层 | 外部命令全走 `execFile`，带超时 |
| `approvals.js` | 读 `APPROVALS.json`，提供出帧/渲染硬门 | 只读，不写账本 |
| `skills.js` | 包内 `skills/` 的 provider | 候选在 apply 时读入；正文按需读盘 |
| `timeline.js` | `timeline.json` 校验（cue/旁白/片长） | 纯函数，不依赖 manimgx |
| `metrics.js` | `<project>/.dsh-motion/metrics.jsonl` | 写失败静默；不改主流程 |
| `project.js` | manifest、项目根解析、标准输出路径、项目锁 | 唯一根入口；不认 `.git`，不继承父账本 |
| `fresh.js` | 开发期按 mtime 热加载 `ops/doctor/setup` | 只对实现生效，不管 schema |

### 2.2 `scripts/`（独立进程）

| 脚本 | 用途 |
|---|---|
| `setup.mjs` | 命令行版 `motion_setup` |
| `timeline-check.mjs` | 定稿前时间轴自检（cue 顺序/越界、旁白晚到/压拍） |
| `scaffold.mjs` | 从 `templates/project/` 生成项目骨架 |
| `run-report.mjs` | 汇总 metrics 的 active / wall |
| `narrate.mjs` | 旁白：缓存、并发、词级 timing、SRT |
| `mix.mjs` | 人声 + 音乐混音、LUFS/TP、间隙 dB、可选 mux |
| `approvals.mjs` | 写确认门账本 |
| `plan-questions.mjs` / `route-style.mjs` | 需求卡点 / 风格路由 |
| `dev.mjs` | 绕过 Harness 的 frames/render/probe/doctor/setup |
| `smoke.mjs` / `check-meta.mjs` / `build-style-index.mjs` | 维护与发布检查 |

### 2.3 `templates/project/`（项目契约）

| 文件 | 作用 |
|---|---|
| `timeline.json` | cue 表：`id / at / hold / lineId`，唯一时间来源 |
| `timeline.py` | `TimedScene.cue()`：对比 `self.time`，落后 >0.35s 打印 `[late]` |
| `scene.py` | 最小场景骨架，按 cue 组织 |
| `narration.json` | 旁白稿与起点 |
| `assemble.py` | raw → CFR 成片，并写 assemble 账本 |
| `DESIGN.md` / `README.md` / `gitignore.txt` | 视觉契约、命令、忽略规则 |

---

## 3. 工具契约

| 工具 | 输入 | 副作用 | 闸门 |
|---|---|---|---|
| `motion_doctor` | 无 | 读缓存/写缓存；spawn 探针 | 无 |
| `motion_setup` | `force?`, `tts?` | 建/改 venv、pip 安装 | 无（宿主进程） |
| `motion_frames` | `file`, `scene?`, `times?`, `out?` | 出 storyboard PNG；写 metrics | 有 `APPROVALS.json` 时需求必须锁定 |
| `motion_render` | `file`, `scene?`, `engine?`, `post?`, `width/height/fps/out` | 出 MP4；CFR 归一；写 metrics | 有 manifest；账本是前置，未通过才平台审批 |
| `motion_probe` | `video`, `frames?`, `out?` | contact sheet；写 metrics | 无 |
| `formula_check` | `left`, `right` | 无 | 无 |

约束：

- 渲染规格只接受枚举/上限（`normalizePost`、`clampInt`）；
- 外部命令全部 `execFile` + 超时，不经 shell；
- 工具返回结构化 JSON，不让模型 grep 日志；
- 错误信息直接给下一步（缺 venv → `motion_setup`，缺包 → `motion_setup`）；
- 正式 `motion_render` 同时在工具层和 `ops.js` 执行层校验 `APPROVALS.json`，并要求
  `motion.project.json`；账本已通过时直接渲染，未通过才走 Harness `ctx.approval.request`
  （`confirmEveryRender: true` 可恢复逐次确认）；
  CLI 调试用 `--explore`，不进入交付。

---

## 4. 数据流

```text
target scene/video
  │
  └─ resolveProject() → <ws>/<目录名>/motion.project.json 或 unmanaged（不 legacy）
       │
brief
  │
  ├─ plan-questions → ask_user_question
  ├─ approvals init/set → APPROVALS.json（requirements 必须锁 时长/画幅/帧率/交付/风格/受众/旁白）
  │
  ├─ skill: animation-router / design-spec / qa-rubric
  │
  ├─ motion_doctor ──miss──→ motion_setup ──→ 再 doctor
  │      │
  │      └─ fonts.cjk / formulas / api / functions / rates
  │
  ├─ timeline-check（timeline.json + audio/*/timing.json）
  │
  ├─ motion_frames（manimgx inspect）
  │      └─ storyboard + layoutIssues[].index + metrics(frames)
  │
  ├─ motion_render（manimgx/manim）
  │      └─ post → ensureCfr → probeOutput → metrics(render)
  │
  ├─ narrate（cache + concurrent）
  │      └─ audio/<provider>/lN.mp3 + timing.json + captions.srt + metrics(tts)
  │
  ├─ mix（人声 + 音乐 → LUFS/TP + gap dB + mux）
  │      └─ audio/master.wav + mix.json + metrics(mix)
  │
  ├─ assemble.py（raw VFR → CFR；可 mux 音频）
  │      └─ metrics(assemble)
  │
  ├─ motion_probe（fps/frames/VFR/CFR + 空镜）
  │      └─ contact sheet + metrics(probe)
  │
  └─ run-report（active / wall / cacheHits）
```

### 4.0 项目集：会话边界、深度、失败要响

项目放在**会话工作目录**下的 `dsh-motion-projects/`，不挂家目录、不向上搜同名目录：

> 会话工作目录来自 `exec.agent.session.cwd`，**不是**进程的 `process.cwd()`——插件进程的 cwd 是
> `~/.dsh/profiles/<profile>`，拿它当项目集就会解析到 profile 里。工具层用 `toolConfig()` 注入。

```text
<会话 cwd>/dsh-motion-projects/
  registry.json                 # 派生索引：可删可重建，读路径从不依赖它
  calculus-45s/
    motion.project.json         # 身份（id）在这里
    ...
```

三条不变量（`lib/project.js`）：

1. **边界**：解析永不越过 workspace。外面的 `scene.py` 一律 `unmanaged`，报错里给出项目集路径。
2. **深度**：项目必须是 workspace 的直接子目录。子目录里再出现的 `motion.project.json` 直接报错（不允许嵌套），不会被静默归到父项目。
3. **失败要响**：缺 manifest、`projectId` 与账本不符、目录越界 → 都抛错并给修复命令（`projects.mjs repair|rename`），没有 legacy 回退。

分工：**寻址用目录名**（单段，`{"file": "calculus-45s"}` 或绝对路径），**身份用 id**（`slug-6hex`，改名不变，绑账本），**产物返回绝对路径**。

`registry.json` 只是 cache：`listProjects()` 每次扫磁盘；索引与磁盘不一致时重建，不报错。

### 4.1 项目目录约定

```text
<会话 cwd>/dsh-motion-projects/<目录名>/   # 项目集；插件包外
  motion.project.json           # 唯一项目根（提交）
  APPROVALS.json                # 确认门账本（提交）
  DESIGN.md                     # 视觉契约
  timeline.json                 # cue 契约
  narration.json                # 旁白稿
  scene.py                      # 单场景；多场景放 scenes/
  audio/
    edge|say/                   # lN.mp3 / lN.json / timing.json / captions.srt
    master.wav
  out/
    frames/ render/ probe/      # 项目内产物
  .dsh-motion/
    metrics.jsonl               # 运行账本
    approvals.jsonl             # 拒绝/绕过/平台审批审计
    project.lock                # 项目内互斥锁
```

仓库内 `showcase/<slug>/` 也是标准项目：`motion.project.json` + `scene.py`；
交付成片提交在 `final/`，storyboard/contact sheet 等生成物落 `out/`（gitignore）。

---

## 5. 不变量与关键决策

项目根是 `motion.project.json`，不是 cwd、不是 `.git`、也不是父目录。`resolveProject()` 只在
`dsh-motion-projects/` 里找，从目标目录向上最多走到 workspace 根；越界、无 manifest、嵌套项目
都直接报错，没有 legacy 兜底。`APPROVALS.json` 只读项目根，metrics 只写项目根，正式 render
必须有项目根。

仓库自带的 `showcase/<slug>/` 不在会话项目集里，用它们时显式指定：
`MOTION_PROJECTS_HOME=showcase node scripts/approvals.mjs show swiss-euler`。

1. **skill 由插件自己注册**，不依赖 `~/.dsh/skills`。
   `lib/skills.js` 通过 `ctx.skills.registerProvider` 提供 `motion` provider；rank 600，
   用户/项目 skill 优先。skill 正文在 `get()` 时读盘，改正文不用重启；增删 skill 需要重启。

2. **缓存指纹不包含 Node 版本**。
   探针跑在 venv Python 里，Node 只解析 JSON；指纹保留
   `schema / platform / venv / python / manimgx / probe`。schema=2，报告结构变化时 bump。

3. **字体验证用“缺字体基线”**。
   manimgx 对不存在字体静默回退；`probe_env.py` 先量一个必然缺失的家族，
   目标家族与基线宽高都一致就判回退。`ready.fonts` 只信 `fonts.cjk`。

4. **环境安装在宿主进程**。
   模型 bash 是 workspace-write，写不了 `~/.dsh/.../venv`；`motion_setup` 在宿主执行，
   只暴露 `force/tts` 两个布尔值。插件启动不联网、不改环境。

5. **确认门与确认凭据**。
   `lib/approvals.js` 只读项目根 `APPROVALS.json`；写账本只走 `scripts/approvals.mjs`。
   `requirements` / `start` 的 approved 必须带 `--confirmation <ask_user_question id>`；brief
   带 `briefHash`，手改会判 tampered。拒绝、`--explore` 绕过、平台审批都写
   `.dsh-motion/approvals.jsonl`。

6. **raw 与成片分开**。
   manimgx 可能输出 VFR raw；`motion_render` 用 `ensureCfr` 归一，
   `motion_probe` 显式报 `vfr/cfr`。raw 是中间片，只有 CFR 成片进交付/剪辑。

7. **时间轴是契约**。
   `timeline.json` 是 cue 的唯一来源；运行时 `TimedScene.cue()` 告警，定稿前
   `timeline-check --strict` 静态校验。改时间先改 timeline，再改场景。

8. **度量口径分开**。
   `metrics.jsonl` 记录 `activeSec`（工具/脚本实际占用）与 `wallSec`；
   `run-report --wall` 才算端到端占比。不把 compute 的百分比写成端到端收益。

9. **零 npm 运行时依赖**。
   只用 Node 标准库；外部能力靠 Python/ffmpeg/Chrome/HF。Node ≥ 22。

10. **项目内互斥**。
    `render` / `frames` / `probe` / `narrate` / `mix` 写入前拿
    `<project>/.dsh-motion/project.lock`；跨项目天然隔离，同项目并发被挡住。

---

## 6. 失败模式

| 现象 | 归因 | 出口 |
|---|---|---|
| `ready.math=false` | venv 缺失 / manimgx / sympy 缺失 | `motion_setup`；再 `motion_doctor` |
| `ready.fonts=false` | 无可用 CJK 家族 / 字体包缺失 | `motion_setup` 检查 `manimgx-fonts*`；仍失败查系统字体 |
| `找不到渲染器` | venv 里无 manimgx/manim | `motion_setup`（或对应 pip 手动兜底） |
| `未找到 APPROVALS.json` / `需求未锁定` | 确认门未过 | `scripts/approvals.mjs init/set --confirmation <id>` |
| 用户拒绝渲染 | 平台审批 rejected/cancelled | 重新过确认门；审计在 `.dsh-motion/approvals.jsonl` |
| `正式渲染需要项目根` | 场景不在项目集里 | `scaffold` 新建，或 `projects.mjs repair` 补 manifest；临时调试用 `--explore` |
| `项目被占用` | 同项目有 render/tts/mix 在写 | 等结束；确认锁已死再删 `.dsh-motion/project.lock` |
| `timeline-check` error/warn | cue 乱序/越界、旁白晚到/压拍 | 改 `timeline.json` 或场景节奏 |
| `[late] cue=...` | 场景实际时间落后于 cue | 减少前面动画/等待，或后移 cue |
| `vfr:true, cfr:false` | raw 是 VFR | `assemble.py` 或 `motion_render` 归一 |
| `edge-tts 连续失败` | 网络/接口 | `tts_edge.py` 已重试；可 `--provider say` 兜底 |
| `间隙低于 -40 dB` | 音乐床偏轻 | 提高 `--music-db` 或改 bed |
| `pip install 失败` | Python 版本/网络 | 设 `MOTION_PYTHON=python3.13` 后 `motion_setup` |

---

## 7. 热加载与重启

| 改动 | 重启 Harness？ | 原因 |
|---|---|---|
| `lib/ops.js` / `doctor.js` / `setup.js` | 否 | `importFresh()` 按 mtime 重载 |
| `lib/metrics.js` | 是 | 被 `ops.js` 静态 import，节点内缓存 |
| `lib/project.js` | 是 | 被 `ops/approvals/metrics` 静态 import |
| `lib/skills.js` / 增删 `skills/*` | 是 | provider 在 `apply()` 注册 |
| skill 正文 | 否 | `get()` 每次读盘 |
| `lib/timeline.js` | 否（CLI 独立进程） | `timeline-check` 每次新进程 |
| `scripts/timeline-check|scaffold|run-report` | 否 | 独立 Node 进程 |
| 工具名/描述/schema | 是 | 注册发生在 `apply()` |
| `env.js` / `fresh.js` | 是 | 静态 import / 加载器本身 |

---

## 8. 扩展点

- **加工具**：`lib/index.js` 注册 + `lib/ops.js` 实现；需要重启；补 `scripts/test-*` 与 smoke。
- **加 skill**：在 `skills/<name>/SKILL.md` 放 frontmatter；provider 自动发现；重启后进入 catalog。
- **加风格**：`styles/<slug>/` + `npm run styles:index`；场景通过 `theme.py` 取 token。
- **加项目模板**：`templates/project/` + `scripts/scaffold.mjs` 的占位符变量。
- **加度量阶段**：调用 `recordMetric(project, {phase, activeSec, ...})`；`run-report` 自动汇总。
- **加确认阶段**：在 `scripts/approvals.mjs` 的 stage 表与 `lib/approvals.js` 的 required 逻辑同步。

---

## 9. 测试与发布

```bash
npm run check        # node --check 全部入口
npm test             # 12 个 Node 单测 + 1 个 Python 探针单测
npm run smoke        # 包结构 + 导出 + doctor
npm run check:meta   # 占位符/绝对路径/许可
npm pack --dry-run   # 包内容（templates 必须在内）
```

发布走 GitHub Actions Trusted Publishing；`prepack` 会跑 check + test + smoke。
版本与 `ARCHITECTURE.md` / `README.md` 的工具表必须同步更新。
