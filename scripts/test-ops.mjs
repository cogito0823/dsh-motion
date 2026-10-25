/**
 * 纯 Node 单元测试：不联网、不跑 Python、不碰视频。
 *
 * 钉住 lib/ 里那些"模型看不到的不变量"：
 *   - summarizeRender 能否从渲染器输出里稳定抽出时长/分辨率/布局问题；
 *   - normalizePost 是否把脏参数挡在 ffmpeg 之前；
 *   - probe 的网格、亮度解析与空镜判据是否符合 limited range；
 *   - pluginSource 报的是不是当前这份代码。
 *
 * 用法：node scripts/test-ops.mjs
 */
import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

import { pluginSource } from '../lib/doctor.js'
import { isBlankFrame, normalizePost, parseSignalStats, summarizeRender, tileGrid } from '../lib/ops.js'

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

// —— tileGrid：网格要装得下请求的帧数 ——
test('tileGrid 按帧数选网格', () => {
  assert.equal(tileGrid(2), '2x1')
  assert.equal(tileGrid(4), '2x2')
  assert.equal(tileGrid(6), '3x2')
  assert.equal(tileGrid(9), '3x3')
  assert.equal(tileGrid(12), '4x3')
  assert.equal(tileGrid(16), '4x4')
  assert.equal(tileGrid(24), '6x4')
})

// —— signalstats：从 ffmpeg 的 metadata 输出里读回每帧亮度范围 ——
const SIGNAL_FIXTURE = `frame:0    pts:0       pts_time:0
lavfi.signalstats.YMIN=16
lavfi.signalstats.YLOW=16
lavfi.signalstats.YAVG=16
lavfi.signalstats.YHIGH=16
lavfi.signalstats.YMAX=16
frame:1    pts:512     pts_time:0.017
lavfi.signalstats.YMIN=16
lavfi.signalstats.YLOW=40
lavfi.signalstats.YAVG=120.5
lavfi.signalstats.YHIGH=200
lavfi.signalstats.YMAX=235
`

test('parseSignalStats 逐帧读回 YMIN/YAVG/YMAX', () => {
  const frames = parseSignalStats(SIGNAL_FIXTURE)
  assert.equal(frames.length, 2)
  assert.deepEqual(frames[0], { frame: 0, ymin: 16, yavg: 16, ymax: 16 })
  assert.deepEqual(frames[1], { frame: 1, ymin: 16, yavg: 120.5, ymax: 235 })
})

test('parseSignalStats 空输出不报错', () => {
  assert.deepEqual(parseSignalStats(''), [])
})

// —— 空镜判据：limited range 的黑是 16、白是 235 ——
test('isBlankFrame 认得出纯黑与纯白', () => {
  assert.equal(isBlankFrame({ ymin: 16, ymax: 16 }), true)
  assert.equal(isBlankFrame({ ymin: 16, yavg: 16, ymax: 18 }), true)
  assert.equal(isBlankFrame({ ymin: 235, ymax: 235 }), true)
  assert.equal(isBlankFrame({ ymin: 232, yavg: 234, ymax: 235 }), true)
})

test('isBlankFrame 不误杀正常画面', () => {
  // 暗场风格：黑底 16 + 亮线 235，是最常见的正常帧
  assert.equal(isBlankFrame({ ymin: 16, yavg: 30, ymax: 235 }), false)
  assert.equal(isBlankFrame({ ymin: 16, yavg: 120, ymax: 200 }), false)
  assert.equal(isBlankFrame({}), false)
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
