#!/usr/bin/env node
/**
 * 运行账本报表：把 <project>/.dsh-motion/metrics.jsonl 汇总成
 * compute（active）/ wall / 端到端 三个口径，避免再拿 compute 的百分比
 * 当端到端收益。
 *
 *   node scripts/run-report.mjs <project>
 *   node scripts/run-report.mjs <project> --wall 752
 *   node scripts/run-report.mjs <project> --json
 */
import { existsSync } from 'node:fs'
import { resolve } from 'node:path'

import { aggregateMetrics, findMetricsFiles, readMetrics } from '../lib/metrics.js'

const HELP = `用法: node scripts/run-report.mjs <project> [选项]

  --wall <sec>   整段端到端时间（可选）；给出后计算 active / wall 占比
  --file <file>  只读指定 metrics.jsonl
  --json         输出机器可读结果
`

function parseArgs(argv) {
  const args = { _: [] }
  for (let i = 0; i < argv.length; i++) {
    const token = argv[i]
    if (!token.startsWith('--')) {
      args._.push(token)
      continue
    }
    const eq = token.indexOf('=')
    if (eq >= 0) {
      args[token.slice(2, eq)] = token.slice(eq + 1)
      continue
    }
    const key = token.slice(2)
    const next = argv[i + 1]
    if (next !== undefined && !next.startsWith('--')) {
      args[key] = next
      i++
    } else {
      args[key] = true
    }
  }
  return args
}

function main() {
  const args = parseArgs(process.argv.slice(2))
  if (args.help) {
    console.log(HELP)
    return
  }
  const project = resolve(args._[0] ?? '.')
  const files = args.file
    ? [resolve(args.file)]
    : findMetricsFiles(project)
  const existing = files.filter((file) => existsSync(file))
  if (!existing.length) {
    throw new Error(
      `没有找到 metrics.jsonl（找过 ${files.length ? files.join(', ') : project}）\n`
      + '先跑一次 motion_frames / motion_render / narrate / mix；账本写在 <project>/.dsh-motion/metrics.jsonl。',
    )
  }

  const events = existing.flatMap((file) => readMetrics(project, file))
  if (!events.length) throw new Error(`metrics 文件为空: ${existing.join(', ')}`)
  const aggregate = aggregateMetrics(events)
  const wallSec = args.wall === undefined ? null : Number(args.wall)
  const ratio = wallSec && wallSec > 0
    ? Number(((aggregate.total.activeSec / wallSec) * 100).toFixed(1))
    : null

  const payload = {
    project,
    files: existing,
    wallSec: Number.isFinite(wallSec) ? wallSec : null,
    activeSec: aggregate.total.activeSec,
    activePercentOfWall: ratio,
    ...aggregate,
  }

  if (args.json) {
    console.log(JSON.stringify(payload, null, 2))
    return
  }

  console.log(`project ${project}`)
  console.log('phase        count   active(s)   wall(s)   cache')
  for (const item of aggregate.phases) {
    console.log(
      `${item.phase.padEnd(12)} ${String(item.count).padStart(5)} `
      + `${item.activeSec.toFixed(2).padStart(10)} ${item.wallSec.toFixed(2).padStart(9)} `
      + `${String(item.cacheHits).padStart(7)}`,
    )
  }
  console.log(
    `${'TOTAL'.padEnd(12)} ${String(aggregate.total.count).padStart(5)} `
    + `${aggregate.total.activeSec.toFixed(2).padStart(10)} ${aggregate.total.wallSec.toFixed(2).padStart(9)} `
    + `${String(aggregate.total.cacheHits).padStart(7)}`,
  )
  if (ratio != null) {
    console.log(`active ${aggregate.total.activeSec.toFixed(2)}s / wall ${wallSec}s = ${ratio}%`)
  }
  console.log(`ledger ${existing.join(', ')}`)
}

try {
  main()
} catch (error) {
  console.error(error?.message ?? String(error))
  process.exit(1)
}
