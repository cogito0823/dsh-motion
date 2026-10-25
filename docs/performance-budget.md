# 迭代预算（P0）

依据：30.02 s 成片、882.1 s 端到端的一次真实诊断。

| 指标 | 那次 | 目标 |
|---|---|---|
| 首帧 | 261 s | **≤60 s** |
| 端到端 | 882 s | **≤400 s** |
| 模型时间 | 740.6 s（84%） | 不单独设目标，随步数/token 降 |
| 输出 tokens | 126,839 | **≤30k** |
| 上下文峰值 | 222k / 256k | **≤100k** |
| 读图 | 32 张 1080p | **≤10 张 sheet/局部** |
| 全文件重写 | 2 次 | **0 次**（例外见下） |
| `motion_probe` / `motion_render` | 3 / 4 次 | **1 / 2 次** |

## P0 四条

### 1. 先构图，后动画

- 先写“最小场景”：只放 6–8 个关键构图，不写完整动画；
- `motion_frames` 出 sheet，确认构图与版式；
- **60 s 内看不到第一帧就停下来**，检查是不是在盲写；
- 构图确认后才补时间轴、运动、转场。

### 2. 只做局部 edit

- 默认用 `edit`，不整文件重写；
- 只有改动超过文件 50%，或文件 <40 行时，才允许重写；
- 重写必须在回复里说明原因，不能“顺手重写”。

### 3. 图片预算

- 每次迭代只看 **1 张 contact sheet**，宽度约 960 px；
- 只有可疑格才读全分辨率；
- 同一张图不重复读；改了场景才重新出图；
- 目标：整个任务 ≤10 次读图。

### 4. 上下文预算

- 只保留当前场景版本，旧版本用一两句话摘要；
- 不把旧代码、旧图、已经确认过的长文重复贴回上下文；
- 目标峰值 ≤100k；接近 100k 时先摘要再继续。

## P1（工具）

已完成：

- [x] 格式契约：`apply_config()` 只设背景色，不再覆盖分辨率/帧率；`motion_render` 的 `width/height/fps` 与 CLI 的 `-r/--fps` 生效；
- [x] CFR：post 强制 CFR；所有成片按 `nb_read_frames` 对比期望帧数，少帧时用 `tpad + CFR` 补齐并复验；
- [x] storyboard 顶部 caption 条加提示，避免误判“裁切”。

明确不做：

- CJK 字符级 `ReplacementTransform` / `Transform` 的字形变形。manimgx 核心按点插值，汉字轮廓点数与顺序不一致，修起来是字形级工程；本仓库按“不支持”处理。
  - 中文标题/标签：`Write`、`FadeIn/Out`、`Indicate`、改颜色；
  - 换词：`FadeOut(old)` + `FadeIn(new)`，或按词/行 stagger；
  - 公式：`TransformMatchingTex`；中文注释放在 `Text`，不混进 MathTex。

待做：

- [ ] `motion_probe` 只在最终成片跑一次；
- [ ] `--draft` 低分辨率/低帧率、分段渲染、`manimgx preview` 包装、animatic。

## 怎么量

每个项目记录：

```text
first_frame_s, total_s, model_s, tool_s, render_s,
output_tokens, context_peak, image_reads, full_rewrites, probes, renders
```

复测时用同一台机器、同一支 30 s 片，先对比“首帧”和“输出 tokens”，再看总时长。
