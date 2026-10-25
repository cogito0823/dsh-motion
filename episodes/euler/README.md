# 欧拉公式 · 10 秒

单位圆上的半圈旋转：从 `1` 出发，逆时针转过 `π`，落在 `−1`，收束成
`e^{iπ} + 1 = 0`。

## 成品

- `euler.mp4` — 10.000 s，1920×1080，60 fps，H.264 / AAC，约 3.7 MB（体积大，不随仓库分发）
- `poster.jpg` — 9.6 s 处的封面帧
- 无旁白、无字幕；原创环境音，Integrated ≈ −16 LUFS，True Peak ≈ −6.7 dBFS

## 重建

```bash
V=/Users/cogito/.dsh/data/dsh-motion/venv
$V/bin/manimgx inspect scene.py -t 2,6.4,9   # 版式自检
$V/bin/manimgx render scene.py -r 1920x1080 --fps 60 --crf 20 -o euler-base.mp4
$V/bin/python make_audio.py
ffmpeg -i euler-base.mp4 -i euler-audio.wav \
  -map 0:v -map 1:a -c:v copy -c:a aac -b:a 192k \
  -frames:v 600 -movflags +faststart euler.mp4
```

`motion_render` 的 `post` 参数用于颗粒与暗角；本片使用 `grain=4, vignette=5`。

## 版式与公式

- 设计规范见 `DESIGN.md`，分镜见 `storyboard.md`。
- `exp(I*pi) + 1 = 0` 与 `exp(I*theta) = cos(theta) + I*sin(theta)` 均通过 SymPy 恒等检查。
- 全片只有三处文字层级：标题、公式、一行注解。
