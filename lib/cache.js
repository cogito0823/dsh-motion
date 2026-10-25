/**
 * 极简 JSON 缓存：文件指纹一致且未过期才算命中。
 *
 * 只用于「重跑一次也不该花掉一个回合」的东西（环境预检）。
 * 指纹里带 mtime + size，所以升级 manimgx、改探针脚本、换 venv 都会自动失效。
 */

import { mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'

/** 文件指纹；不存在时是 'missing'，不会被误当成命中。 */
export function statSig(file) {
  try {
    const stat = statSync(file)
    return `${stat.mtimeMs.toFixed(0)}:${stat.size}`
  } catch {
    return 'missing'
  }
}

/** 目录指纹：只取 mtime，够用来发现「包被升级/重装」。 */
export function dirSig(dir) {
  try {
    return `dir:${statSync(dir).mtimeMs.toFixed(0)}`
  } catch {
    return 'missing'
  }
}

export function readCache(file, fingerprint, ttlMs) {
  let raw
  try {
    raw = JSON.parse(readFileSync(file, 'utf8'))
  } catch {
    return null
  }
  if (!raw || typeof raw !== 'object') return null
  if (JSON.stringify(raw.fingerprint) !== JSON.stringify(fingerprint)) return null
  const ageMs = Date.now() - Number(raw.at ?? 0)
  // TTL 是上界：ttlMs=0 表示永不用缓存，不能靠「写读之间过了 1ms」才失效。
  if (!Number.isFinite(ageMs) || ageMs < 0 || ageMs >= ttlMs) return null
  return { value: raw.value, ageMs }
}

/** 写入成功返回路径；被沙箱/权限挡住时返回 null（调用方不该因此失败）。 */
export function writeCache(file, fingerprint, value) {
  try {
    mkdirSync(dirname(file), { recursive: true })
    writeFileSync(file, JSON.stringify({ fingerprint, at: Date.now(), value }), 'utf8')
    return file
  } catch {
    return null
  }
}
