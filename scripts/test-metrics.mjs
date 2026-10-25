#!/usr/bin/env node
/**
 * 运行账本测试：项目根识别、JSONL 追加、聚合、CLI compute/wall 口径。
 */
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { aggregateMetrics, findMetricsFiles, metricsFileOf, projectRootOf, readMetrics, recordMetric } from '../lib/metrics.js'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const dir = mkdtempSync(join(tmpdir(), 'dsh-motion-metrics-'))
try {
  const project = join(dir, 'film')
  mkdirSync(join(project, 'out'), { recursive: true })
  writeFileSync(join(project, 'timeline.json'), '{}')

  // 从 out/ 里的视频仍应回到项目根
  assert.equal(projectRootOf(join(project, 'out', 'clip.mp4')), project)
  assert.equal(metricsFileOf(join(project, 'out', 'clip.mp4')), join(project, '.dsh-motion', 'metrics.jsonl'))

  recordMetric(join(project, 'out', 'clip.mp4'), { phase: 'probe', activeSec: 3.5 })
  recordMetric(join(project, 'scene.py'), { phase: 'frames', activeSec: 2.4 })
  recordMetric(project, { phase: 'tts', activeSec: 20.35, cacheHits: 2 })
  recordMetric(project, { phase: 'render', activeSec: 6.42, normalized: true })

  const file = metricsFileOf(project)
  assert.deepEqual(findMetricsFiles(project), [file])
  assert.equal(readMetrics(project).length, 4)

  const aggregate = aggregateMetrics(readMetrics(project))
  assert.equal(aggregate.total.count, 4)
  assert.equal(aggregate.total.activeSec, 32.67)
  assert.equal(aggregate.total.cacheHits, 2)
  const tts = aggregate.phases.find((item) => item.phase === 'tts')
  assert.equal(tts.activeSec, 20.35)

  const cli = spawnSync(process.execPath, [
    join(root, 'scripts', 'run-report.mjs'), project, '--wall', '752', '--json',
  ], { encoding: 'utf8' })
  assert.equal(cli.status, 0, cli.stderr)
  const payload = JSON.parse(cli.stdout)
  assert.equal(payload.activeSec, 32.67)
  assert.equal(payload.wallSec, 752)
  assert.equal(payload.activePercentOfWall, 4.3)
} finally {
  rmSync(dir, { recursive: true, force: true })
}

console.log('ok  metrics: root / append / aggregate / active-vs-wall')
