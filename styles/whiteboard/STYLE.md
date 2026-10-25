---
name: whiteboard
version: 1.0.0
source: https://github.com/lemomo-ai/lemo-opuscar/tree/main/styles/whiteboard
license: MIT（上游风格文档）；demo 静帧 CC BY 4.0（LemoLab）
status: adapted
---

# Whiteboard Explainer · 白板讲解

> 上游：Lemo-Opuscar `styles/whiteboard`（MIT）。保留“一块板 + 三支马克笔 + 书写顺序”的语法；
> manimgx 版省掉手/浮空笔/相机旅行，用 draw-on 与固定机位近似。

## 1. 定位

一块暖白干擦板，所有内容都是马克笔“写”出来的：

- 适合：科学解释、课程、机制/流程说明；
- 不适合：需要真实材质、角色表演、复杂 3D 的题材。

## 2. 不变量

| 项 | 规则 |
|---|---|
| 板面 | 暖白 `#F7F5EF`，可有轻微不均与旧字痕 |
| 墨色 | 黑 `#23262C`：结构与文字 |
| 过程色 | 蓝 `#2A5CB3`：测量、过程、正在变化 |
| 强调 | 橙 `#D97757`：结论、最终答案；每区最多一次 |
| 字体 | 手写体（Chalkboard SE）；公式 New Computer Modern |
| 运动 | 按书写顺序 draw-on；一笔接一笔；不弹跳 |
| 版面 | 一个想法一个区域；距离=论证距离；标签要么全在画面内，要么不出现 |

## 3. manimgx 映射

- `theme.py`：`apply_config()`、`backdrop()`（暖白渐变 + 细噪点）；
- 线条与文字用 `Create` / `Write` 按顺序出现；没有笔、手、橡皮、相机；
- 字体替换：EMS Tech / Architects Daughter → `Chalkboard SE`；
- 旧字痕用低透明度 `Text`/`Line` 近似。

## 4. Do / Don't

**Do**

- 先写标题，再按“定义 → 例子 → 结论”在板面上展开；
- 蓝色只给“正在变化”的对象，橙色只给结论；
- 结论出现后停住，给读者读完。

**Don't**

- 不画手、笔、光标；
- 不用第四种马克笔颜色；
- 不做镜头急推/急拉；文字不压线。

## 5. 与上游的差异

- 上游有浮空马克笔、笔影、干擦纹理、相机旅行；这里只保留书写顺序与三色语义；
- 上游 24 fps、板面可远大于画幅；本实现 30 fps、固定画幅；
- 字体与纹理均为近似，验收以帧为准。
