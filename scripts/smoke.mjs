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
  'skills/animation-router/SKILL.md',
  'skills/design-spec/SKILL.md',
  'skills/qa-rubric/SKILL.md',
  'styles/dark-editorial/STYLE.md',
  'styles/dark-editorial/tokens.json',
  'styles/dark-editorial/theme.py',
  'styles/dark-editorial/preview.jpg',
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
console.log(`${typeof mod.apply === 'function' ? 'ok  ' : 'FAIL'} exports apply()`)
if (mod.name !== 'motion' || typeof mod.apply !== 'function') failed++

const styleTokens = JSON.parse(
  readFileSync(join(root, 'styles/dark-editorial/tokens.json'), 'utf8'),
)
const styleOk =
  styleTokens.name === 'dark-editorial' && styleTokens.version === '1.0.0'
console.log(
  `${styleOk ? 'ok  ' : 'FAIL'} style tokens: ${styleTokens.name}@${styleTokens.version}`,
)
if (!styleOk) failed++

const { doctor } = await import(join(root, 'lib/doctor.js'))
const report = await doctor({})
console.log(`ok   doctor: ${report.rows.length} checks, math=${report.ready.math}, delivery=${report.ready.delivery}`)

if (failed > 0) {
  console.error(`\n${failed} check(s) failed`)
  process.exit(1)
}
console.log('\nsmoke passed')
