/**
 * 纯 Node 单元测试：不联网、不跑 Python、不碰视频。
 *
 * 钉住 lib/ 里那些"模型看不到的不变量"：
 *   - summarizeRender 能否从渲染器输出里稳定抽出时长/分辨率/布局问题；
 *   - normalizePost 是否把脏参数挡在 ffmpeg 之前；
 *   - pluginSource 报的是不是当前这份代码。
 *
 * 用法：node scripts/test-ops.mjs
 */
import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

import { pluginSource } from '../lib/doctor.js'
import { normalizePost, summarizeRender } from '../lib/ops.js'

let failed = 0

function test(name, fn) {
  try {
    fn()
    console.log(`ok   ${name}`)
  } catch (error) {
    failed++
    console.log(`FAIL ${name}`)
    console.error(`     ${String(error.message).split('\n')[0]}`)
  }
}

// —— summarizeRender：真实渲染器输出的一行摘要 ——
test('summarizeRender 读出声画参数', () => {
  const summary = summarizeRender(
    'Derivative.mp4 12.5 s, 1280x720 at 30 fps, 4.2 MB, rendered in 61.3 s\n',
    '',
  )
  assert.equal(summary.video, 'Derivative.mp4')
  assert.equal(summary.durationSec, 12.5)
  assert.equal(summary.width, 1280)
  assert.equal(summary.height, 720)
  assert.equal(summary.fps, 30)
  assert.equal(summary.megabytes, 4.2)
  assert.equal(summary.renderedSec, 61.3)
  assert.deepEqual(summary.layoutProblems, [])
})

test('summarizeRender 也认 stderr', () => {
  const summary = summarizeRender('', 'out.mp4 1.0 s, 640x360 at 15 fps, 0.1 MB')
  assert.equal(summary.video, 'out.mp4')
  assert.equal(summary.durationSec, 1)
  assert.equal(summary.renderedSec, null)
})

test('summarizeRender 抽布局问题', () => {
  const summary = summarizeRender(
    'noise\n  [1] Text "Euler" overflows the frame\n  [2] Axes label collides\n',
    '',
  )
  assert.deepEqual(summary.layoutProblems, [
    'Text "Euler" overflows the frame',
    'Axes label collides',
  ])
  assert.equal(summary.video, null)
  assert.equal(summary.durationSec, null)
})

test('summarizeRender 不把无关方括号当问题', () => {
  const summary = summarizeRender('[build] starting\n[1]ok\n', '')
  assert.deepEqual(summary.layoutProblems, ['ok'])
})

// —— normalizePost：脏参数一律夹到合法区间 ——
test('normalizePost 默认关闭', () => {
  const post = normalizePost()
  assert.deepEqual(post, {
    subframes: 1,
    grain: 0,
    vignette: 0,
    grade: '',
    enabled: false,
  })
})

test('normalizePost 夹住 subframes', () => {
  assert.equal(normalizePost({ subframes: 99 }).subframes, 8)
  assert.equal(normalizePost({ subframes: 0 }).subframes, 1)
  assert.equal(normalizePost({ subframes: -3 }).subframes, 1)
  assert.equal(normalizePost({ subframes: 'abc' }).subframes, 1)
  assert.equal(normalizePost({ subframes: 3 }).subframes, 3)
})

test('normalizePost 接受布尔简写', () => {
  assert.equal(normalizePost({ grain: true }).grain, 7)
  assert.equal(normalizePost({ vignette: true }).vignette, 4)
  assert.equal(normalizePost({ grain: true }).enabled, true)
})

test('normalizePost 不把负数当"开启"', () => {
  const post = normalizePost({ grain: -5, vignette: -2 })
  assert.equal(post.grain, -5)
  assert.equal(post.enabled, false)
})

test('normalizePost 只认已知调色预设', () => {
  assert.equal(normalizePost({ grade: 'warm' }).enabled, true)
  assert.equal(normalizePost({ grade: 42 }).enabled, false)
})

// —— pluginSource：报的就是当前这份代码 ——
test('pluginSource 版本与 lib 路径自洽', () => {
  const source = pluginSource()
  const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'))
  assert.equal(source.version, pkg.version)
  assert.ok(['npm 安装', '本地 checkout'].includes(source.kind))
  assert.ok(existsSync(join(source.lib, 'index.js')))
  assert.ok(existsSync(join(source.lib, 'doctor.js')))
})

if (failed > 0) {
  console.error(`\n${failed} test(s) failed`)
  process.exit(1)
}
console.log('\ntest-ops passed')
