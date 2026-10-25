# dsh-motion

![npm](https://img.shields.io/npm/v/dsh-motion)

> **Unofficial community plugin.** Not affiliated with or endorsed by DeepSeek.
> The name is descriptive (`motion` = animation); if the upstream project needs it, this package will be renamed.

**代码生成的数学 / 科普动画**，给 [DeepSeek Harness](https://github.com/deepseek-ai) 用的插件。
画面由代码逐帧生成，不经过任何文生视频（text-to-video）模型。

提供六个工具：

| 工具 | 作用 |
|---|---|
| `motion_frames` | **极简模式（默认）**：直接从场景出帧，不生成视频、不用 HF；几秒拿到 storyboard PNG 与 layout 问题；输出落 `<project>/out/frames` |
| `motion_doctor` | **环境预检（一次调用）**：运行时 + 真实可用字体清单 + 公式转换 + API/函数/rate；按指纹缓存 12 h（不再按 Node 版本分叉） |
| `motion_setup` | **环境自愈**：建 venv、装 manimgx/sympy（`tts=true` 加 edge-tts）；在宿主进程执行，不受模型 bash 沙箱限制 |
| `motion_render` | 渲染 Manim / manimgx 场景；必须有 `motion.project.json`，`APPROVALS.json` 是前置账本（已通过就直接渲，未通过才走一次平台审批）；输出落 `<project>/out/render` |
| `motion_probe` | 成片抽帧拼 contact sheet，报告全黑/过曝，并给出 fps/帧数/VFR/CFR |
| `formula_check` | 用 SymPy 判断两个表达式是否恒等 |

外加三个技能：`animation-router`（题材路由 + API/命令速查）、`design-spec`（写 DESIGN.md）、`qa-rubric`（交付自检）。
它们由插件通过 `ctx.skills` 注册，**安装后自动出现在会话技能目录**，不需要再复制到 `~/.dsh/skills`。

模块边界、进程拓扑、数据流与不变量见 [ARCHITECTURE.md](ARCHITECTURE.md)；设计理由与外部调研见
[docs/ai-native-motion.md](docs/ai-native-motion.md)。

## 版本与发布说明

npm 页面只渲染 README，不提供每个版本的 release note；完整记录在
[GitHub Releases](https://github.com/cogito0823/dsh-motion/releases)。下面是当前版本摘要：

| 版本 | 日期 | 主要内容 |
|---|---|---|
| [0.10.1](https://github.com/cogito0823/dsh-motion/releases/tag/v0.10.1) | 2026-10-26 | 修复：项目集按 `exec.agent.session.cwd` 定位，不再误用插件进程 cwd（`~/.dsh/profiles/<p>`）；metrics 也走同一坐标系 |
| [0.10.0](https://github.com/cogito0823/dsh-motion/releases/tag/v0.10.0) | 2026-10-26 | 需求卡点固定七题（含时长/帧率/受众/风格/旁白）；项目集收敛到会话工作区的 `dsh-motion-projects/`，解析不越界/不嵌套/无 legacy；账本通过后渲染不再逐次弹窗 |
| [0.9.1](https://github.com/cogito0823/dsh-motion/releases/tag/v0.9.1) | 2026-10-26 | 文档：README 增加版本摘要与 Releases 链接（docs-only） |
| [0.9.0](https://github.com/cogito0823/dsh-motion/releases/tag/v0.9.0) | 2026-10-26 | 项目根 manifest、审批门与审计、时间轴自检、TTS 缓存、VFR/CFR、运行账本、showcase 标准化 |
| [0.6.0](https://github.com/cogito0823/dsh-motion/releases/tag/v0.6.0) | 2026-10-26 | 免费 edge-tts 旁白、词级 timing、SRT、混音 |
| [0.5.0](https://github.com/cogito0823/dsh-motion/releases/tag/v0.5.0) | 2026-10-25 | requirements brief 硬门；无锁定时 `motion_frames` 拒绝出帧 |
| [0.4.3](https://github.com/cogito0823/dsh-motion/releases/tag/v0.4.3) | 2026-10-25 | 预检合并为一次 `motion_doctor`，指纹缓存；TTL 边界修复 |
| [0.4.2](https://github.com/cogito0823/dsh-motion/releases/tag/v0.4.2) | 2026-10-25 | render 规格生效；按帧数强制 CFR |
| [0.4.1](https://github.com/cogito0823/dsh-motion/releases/tag/v0.4.1) | 2026-10-25 | 未 approved checkpoint 拒绝 render |
| [0.4.0](https://github.com/cogito0823/dsh-motion/releases/tag/v0.4.0) | 2026-10-25 | 分档确认门、`APPROVALS.json`、pre-flight、CFR |
| [0.3.0](https://github.com/cogito0823/dsh-motion/releases/tag/v0.3.0) | 2026-10-25 | 风格路由 registry/CLI；3b1b + whiteboard |
| [0.2.0](https://github.com/cogito0823/dsh-motion/releases/tag/v0.2.0) | 2026-10-25 | Lemo 风格库、frames-first、showcase、probe/doctor 改进 |
| [0.1.1](https://github.com/cogito0823/dsh-motion/releases/tag/v0.1.1) | 2026-10-25 | OIDC Trusted Publishing、npm badge、unofficial 标记 |
| [0.1.0](https://github.com/cogito0823/dsh-motion/releases/tag/v0.1.0) | 2026-10-25 | 首个公开版本：4 个工具、3 个 skill |

`0.7.0` / `0.8.0` 未单独发布，改动已并入 `0.9.0`。

## 两种模式

| | 极简模式（默认） | 交付模式 |
|---|---|---|
| 画面来源 | `motion_frames`：按时间点直接出 PNG | `motion_render` → MP4 → HyperFrames 合成 |
| 是否需要 HF | 不需要 | 需要（字幕、编码；旁白/混音也可走本地免费路线） |
| 检查方式 | 看帧（读图），没有"渲染完再抽帧" | `motion_probe` / `hyperframes check` |
| 典型耗时 | 2–6 秒/次 | 数秒–数十秒；HF 合成为分钟级 |
| 什么时候用 | 写场景、调节奏、改版式 | 定稿后出片 |

先出帧、改到满意，再决定要不要渲染成片。`motion_probe` 是给已经存在的视频做体检的，不是默认步骤。

## 项目骨架、时间轴与账本

新项目用脚手架起，不要从空白开始：

```bash
node scripts/scaffold.mjs my-film --title "欧拉公式" --duration 30
node scripts/timeline-check.mjs dsh-motion-projects/my-film --strict
node scripts/run-report.mjs dsh-motion-projects/my-film --wall 752
```

- 模板生成 `motion.project.json` / `scene.py` / `timeline.json` / `timeline.py` / `narration.json` / `assemble.py` / `DESIGN.md`；
- **一个项目 = 一部片子**，放在**会话工作目录**下的 `dsh-motion-projects/<目录名>`（可用 `MOTION_PROJECTS_HOME` 改）；
  工具路径用 `exec.agent.session.cwd` 定位（不是插件进程的 cwd，那是 profile 目录）；
- 项目集只有这一层：`dsh-motion-projects/registry.json` 是可删可重建的索引，不参与寻址；
- `motion.project.json` 是唯一项目根，`id` 在这里，目录改名不影响身份；`APPROVALS.json` / `out/` / `audio/` / `.dsh-motion/` 都相对它；
- 解析**不越界、不向上找**：workspace 外的 `scene.py` 一律 unmanaged；子目录里的项目会被拒绝（不允许嵌套）；
- 正式 `motion_render` 必须有项目根；临时场景只能出帧，或用 `--explore` 调试；
- 工具入参可以给**项目目录名**（`{"file": "my-film"}`）或场景文件的绝对路径；
- 仓库自带的 `showcase/*` 不在项目集内，跑它们用 `MOTION_PROJECTS_HOME=showcase`；
- 管理项目集：`node scripts/projects.mjs list|show|repair|rename|registry`；
- `timeline.py` 的 `TimedScene.cue()` 在运行时对比 `self.time`，落后超过 0.35s 打印 `[late]`；
- `timeline-check` 检查 cue 乱序/越界、旁白晚于画面、旁白压到下一拍；
- 每个项目写 `<project>/.dsh-motion/metrics.jsonl`，`run-report` 汇总 active / wall，避免把 compute 百分比当端到端收益；
- `motion_probe` 报 `vfr:true` 时，raw 只是中间片，交付前用 `assemble.py` 或 `motion_render` 归一成 CFR。

旁白 `narrate` 默认按文本/音色/语速缓存并并发 3 句；`mix --report-gaps` 输出每个旁白间隙的 dB。

## 风格库

默认 **瑞士动态排版（swiss-motion）**；另外四套按题材选。四套改编自 [Lemo-Opuscar](https://github.com/lemomo-ai/lemo-opuscar)，`3b1b` 来自 Manim 社区，均非自创。

| 风格 | 适合 | 规范 |
|---|---|---|
| `swiss-motion`（默认） | 公式、定义、数据结论 | [STYLE](styles/swiss-motion/STYLE.md) · [tokens](styles/swiss-motion/tokens.json) |
| `dataviz` | 趋势、比较、分布、科学数据 | [STYLE](styles/dataviz/STYLE.md) · [tokens](styles/dataviz/tokens.json) |
| `blueprint` | 几何证明、结构、尺寸关系 | [STYLE](styles/blueprint/STYLE.md) · [tokens](styles/blueprint/tokens.json) |
| `whiteboard` | 科学解释、课程、机制说明 | [STYLE](styles/whiteboard/STYLE.md) · [tokens](styles/whiteboard/tokens.json) |
| `3b1b` | 线代、微积分、概率、神经网络 | [STYLE](styles/3b1b/STYLE.md) · [tokens](styles/3b1b/tokens.json) |

**参考与示例统一用 HyperFrames 的库**：[examples](https://hyperframes.heygen.com/examples)、[catalog](https://hyperframes.heygen.com/catalog)、[frame.md](https://hyperframes.heygen.com/prompting/design-systems)。本仓库不再内置样片/分集；`showcase/` 只放可复现的演示。

路由是显式的：`node scripts/route-style.mjs "<题材>"`（点名优先 → registry 打分 → 默认 `swiss-motion`；分数并列/为 0 时要求确认）。规则在 [styles/registry.json](styles/registry.json)。

迭代预算（首帧 ≤60s、输出 ≤30k、上下文 ≤100k、读图 ≤10）见 [docs/performance-budget.md](docs/performance-budget.md)。

开工前先过需求卡点：`npm run plan -- "竖屏抖音，讲导数，要旁白"`，会推断画幅、交付、风格的候选项，再交给 `ask_user_question`；能推断的不问。

项目 `DESIGN.md` 头部写 `style: <slug>` + `style_version: 1.0.0`。风格来源、HF 集成、抽帧能力与 Lemo 调研见 [docs/ai-native-motion.md](docs/ai-native-motion.md)。

## 演示

五个类别各一支 10 秒内短片，记录出帧/渲染耗时：

- 公式：[showcase/swiss-euler](showcase/swiss-euler)
- 数据：[showcase/dataviz-secant](showcase/dataviz-secant)
- 几何：[showcase/blueprint-pythagoras](showcase/blueprint-pythagoras)
- 白板：[showcase/whiteboard-derivative](showcase/whiteboard-derivative)
- 暗场数学：[showcase/3b1b-unit-circle](showcase/3b1b-unit-circle)

每个 showcase 目录都是标准项目（带 `motion.project.json`）；成片在 `final/`，生成物在 `out/`。
汇总见 [showcase/README.md](showcase/README.md)。

## 开工前确认

`requirements` / `start` 的确认必须带 `--confirmation <ask_user_question id>`；brief 哈希由脚本自动生成。

顺序是硬性的：

1. 需求卡点（画幅 / 交付 / 风格 / 受众 / 旁白）
2. 脚本 / 文案（逐句旁白、上屏文字、公式）
3. 分镜（镜头、秒数、画面、运动、字幕）
4. `DESIGN.md` + 3 张风格帧（只出帧，不渲染）
5. 交付清单（尺寸 / fps / 时长 / 文件 / 音频 / 字幕）
6. **用户明确说“可以开始 / 开始做 / 按这个执行”**

`motion_render` 只在账本没通过时才走 Harness 的 `ctx.approval.request`：
账本全 approved 说明需求/脚本/分镜/开工都确认过了，渲染不再重复问，只往审计里记一条
`ledger-approved`。账本缺失或未通过时用户在界面里确认一次，拒绝则渲染失败。
想恢复“每次渲染都问”，在插件配置里加 `confirmEveryRender: true`。
`APPROVALS.json` 始终是前置条件（CLI/无平台路径也会校验）。
拒绝、`--explore` 绕过、平台审批与跳过审批都会写进 `<project>/.dsh-motion/approvals.jsonl`。

`motion_frames` 也会拦：项目有账本、但需求没落全「时长 / 画幅 / 帧率 / 交付 / 风格 / 受众 / 旁白」时，直接拒绝出帧。
第一步永远是固定七题一次问完，然后落账：

```bash
npm run approvals -- init <project> --mode standard
npm run approvals -- set <project> requirements approved \
  --duration 30s --aspect 1920x1080 --fps 30fps --delivery narrated \
  --style 3b1b --audience high --narration zh-neutral \
  --confirmation q_... --note "用户确认"
```

没听到第 6 步的明确指令，不写完整场景、不出全片。清单模板见
[skills/animation-router/references/confirmation.md](skills/animation-router/references/confirmation.md)。

按体量分档：`light`（≤15 s 无旁白：脚本+分镜合并）、`standard`（15–60 s 或旁白）、`full`（>60 s 或多段，加 animatic）。确认状态落在项目里的 `APPROVALS.json`：

```bash
npm run approvals -- init <project> --mode light
npm run approvals -- set <project> start approved --confirmation q_... --note "用户说可以开始"
npm run approvals -- check <project>
```

## 安装

```bash
# npm
npm install -g dsh-motion

# 或在 DSH 插件管理器里安装 dsh-motion
```

安装后重启 DeepSeek Harness，然后先跑一次预检：

```
motion_doctor
```

它把运行时、真实可用字体、公式转换和 API/函数/rate 一次带回（按机器指纹缓存 12 小时，重复调用几乎不耗时）。
`ready.math=false` 时调用 `motion_setup`，不要自己用 bash 建 venv——venv 在 workspace 外，会被沙箱拒绝。

## 依赖

| 依赖 | 是否必需 | 说明 |
|---|---|---|
| Node.js ≥ 22 | 必需 | `engines` 声明 |
| Python 3 + venv | 数学功能需要 | `manimgx`、`sympy`；极简出帧只需这一项 |
| FFmpeg + ffprobe | 成片/探针需要 | 后期与抽帧；出帧不需要；不随包分发 |
| Chrome | 用了 HF 才需要 | HyperFrames 优先复用系统 Chrome |
| HyperFrames | 交付模式需要 | `npx hyperframes`，不随包分发 |

### 准备 Python 环境

```bash
# 推荐：插件内 motion_setup，或命令行（幂等，缺什么补什么）
npm run setup
npm run setup -- --tts     # 旁白依赖 edge-tts / numpy
npm run setup -- --force   # 删掉旧 venv 重建

# 手动兜底
python3 -m venv ~/.dsh/data/dsh-motion/venv
~/.dsh/data/dsh-motion/venv/bin/pip install manimgx sympy
```

Windows 把 `bin/` 换成 `Scripts\`，可执行文件加 `.exe`。

## 配置

插件配置（或在 profile 的 `cordis.patch.yml` 里传入）：

```yaml
- insert:
    - id: motion
      name: dsh-motion
      config:
        motionHome: ~/.dsh/data/dsh-motion
        workspace: <会话 cwd>/dsh-motion-projects      # 默认值；也可用 MOTION_PROJECTS_HOME
        venv: ~/.dsh/data/dsh-motion/venv
        python: /opt/homebrew/bin/python3.13   # 可选；默认找 python3.13/3.12/3.11/3
        packages: [manimgx, sympy, manimgx-fonts, manimgx-fonts-cjk]  # 可选；motion_setup 安装清单
        tts: false                             # 可选；true 时追加 edge-tts / numpy
        ffmpeg: /opt/homebrew/bin/ffmpeg
```

解析顺序：插件配置 → 环境变量（`MOTION_HOME` / `MOTION_PROJECTS_HOME` / `MOTION_VENV` / `MOTION_FFMPEG`）→ 默认目录 → 系统 PATH。

## 快速开始

### 0. 先建项目

```bash
node scripts/scaffold.mjs demo --title "演示" --duration 10
cd dsh-motion-projects/demo
```

项目根由 `motion.project.json` 标识；正式渲染必须能找到它。临时场景可以只出帧，但不要用于交付。

### 1. 写一个 Manim 场景

```python
# scene.py
import manimgx as m
from manimgx import *

class Demo(Scene):
    def construct(self):
        ax = Axes(x_range=[-2, 2], y_range=[-1, 4])
        self.play(Create(ax))
        self.wait(1)
```

### 2. 先出帧（默认，不需要 HF）

```jsonc
// motion_frames
{ "file": "demo", "times": ["1.2", "4.5", "end"] }
```

返回 `storyboard` PNG 路径与 layout 问题清单（实测 3–4 帧约 3–5 秒）。看图改场景，不满意就再来一轮；这一步不生成 mp4，也不需要 HyperFrames。

### 3. 需要成片时再渲染

```jsonc
// motion_render
{ "file": "demo", "scene": "Demo", "width": 1920, "height": 1080, "fps": 60 }
```

### 4. 公式先验

```jsonc
// formula_check
{ "left": "diff(0.5*exp(x), x)", "right": "0.5*exp(x)" }
```

## 旁白（免费路线）

不依赖付费 API、不需要账号。默认用 [`edge-tts`](https://github.com/rany2/edge-tts)（微软 Edge 朗读接口的非官方封装：免费、联网、带词级时间戳）；离线兜底用 macOS `say`。

一次性准备：

```bash
python3 -m venv .venv-tts
.venv-tts/bin/pip install edge-tts numpy   # Windows: .venv-tts\Scripts\pip
```

`narration.json` 只描述文本和节拍，语音参数可以写在 `edge` 里，也可以命令行覆盖：

```json
{
  "duration": 30,
  "edge": { "voice": "zh-CN-XiaoxiaoNeural", "rate": "+10%" },
  "lines": [
    { "id": 1, "start": 0.65, "text": "先看这个函数……" }
  ]
}
```

生成逐句音频、词级 `timing.json` 和 `captions.srt`：

```bash
npm run narrate -- dsh-motion-projects/foo --voice zh-CN-XiaoxiaoNeural --rate +10%
```

混音（可选音乐、自动 duck、−14 LUFS / −1 dBTP），需要时直接压进现有视频：

```bash
npm run mix -- dsh-motion-projects/foo --music assets/bed.wav \
  --mux out/foo.mp4 --mux-out out/foo-narrated.mp4
```

| 产物 | 内容 |
|---|---|
| `audio/edge/l1.mp3` | 逐句人声；按“文本 + 音色 + 参数”缓存 |
| `audio/edge/timing.json` | 每句起止 + 词级时间 |
| `audio/edge/captions.srt` | 与配音对齐的字幕 |
| `audio/master.wav` | 48 kHz / 24-bit 母带 |
| `audio/mix.json` | 响度、真峰值、duck 参数 |

没有网络时：

```bash
npm run narrate -- dsh-motion-projects/foo --provider say --voice Tingting --rate 230
```

`say` 不提供词级时间，字幕按 token 权重估算，并在 `timing.json` 标 `estimated`。Python 解释器可用 `--python` 或 `MOTION_TTS_PYTHON` 指定。

> `edge-tts` 免费但非官方接口：需要联网，无 SLA；商业发行建议换 Apache 2.0 的 Fun-CosyVoice3 或真人配音。

## 和 HyperFrames 的关系

本插件**不是**渲染框架，默认只产出画面素材；成片合成、字幕、编码交给 HyperFrames。旁白与混音可以用上面的免费路线，不强制走 HF：

```bash
npx hyperframes init my-video
npx hyperframes add data-chart          # 约 450 个现成 block / component
npx hyperframes check                   # 运行时、版式、对比度
npx hyperframes render -o out.mp4
```

- **风格契约**：HF 用 `frame.md`（`DESIGN.md` 的超集）做 brand truth；本仓库的 `DESIGN.md` / `styles/<name>/` 是同一套思路的轻量版，两边可以互读。
- **参考库**：不要把参考片塞进本仓库；直接看 HF 的 [examples](https://hyperframes.heygen.com/examples)、[catalog](https://hyperframes.heygen.com/catalog) 和 [frame.md templates](https://hyperframes.dev/design)。
- **分工**：manimgx 负责公式/坐标/几何这类确定性画面；HF 负责排版、图文、字幕与交付；免费旁白路线负责 TTS、时间轴与混音。
- **HF 不必先出片再截图**：`npx hyperframes snapshot <project> --at 2.9,10.4` 直接抓指定时刻的 PNG；`--frames 10 --review` 出 contact sheet；只有要完整序列时才 `render --format png-sequence`。

字幕建议“一份 transcript 出两个产物”：烧录进画面 + 独立 `.srt`。

## 故障排除

| 现象 | 原因 | 处理 |
|---|---|---|
| `找不到 Python 虚拟环境` | 未建 venv | 调用 `motion_setup`（或 `npm run setup`），不要手动在 workspace 外建 |
| `找不到渲染器: …/manimgx` | venv 里没装 | `pip install manimgx` |
| `motion_frames` 报 layout 问题 | 压字 / 出画 / 字号过小 | 按返回的 `[n]` 逐条改场景；退出码 1 是“有问题”，不是崩溃 |
| 渲染断字 / 字体回退 | 字体未声明 `@font-face` | 把 `.woff2` 放工程 `assets/fonts/` 并声明 |
| `ffprobe` 缺失 | 只装了 ffmpeg | 装完整 FFmpeg，插件会退回 `ffmpeg -i` 解析 |
| 抽帧全黑 | 片头/片尾空镜 | 用 `tpad=stop_mode=clone` 补帧，或剪掉 |

## 本地开发（维护者）

桌面 App **独占** `desktop` profile，CLI 不能管理它（`dsh plugin --profile desktop` 会直接报错）。
把插件切到当前 checkout 的完整步骤、验证命令和禁忌清单记在
[MAINTAINING.md](https://github.com/cogito0823/dsh-motion/blob/main/MAINTAINING.md)。

一句话版本：插件管理器里**卸载** `dsh-motion` → **安装本地目录** `/path/to/dsh-motion` → `⌘⇧R` 重启；
之后 `motion_doctor` 第一行的「插件来源」会直接说明当前跑的是本地 checkout 还是 npm 安装。

日常改代码**不需要重装**：link 安装一次后，改 `lib/ops.js` / `lib/doctor.js` 会在下一次工具调用时按 mtime 热加载；只有改工具名/参数 schema 才需要 `⌘⇧R`。风格、`tokens.json`、场景文件本来就是运行时读取，不用重启。详见 [docs/dev-loop.md](docs/dev-loop.md)，也可以完全绕开 Harness：

```bash
node scripts/dev.mjs frames showcase/swiss-euler/scene.py 1,3,end   # → showcase/swiss-euler/out/frames/scene.png
node scripts/dev.mjs render --explore showcase/swiss-euler/scene.py --fps 30   # 演示项目无账本，仅调试
```

## 发版（维护者）

首次发布会把包名与 2FA 绑好；之后走 GitHub Actions 的 **Trusted Publishing**（OIDC），不需要 token、不需要 OTP，自动附带 **provenance 签名**。

### 一次性绑定

npm 包设置 → **Settings → Trusted Publisher → GitHub Actions**：

| 字段 | 值 |
|---|---|
| Organization or user | `cogito0823` |
| Repository | `dsh-motion` |
| Workflow filename | `release.yml` |
| Environment | 留空 |

Allowed actions：勾 **`npm publish`** 即可（`npm dist-tag` 用不到）。

### 发一版

```bash
npm version patch          # 0.1.0 -> 0.1.1
git push --follow-tags     # 触发 .github/workflows/release.yml
```

工作流会：校验 tag 与 `package.json` 版本一致 → `check` + `smoke` → `npm publish --provenance --access public`。

### 两个必须知道的坑

1. **npm CLI 必须 ≥ 11.5.1**。Node 22 自带的 npm 10 不支持 OIDC，会把占位 token 发出去，registry 返回误导性的 `404 not in this registry`。工作流里已加 `npm install -g npm@latest`。
2. **发布后不是立刻可见**。CLI 会打印 `Your package is being processed and may take a few minutes to become available`，通常 1–2 分钟后 `npm view` 才查得到。这不是失败。

### 验证

```bash
npm view dsh-motion version
npm view dsh-motion@<version> dist.attestations   # 应含 provenance / SLSA v1
```

npm 包页面会出现 **“Built and signed on GitHub Actions”**。

## 许可

MIT（见 `LICENSE`）。第三方依赖与调用关系见 `NOTICE.md`。
