/**
 * 环境自检：装完插件先跑这个，别等渲染时报错。
 * 只读，不改任何东西；返回结构化表格 + 修法。
 */

import { execFile } from 'node:child_process'
import { existsSync } from 'node:fs'
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
    summary: ready.math
      ? '数学渲染与成片可用'
      : ready.delivery
        ? '成片可用；数学渲染缺少 Python venv'
        : '缺少 FFmpeg：渲染不可用',
    rows,
  }
}
