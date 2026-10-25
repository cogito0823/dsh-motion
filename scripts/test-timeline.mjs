#!/usr/bin/env node
/**
 * 时间轴校验单元测试：顺序、越界、旁白迟到/压拍、strict 退出码。
 */
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { parseDurationToSec, validateTimeline } from '../lib/timeline.js'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')

assert.equal(parseDurationToSec(30), 30)
assert.equal(parseDurationToSec('30s'), 30)
assert.equal(parseDurationToSec('1m'), 60)
assert.equal(parseDurationToSec('1m30s'), 90)
assert.equal(parseDurationToSec('00:30'), 30)
assert.equal(parseDurationToSec('00:01:30'), 90)
assert.equal(parseDurationToSec('nope'), null)
assert.equal(parseDurationToSec(-1), null)

const base = {
  version: 1,
  durationSec: 10,
  cues: [
    { id: 'hook', at: 0, hold: 2, lineId: 1 },
    { id: 'point', at: 2.5, hold: 3, lineId: 2 },
    { id: 'close', at: 6, hold: 2.5, lineId: 3 },
  ],
}
const timing = {
  duration: 10,
  lines: [
    { id: 1, start: 0.1, end: 1.8 },
    { id: 2, start: 2.6, end: 5.2 },
    { id: 3, start: 6.1, end: 8.2 },
  ],
}

let result = validateTimeline(base, { timing })
assert.equal(result.ok, true)
assert.equal(result.strictOk, true, JSON.stringify(result.issues))
assert.equal(result.summary.cues, 3)
assert.equal(result.summary.lastCueEndSec, 8.5)

// 重复 id
result = validateTimeline({ ...base, cues: [...base.cues, { id: 'hook', at: 9 }] })
assert.equal(result.ok, false)
assert.ok(result.issues.some((issue) => issue.code === 'duplicate-id'))

// 乱序
result = validateTimeline({ ...base, cues: [{ id: 'a', at: 5 }, { id: 'b', at: 2 }] })
assert.ok(result.issues.some((issue) => issue.code === 'order'))

// 超出片长
result = validateTimeline({ ...base, cues: [{ id: 'a', at: 9, hold: 3 }] })
assert.ok(result.issues.some((issue) => issue.code === 'beyond-duration'))

// 旁白晚于画面 0.7s：warn，strict 不通过
const late = {
  ...timing,
  lines: timing.lines.map((line) => (line.id === 2 ? { ...line, start: 3.2 } : line)),
}
result = validateTimeline(base, { timing: late })
assert.equal(result.ok, true)
assert.equal(result.strictOk, false)
const lateIssue = result.issues.find((issue) => issue.code === 'narration-late')
assert.ok(lateIssue, JSON.stringify(result.issues))
assert.equal(lateIssue.driftSec, 0.7)

// 旁白压到下一拍
const overlap = {
  ...timing,
  lines: timing.lines.map((line) => (line.id === 1 ? { ...line, end: 3.0 } : line)),
}
result = validateTimeline(base, { timing: overlap })
assert.ok(result.issues.some((issue) => issue.code === 'narration-overlap'))

// 旁白没有 cue
result = validateTimeline(base, { timing: { ...timing, lines: [...timing.lines, { id: 4, start: 8.5, end: 9.5 }] } })
assert.ok(result.issues.some((issue) => issue.code === 'unmapped-line'))

// CLI：正常退出 0；--strict + 迟到退出 1
const dir = mkdtempSync(join(tmpdir(), 'dsh-motion-timeline-'))
try {
  const project = join(dir, 'project')
  mkdirSync(join(project, 'audio', 'edge'), { recursive: true })
  writeFileSync(join(project, 'timeline.json'), JSON.stringify(base))
  writeFileSync(join(project, 'audio', 'edge', 'timing.json'), JSON.stringify(timing))
  let cli = spawnSync(process.execPath, [join(root, 'scripts', 'timeline-check.mjs'), project, '--json'], { encoding: 'utf8' })
  assert.equal(cli.status, 0, cli.stderr)
  assert.equal(JSON.parse(cli.stdout).ok, true)

  writeFileSync(join(project, 'audio', 'edge', 'timing.json'), JSON.stringify(late))
  cli = spawnSync(process.execPath, [join(root, 'scripts', 'timeline-check.mjs'), project, '--strict'], { encoding: 'utf8' })
  assert.equal(cli.status, 1, cli.stdout)
  assert.match(cli.stdout, /narration-late/)
} finally {
  rmSync(dir, { recursive: true, force: true })
}

console.log('ok  timeline: duration / order / bounds / narration late / strict')
