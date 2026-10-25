# {{TITLE}}

{{DURATION}}s 项目骨架。项目根由 `motion.project.json` 标识；不要删除/移动它，也不要把别的项目放进这个目录。
下面的 `scripts/...` 在 **dsh-motion 包根**；在项目目录内执行时，把 `PKG` 指向包根：

```bash
PKG=/path/to/dsh-motion   # 或 ~/.dsh/profiles/<profile>/node_modules/dsh-motion

# 1) 时间轴自检（定稿前必跑）
node "$PKG/scripts/timeline-check.mjs" . --strict

# 2) 需求账本（没有 APPROVALS.json 时 motion_frames 不拦，但正式项目建议开）
node "$PKG/scripts/approvals.mjs" init . --mode light
node "$PKG/scripts/approvals.mjs" set . requirements approved \
  --duration {{DURATION}}s --aspect 1920x1080 --delivery silent \
  --confirmation q_... --note "用户确认"

# 3) 出帧
#    Harness 内用 motion_frames；命令行：
node "$PKG/scripts/dev.mjs" frames scene.py 0.2,3.0,7.0,end

# 4) 旁白（可选）
node "$PKG/scripts/narrate.mjs" . --provider edge
node "$PKG/scripts/mix.mjs" . --mux out/raw.mp4 --mux-out out/final.mp4 --report-gaps

# 5) raw → CFR 成片
python assemble.py --raw out/raw.mp4 --out out/final.mp4 --fps 30

# 6) 账本：active / wall 分开看
node "$PKG/scripts/run-report.mjs" . --wall 300
```

- `timeline.py` 的 `TimedScene.cue()` 会在运行时打印 `[late]`；最终渲染可设 `strict_late = True`。
- `timeline.json` 是 cue 契约；改时间先改它，再改场景。
- `assemble.py` 只负责把 raw 归一到 CFR；raw 不要直接给剪辑软件。
