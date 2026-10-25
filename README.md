# dsh-motion

![npm](https://img.shields.io/npm/v/dsh-motion)

> **Unofficial community plugin.** Not affiliated with or endorsed by DeepSeek.
> The name is descriptive (`motion` = animation); if the upstream project needs it, this package will be renamed.

**代码生成的数学 / 科普动画**，给 [DeepSeek Harness](https://github.com/deepseek-ai) 用的插件。
画面由代码逐帧生成，不经过任何文生视频（text-to-video）模型。

提供五个工具：

| 工具 | 作用 |
|---|---|
| `motion_frames` | **极简模式（默认）**：直接从场景出帧，不生成视频、不用 HF；几秒拿到 storyboard PNG 与 layout 问题 |
| `motion_doctor` | 环境自检（Node / FFmpeg / Python venv / manimgx / sympy / Chrome / HyperFrames） |
| `motion_render` | 渲染 Manim / manimgx 场景；未通过 `APPROVALS.json` 确认门的项目会拒绝渲染 |
| `motion_probe` | 成片抽帧拼 contact sheet，报告全黑 / 过曝的空镜 |
| `formula_check` | 用 SymPy 判断两个表达式是否恒等 |

外加三个技能：`animation-router`（题材路由）、`design-spec`（写 DESIGN.md）、`qa-rubric`（交付自检）。

## 两种模式

| | 极简模式（默认） | 交付模式 |
|---|---|---|
| 画面来源 | `motion_frames`：按时间点直接出 PNG | `motion_render` → MP4 → HyperFrames 合成 |
| 是否需要 HF | 不需要 | 需要（字幕、旁白、混音、编码） |
| 检查方式 | 看帧（读图），没有"渲染完再抽帧" | `motion_probe` / `hyperframes check` |
| 典型耗时 | 2–6 秒/次 | 数秒–数十秒；HF 合成为分钟级 |
| 什么时候用 | 写场景、调节奏、改版式 | 定稿后出片 |

先出帧、改到满意，再决定要不要渲染成片。`motion_probe` 是给已经存在的视频做体检的，不是默认步骤。

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

汇总见 [showcase/README.md](showcase/README.md)。

## 开工前确认

顺序是硬性的：

1. 需求卡点（画幅 / 交付 / 风格 / 受众 / 旁白）
2. 脚本 / 文案（逐句旁白、上屏文字、公式）
3. 分镜（镜头、秒数、画面、运动、字幕）
4. `DESIGN.md` + 3 张风格帧（只出帧，不渲染）
5. 交付清单（尺寸 / fps / 时长 / 文件 / 音频 / 字幕）
6. **用户明确说“可以开始 / 开始做 / 按这个执行”**

`motion_render` 会读项目里的 `APPROVALS.json`；没有，或 `delivery` / `start` 等阶段未全部 approved，直接报错，不会偷偷渲染。

没听到第 6 步的明确指令，不写完整场景、不出全片。清单模板见
[skills/animation-router/references/confirmation.md](skills/animation-router/references/confirmation.md)。

按体量分档：`light`（≤15 s 无旁白：脚本+分镜合并）、`standard`（15–60 s 或旁白）、`full`（>60 s 或多段，加 animatic）。确认状态落在项目里的 `APPROVALS.json`：

```bash
npm run approvals -- init <project> --mode light
npm run approvals -- set <project> start approved --note "用户说可以开始"
npm run approvals -- check <project>
```

## 安装

```bash
# npm
npm install -g dsh-motion

# 或在 DSH 插件管理器里安装 dsh-motion
```

安装后重启 DeepSeek Harness，然后先跑一次自检：

```
motion_doctor
```

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
        venv: ~/.dsh/data/dsh-motion/venv
        ffmpeg: /opt/homebrew/bin/ffmpeg
```

解析顺序：插件配置 → 环境变量（`MOTION_HOME` / `MOTION_VENV` / `MOTION_FFMPEG`）→ 默认目录 → 系统 PATH。

## 快速开始

### 1. 写一个 Manim 场景

```python
# scenes/derivative.py
import manimgx as m
from manimgx import *

class Derivative(Scene):
    def construct(self):
        ax = Axes(x_range=[-2, 2], y_range=[-1, 4])
        self.play(Create(ax))
        self.wait(1)
```

### 2. 先出帧（默认，不需要 HF）

```jsonc
// motion_frames
{ "file": "/abs/path/scenes/derivative.py", "times": ["1.2", "4.5", "end"] }
```

返回 `storyboard` PNG 路径与 layout 问题清单（实测 3–4 帧约 3–5 秒）。看图改场景，不满意就再来一轮；这一步不生成 mp4，也不需要 HyperFrames。

### 3. 需要成片时再渲染

```jsonc
// motion_render
{ "file": "/abs/path/scenes/derivative.py", "scene": "Derivative", "width": 1920, "height": 1080, "fps": 60 }
```

### 4. 公式先验

```jsonc
// formula_check
{ "left": "diff(0.5*exp(x), x)", "right": "0.5*exp(x)" }
```

## 和 HyperFrames 的关系

本插件**不是**渲染框架，只产出画面素材；合成、字幕、旁白、混音、编码交给 HyperFrames：

```bash
npx hyperframes init my-video
npx hyperframes add data-chart          # 约 450 个现成 block / component
npx hyperframes check                   # 运行时、版式、对比度
npx hyperframes render -o out.mp4
```

- **风格契约**：HF 用 `frame.md`（`DESIGN.md` 的超集）做 brand truth；本仓库的 `DESIGN.md` / `styles/<name>/` 是同一套思路的轻量版，两边可以互读。
- **参考库**：不要把参考片塞进本仓库；直接看 HF 的 [examples](https://hyperframes.heygen.com/examples)、[catalog](https://hyperframes.heygen.com/catalog) 和 [frame.md templates](https://hyperframes.dev/design)。
- **分工**：manimgx 负责公式/坐标/几何这类确定性画面；HF 负责排版、图文、字幕、音频与交付。
- **HF 不必先出片再截图**：`npx hyperframes snapshot <project> --at 2.9,10.4` 直接抓指定时刻的 PNG；`--frames 10 --review` 出 contact sheet；只有要完整序列时才 `render --format png-sequence`。

字幕建议“一份 transcript 出两个产物”：烧录进画面 + 独立 `.srt`。

## 故障排除

| 现象 | 原因 | 处理 |
|---|---|---|
| `找不到 Python 虚拟环境` | 未建 venv | 按上文创建，并 `pip install manimgx sympy` |
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
node scripts/dev.mjs frames showcase/swiss-euler/scene.py 1,3,end   # → out/swiss-euler-frames.png
node scripts/dev.mjs render showcase/swiss-euler/scene.py --fps 30   # → out/swiss-euler.mp4
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
