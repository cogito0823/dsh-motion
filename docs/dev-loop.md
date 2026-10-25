# 开发调试：不重启插件

## 先分清哪些改动需要重启

| 改动 | 是否需要重启 Harness | 原因 |
|---|---|---|
| `styles/*`（STYLE / tokens / theme / preview） | **不需要** | 场景运行时才读 Python/JSON |
| `showcase/*` 场景 | **不需要** | manimgx 每次执行都重新加载 |
| `lib/ops.js`、`lib/doctor.js`、`lib/setup.js` | **不需要**（本仓库已做 mtime 热加载） | 工具每次调用按 mtime 重新 import |
| `lib/skills.js`、`skills/*` | 需要 | provider 在 `apply()` 时注册；skill 正文在 `get` 时读盘，改正文不需要重启 |
| `lib/project.js`、`lib/metrics.js` | 需要 | `ops.js` / `approvals.js` / `metrics.js` 静态 import，节点内缓存 |
| `lib/timeline.js` | 不需要（`timeline-check` 独立进程） | 每次新进程 |
| `scripts/timeline-check` / `scaffold` / `run-report` / `projects` | **不需要** | 独立 Node 进程，直接读项目文件 |
| 工具名 / 描述 / 参数 schema（`lib/index.js`） | 需要 | 注册发生在 `apply()` 启动时 |
| `lib/fresh.js`、`lib/env.js` | 需要 | 前者是加载器本身，后者被静态 import 缓存 |
| 安装方式变化（link ↔ npm） | 需要，且要重装 | profile 清单只有一个依赖字段 |

所以"改代码就要重装"是误判：**link 安装一次之后不用再重装**；只有改工具 schema 才需要 `⌘⇧R`。

## 方案 1：mtime 热加载（已内置）

`lib/fresh.js` 按文件 mtime 重新 import：

```js
const mtime = statSync(new URL(href)).mtimeMs
if (hit && hit.mtime === mtime) return hit.module
return import(`${href}?t=${mtime}`)
```

`lib/index.js` 里所有工具实现都走 `importFresh()`：

- 改 `ops.js` 的函数体 → 下一次 `motion_frames` / `motion_render` 调用就生效；
- 改 `doctor.js` → 下一次 `motion_doctor` 生效；
- 没有变化时命中缓存，额外开销是一次 `statSync`。

一次性的代价：这个机制本身要重启一次才能加载；之后改实现不用再重启。

## 方案 2：不走 Harness 的 dev CLI

```bash
node scripts/dev.mjs frames showcase/swiss-euler/scene.py 1,3,end
node scripts/dev.mjs render --explore showcase/swiss-euler/scene.py --fps 30
node scripts/dev.mjs probe out.mp4
node scripts/dev.mjs doctor
node scripts/dev.mjs setup          # 建/修 venv
node scripts/dev.mjs setup --tts    # 追加 edge-tts
```

它直接 import `lib/ops.js`，不经过插件注册，适合调参数、量耗时、跑回归。默认输出到 `out/`（已 git 忽略），不会弄脏场景目录；`showcase/` 里是提交的展示片，测试片不要放那里。

## 方案 3：把变化关在数据里

- 风格：只改 `tokens.json` / `STYLE.md`，场景 import theme，本来就不用重启；
- 场景：改 `.py` 直接重跑 `manimgx`；
- 交付：HF 的 `snapshot` / `check` 也不依赖本插件。

## 不要做的事

- 每次改代码都卸载/重装插件：link 安装不需要；
- 在 `lib/index.js` 里写实现：它一改就要重启；实现放 `ops.js` / `doctor.js`；
- 改 `env.js` 后指望热加载：它是静态 import，仍要重启。
