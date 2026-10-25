/**
 * 机制层：所有"不变量"都在这里，模型只能传有限的参数。
 *
 * 设计原则
 *  - 渲染规格（分辨率、fps、编码器、crf）只接受枚举和数字上限；
 *  - 每个函数返回结构化摘要（时长/体积/layout 问题），不让模型 grep 日志；
 *  - 外部命令全部走 execFile + 超时，不经 shell。
 */

import { execFile } from 'node:child_process'
import { existsSync, statSync } from 'node:fs'
import { basename, dirname, join, resolve } from 'node:path'
import { promisify } from 'node:util'

import { hasVenv, resolveBinary, resolveVenv, venvBinary } from './env.js'

const exec = promisify(execFile)

function binaryOf(config, name) {
  return resolveBinary(config, name)
}

function requireVenv(config) {
  if (!hasVenv(config)) {
    throw new Error(
      `找不到 Python 虚拟环境：${resolveVenv(config)}\n`
      + '数学功能需要 manimgx 与 sympy。创建方式：\n'
      + `  python3 -m venv ${resolveVenv(config)}\n`
      + `  ${venvBinary(config, 'pip')} install manimgx sympy\n`
      + '或在插件配置里指定 venv 路径 / 设置 MOTION_VENV。',
    )
  }
}

/** 从渲染器 stdout 里抽布局问题和产物信息。 */
export function summarizeRender(stdout, stderr) {
  const text = `${stdout}\n${stderr}`
  const problems = [...text.matchAll(/^\s*\[(\d+)\]\s*(.+)$/gm)].map((m) => m[2].trim())
  const line = text.match(/^(.*\.mp4)\s+([\d.]+) s,\s*(\d+)x(\d+) at ([\d.]+) fps,\s*([\d.]+) MB(?:.*rendered in ([\d.]+) s)?/m)
  return {
    video: line?.[1] ?? null,
    durationSec: line ? Number(line[2]) : null,
    width: line ? Number(line[3]) : null,
    height: line ? Number(line[4]) : null,
    fps: line ? Number(line[5]) : null,
    megabytes: line ? Number(line[6]) : null,
    renderedSec: line?.[7] ? Number(line[7]) : null,
    layoutProblems: problems,
  }
}

/** 渲染一支场景。engine = manimgx（默认，无需 LaTeX）或 manim（Manim CE 回退）。 */
export async function renderScene(config, args) {
  const file = resolve(args.file)
  if (!existsSync(file)) throw new Error(`场景文件不存在: ${file}`)

  const engine = args.engine ?? 'manimgx'
  if (engine !== 'manimgx' && engine !== 'manim') {
    throw new Error('engine 只支持 manimgx 或 manim')
  }

  const width = clampInt(args.width ?? 1920, 320, 4096)
  const height = clampInt(args.height ?? 1080, 320, 4096)
  const fps = clampInt(args.fps ?? 30, 10, 60)
  const out = resolve(args.out ?? join(dirname(file), `${basename(file, '.py')}.mp4`))

  requireVenv(config)
  const venv = resolveVenv(config)
  const binDir = join(venv, process.platform === 'win32' ? 'Scripts' : 'bin')
  const command = venvBinary(config, engine === 'manim' ? 'manim' : 'manimgx')
  if (!existsSync(command)) {
    throw new Error(`找不到渲染器: ${command}\n请在 venv 里安装：${venvBinary(config, 'pip')} install ${engine === 'manim' ? 'manim' : 'manimgx'}`)
  }

  const argv = engine === 'manim'
    ? [file, ...(args.scene ? [args.scene] : []), '-o', basename(out)]
    : ['render', file, ...(args.scene ? [args.scene] : []), '-r', `${width}x${height}`, '--fps', String(fps), '-o', out]

  const post = normalizePost(args.post)
  if (post.subframes > 1 && engine === 'manimgx') {
    const i = argv.indexOf('--fps')
    if (i >= 0) argv[i + 1] = String(fps * post.subframes)
  }

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

  if (post.enabled) {
    const finalOut = out.replace(/\.mp4$/, '') + '-post.mp4'
    await applyPost(config, out, finalOut, fps, post)
    summary.post = { ...post, output: finalOut }
    summary.output = finalOut
    summary.video = finalOut
  }

  summary.wallSec = Number(((Date.now() - started) / 1000).toFixed(1))
  return summary
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
    '-vf', chain.join(','), '-c:v', 'libx264', '-crf', '19', '-pix_fmt', 'yuv420p',
    '-an', output,
  ], { timeout: 900_000, maxBuffer: 8 * 1024 * 1024 })
}

/** 抽帧自检：等间隔取 n 帧拼 contact sheet，并报告全黑/过曝帧。 */
export async function probeVideo(config, args) {
  const video = resolve(args.video)
  if (!existsSync(video)) throw new Error(`视频不存在: ${video}`)
  const n = clampInt(args.frames ?? 12, 2, 24)
  const sheet = resolve(args.out ?? join(dirname(video), `${basename(video, '.mp4')}-contact.png`))
  const ffmpeg = binaryOf(config, 'ffmpeg')

  const duration = await readDuration(config, video)
  const step = Math.max(1, Math.floor((duration * 30) / n))
  await exec(ffmpeg, [
    '-y', '-loglevel', 'error', '-i', video,
    '-vf', `select='not(mod(n\\,${step}))',scale=270:-2,tile=4x3:margin=6:padding=4:color=0x222222`,
    '-frames:v', '1', sheet,
  ], { timeout: 120_000 })

  const { stdout } = await exec(ffmpeg, [
    '-hide_banner', '-i', video, '-vf', 'signalstats,metadata=print:key=lavfi.signalstats.YAVG:file=-',
    '-f', 'null', '-',
  ], { timeout: 120_000, maxBuffer: 32 * 1024 * 1024 })
  const avgs = [...stdout.matchAll(/YAVG=([\d.]+)/g)].map((m) => Number(m[1]))
  const blank = avgs.map((v, i) => ({ frame: i, yavg: v })).filter((x) => x.yavg < 8 || x.yavg > 250)

  return {
    video,
    durationSec: duration,
    framesAnalyzed: avgs.length,
    contactSheet: sheet,
    blankFrames: blank.slice(0, 8),
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
