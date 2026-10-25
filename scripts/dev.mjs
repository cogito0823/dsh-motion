#!/usr/bin/env node
/**
 * 不经过 Harness 的开发 CLI：直接调用 lib/ops.js。
 *
 *   node scripts/dev.mjs frames <scene.py> [t1,t2,...]
 *   node scripts/dev.mjs render <scene.py> [--fps 30] [--out path] [--explore]
 *   node scripts/dev.mjs probe <video.mp4>
 *   node scripts/dev.mjs doctor [--force]
 *   node scripts/dev.mjs setup [--force] [--tts]
 */
import { mkdirSync } from 'node:fs'
import { basename, dirname, join, resolve } from 'node:path'

import { inspectFrames, probeVideo, renderScene } from '../lib/ops.js'
import { doctor } from '../lib/doctor.js'
import { resolveProject } from '../lib/project.js'
import { ensureVenv } from '../lib/setup.js'

const [cmd, file, ...rest] = process.argv.slice(2)

function fail(message) {
  console.error(message)
  process.exit(1)
}

function elapsed(start) {
  return `${((Date.now() - start) / 1000).toFixed(1)}s`
}

if (!cmd) fail('用法: node scripts/dev.mjs frames|render|probe|doctor|setup ...\nrender --explore 仅用于临时场景，不进入交付。')

function outputDir(file, kind) {
  const project = resolveProject(file, { allowLegacy: true })
  const dir = project.root ? join(project.root, 'out', kind) : join(dirname(resolve(file)), 'out', kind)
  mkdirSync(dir, { recursive: true })
  return dir
}

if (cmd === 'frames') {
  if (!file) fail('缺少场景文件')
  const times = (rest[0] ?? '').split(',').filter(Boolean)
  const started = Date.now()
  const result = await inspectFrames({}, {
    file,
    times,
    out: join(outputDir(file, 'frames'), `${basename(file, '.py')}.png`),
  })
  console.log(JSON.stringify({ ...result, elapsed: elapsed(started) }, null, 2))
} else if (cmd === 'render') {
  if (!file) fail('缺少场景文件')
  const fpsIndex = rest.indexOf('--fps')
  const outIndex = rest.indexOf('--out')
  const explore = rest.includes('--explore')
  const started = Date.now()
  const result = await renderScene({ allowUnconfirmed: explore, allowUnmanaged: explore }, {
    file,
    fps: fpsIndex >= 0 ? Number(rest[fpsIndex + 1]) : 30,
    out: outIndex >= 0 ? rest[outIndex + 1] : join(outputDir(file, 'render'), `${basename(file, '.py')}.mp4`),
  })
  console.log(JSON.stringify({ ...result, elapsed: elapsed(started) }, null, 2))
} else if (cmd === 'probe') {
  if (!file) fail('缺少视频文件')
  const started = Date.now()
  console.log(JSON.stringify({ ...(await probeVideo({}, { video: file })), elapsed: elapsed(started) }, null, 2))
} else if (cmd === 'setup') {
  const started = Date.now()
  const result = await ensureVenv({}, {
    force: rest.includes('--force'),
    tts: rest.includes('--tts'),
    onProgress: (message) => console.error(`· ${message}`),
  })
  console.log(JSON.stringify({ ...result, elapsed: elapsed(started) }, null, 2))
} else if (cmd === 'doctor') {
  if (rest.includes('--force')) process.env.MOTION_PREFLIGHT = 'force'
  const started = Date.now()
  const report = await doctor({})
  console.log(JSON.stringify({ ...report, elapsed: elapsed(started) }, null, 2))
} else {
  fail(`未知命令: ${cmd}`)
}
