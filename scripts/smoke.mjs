/**
 * 冒烟测试：不依赖网络与 Python，验证包结构与核心模块可加载。
 * 用法：node scripts/smoke.mjs
 */
import { existsSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const required = [
  'package.json',
  'cordis.patch.yml',
  'lib/index.js',
  'lib/ops.js',
  'lib/env.js',
  'lib/doctor.js',
  'lib/fresh.js',
  'skills/animation-router/SKILL.md',
  'skills/animation-router/references/confirmation.md',
  'skills/design-spec/SKILL.md',
  'skills/qa-rubric/SKILL.md',
  'styles/registry.json',
  'styles/swiss-motion/STYLE.md',
  'styles/swiss-motion/tokens.json',
  'styles/swiss-motion/theme.py',
  'styles/swiss-motion/preview.jpg',
  'styles/dataviz/STYLE.md',
  'styles/dataviz/tokens.json',
  'styles/dataviz/theme.py',
  'styles/dataviz/preview.jpg',
  'styles/blueprint/STYLE.md',
  'styles/blueprint/tokens.json',
  'styles/blueprint/theme.py',
  'styles/blueprint/preview.jpg',
  'styles/whiteboard/STYLE.md',
  'styles/whiteboard/tokens.json',
  'styles/whiteboard/theme.py',
  'styles/whiteboard/preview.jpg',
  'styles/3b1b/STYLE.md',
  'styles/3b1b/tokens.json',
  'styles/3b1b/theme.py',
  'styles/3b1b/preview.jpg',
  'docs/ai-native-motion.md',
  'docs/dev-loop.md',
  'README.md',
  'LICENSE',
  'NOTICE.md',
]

let failed = 0
for (const rel of required) {
  const ok = existsSync(join(root, rel))
  if (!ok) failed++
  console.log(`${ok ? 'ok  ' : 'MISS'} ${rel}`)
}

const mod = await import(join(root, 'lib/index.js'))
console.log(`${mod.name === 'motion' ? 'ok  ' : 'FAIL'} exports name=${mod.name}`)

const ops = await import(join(root, 'lib/ops.js'))
const framesOk = typeof ops.inspectFrames === 'function' && typeof ops.parseInspectOutput === 'function'
console.log(`${framesOk ? 'ok  ' : 'FAIL'} frames-first: motion_frames helpers exported`)
if (!framesOk) failed++
console.log(`${typeof mod.apply === 'function' ? 'ok  ' : 'FAIL'} exports apply()`)
if (mod.name !== 'motion' || typeof mod.apply !== 'function') failed++

for (const slug of ['swiss-motion', 'dataviz', 'blueprint', 'whiteboard', '3b1b']) {
  const tokens = JSON.parse(readFileSync(join(root, 'styles', slug, 'tokens.json'), 'utf8'))
  const ok = tokens.name === slug && tokens.version === '1.0.0'
  if (!ok) failed++
  console.log(`${ok ? 'ok  ' : 'FAIL'} style tokens: ${tokens.name}@${tokens.version}`)
}

const { doctor } = await import(join(root, 'lib/doctor.js'))
const report = await doctor({})
console.log(`ok   doctor: ${report.rows.length} checks, math=${report.ready.math}, delivery=${report.ready.delivery}`)

if (failed > 0) {
  console.error(`\n${failed} check(s) failed`)
  process.exit(1)
}
console.log('\nsmoke passed')
