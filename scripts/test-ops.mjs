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
import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, utimesSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { assertApproved, assertBrief, readApprovals } from '../lib/approvals.js'
import { pluginSource } from '../lib/doctor.js'
import { writeProjectManifest } from '../lib/project.js'
import { importFresh } from '../lib/fresh.js'
import {
  isBlankFrame,
  normalizePost,
  normalizeTimes,
  parseFrameRate,
  parseInspectOutput,
  parseSignalStats,
  summarizeRender,
  tileGrid,
  videoInfoFromProbe,
} from '../lib/ops.js'

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
  // 深色画面：黑底 16 + 亮线 235，是最常见的正常帧
  assert.equal(isBlankFrame({ ymin: 16, yavg: 30, ymax: 235 }), false)
  assert.equal(isBlankFrame({ ymin: 16, yavg: 120, ymax: 200 }), false)
  assert.equal(isBlankFrame({}), false)
})

// —— 极简模式：解析 manimgx inspect 的输出，只出帧不编码 ——
const INSPECT_FIXTURE = `/tmp/scene.py: T, 3.70 s, 3 plays
storyboard: /tmp/sheet.png, /tmp/sheet-2.png
  #0   0.00– 1.20s  scene.py:13  Create(Axes)
layout: 1 problem
  [1] t=0.3–1.5s (scene.py:5)  t (Text '长标题'): 1.48 past the right edge
`

test('parseInspectOutput 读出片名/时长/多张 sheet 与 layout 问题', () => {
  const parsed = parseInspectOutput(INSPECT_FIXTURE)
  assert.equal(parsed.scene, 'T')
  assert.equal(parsed.durationSec, 3.7)
  assert.equal(parsed.plays, 3)
  assert.deepEqual(parsed.storyboard, ['/tmp/sheet.png', '/tmp/sheet-2.png'])
  assert.equal(parsed.layoutOk, false)
  assert.equal(parsed.layoutProblems.length, 1)
  assert.match(parsed.layoutProblems[0], /past the right edge/)
  assert.deepEqual(parsed.layoutIssues, [{ index: 1, message: parsed.layoutProblems[0] }])
})

test('parseInspectOutput 认 0 problem 与空输出', () => {
  const ok = parseInspectOutput('scene.py: T, 1.00 s, 1 play\nstoryboard: a.png\nlayout: no problems in 4 samples\n')
  assert.equal(ok.layoutOk, true)
  assert.deepEqual(ok.layoutProblems, [])
  assert.equal(parseInspectOutput('').scene, null)
})

test('normalizeTimes 只放行秒数与 end', () => {
  assert.deepEqual(normalizeTimes(['1.5', 'end', 2]), ['1.5', 'end', '2'])
  assert.deepEqual(normalizeTimes(undefined), [])
  assert.throws(() => normalizeTimes(['-1']))
  assert.throws(() => normalizeTimes(['abc']))
  assert.throws(() => normalizeTimes(Array.from({ length: 25 }, (_, i) => String(i))))
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

// —— approvals：工具层的开工确认硬门 ——
{
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'dsh-approvals-gate-')))
  const ws = join(root, 'dsh-motion-projects')
  const dir = join(ws, 'gate')
  mkdirSync(dir, { recursive: true })
  const scene = join(dir, 'scene.py')
  writeFileSync(scene, 'pass\n')
  writeProjectManifest(dir, { name: 'gate' })
  const opts = { workspace: ws }
  let missing = false
  try { assertApproved(scene, opts) } catch { missing = true }
  if (missing) console.log('ok   assertApproved 拒绝缺少 APPROVALS.json')
  else { failed++; console.log('FAIL assertApproved 拒绝缺少 APPROVALS.json') }

  mkdirSync(dir, { recursive: true })
  writeFileSync(join(dir, 'APPROVALS.json'), JSON.stringify({
    mode: 'standard',
    stages: {
      requirements: { label: '需求', status: 'approved' },
      delivery: { label: '交付清单', status: 'pending' },
      start: { label: '开工', status: 'pending' },
    },
  }))
  const report = readApprovals(scene, opts)
  if (report.status === 'pending' && report.missing.includes('交付清单')) {
    console.log('ok   readApprovals 报出缺失的交付清单')
  } else { failed++; console.log('FAIL readApprovals 报出缺失的交付清单') }

  let blocked = false
  try { assertApproved(scene, opts) } catch { blocked = true }
  if (blocked) console.log('ok   assertApproved 拒绝 pending 阶段')
  else { failed++; console.log('FAIL assertApproved 拒绝 pending 阶段') }

  // 出帧门：老账本 requirements 已 approved 但没有 brief，视同未确认
  let legacyBlocked = false
  try { assertBrief(scene, opts) } catch { legacyBlocked = true }
  if (legacyBlocked) console.log('ok   assertBrief 拒绝缺 brief 的老账本')
  else { failed++; console.log('FAIL assertBrief 拒绝缺 brief 的老账本') }

  const ledger = JSON.parse(readFileSync(join(dir, 'APPROVALS.json'), 'utf8'))
  ledger.stages.requirements = {
    label: '需求', status: 'approved', at: null, by: 'user', note: '',
    brief: {
      duration: '30s', aspect: '1920x1080', fps: '30fps', delivery: 'narrated',
      style: '3b1b', audience: 'high', narration: 'zh-neutral',
    },
  }
  writeFileSync(join(dir, 'APPROVALS.json'), JSON.stringify(ledger))
  const brief = assertBrief(scene, opts)
  if (brief?.brief?.delivery === 'narrated') console.log('ok   assertBrief 放行已锁定的需求')
  else { failed++; console.log('FAIL assertBrief 放行已锁定的需求') }

  // 没有账本的临时场景不拦
  const scratch = mkdtempSync(join(tmpdir(), 'dsh-scratch-'))
  const scratchScene = join(scratch, 'scene.py')
  writeFileSync(scratchScene, 'pass\n')
  if (assertBrief(scratchScene) === null) console.log('ok   assertBrief 放行临时场景')
  else { failed++; console.log('FAIL assertBrief 放行临时场景') }
  rmSync(scratch, { recursive: true, force: true })
  rmSync(root, { recursive: true, force: true })
}

test('parseFrameRate 解析 30000/1001 与 0/0', () => {
  assert.equal(parseFrameRate('30/1'), 30)
  assert.equal(parseFrameRate('30000/1001'), 29.97)
  assert.equal(parseFrameRate('0/0'), null)
  assert.equal(parseFrameRate(null), null)
})

test('videoInfoFromProbe 认 CFR 30fps', () => {
  const info = videoInfoFromProbe({
    streams: [{ width: 1920, height: 1080, r_frame_rate: '30/1', avg_frame_rate: '30/1', nb_read_frames: '900' }],
    format: { duration: '30.0', size: '10000000' },
  })
  assert.equal(info.fps, 30)
  assert.equal(info.avgFps, 30)
  assert.equal(info.frames, 900)
  assert.equal(info.expectedFrames, 900)
  assert.equal(info.frameDelta, 0)
  assert.equal(info.vfr, false)
  assert.equal(info.cfr, true)
})

test('videoInfoFromProbe 认 VFR raw（621 帧 / 30.033s / 20.68fps）', () => {
  const info = videoInfoFromProbe({
    streams: [{ r_frame_rate: '30/1', avg_frame_rate: '621/30.033', nb_read_frames: '621' }],
    format: { duration: '30.033' },
  })
  assert.equal(info.frames, 621)
  assert.equal(info.expectedFrames, 901)
  assert.equal(info.frameDelta, -280)
  assert.equal(info.vfr, true)
  assert.equal(info.cfr, false)
})

// —— importFresh：改文件后按 mtime 重新 import（热加载的基础） ——
{
  const dir = mkdtempSync(join(tmpdir(), 'dsh-fresh-'))
  const file = join(dir, 'mod.mjs')
  const url = new URL(`file://${file}`)
  writeFileSync(file, 'export const value = 1\n')
  const first = await importFresh(url)
  writeFileSync(file, 'export const value = 2\n')
  utimesSync(file, new Date(), new Date(Date.now() + 2000))
  const second = await importFresh(url)
  if (first.value === 1 && second.value === 2) {
    console.log('ok   importFresh 按 mtime 重新加载')
  } else {
    failed++
    console.log('FAIL importFresh 按 mtime 重新加载')
  }
}

if (failed > 0) {
  console.error(`\n${failed} test(s) failed`)
  process.exit(1)
}
console.log('\ntest-ops passed')
