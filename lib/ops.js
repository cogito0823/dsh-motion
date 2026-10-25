/**
 * 机制层：所有"不变量"都在这里，模型只能传有限的参数。
 *
 * 设计原则
 *  - 渲染规格（分辨率、fps、编码器、crf）只接受枚举和数字上限；
 *  - 每个函数返回结构化摘要（时长/体积/layout 问题），不让模型 grep 日志；
 *  - 外部命令全部走 execFile + 超时，不经 shell。
 */

import { execFile } from 'node:child_process'
import { existsSync, mkdirSync, renameSync, statSync } from 'node:fs'
import { basename, dirname, join, resolve } from 'node:path'
import { promisify } from 'node:util'

import { assertApproved, assertBrief } from './approvals.js'
import { hasVenv, resolveBinary, resolveVenv, venvBinary } from './env.js'
import { recordMetric } from './metrics.js'
import { PROJECT_FILE, acquireProjectLock, projectOut, resolveProject } from './project.js'

const exec = promisify(execFile)

function binaryOf(config, name) {
  return resolveBinary(config, name)
}

function requireVenv(config) {
  if (!hasVenv(config)) {
    throw new Error(
      `找不到 Python 虚拟环境：${resolveVenv(config)}\n`
      + '数学功能需要 manimgx 与 sympy。\n'
      + '先在 Harness 里调用 motion_setup（或运行 npm run setup）自动创建；\n'
      + '不要用 bash 在 workspace 外建 venv——模型 bash 的 workspace-write 沙箱会拒绝。\n'
      + `手动兜底（仅限本机终端）：python3 -m venv ${resolveVenv(config)} && ${venvBinary(config, 'pip')} install manimgx sympy\n`
      + '也可以设置 MOTION_VENV 指向可写目录。',
    )
  }
}

/** 从渲染器 stdout 里抽布局问题和产物信息。 */
export function summarizeRender(stdout, stderr) {
  const text = `${stdout}\n${stderr}`
  const layoutIssues = [...text.matchAll(/^\s*\[(\d+)\]\s*(.+)$/gm)].map((m) => ({
    index: Number(m[1]),
    message: m[2].trim(),
  }))
  const line = text.match(/^(.*\.mp4)\s+([\d.]+) s,\s*(\d+)x(\d+) at ([\d.]+) fps,\s*([\d.]+) MB(?:.*rendered in ([\d.]+) s)?/m)
  return {
    video: line?.[1] ?? null,
    durationSec: line ? Number(line[2]) : null,
    width: line ? Number(line[3]) : null,
    height: line ? Number(line[4]) : null,
    fps: line ? Number(line[5]) : null,
    megabytes: line ? Number(line[6]) : null,
    renderedSec: line?.[7] ? Number(line[7]) : null,
    layoutProblems: layoutIssues.map((issue) => issue.message),
    layoutIssues,
  }
}

/** 渲染一支场景。engine = manimgx（默认，无需 LaTeX）或 manim（Manim CE 回退）。 */
export async function renderScene(config, args) {
  const file = resolve(args.file)
  if (!existsSync(file)) throw new Error(`场景文件不存在: ${file}`)
  const project = resolveProject(file, { config })
  const allowUnmanaged = config.allowUnmanaged === true || process.env.DSH_MOTION_ALLOW_UNMANAGED === '1'
  if (!project.root && !allowUnmanaged) {
    throw new Error(
      `未找到 ${PROJECT_FILE}：正式渲染需要项目根。\n`
      + '先运行：node scripts/scaffold.mjs --title "片名" --duration 30\n'
      + '已有项目但没有 manifest：用 node scripts/project-adopt.mjs <dir> 迁移。\n'
      + '临时预览用 motion_frames；CLI 调试用 node scripts/dev.mjs render --explore。',
    )
  }

  assertApproved(file, {
    allow: config.allowUnconfirmed === true || process.env.DSH_MOTION_ALLOW_UNCONFIRMED === '1',
  })

  const engine = args.engine ?? 'manimgx'
  if (engine !== 'manimgx' && engine !== 'manim') {
    throw new Error('engine 只支持 manimgx 或 manim')
  }

  const width = clampInt(args.width ?? 1920, 320, 4096)
  const height = clampInt(args.height ?? 1080, 320, 4096)
  const fps = clampInt(args.fps ?? 30, 10, 60)
  const out = resolve(args.out ?? (
    project.root
      ? projectOut(project.root, 'render', `${basename(file, '.py')}.mp4`)
      : join(dirname(file), `${basename(file, '.py')}.mp4`)
  ))
  mkdirSync(dirname(out), { recursive: true })

  requireVenv(config)
  const venv = resolveVenv(config)
  const binDir = join(venv, process.platform === 'win32' ? 'Scripts' : 'bin')
  const command = venvBinary(config, engine === 'manim' ? 'manim' : 'manimgx')
  if (!existsSync(command)) {
    throw new Error(`找不到渲染器: ${command}\n先调用 motion_setup（或 npm run setup）自动安装；手动兜底：${venvBinary(config, 'pip')} install ${engine === 'manim' ? 'manim' : 'manimgx'}`)
  }

  const argv = engine === 'manim'
    ? [file, ...(args.scene ? [args.scene] : []), '-o', basename(out)]
    : ['render', file, ...(args.scene ? [args.scene] : []), '-r', `${width}x${height}`, '--fps', String(fps), '-o', out]

  const post = normalizePost(args.post)
  if (post.subframes > 1 && engine === 'manimgx') {
    const i = argv.indexOf('--fps')
    if (i >= 0) argv[i + 1] = String(fps * post.subframes)
  }

  const release = acquireProjectLock(project.root, { command: 'motion_render' })
  try {
    const started = Date.now()
    const { stdout, stderr } = await exec(command, argv, {
      timeout: 900_000,
      maxBuffer: 8 * 1024 * 1024,
      env: { ...process.env, PATH: `${binDir}${process.platform === 'win32' ? ';' : ':'}${process.env.PATH ?? ''}` },
      cwd: dirname(file),
    })

    const summary = summarizeRender(stdout, stderr)
    summary.engine = engine
    summary.output = out
    summary.project = project.root

    if (post.enabled) {
      const finalOut = out.replace(/\.mp4$/, '') + '-post.mp4'
      await applyPost(config, out, finalOut, fps, post)
      // post 会改帧率与体积：摘要必须以成片为准，而不是中间产物
      Object.assign(summary, await probeOutput(config, finalOut))
      summary.post = { ...post, output: finalOut }
      summary.output = finalOut
      summary.video = finalOut
    }

    // post/ffmpeg 可能因 tmix/丢帧把时长压短；用 CFR 补齐并校验，避免"30s 变 27.4s"。
    if (summary.durationSec) {
      const fixed = await ensureCfr(config, summary, fps)
      if (fixed) summary.normalized = true
    }

    summary.wallSec = Number(((Date.now() - started) / 1000).toFixed(1))
    recordMetric(file, {
      phase: 'render',
      activeSec: summary.wallSec,
      durationSec: summary.durationSec,
      engine,
      problems: summary.layoutProblems.length,
      normalized: Boolean(summary.normalized),
      output: summary.output,
    })
    return summary
  } finally {
    release()
  }
}

/** 成片时长或帧数不对（VFR 少帧）时，用 tpad + CFR 修正；返回是否修过。 */
async function ensureCfr(config, summary, fps) {
  const expected = Number(summary.durationSec)
  if (!Number.isFinite(expected) || expected <= 0) return false
  const file = summary.output
  const before = await probeOutput(config, file)
  const expectedFrames = Math.round(expected * fps)
  const frameGap = Number.isFinite(before.frames) ? Math.abs(before.frames - expectedFrames) : 0
  const durationGap = Math.abs(expected - before.durationSec)
  if (frameGap <= 1 && durationGap <= 0.08) return false

  const delta = expected - before.durationSec
  const tmp = `${file}.cfr.mp4`
  const chain = []
  if (delta > 0.05) chain.push(`tpad=stop_mode=clone:stop_duration=${delta.toFixed(3)}`)
  chain.push(`fps=${fps}`)
  const args = [
    '-y', '-loglevel', 'error', '-i', file,
    '-vf', chain.join(','), '-fps_mode', 'cfr', '-r', String(fps),
    '-c:v', 'libx264', '-crf', '18', '-pix_fmt', 'yuv420p', '-an',
  ]
  if (delta < -0.05) args.push('-t', expected.toFixed(3))
  args.push(tmp)
  await exec(binaryOf(config, 'ffmpeg'), args, { timeout: 900_000, maxBuffer: 8 * 1024 * 1024 })

  const after = await probeOutput(config, tmp)
  const afterGap = Number.isFinite(after.frames) ? Math.abs(after.frames - expectedFrames) : 0
  if (afterGap > 1 || Math.abs(after.durationSec - expected) > 0.05) {
    throw new Error(`CFR 修正后仍不对：期望 ${expectedFrames} 帧 / ${expected}s，实际 ${after.frames} 帧 / ${after.durationSec}s（${tmp}）`)
  }
  renameSync(tmp, file)
  Object.assign(summary, after)
  return true
}

/** 归一化后期参数：枚举/上限之外的值一律夹到合法区间，交给 ffmpeg 之前就把脏输入挡掉。 */
export function normalizePost(raw) {
  const p = raw && typeof raw === 'object' ? raw : {}
  const subframes = clampInt(p.subframes ?? 1, 1, 8)
  const grain = p.grain === true ? 7 : Number(p.grain ?? 0)
  const vignette = p.vignette === true ? 4 : Number(p.vignette ?? 0)
  const grade = typeof p.grade === 'string' ? p.grade : ''
  return {
    subframes,
    grain: Number.isFinite(grain) ? grain : 0,
    vignette: Number.isFinite(vignette) ? vignette : 0,
    grade,
    enabled: subframes > 1 || grain > 0 || vignette > 0 || Boolean(grade),
  }
}

/** 管线层后期：tmix 运动模糊 + 颗粒 + 暗角 + 调色，不写进场景代码。 */
async function applyPost(config, input, output, fps, post) {
  const chain = []
  if (post.subframes > 1) chain.push(`tmix=frames=${post.subframes}`, `fps=${fps}`)
  if (post.vignette > 0) chain.push(`vignette=PI/${post.vignette}`)
  if (post.grain > 0) chain.push(`noise=alls=${Math.round(post.grain)}:allf=t`)
  if (post.grade === 'cinematic') chain.push('eq=contrast=1.06:saturation=1.12', 'curves=preset=medium_contrast')
  if (post.grade === 'warm') chain.push('eq=contrast=1.03:saturation=1.06', 'colorbalance=rs=.04:bs=-.03')
  if (chain.length === 0) return
  await exec(binaryOf(config, 'ffmpeg'), [
    '-y', '-loglevel', 'error', '-i', input,
    '-vf', chain.join(','), '-fps_mode', 'cfr', '-r', String(fps),
    '-c:v', 'libx264', '-crf', '19', '-pix_fmt', 'yuv420p',
    '-an', output,
  ], { timeout: 900_000, maxBuffer: 8 * 1024 * 1024 })
}

/** 按帧数选一个接近方形的网格：2→2x1、4→2x2、6→3x2、12→4x3、24→6x4。 */
export function tileGrid(n) {
  const cols = n <= 2 ? 2 : n <= 4 ? 2 : n <= 6 ? 3 : n <= 9 ? 3 : n <= 12 ? 4 : n <= 16 ? 4 : 6
  return `${cols}x${Math.ceil(n / cols)}`
}

/** 解析 signalstats 的 metadata=print 输出：每帧一段 `frame:N` + 若干 `lavfi.signalstats.*`。 */
export function parseSignalStats(text) {
  const frames = []
  let current
  for (const raw of text.split('\n')) {
    const line = raw.trim()
    const head = /^frame:(\d+)/.exec(line)
    if (head) {
      current = { frame: Number(head[1]) }
      frames.push(current)
      continue
    }
    const kv = /^lavfi\.signalstats\.(YMIN|YMAX|YAVG)=([\d.]+)$/.exec(line)
    if (kv && current) current[kv[1].toLowerCase()] = Number(kv[2])
  }
  return frames
}

/**
 * 归一化帧时间点：秒数或 "end"。`motion_frames` 只画这些帧，不编码视频。
 * 上限 24 个：再多也看不过来，而且 manimgx 会拆成多张 sheet。
 */
export function normalizeTimes(raw) {
  const list = raw == null ? [] : Array.isArray(raw) ? raw : [raw]
  if (list.length > 24) throw new Error('times 最多 24 个')
  return list.map((item) => {
    if (typeof item === 'string' && item.trim().toLowerCase() === 'end') return 'end'
    const n = Number(item)
    if (!Number.isFinite(n) || n < 0 || n > 3600) {
      throw new Error(`无效时间点：${item}（秒或 "end"）`)
    }
    return String(n)
  })
}

/** 解析 manimgx inspect 的 stdout：片名/时长、storyboard 路径、layout 问题。 */
export function parseInspectOutput(stdout) {
  const text = String(stdout ?? '')
  const head = text.match(/^(.+?):\s+([A-Za-z_][\w.]*),\s+([\d.]+)\s*s,\s+(\d+)\s+plays?\b/m)
  const sheet = text.match(/^storyboard:\s*(.+)$/m)
  const layout = text.match(/^layout:\s*(.+)$/m)
  const layoutIssues = [...text.matchAll(/^\s*\[(\d+)\]\s+(.+)$/gm)].map((m) => ({
    index: Number(m[1]),
    message: m[2].trim(),
  }))
  return {
    scene: head?.[2] ?? null,
    durationSec: head ? Number(head[3]) : null,
    plays: head ? Number(head[4]) : null,
    storyboard: sheet
      ? sheet[1].split(',').map((s) => s.trim()).filter(Boolean)
      : [],
    layout: layout ? layout[1].trim() : null,
    layoutOk: layout ? /no problems/.test(layout[1]) : null,
    layoutProblems: layoutIssues.map((issue) => issue.message),
    layoutIssues,
  }
}

/**
 * 极简模式：直接从场景出帧，不生成视频、不依赖 HyperFrames。
 *
 * manimgx inspect 只画请求的时刻并做版式检查，通常几秒完成；返回的
 * storyboard PNG 可以直接交给模型读图。退出码 1 表示有 layout 问题，
 * 仍是有效结果，不当失败。
 */
export async function inspectFrames(config, args) {
  const file = resolve(args.file)
  if (!existsSync(file)) throw new Error(`场景文件不存在: ${file}`)
  const project = resolveProject(file, { config })

  // 硬门：项目账本存在时，需求（时长/画幅/交付）没锁就不出帧。
  assertBrief(file, {
    allow: config.allowUnconfirmed === true || process.env.DSH_MOTION_ALLOW_UNCONFIRMED === '1',
  })

  requireVenv(config)
  const venv = resolveVenv(config)
  const command = venvBinary(config, 'manimgx')
  if (!existsSync(command)) {
    throw new Error(
      `找不到渲染器: ${command}\n先调用 motion_setup（或 npm run setup）自动安装；手动兜底：${venvBinary(config, 'pip')} install manimgx`,
    )
  }

  const times = normalizeTimes(args.times)
  const out = args.out
    ? resolve(args.out)
    : project.root
      ? projectOut(project.root, 'frames', `${basename(file, '.py')}.png`)
      : null
  if (out) mkdirSync(dirname(out), { recursive: true })
  const argv = ['inspect', file, ...(args.scene ? [args.scene] : [])]
  if (times.length) argv.push('-t', times.join(','))
  if (out) argv.push('-o', out)

  const release = acquireProjectLock(project.root, { command: 'motion_frames' })
  try {
    const binDir = join(venv, process.platform === 'win32' ? 'Scripts' : 'bin')
    const started = Date.now()
    let stdout = ''
    try {
      ({ stdout } = await exec(command, argv, {
        timeout: 300_000,
        maxBuffer: 8 * 1024 * 1024,
        cwd: dirname(file),
        env: {
          ...process.env,
          PATH: `${binDir}${process.platform === 'win32' ? ';' : ':'}${process.env.PATH ?? ''}`,
        },
      }))
    } catch (error) {
      // 有 layout 问题时 manimgx 返回 1，stdout 仍然是完整报告。
      if (error.code !== 1 || !error.stdout) throw error
      stdout = error.stdout
    }

    const parsed = parseInspectOutput(stdout)
    const wallSec = Number(((Date.now() - started) / 1000).toFixed(1))
    recordMetric(file, {
      phase: 'frames',
      activeSec: wallSec,
      samples: times.length || parsed.plays || 0,
      issues: parsed.layoutProblems.length,
      storyboards: parsed.storyboard.length,
    })
    return {
      file,
      project: project.root,
      mode: 'frames',
      requestedTimes: times,
      ...parsed,
      // 每格顶部约 28px 是 caption 条，不属于画面；不要据此判断"上沿被裁"。
      storyboardNote: parsed.storyboard.length
        ? '每格顶部是 caption 条，不是画面；怀疑裁切时看单帧或全图。'
        : null,
      wallSec,
    }
  } finally {
    release()
  }
}

/**
 * 空镜判据：yuv420p limited range 黑=16、白=235，用接近 0/255 的阈值永远判不出来。
 * 看内容范围而不是平均值：全黑帧 YMAX 仍在 16 附近，全白帧 YMIN 在 235 附近。
 */
export function isBlankFrame(frame) {
  if (Number.isFinite(frame.ymax) && frame.ymax < 20) return true
  if (Number.isFinite(frame.ymin) && frame.ymin > 230) return true
  return false
}

/** 解析 ffprobe 的 "30000/1001" 帧率；0/0 视为未知。 */
export function parseFrameRate(value) {
  const [num, den = '1'] = String(value ?? '').split('/')
  const n = Number(num)
  const d = Number(den)
  if (!Number.isFinite(n) || !Number.isFinite(d) || n <= 0 || d <= 0) return null
  return Math.round((n / d) * 1000) / 1000
}

/**
 * 把 ffprobe 的 JSON 归一成“这份 raw 到底是 CFR 还是 VFR”。
 * manimgx 对长驻留/少帧会输出 VFR raw；交付前必须知道，不能默认它 30fps。
 */
export function videoInfoFromProbe(data = {}) {
  const stream = data.streams?.[0] ?? {}
  const format = data.format ?? {}
  const fps = parseFrameRate(stream.r_frame_rate)
  const avgFps = parseFrameRate(stream.avg_frame_rate)
  const frames = Number(stream.nb_read_frames ?? stream.nb_frames)
  const durationSec = Number(format.duration)
  const expectedFrames = fps && Number.isFinite(durationSec) ? Math.round(fps * durationSec) : null
  const vfr = fps && avgFps ? Math.abs(fps - avgFps) / fps > 0.01 : null
  return {
    width: Number(stream.width) || null,
    height: Number(stream.height) || null,
    fps,
    avgFps,
    frames: Number.isFinite(frames) ? frames : null,
    durationSec: Number.isFinite(durationSec) ? Math.round(durationSec * 100) / 100 : null,
    expectedFrames,
    frameDelta: Number.isFinite(frames) && expectedFrames ? frames - expectedFrames : null,
    vfr,
    cfr: vfr === null ? null : !vfr,
  }
}

async function readVideoInfo(config, file) {
  try {
    const { stdout } = await exec(binaryOf(config, 'ffprobe'), [
      '-v', 'error', '-count_frames', '-select_streams', 'v:0',
      '-show_entries', 'stream=width,height,r_frame_rate,avg_frame_rate,nb_frames,nb_read_frames:format=duration,size',
      '-of', 'json', file,
    ], { timeout: 120_000, maxBuffer: 4 * 1024 * 1024 })
    return videoInfoFromProbe(JSON.parse(stdout))
  } catch {
    return null
  }
}

/** 抽帧自检：等间隔取 n 帧拼 contact sheet，并报告全黑/过曝帧。 */
export async function probeVideo(config, args) {
  const started = Date.now()
  const video = resolve(args.video)
  if (!existsSync(video)) throw new Error(`视频不存在: ${video}`)
  const n = clampInt(args.frames ?? 12, 2, 24)
  const project = resolveProject(video, { config })
  const sheet = resolve(args.out ?? (
    project.root
      ? projectOut(project.root, 'probe', `${basename(video, '.mp4')}-contact.png`)
      : join(dirname(video), `${basename(video, '.mp4')}-contact.png`)
  ))
  mkdirSync(dirname(sheet), { recursive: true })
  const ffmpeg = binaryOf(config, 'ffmpeg')

  const release = acquireProjectLock(project.root, { command: 'motion_probe' })
  try {
    const duration = await readDuration(config, video)
    const info = await readVideoInfo(config, video)
    // 用 fps 滤镜按整段时长重采样：与源帧率无关，60 fps 的成片也不会只覆盖前半段
    const rate = (n / Math.max(duration, 0.001)).toFixed(6)
    await exec(ffmpeg, [
      '-y', '-loglevel', 'error', '-i', video,
      '-vf', `fps=${rate},scale=270:-2,tile=${tileGrid(n)}:margin=6:padding=4:color=0x222222`,
      '-frames:v', '1', sheet,
    ], { timeout: 120_000 })

    const { stdout } = await exec(ffmpeg, [
      '-hide_banner', '-i', video, '-vf', 'signalstats,metadata=print:file=-',
      '-f', 'null', '-',
    ], { timeout: 120_000, maxBuffer: 64 * 1024 * 1024 })
    const frames = parseSignalStats(stdout)
    const blank = frames
      .filter(isBlankFrame)
      .map(({ frame, yavg, ymin, ymax }) => ({ frame, yavg, ymin, ymax }))

    const result = {
      video,
      project: project.root,
      durationSec: duration,
      fps: info?.fps ?? null,
      avgFps: info?.avgFps ?? null,
      frames: info?.frames ?? null,
      expectedFrames: info?.expectedFrames ?? null,
      frameDelta: info?.frameDelta ?? null,
      vfr: info?.vfr ?? null,
      cfr: info?.cfr ?? null,
      vfrWarning: info?.vfr
        ? `VFR:平均 ${info.avgFps}fps / 标称 ${info.fps}fps、${info.frames} 帧；raw 不要当 ${info.fps}fps CFR 中间片`
        : null,
      framesAnalyzed: frames.length,
      // 只回前 8 条明细，但总数要能看到——否则 300 个空镜和 3 个空镜长得一样
      blankCount: blank.length,
      contactSheet: sheet,
      blankFrames: blank.slice(0, 8),
    }
    result.wallSec = Number(((Date.now() - started) / 1000).toFixed(1))
    recordMetric(video, {
      phase: 'probe',
      activeSec: result.wallSec,
      frames: result.framesAnalyzed,
      blank: result.blankCount,
      durationSec: result.durationSec,
    })
    return result
  } finally {
    release()
  }
}

/** 用 ffprobe 重新读成片参数（post 之后帧率、时长、体积都可能与中间产物不同）。 */
export async function probeOutput(config, file) {
  const { stdout } = await exec(binaryOf(config, 'ffprobe'), [
    '-v', 'error', '-count_frames', '-select_streams', 'v:0',
    '-show_entries', 'stream=width,height,r_frame_rate,avg_frame_rate,nb_read_frames:format=duration,size',
    '-of', 'json', file,
  ], { timeout: 120_000, maxBuffer: 4 * 1024 * 1024 })
  const data = JSON.parse(stdout)
  const info = videoInfoFromProbe(data)
  const size = Number(data.format?.size)
  return {
    ...info,
    megabytes: Number.isFinite(size) ? Math.round(size / 1e5) / 10 : null,
  }
}

async function readDuration(config, video) {
  try {
    const { stdout } = await exec(binaryOf(config, 'ffprobe'), [
      '-v', 'error', '-show_entries', 'format=duration', '-of', 'default=nw=1:nk=1', video,
    ], { timeout: 60_000 })
    const n = Number(stdout.trim())
    if (Number.isFinite(n) && n > 0) return n
  } catch {
    // ffprobe 不可用时退回 ffmpeg -i 的 stderr 解析
  }
  const { stderr } = await exec(binaryOf(config, 'ffmpeg'), ['-hide_banner', '-i', video], { timeout: 60_000 })
    .catch((err) => ({ stderr: String(err.stderr ?? '') }))
  const m = /Duration:\s*(\d+):(\d+):(\d+\.\d+)/.exec(stderr)
  if (!m) throw new Error('无法读取视频时长：ffprobe 与 ffmpeg 都失败')
  return Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3])
}

/** 用 sympy 判两个表达式是否恒等（数学正确性门）。 */
export async function checkMath(config, args) {
  requireVenv(config)
  const venv = resolveVenv(config)
  const python = venvBinary(config, 'python')
  const script = `
import sys, sympy as sp
from sympy.parsing.sympy_parser import parse_expr, standard_transformations, implicit_multiplication_application
t = standard_transformations + (implicit_multiplication_application,)
x, y, t_ = sp.symbols('x y t')
local = {'x': x, 'y': y, 't': t_, 'pi': sp.pi, 'e': sp.E}
left = sp.nsimplify(parse_expr(sys.argv[1], transformations=t, local_dict=local), rational=True)
right = sp.nsimplify(parse_expr(sys.argv[2], transformations=t, local_dict=local), rational=True)
diff = sp.simplify(left - right)
print('EQUAL' if diff == 0 else 'DIFF')
print(sp.srepr(diff)[:400])
`
  const { stdout } = await exec(python, ['-c', script, args.left, args.right], {
    timeout: 60_000,
    maxBuffer: 1024 * 1024,
    env: {
      ...process.env,
      PATH: `${join(venv, process.platform === 'win32' ? 'Scripts' : 'bin')}${process.platform === 'win32' ? ';' : ':'}${process.env.PATH ?? ''}`,
    },
  })
  const [verdict, rest] = stdout.trim().split('\n')
  return { equal: verdict === 'EQUAL', difference: rest ?? '', left: args.left, right: args.right }
}

function clampInt(value, min, max) {
  const n = Math.trunc(Number(value))
  if (!Number.isFinite(n)) return min
  return Math.min(max, Math.max(min, n))
}
