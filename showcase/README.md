# 展示片（5 个类别）

每支都用真实场景代码渲染，记录**出帧**与**渲染**耗时。风格来自 `styles/`：4 套改编自 Lemo-Opuscar，`3b1b` 来自 Manim 社区。

0.9.0 起每个 showcase 都是标准项目：带 `motion.project.json`；生成的 storyboard/contact sheet 落 `showcase/<slug>/out/`（gitignore），
交付成片放 `showcase/<slug>/final/`（提交）。

| 类别 | 短片 | 风格 | 帧检查（3 帧） | 渲染 | 成片 | 体积 |
|---|---|---|---|---|---|---|
| 公式 | [swiss-euler](swiss-euler) | `swiss-motion` | 2.4 s | 2.8 s | 6.2 s · 1080p30 | 0.1 MB |
| 数据 | [dataviz-secant](dataviz-secant) | `dataviz` | 2.5 s | 3.1 s | 10.1 s · 1080p30 | 0.2 MB |
| 几何 | [blueprint-pythagoras](blueprint-pythagoras) | `blueprint` | 4.3 s | 5.0 s | 6.9 s · 1080p30 | 0.5 MB |
| 白板 | [whiteboard-derivative](whiteboard-derivative) | `whiteboard` | 4.3 s | 5.2 s | 9.6 s · 1080p30 | 0.6 MB |
| 暗场数学 | [3b1b-unit-circle](3b1b-unit-circle) | `3b1b` | 2.6 s | 3.0 s | 10.3 s · 1080p30 | 0.3 MB |

耗时是 2026-10-25 同一台机器、同一次运行的旧基线；机器负载不同会有波动。出帧用 `motion_frames` / `dev.mjs frames`（不编码视频）；渲染用 `motion_render`（平台审批）/ `dev.mjs render --explore`。

## 1. 公式 · 欧拉公式

`e^{iπ}+1=0`。瑞士网格 + 一个红色信号色；全片只让 `0` 落在信号色上。

- 场景：[scene.py](swiss-euler/scene.py)
- 预览：[preview.jpg](swiss-euler/preview.jpg)
- 成片：[swiss-euler.mp4](swiss-euler/final/swiss-euler.mp4)

## 2. 数据 · 割线变切线

`f(x)=x²/2` 上 `P(2,2)` 固定，`Q(q,f(q))` 从 `q=3` 滑到 `q=2`；割线斜率读数从 `2.50` 落到 `2.00`，最后切线出现。

- 场景：[scene.py](dataviz-secant/scene.py)
- 预览：[preview.jpg](dataviz-secant/preview.jpg)
- 成片：[dataviz-secant.mp4](dataviz-secant/final/dataviz-secant.mp4)

## 3. 几何 · 3-4-5 直角三角形

按制图顺序画：轮廓 → 直角标记 → 尺寸线 → 公式 → 红色 Q.E.D. 印章。

- 场景：[scene.py](blueprint-pythagoras/scene.py)
- 预览：[preview.jpg](blueprint-pythagoras/preview.jpg)
- 成片：[blueprint-pythagoras.mp4](blueprint-pythagoras/final/blueprint-pythagoras.mp4)

## 4. 白板 · 割线为什么会变成切线

暖白板 + 三支马克笔：黑色画结构，蓝色画正在滑动的 Q，橙色给最终切线。`Chalkboard SE` 手写体，按书写顺序出现。

- 场景：[scene.py](whiteboard-derivative/scene.py)
- 预览：[preview.jpg](whiteboard-derivative/preview.jpg)
- 成片：[whiteboard-derivative.mp4](whiteboard-derivative/final/whiteboard-derivative.mp4)

## 5. 暗场数学 · 单位圆上的旋转

3b1b 配色：`#1c1c1c` 底、蓝 `#3b82f6` 向量、黄 `#fbbf24` 投影；先看旋转，最后收束到 `e^{iθ} = cosθ + i sinθ`。

- 场景：[scene.py](3b1b-unit-circle/scene.py)
- 预览：[preview.jpg](3b1b-unit-circle/preview.jpg)
- 成片：[3b1b-unit-circle.mp4](3b1b-unit-circle/final/3b1b-unit-circle.mp4)

## 复现

命令从 dsh-motion 包根执行；`out/` 是临时产物，`final/` 是提交的成片。

```bash
# 1) 先出帧：默认写 showcase/<slug>/out/frames/scene.png
node scripts/dev.mjs frames showcase/swiss-euler/scene.py 1,3,end

# 2) 再渲染：--explore 用于没有 APPROVALS 的演示项目
node scripts/dev.mjs render showcase/swiss-euler/scene.py --explore \
  --out showcase/swiss-euler/final/swiss-euler.mp4
```

Harness 内用 `motion_frames` / `motion_render`：`motion_render` 会要求平台审批，账本是前置条件；
showcase 只用于演示，不伪造 `APPROVALS.json`。计时明细见 [timings.json](timings.json)，为 2026-10-25
旧命令的基线；0.9.0 的路径/审批变化见 [ARCHITECTURE.md](../ARCHITECTURE.md)。
