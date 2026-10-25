---
name: qa-rubric
description: 代码动画的自检清单：环境、公式、画面、音频、字幕。默认先看帧（motion_frames），有成片时才查视频。
---

# 交付前自检

## 0. 迭代预算

- 首帧 ≤60 s；总时长 ≤400 s（30 s 片）；
- 输出 tokens ≤30k，上下文 ≤100k；
- 每次迭代 1 张 contact sheet，读图 ≤10 次；
- 全文件重写 0 次；`motion_probe` 1 次、`motion_render` 2 次。

详见 [performance-budget.md](../../docs/performance-budget.md)。

## 1. 环境

先跑 `motion_doctor`，`ready.math` 与 `ready.delivery` 都为 true 再继续。

## 2. 公式（仅数学题材）

- 所有上屏公式先过 `formula_check`；
- 逐条对照代码与画面，确认没有手改过的常数。

## 3. 工程（仅当用了 HyperFrames）

```bash
npx hyperframes check
```

- 0 error 才算过；
- 关注 lint（缺 `@font-face`）、layout（文字裁切/重叠）、contrast（对比度 < 3:1）；
- 没进 HF 的极简流程跳过本节。

## 4. 画面

**先帧后片**：场景阶段用 `motion_frames`，直接看 manimgx 画出的帧，不等视频。

```jsonc
// motion_frames
{ "file": "/abs/path/scene.py", "times": ["1.2", "4.5", "end"] }
```

- 返回的 storyboard PNG 逐张看过：无叠字、无出画、字号可读；
- sheet 每格顶部是 caption 条，不是画面；不要把 caption 当成"上沿被裁"；
- `layoutProblems` 每一条都要处理或明确接受；
- 已经生成了 mp4 时，才用 `motion_probe` 抽 contact sheet + 查 `blankFrames`；
- 用了 HyperFrames 的项目，用 `npx hyperframes snapshot <project> --at 2.9,10.4` 抽帧，不要先 render 再截图。

## 5. 音频

- 旁白最后一字早于结论画面；
- 响度 ≈ −14 LUFS（±1），真峰值 ≤ −1 dBTP；具体以该片 STYLE.md 为准；
- 没有爆音、没有截断。

## 6. 字幕

- 烧录字幕不遮挡主体；
- `.srt` 与音频对齐，单行 ≤ 18 个汉字；
- 烧录与 `.srt` 来自同一份 transcript。

## 7. 交付

mp4 + `.srt` + 场景源码 + `DESIGN.md` + 分镜表。

开工前跑过 `node scripts/approvals.mjs check <project>`；确保 `APPROVALS.json` 里 `start` 是用户明确授权，而不是 agent 自己填的。
