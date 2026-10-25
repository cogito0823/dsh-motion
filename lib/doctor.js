/**
 * 环境自检：装完插件、或渲染报错时跑这个。
 *
 * 一次调用给全：Node / FFmpeg / venv / manimgx / sympy / Chrome / HyperFrames
 * + 中文字体 + 公式转换 + 常用 API 签名（后三项在 probe_env.py 里，一个进程）。
 *
 * 结果按文件指纹缓存（默认 12 h）：同一台机器第二次调用不再 spawn python。
 * 需要强制重测：MOTION_PREFLIGHT=force，或 config.preflightForce = true。
 */

import { execFile } from 'node:child_process'
import { readFileSync } from 'node:fs'
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
import { cacheCandidates, fingerprint, probeRuntime, readAnyCache, writeAnyCache } from './preflight.js'

const exec = promisify(execFile)

/** 当前这份代码所在的 lib 目录与包根（npm 安装还是本地 checkout 一眼可辨）。 */
const LIB_DIR = dirname(fileURLToPath(import.meta.url))
const PACKAGE_ROOT = dirname(LIB_DIR)

const DEFAULT_TTL_SEC = 12 * 60 * 60

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

function summarizeProbe(probe) {
  const fonts = probe?.fonts ?? []
  const formulas = probe?.formulas ?? []
  const cjkFonts = probe?.cjkFonts
    ?? fonts.filter((row) => row.kind === 'cjk' && row.resolved).map((row) => row.family)
  const api = probe?.api ?? {}
  const functions = probe?.functions ?? {}
  const rates = probe?.rates ?? []
  return {
    fonts,
    cjkFonts,
    formulas,
    api,
    functions,
    rates,
    fontsOk: probe?.fontsOk ?? (cjkFonts.length > 0 && fonts.every((row) => row.resolved)),
    formulasOk: probe?.formulasOk ?? (formulas.length > 0 && formulas.every((row) => row.ok)),
    errors: probe?.errors ?? [],
  }
}

function firstFormulaError(probe) {
  const row = (probe?.formulas ?? []).find((item) => !item.ok && item.error)
  return row?.error ?? probe?.errors?.[0] ?? null
}

export async function doctor(config = {}) {
  const started = Date.now()
  const fp = fingerprint(config)
  const force = config.preflightForce === true || process.env.MOTION_PREFLIGHT === 'force'
  const ttlSec = Math.max(
    0,
    Number(config.preflightTtlSec ?? process.env.MOTION_PREFLIGHT_TTL ?? DEFAULT_TTL_SEC) || 0,
  )
  const candidates = cacheCandidates(config)

  if (!force && ttlSec > 0) {
    const hit = readAnyCache(candidates, fp, ttlSec * 1000)
    if (hit) {
      return {
        ...hit.value,
        cached: { hit: true, ageSec: Number((hit.ageMs / 1000).toFixed(1)), ttlSec, file: hit.file },
        elapsedMs: Date.now() - started,
      }
    }
  }

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
  add('Python venv', py, venv, py ? null : '调用 motion_setup 自动创建（推荐）；或设置 MOTION_VENV 指向可写目录后手动建 venv')

  let probe = { ok: false, fonts: [], formulas: [], api: {}, errors: ['venv 不可用，未运行探针'] }
  if (py) {
    probe = await probeRuntime(config)

    for (const [name, found, fix] of [
      ['manimgx', probe.manimgx, `${venvBinary(config, 'pip')} install manimgx（优先用 motion_setup）`],
      ['sympy', probe.sympy, `${venvBinary(config, 'pip')} install sympy`],
    ]) {
      add(name, Boolean(found), found ?? '未安装', found ? null : fix)
    }

    const { fonts, cjkFonts, formulas, api, functions, rates, fontsOk, formulasOk, errors } = summarizeProbe(probe)

    const fontDetail = cjkFonts.length
      ? `${cjkFonts.length} 个中文字体可用：${cjkFonts.slice(0, 6).join(' / ')}${cjkFonts.length > 6 ? ' …' : ''}`
      : (errors[0] ?? '没有中文字体通过“缺字体基线”校验')
    add('中文字体', fontsOk, fontDetail, fontsOk ? null : '调用 motion_setup（会检查 manimgx-fonts / manimgx-fonts-cjk）；仍失败再查系统 CJK 字体（macOS 需 PingFang SC）')

    const formulaDetail = formulas.length
      ? formulasOk
        ? `${formulas.length}/${formulas.length} 条样本转换成功（Typst/mitex）`
        : firstFormulaError(probe) ?? '公式转换失败'
      : '未运行'
    add('公式转换', formulasOk, formulaDetail, formulasOk ? null : '检查 Typst 后端；`\\lim_{...}` 这类写法在正式场景里再验一次')

    const apiCount = Object.keys(api).length
    const functionCount = Object.keys(functions).length
    add(
      '渲染器 API',
      apiCount > 0,
      apiCount
        ? `${apiCount} 个类 / ${functionCount} 个函数 / ${rates.length} 个 rate 已返回；完整表见 skills/animation-router/references/api.md`
        : '未取到签名',
      null,
    )
  }

  const chrome = chromePath()
  add('Chrome', Boolean(chrome), chrome ?? '未找到', chrome ? null : '安装 Chrome，或让 HyperFrames 自行下载渲染浏览器')

  const hf = findHyperframes()
  add('HyperFrames', Boolean(hf), hf ? '已缓存（用于组装/字幕/编码）' : '未安装', hf ? null : 'npx hyperframes@0.8.193 --version')

  add('输出目录', true, motionHome(config), null)

  const { fontsOk, formulasOk } = summarizeProbe(probe)
  const ready = {
    // venv 存在不等于能渲染：manimgx / sympy 真的 import 得到才算 math 就绪。
    math: Boolean(ffmpegVersion && py && probe.manimgx && probe.sympy),
    delivery: Boolean(ffmpegVersion && chrome),
    fonts: fontsOk,
    formulas: formulasOk,
  }

  const summary = !ready.math
    ? !ffmpegVersion
      ? '缺少 FFmpeg：渲染不可用'
      : !py
        ? '缺少 Python venv：调用 motion_setup'
        : 'venv 缺少 manimgx/sympy：调用 motion_setup'
    : !ready.delivery
      ? '数学渲染可用；成片缺少 Chrome（交付模式不可用）'
      : ready.fonts && ready.formulas
        ? '数学渲染与成片可用；字体已过缺字体基线、公式已过构造检查'
        : '数学渲染与成片可用；字体或公式有问题（见下表）'

  const { fonts, cjkFonts, formulas, api, functions, rates } = summarizeProbe(probe)
  const report = {
    ready,
    source,
    summary,
    rows,
    fonts: {
      ok: fontsOk,
      cjk: cjkFonts,
      latin: fonts.filter((row) => row.kind === 'latin' && row.resolved).map((row) => row.family),
      display: fonts.filter((row) => row.kind === 'display' && row.resolved).map((row) => row.family),
      unavailable: fonts.filter((row) => !row.resolved).map((row) => row.family),
    },
    formulas: { ok: formulasOk, samples: formulas },
    api,
    functions,
    rates,
    errors: probe.errors ?? [],
    fingerprint: fp,
    created: new Date().toISOString(),
  }
  const written = writeAnyCache(candidates, fp, report)

  return {
    ...report,
    cached: { hit: false, ageSec: 0, ttlSec, file: written },
    elapsedMs: Date.now() - started,
  }
}
