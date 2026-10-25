# 维护手册

面向维护者：怎么在「本地 checkout」和「npm 发布版」之间切换插件，以及切换前后怎么自证。
普通使用者不需要读这一页。

## 0. 先记住三条事实

1. **`desktop` profile 由桌面 App 独占。** 命令行 `dsh plugin --profile desktop …` 会被直接拒绝：

   ```
   error: profile "desktop" is managed exclusively by the Electron application
   ```

   所以插件的安装/卸载只能走 **App 里的插件管理器**（或它内部用的同一套 pnpm，见 §4）。

2. **唯一真相是 profile 清单里那一个字段**：

   ```
   ~/.dsh/profiles/desktop/package.json  →  dependencies["dsh-motion"]
   ```

   - `"link:/Users/…/dsh-motion"` → 跑的是工作区代码
   - `"0.6.0"`（semver）→ 跑的是 npm 包

   因为只有一个依赖字段，**同一时刻物理上只可能装一份**，不会出现两个 `motion_*` 抢注册。

3. **服务端插件没有热更新**，换完必须重启 Harness（App 内 `⌘⇧R`）。

## 1. 切到本地 checkout

1. 打开 Harness 的**插件管理器**。
2. 找到 `dsh-motion` → **卸载 / Remove**。
   （管理器不允许直接换版本：必须先移除再装。）
3. **安装 / Install** → 目标填绝对目录：`/Users/cogito/Documents/dsh/dsh-motion`
4. 按提示 `⌘⇧R` 重启。
5. 见 §3 验证。

装完 `package.json` 里应变成 `link:/Users/cogito/Documents/dsh/dsh-motion`，`node_modules/dsh-motion` 变成符号链接。

## 2. 切回 npm 发布版

同样两步，第 3 步把目标换成版本号：

```
dsh-motion@0.6.0
```

装完 spec 变回 semver，`node_modules/dsh-motion` 是真实目录。

## 3. 验证（三条命令 + 一个工具）

```bash
# 期望：link:/Users/cogito/Documents/dsh/dsh-motion  或  0.6.0
node -p "require(process.env.HOME+'/.dsh/profiles/desktop/package.json').dependencies['dsh-motion']"

# 期望：带 -> 箭头 = 本地；真实目录 = npm
ls -ld ~/.dsh/profiles/desktop/node_modules/dsh-motion

# 期望：最后一条 registered 5 tools 是刚才重启的时间
tail -2 ~/.dsh/logs/motion.log
```

以及在 Harness 里跑一次 `motion_doctor`，**第一行「插件来源」**是最终裁决：

```
0.6.0 · 本地 checkout · /Users/cogito/Documents/dsh/dsh-motion/lib
0.6.0 · npm 安装     · /Users/cogito/.dsh/profiles/desktop/node_modules/dsh-motion/lib
```

（Node 会把符号链接解析成真实路径，所以 link 安装显示的是仓库路径。）

## 3.5 日常开发（不用反复重启）

- 只改 `lib/ops.js` / `lib/doctor.js`：下一次工具调用按 mtime 热加载，不用重启；
- 改 `styles/*`、`showcase/*`、`tokens.json`：运行时读取，不用重启；
- 改工具名 / 描述 / 参数 schema（`lib/index.js`）：需要 `⌘⇧R`；
- 完全绕开 Harness：`node scripts/dev.mjs frames|render|probe|doctor ...`；
- 细节与限制见 [docs/dev-loop.md](docs/dev-loop.md)。

## 3.6 开发时绕过确认门

`motion_render` 默认要求 `APPROVALS.json`。维护者本地调试可临时：

```bash
DSH_MOTION_ALLOW_UNCONFIRMED=1
```

或在插件配置里 `allowUnconfirmed: true`。**不要**把它写进用户默认配置。

## 4. 兜底：插件管理器不收目录时

用 App 自带的那份 pnpm 直接改依赖，效果与 GUI 完全一致（App 内部也是这么装的）：

```bash
P="/Applications/DeepSeek Harness.app/Contents/Resources/runtime/primary-runtime/dependencies/pnpm/bin/pnpm.cjs"

# 切本地
node "$P" --dir ~/.dsh/profiles/desktop add "link:/Users/cogito/Documents/dsh/dsh-motion"

# 切回 npm
node "$P" --dir ~/.dsh/profiles/desktop add "dsh-motion@0.6.0"
```

本机全局也装了同版本 `pnpm 11.28.5`（在 PATH 里），所以 `pnpm --dir …` 同样可用。
App 升级后如果路径变了，`ls "/Applications/DeepSeek Harness.app/Contents/Resources/runtime/"*/dependencies/pnpm/bin/pnpm.cjs` 找一下。

## 5. 不要做的事

| 禁忌 | 原因 |
|---|---|
| `dsh plugin --profile desktop …` | App 独占该 profile，命令会被拒绝 |
| 用 `~/.dsh/cordis.patch.yml` 改 `name` 指向本地 | patch 的 `name` 是**断言**不是改名；真要绕必须 `disabled` 原条目 + insert 新 id，会变成两条 entry，最容易双挂载 |
| 另建一个 profile 跑同一插件 | 两套插件清单会漂移，测出来的结论不可信 |
| 长期用 tarball 安装 | pnpm 按 integrity 缓存，同名重打包会装到旧包 |
| 在 link 状态下用 GUI「升级」dsh-motion | 会把 `link:` 覆盖回 semver，你还以为在测本地 |

## 6. 版本对齐

- App 版本：`node -p "require('/Applications/DeepSeek Harness.app/Contents/Resources/runtime/primary-runtime/runtime.json').desktopVersion"`
- 全局 CLI **已卸载**（见提交记录）；如果哪天要装回来，必须装与 App 完全相同的版本，否则会出现「旧 CLI 改新 profile」的错位。
- 全局 pnpm 应与 App 自带的一致（当前 `11.28.5`）。

## 7. 发版

```bash
npm version patch|minor     # 会打 git tag
git push --follow-tags      # tag 触发 .github/workflows/release.yml
```

- `prepack` 会跑 `check` + `test` + `smoke`；
- Trusted Publishing 需要 npm ≥ 11.5.1（工作流里已自动升级）；
- 刚发布的版本要等 1–2 分钟才能在 `npm view` 里查到，这是正常现象。

## 8. 症状对照表

| 症状 | 含义 | 处理 |
|---|---|---|
| `motion_doctor` 显示「npm 安装」 | 还跑在旧版上 | 重做 §1，确认重启 |
| 插件管理器提示「已安装」 | 需要先移除 | 先卸载再装 |
| 安装后工具全消失 | 安装失败或启动报错 | 看 `~/.dsh/logs/motion.log` 与 App 的日志 |
| `dsh: command not found` | 全局 CLI 已按计划删除 | 正常，用 GUI 或 §4 的 pnpm |
| GUI 里看不到「安装本地目录」 | 版本差异 | 用 §4 兜底 |
