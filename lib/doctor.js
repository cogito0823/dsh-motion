/**
 * 环境自检：装完插件先跑这个，别等渲染时报错。
 * 只读，不改任何东西；返回结构化表格 + 修法。
 */

import { execFile } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { dirname, join, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'

import {
  chromePath,
  findHyperframes,
  hasVenv,
  motionHome,
  resolveBinary,
  resolveVenv,
  venvBinary,
} from './env.js'

const exec = promisify(execFile)

/** 当前这份代码所在的 lib 目录与包根（npm 安装还是本地 checkout 一眼可辨）。 */
const LIB_DIR = dirname(fileURLToPath(import.meta.url))
const PACKAGE_ROOT = dirname(LIB_DIR)

/**
 * 报告"正在跑的是哪一份 dsh-motion"：版本 + lib 路径 + 安装形态。
 * 用 import.meta.url 推导，符号链接会被 Node 解析成真实路径，所以 link 安装会显示仓库路径。
 */
export function pluginSource() {
  let version = 'unknown'
  try {
    version = JSON.parse(readFileSync(join(PACKAGE_ROOT, 'package.json'), 'utf8')).version ?? 'unknown'
  } catch {
    // 读不到 package.json 时只报路径
  }
  const kind = LIB_DIR.includes(`${sep}node_modules${sep}`) ? 'npm 安装' : '本地 checkout'
  return { version, kind, lib: LIB_DIR }
}

async function runVersion(bin, args) {
  try {
    const { stdout, stderr } = await exec(bin, args, { timeout: 15_000 })
    const line = `${stdout || ''}\n${stderr || ''}`.trim().split('\n')[0]
    if (line) return line.slice(0, 80)
  } catch (err) {
    const line = String(err.stderr || err.stdout || '').trim().split('\n')[0]
    if (line && /version/i.test(line)) return line.slice(0, 80)
  }
  return null
}

async function version(bin, args) {
  if (Array.isArray(args)) return runVersion(bin, args)
  for (const form of [['--version'], ['-version'], ['version']]) {
    const found = await runVersion(bin, form)
    if (found) return found
  }
  return null
}

export async function doctor(config = {}) {
  const rows = []
  const add = (item, ok, detail, fix) => rows.push({ item, ok, detail, fix })

  const source = pluginSource()
  add('插件来源', true, `${source.version} · ${source.kind} · ${source.lib}`, null)

  const nodeMajor = Number(process.versions.node.split('.')[0])
  add('Node.js', nodeMajor >= 22, `v${process.versions.node}`, nodeMajor >= 22 ? null : '升级到 Node 22 或更高')

  const ffmpeg = resolveBinary(config, 'ffmpeg')
  const ffmpegVersion = await version(ffmpeg)
  add('FFmpeg', Boolean(ffmpegVersion), ffmpegVersion ?? ffmpeg, ffmpegVersion ? null : '安装 FFmpeg（macOS: brew install ffmpeg）')

  const ffprobe = resolveBinary(config, 'ffprobe')
  const ffprobeVersion = await version(ffprobe)
  add('ffprobe', Boolean(ffprobeVersion), ffprobeVersion ?? ffprobe, ffprobeVersion ? null : '随 FFmpeg 一起安装')

  const venv = resolveVenv(config)
  const py = hasVenv(config)
  add('Python venv', py, venv, py ? null : `python3 -m venv ${venv}`)

  if (py) {
    const manimgx = await version(venvBinary(config, 'manimgx'))
    add('manimgx', Boolean(manimgx), manimgx ?? '未安装', manimgx ? null : `${venvBinary(config, 'pip')} install manimgx`)
    const sympy = await version(venvBinary(config, 'python'), ['-c', 'import sympy; print(sympy.__version__)'])
    add('sympy', Boolean(sympy), sympy ?? '未安装', sympy ? null : `${venvBinary(config, 'pip')} install sympy`)
  }

  const chrome = chromePath()
  add('Chrome', Boolean(chrome), chrome ?? '未找到', chrome ? null : '安装 Chrome，或让 HyperFrames 自行下载渲染浏览器')

  const hf = findHyperframes()
  add('HyperFrames', Boolean(hf), hf ? '已缓存（用于组装/字幕/编码）' : '未安装', hf ? null : 'npx hyperframes@0.8.193 --version')

  add('输出目录', true, motionHome(config), null)

  const ready = {
    math: Boolean(ffmpegVersion && py),
    delivery: Boolean(ffmpegVersion && chrome),
  }

  return {
    ready,
    source,
    summary: ready.math
      ? '数学渲染与成片可用'
      : ready.delivery
        ? '成片可用；数学渲染缺少 Python venv'
        : '缺少 FFmpeg：渲染不可用',
    rows,
  }
}
