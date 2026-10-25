---
style: dark-editorial
style_version: 1.0.0
updated: 2026-10-25
---

# dsh-motion · 默认视觉风格

本项目默认采用 **暗场编辑（dark-editorial）**：近黑蓝底、暖白墨色、灰蓝结构线、单一琥珀强调色；数学与数据类内容优先用双栏编辑版式，运动只做“生长、旋转、停住”。

这套语言不是形容词，而是锁在文件里的规范与 token：

- 规范：[styles/dark-editorial/STYLE.md](styles/dark-editorial/STYLE.md)
- Tokens：[styles/dark-editorial/tokens.json](styles/dark-editorial/tokens.json)
- Python 工具：[styles/dark-editorial/theme.py](styles/dark-editorial/theme.py)
- 参考帧：[styles/dark-editorial/preview.jpg](styles/dark-editorial/preview.jpg)
- 参考成片：`episodes/euler/euler.mp4`（本地渲染产物，不随仓库分发）

## 使用规则

1. 新片默认继承本风格；在 `episodes/<slug>/DESIGN.md` 头部写 `style: dark-editorial@1.0.0`。
2. 需要不同语言（纸感、瑞士网格、霓虹等）时，在分集 `DESIGN.md` 里显式覆盖，不要改本文件。
3. 只有要更换**全项目默认**时才改本文件，并同步升 `style_version`。
4. 上屏公式先过 `formula_check`；成片先过 `manimgx inspect` 与 `motion_probe`。

## 参考实现

`episodes/euler/` 是 `1.0.0` 的参考实现：

- 10.0 秒，1920×1080，60 fps；
- 单位圆上 0→π 的半圈，收束到 `e^{iπ} + 1 = 0`；
- 原创环境音，−16 LUFS，无旁白。
