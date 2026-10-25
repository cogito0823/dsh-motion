/**
 * 发布前元数据检查：占位符、私有标记、绝对路径。
 * 用法：node scripts/check-meta.mjs
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const pkg = JSON.parse(readFileSync(join(process.cwd(), 'package.json'), 'utf8'))
const problems = []

if (pkg.private) problems.push('package.json 里 private 仍为 true')
if (!pkg.license) problems.push('缺少 license')
if (!pkg.engines?.node) problems.push('缺少 engines.node')

for (const file of ['lib/index.js', 'lib/ops.js', 'lib/env.js', 'lib/doctor.js', 'lib/preflight.js', 'lib/cache.js', 'lib/skills.js', 'lib/setup.js', 'lib/project.js', 'lib/timeline.js', 'lib/metrics.js', 'lib/approvals.js']) {
  const text = readFileSync(join(process.cwd(), file), 'utf8')
  if (/\/Users\/[^\s'"]+/.test(text)) problems.push(`${file} 含绝对路径 /Users/…`)
}

if (problems.length) {
  console.error('发布前检查未通过：')
  for (const p of problems) console.error(` - ${p}`)
  process.exit(1)
}
console.log('元数据检查通过')
