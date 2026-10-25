# AI 原生动效：风格、HyperFrames 与极简模式

调研时间 2026-10-25。结论先行：

1. **风格不是形容词，是外部输入。** 通行做法是给 agent 一份可引用的 truth（`frame.md` / `DESIGN.md` / 参考片），把它写成规范，再用**真实代码出的风格帧**验收；不是让模型"感觉一下"。
2. **风格库是常见基础设施。** HyperFrames 有 catalog（约 450 个 block/component）和 `frame.md` 模板；[Lemo-Opuscar](https://github.com/lemomo-ai/lemo-opuscar) 有 59 个纯代码影片风格，每个是一份 `STYLE.md`（style prompt）+ 一支 demo。
3. **极简模式 = 先出帧。** 在写场景的阶段直接渲染关键帧（不编码视频、不进 Chrome/HF），看过再继续；视频只在定稿后生成。

## 1. 通行做法：风格怎么确定

### 1.1 先给 truth，再谈风格

HyperFrames 的 [design systems 文档](https://hyperframes.heygen.com/prompting/design-systems) 说得很直接：让 agent "make it on-brand" 是最模糊的指令，agent 只能自己发明一个 brand。修法永远是给一份 **source of brand truth**：design spec、线上站点或 Figma 文件。

`frame.md` 的 frontmatter 是"机器可读的品牌"：精确 hex、字体家族、字重关系；正文写 intent 与 Do/Don't。文档给了一个可复用的边界：

- **严格**：品牌色、字体、字重关系、底色；
- **为视频放大**：字号、装饰透明度、描边宽度；
- **交给 agent 编排**：版面、间距、运动。

原话是 "Pin the palette and typography. Delegate the frame."——这也解释了为什么我们的 `STYLE.md` 把版面坐标写死、却允许分集覆盖局部：**token 是契约，构图是创作**。

### 1.2 风格帧先于视频

Lemo-Opuscar 的 [DIRECTOR.md](https://github.com/lemomo-ai/lemo-opuscar/blob/main/DIRECTOR.md) 把这一步叫 **"Prove the look"**：

- 有角色：一张 model sheet + 两张风格帧；
- 无角色：三张风格帧，其中一张是 signature shot；
- 必须用**真实绘制代码**渲染，不是 mock-up；先对照 `STYLE.md` 自检，再往下走；
- 分镜（6–9 张关键镜头拼一张 sheet）**只在用户要求时**才做，做完等确认。

这与"渲染完再抽帧检查"是两件事：前者在写代码的循环里，成本是秒级；后者在成片之后，成本是分钟级。

### 1.3 风格库的两种形态

| 形态 | 例子 | 作用 |
|---|---|---|
| 组件/区块库 | HF catalog（约 450 个 block / component） | 不手搓转场、字幕条、图表、3D 相机 |
| 风格库 | Lemo 59 个 `STYLE.md` | 定语气、材质、颜色逻辑、运动语法 |

Lemo 的每个风格文件是一份 **style prompt**：定位与"不是什么"、材料与渲染、颜色逻辑、字体与字幕、运动质量、相机语法、声音、native moves、媒介陷阱、引擎、变化空间。它不写具体故事——故事是用户的。这和本仓库 `STYLE.md` 的结构同源。

### 1.4 都建立在确定性上

HF 的卖点是 "same input, same frames, same output"：HTML + 可 seek 的动画，headless Chrome 逐帧截，FFmpeg 编码。Lemo 同样要求 `render(t)` 是纯函数：没有 `Date.now()`、没有未播种随机、任意帧可单独渲染。**风格可复现的前提是画面可复现。**

## 2. 要不要用 Lemo 这类风格库

用它的**方法**，不必用它的**素材**：

- Lemo-Opuscar 明确写着风格是为 Claude Opus 5.5 调的，别的模型不一定复现得好；代码 MIT、demo 与静帧 CC BY 4.0；
- 它的 59 个风格覆盖纸感、印刷、像素、3D、纪录片等，适合当"语言菜单"，不适合直接当品牌规范；
- 可借鉴的三件事：`STYLE.md` 作为 style prompt、三张风格帧验收、分镜只在被要求时做；
- 授权上，demo 静帧可商用但需署名 LemoLab；风格文件本身是 MIT。

本仓库的选择：删除自创的 `dark-editorial`，改为 4 套 Lemo 风格（`swiss-motion` / `dataviz` / `blueprint` / `whiteboard`）+ 1 套 Manim 社区的 `3b1b`，每套按 `STYLE.md` + `tokens.json` + `theme.py` + `preview.jpg` 落地；外部参考统一指向 HF。

### 3b1b 风格：社区里谁在用

3Blue1Brown 本人用的是 ManimGL，官方没有发布“风格规范”。社区里把它固化成 agent skill 的主要有三家：

| 项目 | 规模 | 提供什么 |
|---|---|---|
| [adithya-s-k/manim_skill](https://github.com/adithya-s-k/manim_skill) | 约 1.2k stars | ManimCE / ManimGL 两套 best-practice skill，含大量可运行示例；是这类 skill 里用得最多的 |
| [Yusuke710/manim-skill](https://github.com/Yusuke710/manim-skill) | 约 180 stars | 面向 agent 的 Manim 动画 skill |
| [subinium/3b1b-style-animation-skill](https://github.com/subinium/3b1b-style-animation-skill) | 约 7 stars | 唯一把 3b1b 配色写成明确 token 的 skill（`#1c1c1c` / 蓝 `#3b82f6` / 黄 `#fbbf24`） |

本仓库的 `3b1b` 取 subinium 的配色 + adithya 的方法论，按 manimgx 重写；不是 3Blue1Brown 官方项目。

## 3. 和 HyperFrames 怎么结合

HF 是"HTML → MP4"的合成/渲染层，不是绘制层；本插件是绘制层。

| 层 | 负责 | 产物 |
|---|---|---|
| manimgx / dsh-motion | 公式、坐标、几何、逐帧确定性画面 | PNG 帧 / MP4 clip |
| HyperFrames | 排版、字幕、旁白、混音、转场、编码 | 成片 MP4 / WebM / PNG sequence |
| 共享契约 | `DESIGN.md` / `frame.md` | 颜色、字体、禁用项、语气 |

接入方式（按成本从低到高）：

1. **只借规范**：HF 的 `frame.md` 与本仓库 `DESIGN.md` 互读；不装 HF 也能用同一套 token。
2. **借组件**：`npx hyperframes add <block>` 取现成图表、字幕、转场，不必重画。
3. **整片合成**：把 `motion_render` 的 clip 放进 HF composition，字幕走 composition 层，最后 `npx hyperframes render`。

```bash
npx hyperframes init my-video
npx hyperframes add data-chart
npx hyperframes check
npx hyperframes render -o out.mp4
```

HF **不需要先生成视频再截图**。它有三条不产出 mp4 的路径：

| 命令 | 产出 | 用途 |
|---|---|---|
| `npx hyperframes snapshot <project> --at 2.9,10.4,18.7` | 指定时刻的 PNG | 版式/关键帧检查，最接近"抽帧" |
| `npx hyperframes snapshot <project> --frames 10 --review` | 等间隔帧 + contact sheet + 转场接缝帧 | 通看全片 |
| `npx hyperframes render --format png-sequence` | 完整 RGBA 帧序列 | 需要每一帧时 |
| `npx hyperframes check` | 运行时/版式/对比度/运动的报告 | 不开视频的体检 |

`snapshot` 的说明原话是 "Capture specific frames as PNGs, without waiting for a full render"：它会 bundle 项目、起 headless Chrome、seek 到指定时刻截图，但不编码视频。`--zoom` 还能裁局部、`--against` 能和参考片逐帧对比。

所以结论是：**HF 可以抽帧，而且 snapshot 就是为这件事做的**；只有需要完整序列时才用 png-sequence。对本插件来说，`motion_frames`（manimgx inspect）仍然是更轻的一层，因为它连浏览器都不用起。

## 4. 极简模式：直接拿到帧

### 4.1 通用实现

manimgx 自带 `inspect`：只画请求的时刻，做版式检查，**不编码视频**。

```bash
manimgx inspect scene.py -t 1.2,4.5,end
```

- 输出一张（或多张）storyboard PNG，每格标注 `#play t=… file:line`；
- 同时报 layout 问题：压字、出画、字号过小、线/填充盖字；
- 有 layout 问题时退出码为 1，但报告仍然完整。

本仓库把它包成 `motion_frames`，返回结构化 JSON（`storyboard` 路径、`layoutProblems`、`durationSec`、`wallSec`），模型可以直接读图。实测 4 帧约 3–5 秒；同一支 10 秒 / 60fps 场景渲染约 6 秒。渲染成本随**时长**线性增长，看帧成本只跟**采样数**有关，长片差距才明显（对比 HF 合成则是分钟级）。

### 4.2 推荐循环

```
DESIGN.md
  → motion_frames（3–6 帧：开场 / 转折 / 结论）
  → 改场景 → 再出帧（秒级）
  → 需要给用户看分镜时：6–9 帧（真实代码）
  → formula_check
  → motion_render（定稿后）
  → 需要字幕/旁白/混音：进 HF
  → motion_probe / hyperframes check（只对成片）
```

### 4.3 为什么快

| 做法 | 成本 | 什么时候发现版式问题 |
|---|---|---|
| `motion_frames` | 2–6 秒（与时长无关） | 写场景时 |
| `motion_render` + `motion_probe` | 5 秒–1 分钟（随时长） | 渲染后 |
| HF `check` / `png-sequence` | 分钟级（起浏览器 + 跑 composition） | 合成后 |

关键不是"抽帧"本身，而是**把检查点前移**：帧是绘制的直接产物，视频只是帧的编码；在编码之前检查，就省掉了编码、起浏览器、解码抽帧这几次搬运，而且检查成本不再随时长膨胀。

### 4.4 建议的默认

- 默认工具链：`motion_frames`（不装 HF 也能跑）；
- 默认检查：看 storyboard PNG + `layoutProblems`，不看 `blankFrames`（还没有视频）；
- 默认不生成：mp4、HF 工程、视频抽帧 contact sheet；
- 需要交付时才升级到 `motion_render` / HF；
- 成片检查（`motion_probe`）只在已经有 mp4 时运行，不做"为了检查而渲染"。

## 5. 效率：大家怎么缩短时间

共识是**把检查点前移、把渲染延后**：

| 做法 | 出处 | 效果 |
|---|---|---|
| 先出静帧/contact sheet，不先出片 | Lemo `still.mjs` + `sheet.py`；HF `snapshot`；本仓库 `motion_frames` | 秒级看版式，省掉编码 |
| 指定时刻抽帧，而不是等整段 | HF `snapshot --at` / `--frames` / `--review` | 不渲染整条时间线 |
| 低分辨率 / draft 预览，定稿才 full | HF `--quality draft`、`--resolution`；Lemo 先 still | 迭代快、画质最后再提 |
| 并行渲染 | Lemo `video.mjs --workers 3`；HF GPU / Lambda / Cloud Run | 线性缩短编码时间 |
| 只重渲改动镜头 | 帧是 `render(t)` 纯函数，可单帧/单段重跑 | 不重做全片 |
| 独立 rubric 评审代替反复肉眼 | mg-styles-15 的 7 维 rubric、Lemo 的 review loop | 一轮改到点上 |
| 确定性 + 缓存 | HF `same input, same frames`；Lemo 无随机/无时钟 | 可回归、可并发 |

本仓库三个 demo 的实测（同一台机器）：

- 出 3 帧：**2.4–4.3 s**；渲染 6–10 秒成片：**2.8–5.0 s**；
- 关键不是"帧比视频快多少"，而是**看帧成本与片长无关**，且不经过编码、起浏览器、抽帧三次搬运；
- 如果已经在 HF 里，用 `hyperframes snapshot` 而不是"先 render 再 ffmpeg 截图"。

## 6. 开发调试

服务端插件没有 HMR，但也不需要每次重装：

- `link:` 安装一次即可；改 `lib/ops.js` / `lib/doctor.js` 由 mtime 热加载，下一次工具调用生效；
- 改 `styles/*`、场景、tokens 本来就不用重启；
- 只有工具名/描述/参数 schema 变化才 `⌘⇧R`；
- 可以完全绕开 Harness：`node scripts/dev.mjs frames|render|probe|doctor ...`。

细节见 [dev-loop.md](dev-loop.md)。

## 7. 需求卡点：先问，再猜

默认流程多了一个“卡点”，避免在没有信息时自己替用户决定：

```bash
node scripts/plan-questions.mjs "<brief>" --json
```

输出可直接交给 `ask_user_question`：

- **画幅**：按平台线索推断 2 个选项（抖音→9:16 / 16:9；B站→16:9 / 9:16；方图→1:1 / 16:9）；
- **交付**：先出帧 / 静音 mp4 / 旁白+字幕，顺序由 brief 里的“旁白/静音”决定；
- **风格**：`route-style` 的 top 3；点名风格时这道题直接省略；
- **时长/语言**：从 brief 提取，不单独问；未回答的写进 `assumptions`。

关键不是“问满四道题”，而是**能推断的不问、选项按上下文生成、问完一次就开做**。

## 8. 风格路由：目前怎么做，通用标准是什么

### 本仓库

没有隐藏的自动路由。风格在**写作阶段**确定，分三层：

1. `styles/registry.json`：机器可读的风格目录（slug、中文名、uses、keywords、avoid、画幅、复杂度）；
2. `node scripts/route-style.mjs "<题材>"`：显式打分——点名风格 12 分，`keywords` 命中每个 3 分，`uses` 每个 2 分，命中 `avoid` 扣 2 分；
3. `DESIGN.md` 头部 `style:` + `style_version:`：最终声明；场景代码从 `styles/<slug>/theme.py` 取 token。

判定规则：

- 点名（"用 3b1b"/"瑞士动态排版"）→ 直接命中，最高优先；
- 否则打分；`high` 直接写，`medium`/`low`/并列 → 给 top 2–3 让用户确认；
- 完全无命中 → 回退 `default`（`swiss-motion`），并说明是默认。

这样路由是**可复现的**：同样的题材和 registry 得到同样的推荐，不靠模型"感觉像"。

### 通用做法（没有 ISO 标准，但有事实标准）

| 做法 | 代表 | 要点 |
|---|---|---|
| 风格索引 + 元数据 | Lemo `styles/README.md` + `style.json`；HF catalog | 每个风格有稳定 slug、中英文名、分类、`uses`；索引由元数据生成，不手写 |
| 规范文件做声明 | HF `frame.md`；本仓库 `DESIGN.md` | frontmatter 定 hex/字体，正文定 Do/Don't；agent 先读再画 |
| 点名优先 + 推荐 2–3 个 | Lemo `AGENTS.md` | 用户没选时给最接近的 2–3 个，不静默换风格 |
| 打分 / 检索路由 | registry 关键词；HF `catalog --query` 语义检索 | 关键词/描述匹配，输出带理由与置信度 |
| 人类确认门 | 本仓库 `needsConfirmation` | 低置信度、并列、冲突时不自动拍板 |
| 版本与许可 | `style_version`、MIT/CC BY 标注 | 风格可升级、可追溯，不把 demo 当规范 |

没有"W3C 风格路由标准"这种东西；能算标准的是 **design tokens**（颜色/字体/间距的可交换格式）和 **DESIGN.md / frame.md** 这类声明文件。路由本身是产品约定，关键不是算法多复杂，而是**规则显式、结果可复现、低置信度会问人**。

### 对齐事实标准：对齐什么，不对齐什么

**对齐（接口层）**

- `style.json` 采用 Lemo 的字段：`slug` / `num` / `en` / `cn` / `category_en` / `category_cn` / `uses` / `line` / `demo`，再扩展 `keywords` / `avoid` / `aspect` / `fps` / `complexity`；
- `styles/README.md` 的表和 `styles/registry.json` 从 `style.json` 生成，不再手写（对应 Lemo 的 `styleboard/build.py`）；
- 选风格语义采用 Lemo `AGENTS.md` 的“点名优先 + 推荐 2–3 个 + 不静默换风格”，并加置信度门；
- 保留 `style_version` / `source` / `license`，保证可升级、可追溯。

**不对齐（实现层）**

- 不复制 Lemo 的 Canvas/WebGL demo 代码，也不改 manimgx 渲染链；
- 不采用 Lemo 的 24 fps、相机旅行、手写笔刷等实现细节，只取语法；
- 不把 `tokens.json` 强改成 W3C DTCG：目前没有外部 token 消费方，改了只会增加转换成本；将来要接 Figma/HF design tokens 时再加适配层；
- 不照搬 59 套风格，只接与数学/数据/科学相关的几套。

这样既能在元数据、索引、选择语义上和生态互操作，又不会把实现绑死在别人的 demo 上。

### 目前的局限

- 打分是关键词匹配，不理解语义；"导数"和"切线"可能一个命中 dataviz、一个命中 3b1b（已通过去掉 3b1b 的"导数"关键词缓解）；
- 没做向量检索或多语言同义词；
- registry 的 `keywords` 需要随新题材维护；
- 画幅/音频/复杂度字段目前只记录，还没参与硬约束（比如 9:16 未验证的风格应直接拒绝）。

## 9. 现成的风格体系（2026-10 可直接采用）

不必从零写风格文档。这个生态已经沉淀出几套公开、可复用的体系：

| 体系 | 规模 | 提供什么 | 适合拿什么 |
|---|---|---|---|
| [Lemo-Opuscar](https://github.com/lemomo-ai/lemo-opuscar) | 59 个库内风格 + OPUSCAR 98 的 98 个 | 每个风格 `style.json`（slug / 中英文名 / 分类 / uses / 时长）+ `STYLE.md`（11 节：定位、材料、颜色逻辑、字体、运动、相机、声音、native moves、陷阱、引擎、变化空间）+ demo 片 + `DIRECTOR.md` / `TECHNIQUE.md` + 改风格流程 | 整套 schema、风格索引、选风格与改风格的方法 |
| [mg-styles-15](https://github.com/Vincentwei1021/mg-styles-15) | 15 个 10 秒风格 | 每个风格：完整 prompt + 全部源码 + 成片；[template.md](https://github.com/Vincentwei1021/mg-styles-15/blob/main/template.md) 四段式（Output / Technical route / Creative seed / Signature features）；[rubric.md](https://github.com/Vincentwei1021/mg-styles-15/blob/main/rubric.md) 独立评审 + 两轮修改 | 写新风格的模板、可检验的 signature features、评审 rubric |
| [javascript-animation-skills](https://github.com/iart-ai/javascript-animation-skills) | 1 个 skill 包，多种画风 | 从题材推导 look、beat grid / shot list 数据化、contact sheet 自检、零素材审计 | agent 工作流与自检清单 |
| [opus-video-skills](https://github.com/tuzhechen2005/opus-video-skills) | 2 个风格 | 每个风格一个 skill：`SKILL.md` + 可运行 `template/` + worked example | 风格即 skill 的工程组织方式 |
| [HyperFrames frame.md](https://hyperframes.heygen.com/prompting/design-systems) | 一组设计模板（画廊，数量未逐一核对） | 品牌 token（frontmatter）+ 意图/Do-Don't + 模板画廊 | 品牌/版式契约与交付层 |
| [ClaudeAnimationBase](https://github.com/JohnHeibel/ClaudeAnimationBase) | 基础引擎 | 帧为时间纯函数、headless 渲染、逐镜头评审 | 底层渲染约定 |

### 共同做法

1. **风格 = 不变量 + 自由故事。** `STYLE.md` 锁死 look、颜色、字体、运动、声音；故事、镜头、节奏由导演决定（Lemo 的 AGENTS.md 原话：`STYLE.md` is fixed；everything else is yours to direct）。
2. **风格按名字选，不按形容词选。** 用户说 "swiss-motion" / "瑞士动态排版"，agent 查索引、读 `STYLE.md`；没选就推荐 2–3 个最接近的。
3. **风格文档有固定骨架。** Lemo 是 11 节；mg-styles-15 是四段式，其中 signature features 必须可检验（"cubic-bezier(0.34,1.56,0.64,1)，错峰 2–4 帧"，不是"要有弹性"）。
4. **先风格帧，后分镜，最后成片。** 三张真实代码出的风格帧 → 用户要看才做 6–9 张分镜 → 成片；风格帧不过不往下走。
5. **独立评审。** 另一个 AI 用 rubric 按 7 个维度打分（风格保真、概念、运动、排版、质感、声画同步、技术），给 5–10 条带时间码的修改，再改两轮。
6. **确定性。** 帧是 `render(t)` 的纯函数；同一输入同一输出，便于批量与回归。

### 对本仓库的建议

不要搬 59 套，也不要再自己发明一套写法。按 Lemo 的 schema 升级 `styles/`。

**筛选标准**（按顺序）：

1. **内容原语**：公式/排版、图表/数据、几何/工程、流程/空间、概念/文字——每个原语一套，避免重叠；
2. **可实现性**：只需 2D 矢量、文字、坐标轴、标注；不依赖照片、实拍、角色绑定、重着色器；
3. **去重**：已有 `swiss-motion` 占住“排版/公式”，就不再接同角色的风格；
4. **证据**：`style.json` 的 `uses` 对得上，再用 `motion_frames` 出 3 张风格帧验收；不过就换。

按这套标准（2026-10-25 查 `style.json`）：

| 风格 | `uses` | 判定 |
|---|---|---|
| `swiss-motion` | Brand identity / Events / Design education | **核心**：公式与排版 |
| `dataviz` | Data journalism / Reports / Climate & science | **核心**：图表与数据 |
| `blueprint` | Engineering / Hardware launches / Tech explainers | **核心**：几何与工程 |
| `whiteboard` | Explainers / Online courses / Science | 可选：科学讲解；手绘笔画成本中等 |
| `iso-infographic` | Process explainers / Supply chains / Annual reports | 可选：流程/空间；等距投影成本中等 |
| `pictogram-motion` | Sports events / Visual identity / Event openers | 不选：偏活动/体育，公式场景弱 |
| `dark-keynote` | Product launches / SaaS / Keynotes | 不选：与 `swiss-motion` 的排版角色重叠 |

已落 **5 套**：`swiss-motion` / `dataviz` / `blueprint` / `whiteboard` + `3b1b`。`iso-infographic`、`one-line`、`ascii-crt` 仍是候选，等有对应题材再验；这个列表不是永久名单——风格帧验收不过就换。

落地方式：

1. 每个风格一个目录：`style.json`（元数据）+ `STYLE.md`（不变量，按 Lemo 结构）+ `tokens.json` + `theme.py` + `preview.jpg`；
2. 用 mg-styles-15 的四段式模板写**新**风格，用它的 rubric 做评审；
3. 画面仍由 manimgx 画，不复制它们的 Canvas/WebGL demo 代码，只取语法与 prompt；
4. 交付层继续交给 HF，`frame.md` 只做品牌/版式契约；
5. 标注来源与许可：Lemo 代码/文档 MIT，demo 静帧 CC BY 4.0（署名 LemoLab）；mg-styles-15 MIT；HF Apache-2.0。

## 参考

- [HyperFrames design systems](https://hyperframes.heygen.com/prompting/design-systems)
- [HyperFrames examples](https://hyperframes.heygen.com/examples) · [catalog](https://hyperframes.heygen.com/catalog)
- [HyperFrames CLI rendering](https://hyperframes.heygen.com/guides/rendering)
- [Lemo-Opuscar](https://github.com/lemomo-ai/lemo-opuscar) · [DIRECTOR.md](https://github.com/lemomo-ai/lemo-opuscar/blob/main/DIRECTOR.md) · [TECHNIQUE.md](https://github.com/lemomo-ai/lemo-opuscar/blob/main/TECHNIQUE.md)
- 本地 `manimgx inspect --help`（manimgx 0.1.1）
