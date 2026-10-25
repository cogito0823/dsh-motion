# 导数 · 10 秒

`f(x) = x²/2` 上的一个定点 `P(1, 1/2)`，另一个点 `Q` 沿曲线滑向它。
割线随之抬起，最终与切线重合：`f'(1) = 1`。

## 成品

- `derivative.mp4` — 10.000 s，1920×1080，60 fps，H.264 / AAC，约 4.3 MB（体积大，不随仓库分发）
- `poster.jpg` — 9.2 s 处的封面帧
- 无旁白、无字幕；原创环境音，Integrated = −16.0 LUFS，True Peak = −7.0 dBFS

## 重建

```bash
V=/Users/cogito/.dsh/data/dsh-motion/venv
$V/bin/manimgx inspect scene.py -t 2.6,6.3,9.0,end   # 版式自检
$V/bin/manimgx render scene.py -r 1920x1080 --fps 60 -crf 20 -o derivative-silent.mp4
$V/bin/python make_audio.py
ffmpeg -i derivative-silent.mp4 -i derivative-audio.wav \
  -vf "vignette=PI/5,noise=alls=4:allf=t,fps=60" \
  -c:v libx264 -crf 19 -pix_fmt yuv420p \
  -c:a aac -b:a 192k -t 10.0 -movflags +faststart derivative.mp4
```

`motion_render` 的 `post` 参数等价于这里的 `vignette=5` 与 `grain=4`；单独走 ffmpeg
是为了同时补上 `fps=60`（见下）。

## 一个必须知道的坑

manimgx 会把完全静止的帧合并成一个长帧，所以直接渲染出来的是可变帧率文件
（本片 10 s 只有 538 帧，最后一秒的 `wait` 被压成一帧）。用它再 `-c:v copy` 混流，
成片仍是 VFR。上面的命令在滤镜链里加 `fps=60`，把静止段补回 60 fps，
并用 `-t 10.0` 收到整 10 秒——最终 600 帧、CFR。

## 版式与公式

- 设计规范见 `DESIGN.md`，分镜见 `storyboard.md`。
- 坐标系原点 `(-3.90, -2.30)`，比例 `1.30`；绘图窗口 `x ∈ [-2.04, 2.30]`、`y ∈ [0, 2.75]`。
  割线与切线都裁切在窗口内，窗口右边界与曲线右端对齐。
- `diff(x**2/2, x) = x`、`diff(x**2/2, x).subs(x, 1) = 1`、
  `(f(1) − f(q)) / (1 − q) = (1 + q)/2` 均通过 SymPy 恒等检查。
- 割线斜率用化简式 `(1 + q)/2` 计算，`q = 1` 时不会除零，落点就是切线。
- 全片只有三处文字层级：标题、定义、结果。
