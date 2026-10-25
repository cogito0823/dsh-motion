---
name: dataviz
version: 1.0.0
source: https://github.com/lemomo-ai/lemo-opuscar/tree/main/styles/dataviz
license: MIT（上游风格文档）；demo 静帧 CC BY 4.0（LemoLab）
status: adapted
---

# Data Storytelling · 数据叙事

> 上游：Lemo-Opuscar `styles/dataviz`（MIT）。保留“图表就是电影”的语法；
> 铅笔/纸纹等材质实现换成了 manimgx 的平涂与细线。

## 1. 定位

一张会讲故事的图：真实数据、逐笔画出、手写注释钉在数字上。图表本身就是镜头、节奏和情节。

- 适合：趋势、比较、分布、前后变化、科学数据；
- 不适合：没有数据支撑的口号、纯角色故事。

## 2. 不变量

| 项 | 规则 |
|---|---|
| 纸 | 奶油纸 `#F4EDE1`；墨 `#2B2622`；网格 `#C9BFAE` |
| 数据色 | 发散数据用 RdBu（`#2166AC → #F7F7F7 → #B2182B`），以有意义的均值为中心 |
| 强调 | 蓝 `#2F5D8A` 表示过程/记忆；红 `#B5442E` 表示记录/警告/结论 |
| 字体 | 衬线标题与图注（Songti SC）；等宽刻度（Menlo）；公式 New Computer Modern |
| 运动 | 图表操作就是转场：轴生长、点落下、尺度变化、形变；不用淡入淡出 |
| 注释 | 钉在数据空间（值 + 像素偏移），缩放后仍跟着点 |
| 声音 | 每个 mark 一个音高；−14 LUFS |

## 3. manimgx 映射

- `theme.py`：`apply_config()`、`backdrop()`、`rule()`、`leader()`；
- 用 `Axes`、`Dot`、`Line`、`always_redraw` 实现“轴生长 / 点落下 / 割线滑动”；
- 上游的铅笔、纸纹、手写抖动没有实现；用颜色与注释层级表达同一语法；
- 字体替换：Newsreader → Songti SC；IBM Plex Mono → Menlo。

## 4. Do / Don't

**Do**

- 一次只讲一个想法；让轴、标注、尺度变化承担叙事；
- 注释贴着数据点，颜色有语义（蓝=过程，红=结论）；
- 结论出现时停住，给读者读数时间。

**Don't**

- 不做 dashboard；不堆多个图；
- 不为了戏剧性拉伸色阶；
- 不用装饰性图标代替数据。

## 5. 与上游的差异

- 上游是 Canvas 2D + 手写笔刷；这里是矢量平涂，质感更干净；
- 上游 24 fps、50 秒量级；本实现 30 fps、10 秒量级；
- ColorBrewer RdBu 为标准色板；纸色/墨色取上游描述的中值，验收以帧为准。
