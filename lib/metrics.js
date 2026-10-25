/**
 * 每个项目一份轻量运行账本：<project>/.dsh-motion/metrics.jsonl
 *
 * 目的不是精确计费，而是让“compute / wall / 端到端”有一个共同分母。
 * 一条事件：
 *   { at, phase, activeSec, wallSec, cacheHits?, ...detail }
 * phase: setup | timeline | tts | frames | render | probe | mix | assemble
 */

import { appendFileSync, existsSync, mkdirSync, readFileSync, readdirSync } from 'node:fs'
import { dirname, join } from 'node:path'

import { resolveProject } from './project.js'

const SKIP = new Set(['node_modules', '.git', 'out', 'audio'])

/** 项目根由 lib/project.js 统一决定；越界/嵌套/无 manifest 都返回 null。 */
export function projectRootOf(target) {
  try {
    return resolveProject(target, { mustExist: false }).root
  } catch {
    return null
  }
}

/** 账本路径；target 可以是项目目录、场景文件或视频文件。 */
export function metricsFileOf(target) {
  const root = projectRootOf(target)
  return root ? join(root, '.dsh-motion', 'metrics.jsonl') : null
}

/**
 * 追加一条事件。写不进去（沙箱/只读）就静默跳过，不能影响主流程。
 * @returns {string|null} 实际写入的文件
 */
export function recordMetric(target, event) {
  if (!event || typeof event !== 'object' || !event.phase) return null
  try {
    const file = metricsFileOf(target)
    if (!file) return null
    const at = event.at ?? new Date().toISOString()
    const activeSec = Number(event.activeSec ?? event.wallSec ?? 0)
    const wallSec = Number(event.wallSec ?? event.activeSec ?? 0)
    const payload = {
      ...event,
      at,
      phase: String(event.phase),
      activeSec: Number.isFinite(activeSec) ? Number(activeSec.toFixed(3)) : 0,
      wallSec: Number.isFinite(wallSec) ? Number(wallSec.toFixed(3)) : 0,
    }
    mkdirSync(dirname(file), { recursive: true })
    appendFileSync(file, `${JSON.stringify(payload)}\n`)
    return file
  } catch {
    return null
  }
}

/** 读一个项目的账本；没有文件时返回空数组。 */
export function readMetrics(target, file) {
  try {
    const path = file ?? metricsFileOf(target)
    if (!path || !existsSync(path)) return []
    return readFileSync(path, 'utf8')
      .split('\n')
      .filter(Boolean)
      .map((line) => JSON.parse(line))
      .filter((event) => event && event.phase)
  } catch {
    return []
  }
}

/** 聚合：按 phase 汇总 count / activeSec / wallSec / cacheHits。 */
export function aggregateMetrics(events) {
  const phases = {}
  let totalActive = 0
  let totalWall = 0
  for (const event of events) {
    const phase = String(event.phase)
    const active = Number(event.activeSec ?? event.wallSec ?? 0) || 0
    const wall = Number(event.wallSec ?? event.activeSec ?? 0) || 0
    const item = phases[phase] ?? { phase, count: 0, activeSec: 0, wallSec: 0, cacheHits: 0 }
    item.count += 1
    item.activeSec = Number((item.activeSec + active).toFixed(3))
    item.wallSec = Number((item.wallSec + wall).toFixed(3))
    item.cacheHits += Number(event.cacheHits ?? 0) || 0
    phases[phase] = item
    totalActive += active
    totalWall += wall
  }
  return {
    phases: Object.values(phases).sort((a, b) => b.activeSec - a.activeSec),
    total: {
      count: events.length,
      activeSec: Number(totalActive.toFixed(3)),
      wallSec: Number(totalWall.toFixed(3)),
      cacheHits: Object.values(phases).reduce((sum, item) => sum + item.cacheHits, 0),
    },
  }
}

/** 递归找项目下所有 metrics.jsonl（run-report 用；跳过 out/node_modules）。 */
export function findMetricsFiles(root, depth = 0) {
  const found = []
  if (depth > 3) return found
  let entries
  try {
    entries = readdirSync(root, { withFileTypes: true })
  } catch {
    return found
  }
  for (const entry of entries) {
    if (!entry.isDirectory()) continue
    const path = join(root, entry.name)
    if (entry.name === '.dsh-motion') {
      const file = join(path, 'metrics.jsonl')
      if (existsSync(file)) found.push(file)
      continue
    }
    if (SKIP.has(entry.name)) continue
    found.push(...findMetricsFiles(path, depth + 1))
  }
  return found
}
