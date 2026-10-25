---
style: dark-editorial
style_version: 1.0.0
---

# 欧拉公式 · 单位圆上的半圈

10 秒数学短片。用单位圆上的一次半圈旋转，把一般形式 `e^{iθ} = cos θ + i sin θ`
收束成 `e^{iπ} + 1 = 0`。

本片是 [dark-editorial@1.0.0](../../styles/dark-editorial/STYLE.md) 的参考实现；本文件只记录本片的局部决定。

## 设计规范

```yaml
colors:
  ground: "#0B0F16"
  ink:    "#EFEAE0"
  muted:  "#8791A3"
  axis:   "#344054"
  accent: "#E3A857"
typography:
  display: { family: "Noto Sans CJK SC", weight: 700, size: 64 }
  body:    { family: "Noto Sans CJK SC", weight: 400, size: 24 }
  math:    { family: "New Computer Modern", size: 80 }
spacing:
  margin: 0.60
  rule: 1
motion:
  fps: 60
  easing: smooth / ease-out
```

## Do

- 暗场，近黑蓝底 `#0B0F16`，主视觉只用暖白、灰蓝、琥珀三种墨色。
- 先有线，再有面：坐标轴与单位圆都是细线，旋转向量和轨迹才用琥珀色。
- 单位圆在左，公式在右，中间一条极细的分隔线，保持编辑排版感。
- 运动是“生长”和“旋转”，到位后停住，不反复弹跳。
- 公式先过 `formula_check`，再上屏。

## Don't

- 不用高饱和霓虹、渐变球、发光滤镜、投影。
- 不给每句话配卡片；全片只有标题、公式、一行注解。
- 不用无衬线英文大标题堆叠；英文只作小号辅助标签。
- 不在画面上烧录字幕条；本片无旁白。

## 版面

- 左栏：标题块位于左上，单位圆居中偏左下。
- 右栏：一般形式在上，特例公式在中，注解在下。
- 四周留白约 0.45–0.6 单位；任何文字不与圆、轴、分隔线相交。

## 参考

- 数学手稿与科学编辑版式：细线、坐标、单一强调色、克制的字号层级。
- 暗场天文摄影的明暗关系：主体亮，背景沉，边缘轻暗角。
