/**
 * Python 环境自愈：建 venv、装 manimgx/sympy（可选 TTS 依赖）。
 *
 * 为什么需要它：模型的 bash 受 workspace-write 沙箱限制，而 venv 默认在
 * `~/.dsh/data/dsh-motion/venv`（工作区外）。doctor 里那句
 * `python3 -m venv ~/.dsh/...` 会被 EPERM 拒绝，模型只好申请
 * danger-full-access、再手动 pip install——一次 40 s 起。
 *
 * 这个模块跑在 Harness 宿主进程里，不受模型 bash 沙箱限制；通过
 * `motion_setup` 工具暴露，模型只传 force/tts 两个布尔值。
 */

import { execFile } from 'node:child_process'
import { existsSync, rmSync } from 'node:fs'
import { homedir } from 'node:os'
import { resolve } from 'node:path'
import { promisify } from 'node:util'

import { findOnPath, resolveVenv, venvBinary } from './env.js'

const exec = promisify(execFile)

/** 优先 3.13：manimgx 0.1.x 的 wheel 目前覆盖到 3.13；3.15 会装不上。 */
const PYTHON_CANDIDATES = ['python3.13', 'python3.12', 'python3.11', 'python3']
export const DEFAULT_PACKAGES = ['manimgx', 'sympy', 'manimgx-fonts', 'manimgx-fonts-cjk']
export const TTS_PACKAGES = ['edge-tts', 'numpy']
const DEFAULT_TIMEOUT_MS = 900_000
const VERSION_TIMEOUT_MS = 15_000

/** 包名 → 可 import 的模块名（edge-tts → edge_tts）。 */
export function moduleNameOf(packageName) {
  return String(packageName).replace(/-/g, '_')
}

/** force 会删目录，先挡住 /、$HOME 这类明显不该删的路径。 */
export function assertSafeVenv(venv) {
  const path = resolve(String(venv))
  if (path === '/' || path === resolve(homedir()) || path.length < 8) {
    throw new Error(`拒绝删除可疑 venv 路径: ${path}`)
  }
  return path
}

/** 解析可用的 Python：配置 > 环境变量 > 3.13/3.12/3.11/python3。 */
export function pythonCandidates(config = {}) {
  const configured = config.python ?? process.env.MOTION_PYTHON
  if (configured) return [configured]
  const found = []
  for (const name of PYTHON_CANDIDATES) {
    const path = findOnPath(name)
    if (path && !found.includes(path)) found.push(path)
  }
  return found
}

async function pythonVersion(bin, run = exec) {
  try {
    const { stdout } = await run(bin, ['-c', 'import sys; print(".".join(map(str, sys.version_info[:3])))'], {
      timeout: VERSION_TIMEOUT_MS,
    })
    const version = stdout.trim()
    const major = Number(version.split('.')[0])
    const minor = Number(version.split('.')[1])
    return { version, ok: Number.isFinite(major) && Number.isFinite(minor) && (major > 3 || (major === 3 && minor >= 10)) }
  } catch {
    return null
  }
}

/** 选第一个能跑且 >=3.10 的解释器；优先 3.13。 */
export async function pickPython(config = {}, run = exec) {
  for (const bin of pythonCandidates(config)) {
    const found = await pythonVersion(bin, run)
    if (found?.ok) return { bin, version: found.version }
  }
  throw new Error(
    '找不到可用的 Python（需要 3.10+，推荐 3.13）。\n'
    + 'macOS: brew install python@3.13；或设置 MOTION_PYTHON=/path/to/python3.13',
  )
}

async function hasModule(python, packageName, run = exec) {
  try {
    await run(python, ['-c', `import ${moduleNameOf(packageName)}`], { timeout: VERSION_TIMEOUT_MS })
    return true
  } catch {
    return false
  }
}

async function installedVersions(python, packages, run = exec) {
  const modules = packages.map(moduleNameOf).join(', ')
  const script = [
    'import json',
    'from importlib.metadata import version',
    `mods = {${packages.map((pkg) => `${JSON.stringify(moduleNameOf(pkg))}: ${JSON.stringify(pkg)}`).join(', ')}}`,
    `out = {}`,
    `for mod, dist in mods.items():`,
    `    try:`,
    `        __import__(mod)`,
    `        out[dist] = version(dist)`,
    `    except Exception:`,
    `        out[dist] = None`,
    `print(json.dumps(out))`,
  ].join('\n')
  try {
    const { stdout } = await run(python, ['-c', script], { timeout: VERSION_TIMEOUT_MS })
    return JSON.parse(stdout.trim() || '{}')
  } catch {
    return Object.fromEntries(packages.map((pkg) => [pkg, null]))
  }
}

/**
 * 创建/修复 venv。幂等：已有的包不重装；缺哪个装哪个。
 * @param {object} config 插件配置（venv / python / packages）
 * @param {{force?: boolean, tts?: boolean, packages?: string[], run?: Function, onProgress?: Function}} options
 */
export async function ensureVenv(config = {}, options = {}) {
  const started = Date.now()
  const run = options.run ?? exec
  const onProgress = options.onProgress ?? (() => {})
  const venv = resolve(resolveVenv(config))
  const python = venvBinary({ ...config, venv }, 'python')
  const force = options.force === true
  const configured = Array.isArray(config.packages) && config.packages.length > 0
    ? config.packages
    : null
  const packages = options.packages ?? configured ?? [
    ...DEFAULT_PACKAGES,
    ...(options.tts === true || config.tts === true ? TTS_PACKAGES : []),
  ]

  if (force) {
    assertSafeVenv(venv)
    onProgress(`删除旧 venv: ${venv}`)
    rmSync(venv, { recursive: true, force: true })
  }

  const created = !existsSync(python)
  let base = null
  if (created) {
    const picked = await pickPython(config, run)
    base = picked.bin
    onProgress(`创建 venv: ${venv}（${picked.version}）`)
    try {
      await run(picked.bin, ['-m', 'venv', venv], {
        timeout: DEFAULT_TIMEOUT_MS,
        maxBuffer: 8 * 1024 * 1024,
      })
    } catch (error) {
      const detail = String(error?.stderr || error?.stdout || error?.message || '').trim().slice(0, 400)
      throw new Error(`创建 venv 失败（${picked.bin}）：${detail}`)
    }
  }

  if (!existsSync(python)) {
    throw new Error(`venv 创建后仍找不到 python: ${python}`)
  }

  const missing = []
  for (const pkg of packages) {
    if (!(await hasModule(python, pkg, run))) missing.push(pkg)
  }

  let installed = []
  if (missing.length > 0) {
    onProgress(`安装: ${missing.join(', ')}`)
    try {
      await run(python, ['-m', 'pip', 'install', '--disable-pip-version-check', ...missing], {
        timeout: DEFAULT_TIMEOUT_MS,
        maxBuffer: 16 * 1024 * 1024,
      })
      installed = missing
    } catch (error) {
      const detail = String(error?.stderr || error?.stdout || error?.message || '').trim().split('\n').slice(-3).join(' ')
      throw new Error(
        `pip install 失败：${detail.slice(0, 500)}\n`
        + 'manimgx 目前优先支持 Python 3.13；可设置 MOTION_PYTHON=/path/to/python3.13 后重试 motion_setup。',
      )
    }
  }

  const versions = await installedVersions(python, packages, run)
  const stillMissing = packages.filter((pkg) => versions[pkg] == null)
  if (stillMissing.length > 0) {
    throw new Error(
      `安装后仍无法导入: ${stillMissing.join(', ')}\n`
      + `可手动检查: ${python} -m pip install ${stillMissing.join(' ')}`,
    )
  }

  return {
    venv,
    python,
    basePython: base,
    created,
    force,
    packages,
    installed,
    versions,
    ready: existsSync(python),
    elapsedMs: Date.now() - started,
  }
}
