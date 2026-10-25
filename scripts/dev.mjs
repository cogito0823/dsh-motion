#!/usr/bin/env node
/**
 * 不经过 Harness 的开发 CLI：直接调用 lib/ops.js。
 *
 *   node scripts/dev.mjs frames <scene.py> [t1,t2,...]
 *   node scripts/dev.mjs render <scene.py> [--fps 30] [--out path]
 *   node scripts/dev.mjs probe <video.mp4>
 *   node scripts/dev.mjs doctor
 */
import { mkdirSync } from 'node:fs'
import { basename, dirname, join } from 'node:path'

import { inspectFrames, probeVideo, renderScene } from '../lib/ops.js'
import { doctor } from '../lib/doctor.js'

const [cmd, file, ...rest] = process.argv.slice(2)

function fail(message) {
  console.error(message)
  process.exit(1)
}

function elapsed(start) {
  return `${((Date.now() - start) / 1000).toFixed(1)}s`
}

if (!cmd) fail('用法: node scripts/dev.mjs frames|render|probe|doctor ...')

function outputDir() {
  mkdirSync('out', { recursive: true })
  return 'out'
}

function slugOf(path) {
  const dir = dirname(path)
  return dir === '.' ? basename(path, '.py') : basename(dir)
}

if (cmd === 'frames') {
  if (!file) fail('缺少场景文件')
  const times = (rest[0] ?? '').split(',').filter(Boolean)
  const started = Date.now()
  const result = await inspectFrames({}, {
    file,
    times,
    out: join(outputDir(), `${slugOf(file)}-frames.png`),
  })
  console.log(JSON.stringify({ ...result, elapsed: elapsed(started) }, null, 2))
} else if (cmd === 'render') {
  if (!file) fail('缺少场景文件')
  const fpsIndex = rest.indexOf('--fps')
  const outIndex = rest.indexOf('--out')
  const started = Date.now()
  const result = await renderScene({}, {
    file,
    fps: fpsIndex >= 0 ? Number(rest[fpsIndex + 1]) : 30,
    out: outIndex >= 0 ? rest[outIndex + 1] : join(outputDir(), `${slugOf(file)}.mp4`),
  })
  console.log(JSON.stringify({ ...result, elapsed: elapsed(started) }, null, 2))
} else if (cmd === 'probe') {
  if (!file) fail('缺少视频文件')
  const started = Date.now()
  console.log(JSON.stringify({ ...(await probeVideo({}, { video: file })), elapsed: elapsed(started) }, null, 2))
} else if (cmd === 'doctor') {
  console.log(JSON.stringify(await doctor({}), null, 2))
} else {
  fail(`未知命令: ${cmd}`)
}
