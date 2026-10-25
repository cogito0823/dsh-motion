---
name: blueprint
version: 1.0.0
source: https://github.com/lemomo-ai/lemo-opuscar/tree/main/styles/blueprint
license: MIT（上游风格文档）；demo 静帧 CC BY 4.0（LemoLab）
status: adapted
---

# Blueprint · 蓝图 / 工程制图

> 上游：Lemo-Opuscar `styles/blueprint`（MIT）。保留青晒纸、白线、制图顺序与一次红色印章；
> 去掉了 WebGL 纸纹与 3D 投影。

## 1. 定位

工程图在青晒纸上活起来：普鲁士蓝上的白色技术线，按制图顺序画出，标注会动。

- 适合：几何证明、工程结构、尺寸关系、专利/发明叙事；
- 不适合：需要真实材质、角色表演、实拍的题材。

## 2. 不变量

| 项 | 规则 |
|---|---|
| 桌 | 深色绘图桌 `#0D1116` |
| 纸 | 青晒蓝 `#18336B → #2A58A6`，可有轻微不均 |
| 线 | 白 `#E7F0F9`；四种线宽（轮廓/细节/细/发丝）；虚线有制图含义 |
| 印章 | 全片只有一个非蓝颜色：红 `#B5442E`，只盖一次 |
| 字体 | 手写体注释（Chalkboard SE）；技术字段（Menlo）；公式 New Computer Modern |
| 运动 | draw-on：中心线 → 轮廓 → 细节 → 尺寸 → 标注；不做 3D 旋转、不做辉光 |
| 声音 | 纸张、钢笔、尺规、机械；−14 LUFS |

## 3. manimgx 映射

- `theme.py`：`apply_config()`、`backdrop()`（青晒纸渐变 + 噪点）、`sheet()`、`title_block()`；
- 用 `Line`、`Polygon`、`DoubleArrow`、`Create` 实现制图与 draw-on；
- 上游的 3D 斜投影、纸纹 shader 没有实现；用 2D 制图语言近似；
- 字体替换：Architects Daughter → Chalkboard SE；B612 → Menlo。

## 4. Do / Don't

**Do**

- 按制图顺序画：先中心线，再轮廓，最后尺寸与标注；
- 红色印章只出现一次，承担结论；
- 尺寸线、引出线、编号气球让画面“像图”；
- 标题块写图号/状态。

**Don't**

- 不做 3D 渲染、辉光、全息 HUD；
- 不用第二个非蓝颜色；
- 不让主线贴边；文字不压线。

## 5. 与上游的差异

- 上游是 WebGL2 纸纹 + 3D 斜投影；这里是 2D 平涂 + 渐变；
- 上游 24 fps、30–60 秒；本实现 30 fps、7 秒量级；
- 上游手写字体不随包分发；这里用 Chalkboard SE / Menlo 近似。
