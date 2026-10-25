# 展示片（3 个类别）

每支都用真实场景代码渲染，记录**出帧**与**渲染**耗时。风格全部来自 `styles/`（改编自 Lemo-Opuscar）。

| 类别 | 短片 | 风格 | 帧检查（3 帧） | 渲染 | 成片 | 体积 |
|---|---|---|---|---|---|---|
| 公式 | [swiss-euler](swiss-euler) | `swiss-motion` | 2.4 s | 2.8 s | 6.2 s · 1080p30 | 0.1 MB |
| 数据 | [dataviz-secant](dataviz-secant) | `dataviz` | 2.5 s | 3.1 s | 10.1 s · 1080p30 | 0.2 MB |
| 几何 | [blueprint-pythagoras](blueprint-pythagoras) | `blueprint` | 4.3 s | 5.0 s | 6.9 s · 1080p30 | 0.5 MB |

耗时是同一台机器、同一次运行的墙钟时间；机器负载不同会有波动。出帧用 `manimgx inspect -t ...`，不编码视频；渲染用 `manimgx render -r 1920x1080 --fps 30 --crf 20`。

## 1. 公式 · 欧拉公式

`e^{iπ}+1=0`。瑞士网格 + 一个红色信号色；全片只让 `0` 落在信号色上。

- 场景：[scene.py](swiss-euler/scene.py)
- 预览：[preview.jpg](swiss-euler/preview.jpg)
- 成片：[swiss-euler.mp4](swiss-euler/swiss-euler.mp4)

## 2. 数据 · 割线变切线

`f(x)=x²/2` 上 `P(2,2)` 固定，`Q(q,f(q))` 从 `q=3` 滑到 `q=2`；割线斜率读数从 `2.50` 落到 `2.00`，最后切线出现。

- 场景：[scene.py](dataviz-secant/scene.py)
- 预览：[preview.jpg](dataviz-secant/preview.jpg)
- 成片：[dataviz-secant.mp4](dataviz-secant/dataviz-secant.mp4)

## 3. 几何 · 3-4-5 直角三角形

按制图顺序画：轮廓 → 直角标记 → 尺寸线 → 公式 → 红色 Q.E.D. 印章。

- 场景：[scene.py](blueprint-pythagoras/scene.py)
- 预览：[preview.jpg](blueprint-pythagoras/preview.jpg)
- 成片：[blueprint-pythagoras.mp4](blueprint-pythagoras/blueprint-pythagoras.mp4)

## 复现

```bash
V=~/.dsh/data/dsh-motion/venv/bin/manimgx

# 1) 先出帧，看版式
$V inspect showcase/swiss-euler/scene.py -t 1,3,end

# 2) 再渲染
$V render showcase/swiss-euler/scene.py -r 1920x1080 --fps 30 --crf 20 \
  -o showcase/swiss-euler/swiss-euler.mp4
```

或在 Harness 里用 `motion_frames` / `motion_render`（参数相同）。

计时明细见 [timings.json](timings.json)。
