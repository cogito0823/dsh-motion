# 固定命令表

> 这些命令模板就是“别读脚本源码”的替代品。路径默认从**包根**执行；
> 在 Harness 里包根是 `~/.dsh/profiles/<profile>/node_modules/dsh-motion`，
> 也可以先 `cd` 到仓库 checkout。项目路径用绝对路径最稳。

## 0. 新项目脚手架

```bash
# 默认建到 ~/dsh-motion-projects/<slug>；也可显式传 dest
node scripts/scaffold.mjs --title "片名" --duration 30
node scripts/scaffold.mjs ~/dsh-motion-projects/foo --title "片名" --duration 30

# 老项目补 manifest（不移动文件）
node scripts/project-adopt.mjs <project>

# 生成 motion.project.json / scene.py / timeline.py / timeline.json /
# narration.json / assemble.py / DESIGN.md
# timeline.py 的 TimedScene.cue() 会在运行时打印 [late]
```

## 0.5 环境

```bash
# 建/修 venv（缺什么补什么；--force 重建；--tts 装 edge-tts）
node scripts/setup.mjs
node scripts/setup.mjs --tts
node scripts/setup.mjs --force

# 预检（冷/热；MOTION_PREFLIGHT=force 强制重测）
node scripts/dev.mjs doctor
MOTION_PREFLIGHT=force node scripts/dev.mjs doctor
```

Harness 内优先调用工具 `motion_setup` / `motion_doctor`，不要用 bash 跑 `python3 -m venv`：
venv 在 `~/.dsh` 下，模型 bash 的 workspace-write 沙箱会拒绝写。

## 0.7 时间轴自检（定稿前必跑）

```bash
node scripts/timeline-check.mjs <project> --strict
node scripts/timeline-check.mjs <project> --json
```

- error：cue 重复/乱序/越界、cue 结束超出片长；
- warn：旁白晚于画面 >0.35s、旁白压到下一拍、timing 与片长不一致；
- `--strict` 时 warn 也退出 1；不过不许进 `motion_render`。

## 1. 需求与确认门

```bash
# 生成问题（JSON；交给 ask_user_question）
node scripts/plan-questions.mjs "<brief>" --json

# 初始化账本
node scripts/approvals.mjs init <project> --mode light|standard|full

# 需求必须落 时长/画幅/交付，否则 motion_frames 拒绝出帧
node scripts/approvals.mjs set <project> requirements approved \
  --duration 30s --aspect 1920x1080 --delivery silent \
  --confirmation q_... --note "用户确认"   # delivery 三选一：frames / silent / narrated

# 其余阶段
node scripts/approvals.mjs set <project> script_storyboard approved --note "用户确认"
node scripts/approvals.mjs set <project> script approved --note "用户确认"
node scripts/approvals.mjs set <project> storyboard approved --note "用户确认"
node scripts/approvals.mjs set <project> visual approved --note "用户确认"
node scripts/approvals.mjs set <project> delivery approved --note "用户确认"
node scripts/approvals.mjs set <project> start approved --confirmation q_... --note "用户明确说可以开始"

# 查状态（未全部 approved 时退出 1）
node scripts/approvals.mjs check <project>
```

`start` 只能由用户明确说“开始 / 开工 / 按这个执行”后置为 approved。`requirements` / `start` 必须带 `--confirmation <ask_user_question id>`；brief 哈希自动生成。

## 2. 出帧与渲染

```bash
# 命令行（Harness 内用 motion_frames / motion_render 工具）
node scripts/dev.mjs frames <scene.py> 0.5,2.0,end
node scripts/dev.mjs render <scene.py> --fps 30 --out out/clip.mp4
node scripts/dev.mjs probe <video.mp4>
```

## 3. 旁白与混音

```bash
# 生成旁白 + 词级时间（项目里需要 narration.json；provider=edge 免费）
# 默认按文本/音色/语速缓存，多句并发 3；--force 强制重生成
node scripts/narrate.mjs <project> --provider edge --voice zh-CN-XiaoxiaoNeural --rate +0%
node scripts/narrate.mjs <project> --concurrency 4
node scripts/narrate.mjs <project> --provider say --voice Tingting --rate 230   # macOS 离线兜底

# 混音：默认输出 <project>/audio/master.wav；可铺音乐、压进视频
node scripts/mix.mjs <project> --music assets/bed.wav --mux out/clip.mp4 --mux-out out/clip-narrated.mp4
node scripts/mix.mjs <project> --report-gaps          # 每个旁白间隙的 mix/voice dB
node scripts/mix.mjs <project> --gap-min-db -38 --json
```

- `narrate` 需要带 `edge-tts` 的 Python；先 `node scripts/setup.mjs --tts`，或 `--python <path>`。
- `mix` 需要带 `numpy` 的 Python；默认会找 `.venv-tts` 或系统 Python。
- 字幕不烧进 Manim：放到 composition 层，或按 `make_captions.py` 的既有项目模式处理。

## 3.5 交付归一与度量

```bash
# raw 是 VFR 时，先归一成 CFR；raw 不要直接进剪辑软件
python assemble.py --raw out/raw.mp4 --out out/final.mp4 --fps 30 --audio audio/master.wav

# 运行账本（<project>/.dsh-motion/metrics.jsonl）
node scripts/run-report.mjs <project>
node scripts/run-report.mjs <project> --wall 752   # active / 端到端
```

`motion_probe` 的 `vfr:true` / `cfr:false` 是归一前的信号；`run-report` 的 `activeSec`
是工具/脚本实际占用时间，`--wall` 是整段端到端，不要把两者的百分比混用。

## 4. 风格路由

```bash
node scripts/route-style.mjs "<题材>" --json
```

`confidence: high` 才直接写 `DESIGN.md`；`medium/low` 给用户 top 2–3 确认。
