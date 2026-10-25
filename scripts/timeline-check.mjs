#!/usr/bin/env node
/**
 * 时间轴自检：定稿前跑一次，先于 motion_render。
 *
 *   node scripts/timeline-check.mjs <project>
 *   node scripts/timeline-check.mjs <project> --strict --json
 *   node scripts/timeline-check.mjs --timeline path/to/timeline.json --duration 30
 *
 * 检查：cue 重复/乱序/超出片长、cue 结束越界、旁白晚于画面、旁白压到下一拍、
 * timing 与片长不一致、旁白没有对应 cue。error 退出 1；--strict 时 warn 也退出 1。
 */
import { existsSync, readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'

import { readApprovals } from '../lib/approvals.js'
import { parseDurationToSec, timingFromJson, validateTimeline } from '../lib/timeline.js'

const HELP = `用法: node scripts/timeline-check.mjs <project|timeline.json> [选项]

  --timeline <file>   显式指定 timeline.json
  --timing <file>     显式指定 audio/edge/timing.json（默认自动找 edge/say）
  --duration <value>  片长，支持 30 / 30s / 1m / 00:30；默认读 timeline.durationSec 或 APPROVALS
  --late <sec>        旁白相对画面允许的迟到，默认 0.35
  --strict            warn 也视为失败
  --json              输出机器可读结果
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

function fail(message) {
  console.error(message)
  process.exit(1)
}

function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'))
}

function pickTimeline(project, explicit) {
  if (explicit) return resolve(explicit)
  if (project.endsWith('.json')) return resolve(project)
  return join(resolve(project), 'timeline.json')
}

function pickTiming(project, explicit) {
  if (explicit) return resolve(explicit)
  const candidates = [
    join(project, 'audio', 'edge', 'timing.json'),
    join(project, 'audio', 'say', 'timing.json'),
  ]
  return candidates.find((candidate) => existsSync(candidate)) ?? null
}

function main() {
  const args = parseArgs(process.argv.slice(2))
  if (args.help) {
    console.log(HELP)
    return
  }
  const target = args._[0] ?? '.'
  const project = target.endsWith('.json') ? dirname(resolve(target)) : resolve(target)
  const timelinePath = pickTimeline(project, args.timeline)
  if (!existsSync(timelinePath)) fail(`找不到 ${timelinePath}`)
  const timeline = readJson(timelinePath)

  let durationSec = parseDurationToSec(args.duration ?? timeline.durationSec)
  if (!durationSec) {
    const approvals = readApprovals(join(project, 'timeline.json'))
    durationSec = parseDurationToSec(approvals.brief?.duration)
  }

  const timingPath = pickTiming(project, args.timing)
  const timing = timingPath && existsSync(timingPath) ? timingFromJson(readJson(timingPath)) : null

  const result = validateTimeline(timeline, {
    durationSec,
    timing,
    lateThreshold: Number(args.late ?? 0.35),
  })

  const payload = {
    ok: result.ok,
    strictOk: result.strictOk,
    timeline: timelinePath,
    timing: timingPath,
    durationSec: result.summary.durationSec,
    issues: result.issues,
    summary: result.summary,
  }

  if (args.json) {
    console.log(JSON.stringify(payload, null, 2))
  } else {
    console.log(`timeline ${timelinePath}`)
    if (timingPath) console.log(`timing   ${timingPath}`)
    console.log(
      `duration ${result.summary.durationSec ?? '?'}s · cues ${result.summary.cues}`
      + ` · lines ${result.summary.lines} · errors ${result.summary.errors} · warnings ${result.summary.warnings}`,
    )
    for (const issue of result.issues) {
      console.log(`${issue.level === 'error' ? 'error' : 'warn '} [${issue.code}] ${issue.message}`)
    }
    if (!result.issues.length) console.log('ok     时间轴自检通过')
  }

  if (!result.ok || (args.strict && !result.strictOk)) process.exit(1)
}

try {
  main()
} catch (error) {
  fail(error?.message ?? String(error))
}
