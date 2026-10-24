---
name: qa-rubric
description: 代码动画交付前的自检清单：环境、公式、工程、画面、音频、字幕。渲染完但还没交付时使用。
---

# 交付前自检

## 1. 环境

先跑 `motion_doctor`，`ready.math` 与 `ready.delivery` 都为 true 再继续。

## 2. 公式（仅数学题材）

- 所有上屏公式先过 `formula_check`；
- 逐条对照代码与画面，确认没有手改过的常数。

## 3. 工程

```bash
npx hyperframes check
```

- 0 error 才算过；
- 关注 lint（缺 `@font-face`）、layout（文字裁切/重叠）、contrast（对比度 < 3:1）。

## 4. 画面

```bash
motion_probe --video <mp4>
```

- 看 contact sheet：无叠字、无出画、无空白帧；
- `blankFrames` 里的帧逐一看过再决定是否重渲。

## 5. 音频

- 旁白最后一字早于结论画面；
- 响度 ≈ −14 LUFS（±1），真峰值 ≤ −1.5 dBTP；
- 没有爆音、没有截断。

## 6. 字幕

- 烧录字幕不遮挡主体；
- `.srt` 与音频对齐，单行 ≤ 18 个汉字；
- 烧录与 `.srt` 来自同一份 transcript。

## 7. 交付

mp4 + `.srt` + 场景源码 + `DESIGN.md` + 分镜表。
