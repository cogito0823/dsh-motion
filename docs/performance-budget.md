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

- [x] 环境预检合并为一次 `motion_doctor`：字体 + 公式转换 + API 签名进同一个 Python 进程，整份报告按指纹缓存 12 h（冷 0.5 s / 热 4 ms）。旧流程是 4–5 条独立 bash，光模型往返就 40–60 s；
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

## 基线：0.4.3（预检合并后）

2026-10-25，`projects/differential-30s`（30 s / 1920×1080 / 30 fps），M3 Max，Harness 内实测：

| 动作 | 调用 | 耗时 | 备注 |
|---|---:|---:|---|
| `motion_doctor`（冷） | 1 | 292 ms | 13 项运行时 + 字体 + 3 条公式 + 5 个 API 签名 |
| `motion_doctor`（复跑） | 1 | 1 ms | `cached.hit: true`，age 14.4 s |
| `motion_frames`（3 帧） | 1 | 1.4 s | `no problems in 3 samples` |
| 读图 | 1 | — | 1 张 sheet |
| **预检 → 第一帧** | **3** | **≈12 s** | 含复跑验证共 4 次、≈14 s |

对照：同一项目的旧流程是 6 次工具调用（字体/模块 → 公式 → 冒烟渲染 → 读图 → API inspect → 读源码），Harness 计时 **1m57s**。差距在模型往返，不在子进程——预检本身只有 0.3 s。

两条口径：

- 缓存按运行时分文件：Harness 用 Node 24、开发 CLI 用 Node 26，指纹不同，所以各自冷启一次。跨运行时复用要去掉指纹里的 node 版本，但那样升级 Node 后的行为不可预期，暂不做；
- 292 ms 里约 0.2 s 是 `import manimgx`，与场景复杂度无关。

## 怎么量

每个项目记录：

```text
first_frame_s, total_s, model_s, tool_s, render_s,
output_tokens, context_peak, image_reads, full_rewrites, probes, renders,
preflight_calls（目标 1）
```

复测时用同一台机器、同一支 30 s 片，先对比“首帧”和“输出 tokens”，再看总时长。
