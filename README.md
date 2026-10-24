# dsh-motion

> **Unofficial community plugin.** Not affiliated with or endorsed by DeepSeek.
> The name is descriptive (`motion` = animation); if the upstream project needs it, this package will be renamed.

**代码生成的数学 / 科普动画**，给 [DeepSeek Harness](https://github.com/deepseek-ai) 用的插件。
画面由代码逐帧生成，不经过任何文生视频（text-to-video）模型。

提供四个工具：

| 工具 | 作用 |
|---|---|
| `motion_doctor` | 环境自检（Node / FFmpeg / Python venv / manimgx / sympy / Chrome / HyperFrames） |
| `motion_render` | 渲染 Manim / manimgx 场景，可加运动模糊、颗粒、暗角、调色 |
| `motion_probe` | 抽帧拼 contact sheet，报告全黑 / 过曝的空镜 |
| `formula_check` | 用 SymPy 判断两个表达式是否恒等 |

外加三个技能：`animation-router`（题材路由）、`design-spec`（写 DESIGN.md）、`qa-rubric`（交付自检）。

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
| FFmpeg + ffprobe | 必需 | 渲染与后期；不随包分发 |
| Python 3 + venv | 数学功能需要 | `manimgx`、`sympy` |
| Chrome | 成片渲染需要 | HyperFrames 优先复用系统 Chrome |
| HyperFrames 0.8.193 | 成片需要 | `npx hyperframes@0.8.193`，不随包分发 |

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

### 2. 渲染

```jsonc
// motion_render
{ "file": "/abs/path/scenes/derivative.py", "scene": "Derivative", "width": 1920, "height": 1080, "fps": 30 }
```

### 3. 自检

```jsonc
// motion_probe
{ "video": "/abs/path/scenes/derivative.mp4", "frames": 12 }
```

### 4. 公式先验

```jsonc
// formula_check
{ "left": "diff(0.5*exp(x), x)", "right": "0.5*exp(x)" }
```

## 和 HyperFrames 的关系

本插件**不是**渲染框架。成片（合成、字幕、音频混流、编码）交给 HyperFrames：

```bash
npx hyperframes@0.8.193 init <project> --example swiss-grid --video <clip>.mp4
npx hyperframes@0.8.193 check <project>
npx hyperframes@0.8.193 render <project> -o out.mp4 --quality delivery
```

字幕建议“一份 transcript 出两个产物”：烧录进画面 + 独立 `.srt`。

## 故障排除

| 现象 | 原因 | 处理 |
|---|---|---|
| `找不到 Python 虚拟环境` | 未建 venv | 按上文创建，并 `pip install manimgx sympy` |
| `找不到渲染器: …/manimgx` | venv 里没装 | `pip install manimgx` |
| 渲染断字 / 字体回退 | 字体未声明 `@font-face` | 把 `.woff2` 放工程 `assets/fonts/` 并声明 |
| `ffprobe` 缺失 | 只装了 ffmpeg | 装完整 FFmpeg，插件会退回 `ffmpeg -i` 解析 |
| 抽帧全黑 | 片头/片尾空镜 | 用 `tpad=stop_mode=clone` 补帧，或剪掉 |

## 许可

MIT（见 `LICENSE`）。第三方依赖与调用关系见 `NOTICE.md`。
