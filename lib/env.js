/**
 * 路径与外部命令解析。不写死任何本机路径。
 *
 * 解析顺序：插件配置 → 环境变量 → 默认目录 → 系统 PATH。
 */

import { accessSync, constants, existsSync, readdirSync, statSync } from 'node:fs'
import { homedir } from 'node:os'
import { delimiter, join } from 'node:path'

export function motionHome(config = {}) {
  return config.motionHome
    ?? process.env.MOTION_HOME
    ?? join(process.env.DSH_HOME ?? join(homedir(), '.dsh'), 'data', 'dsh-motion')
}

export function isExecutable(file) {
  try {
    accessSync(file, constants.X_OK)
    return statSync(file).isFile()
  } catch {
    return false
  }
}

/** 在 PATH 里查找可执行文件，不经过 shell。 */
export function findOnPath(name) {
  const dirs = (process.env.PATH ?? '').split(delimiter).filter(Boolean)
  const exts = process.platform === 'win32'
    ? (process.env.PATHEXT ?? '.EXE;.CMD;.BAT').split(';').filter(Boolean)
    : ['']
  for (const dir of dirs) {
    for (const ext of exts) {
      const candidate = join(dir, name + ext)
      if (isExecutable(candidate)) return candidate
    }
  }
  return null
}

/** venv 根目录：配置 > 环境变量 > $DSH_HOME/data/dsh-motion/venv */
export function resolveVenv(config = {}) {
  return config.venv ?? process.env.MOTION_VENV ?? join(motionHome(config), 'venv')
}

export function venvBinary(config, name) {
  const root = resolveVenv(config)
  return process.platform === 'win32'
    ? join(root, 'Scripts', `${name}.exe`)
    : join(root, 'bin', name)
}

export function hasVenv(config = {}) {
  return isExecutable(venvBinary(config, 'python'))
}

/** 外部命令：配置 > 环境变量 > PATH > 常见安装位置。 */
export function resolveBinary(config = {}, name) {
  const key = name.toLowerCase()
  const configured = config[key]
    ?? process.env[`MOTION_${key.toUpperCase()}`]
  if (configured) return configured
  const found = findOnPath(name)
  if (found) return found
  const fallbacks = process.platform === 'darwin'
    ? ['/opt/homebrew/bin', '/usr/local/bin', '/usr/bin']
    : ['/usr/local/bin', '/usr/bin', '/bin']
  for (const dir of fallbacks) {
    const candidate = join(dir, name)
    if (isExecutable(candidate)) return candidate
  }
  return name
}

export function chromePath() {
  const candidates = process.platform === 'darwin'
    ? ['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome']
    : process.platform === 'win32'
      ? ['C:/Program Files/Google/Chrome/Application/chrome.exe']
      : ['/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser']
  return candidates.find((p) => existsSync(p)) ?? null
}

/** 最新 npx 缓存里的 hyperframes（只用于 doctor 报告，不作为依赖）。 */
export function findHyperframes() {
  const npxRoot = join(process.env.HOME ?? homedir(), '.npm', '_npx')
  if (existsSync(npxRoot)) {
    for (const dir of readdirSync(npxRoot)) {
      const candidate = join(npxRoot, dir, 'node_modules', 'hyperframes', 'package.json')
      if (existsSync(candidate)) return candidate
    }
  }
  return findOnPath('hyperframes')
}
