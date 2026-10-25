# 确认门清单

在写完整场景、出全片之前，逐项确认。每一轮只推进一项；用户改了哪项，就回到哪项重确认。

## 0. 选模式

| 模式 | 适用 | 阶段 |
|---|---|---|
| `light` | ≤15 s、无旁白、一个结论 | 需求 → 脚本+分镜 → 视觉 → 开工 |
| `standard` | 15–60 s，或有旁白 | 需求 → 脚本 → 分镜 → 视觉 → 交付 → 开工 |
| `full` | >60 s、多段、复杂旁白 | 需求 → 脚本 → 分镜 → animatic → 视觉 → 交付 → 开工 |

`light` 把“脚本”和“分镜”合成一张表：每个镜头一行，写秒数、画面、上屏文字/公式。

## 1. 需求（硬门：固定七题，一次问完）

七个问题、固定题数、固定顺序：受众 → 风格 → 交付 → 时长 → 画幅 → 帧率 → 旁白。
题目来自 `node scripts/plan-questions.mjs "<brief>" --json`，一次全部交给 `ask_user_question`；
每题第一个选项是推断出的默认项（标“推荐”）。

全部七项必须落进 `APPROVALS.json` 的 `requirements.brief`，否则 `motion_frames` 拒绝出帧：

- [ ] 受众：`high` / `university` / `general` / `intro` / `pro` / `kids`
- [ ] 风格：registry 的 slug（或 `让你决定` → 默认 slug）
- [ ] 交付：`frames`（先出帧）/ `silent`（静音 mp4）/ `narrated`（旁白 + 字幕，进 HF）
- [ ] 时长：如 `30s`（默认按题材 + 交付容量推，不静默兜底）
- [ ] 画幅：像素一并定，如 `1920x1080` / `1080x1920` / `3840x2160`
- [ ] 帧率：`auto`（按交付推导）或 24 / 25 / 30 / 50 / 60；交付为 `frames` 时记 `N/A`
- [ ] 旁白：`zh-neutral` / `zh-warm` / `zh-strong` / `en-neutral` / `none`（`narrated` 时不能是 `none`）

答完必须回显一行：`高中 / 3b1b / 旁白+字幕 / 60s / 1920×1080 / 30fps / 中文·中性`，
再锁账。七题同时呈现，时长默认基于推断的受众给出；用户改了受众就要复核一次时长。

## 2. 脚本 / 文案

| # | 旁白（逐句） | 上屏文字 | 公式 | 备注 |
|---|---|---|---|---|
| 1 |  |  |  |  |

- 公式先过 `formula_check`；
- 旁白按“一句一个意思”拆，标出预计秒数；
- 没有旁白就只填上屏文字与公式。

## 3. 分镜

| # | 起止秒 | 画面 | 运动 | 字幕 / 旁白 | 验收点 |
|---|---|---|---|---|---|
| 1 | 0.0–2.0 |  |  |  |  |

- 镜头数按内容定，不为了凑时长加镜头；
- 每个镜头写清“观众看到什么变化”；
- 结论镜头要留够阅读时间（≥1.2 s）。

## 4. 视觉

- [ ] `DESIGN.md`：颜色、字体、禁用项、参考
- [ ] 3 张风格帧：开场 / 转折 / 结论（真实代码出帧，不渲染视频）
- [ ] 风格帧通过 `motion_frames` 的 layout 检查

## 5. 交付清单

- [ ] 尺寸 / fps / 时长（与 `requirements.brief` 一致）
- [ ] 文件：mp4 / `.srt` / 场景源码 / DESIGN.md / 分镜表
- [ ] 音频：无 / 旁白 / 音乐；响度目标
- [ ] 字幕：烧录 / 外挂 / 两者

## 6. 账本

```bash
node scripts/approvals.mjs init <project> --mode light
node scripts/approvals.mjs set <project> requirements approved \
  --duration 30s --aspect 1920x1080 --fps 30fps --delivery narrated \
  --style 3b1b --audience high --narration zh-neutral \
  --confirmation q_... --note "用户确认"
node scripts/approvals.mjs set <project> <stage> approved --note "用户确认"
node scripts/approvals.mjs check <project>
```

- `requirements` 必须带全七项（含 `--fps`；`narrated` 还要 `--narration`），格式不对直接报错；**改需求会把下游重置为 pending**；
- `check` 未全部 approved 时退出 1；不能跳过前置阶段；
- `start` 必须是用户明确授权。

## 7. 开工指令

只有用户**明确**说出下面这类话，才进入执行：

- “可以开始”
- “开始做”
- “按这个执行”
- “开工”

以下**不算**整体开工：

- 对某个选项说“好 / 可以 / 行”；
- 确认了脚本或分镜；
- 说“看着办”但没有明确授权执行。

不确定时问一句：“脚本、分镜、风格帧都确认了，现在开始执行吗？”
