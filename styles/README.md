# 风格库

可复用的视觉语言。当前默认是 `dark-editorial`。

| 风格 | 适合 | 版本 | 入口 |
|---|---|---|---|
| `dark-editorial` / 暗场编辑 | 数学、数据、概念解释 | 1.0.0 | [README](dark-editorial/README.md) · [规范](dark-editorial/STYLE.md) |

新增风格时，在本目录建 `<name>/`，至少包含：

- `STYLE.md`：定位、tokens、版面、运动、声音、检查清单；
- `tokens.json`：颜色、字体、运动、音频的可复用数值；
- `theme.py`：读取 tokens 的最小工具；
- `preview.jpg`：参考帧。

然后在根 `DESIGN.md` 里决定它是否成为项目默认。
