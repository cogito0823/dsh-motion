/**
 * 读取项目里的 APPROVALS.json，供工具层做“开工确认”硬门。
 *
 * 脚本 scripts/approvals.mjs 负责写；这里只读，避免模型绕过。
 */
import { existsSync, readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'

const FILE = 'APPROVALS.json'

export function findApprovals(file) {
  let dir = dirname(resolve(file))
  for (let i = 0; i < 4; i += 1) {
    const candidate = join(dir, FILE)
    if (existsSync(candidate)) return candidate
    const parent = dirname(dir)
    if (parent === dir) break
    dir = parent
  }
  return null
}

export function readApprovals(file) {
  const path = findApprovals(file)
  if (!path) return { status: 'missing', path: null, missing: [], mode: null }
  const data = JSON.parse(readFileSync(path, 'utf8'))
  const stages = Object.entries(data.stages ?? {})
  const missing = stages
    .filter(([, value]) => value.status !== 'approved')
    .map(([key, value]) => value.label ?? key)
  return {
    status: missing.length ? 'pending' : 'approved',
    path,
    mode: data.mode ?? null,
    project: data.project ?? null,
    missing,
    data,
  }
}

export function assertApproved(file, { allow = false } = {}) {
  if (allow) return null
  const report = readApprovals(file)
  if (report.status === 'missing') {
    throw new Error(
      `未找到 ${FILE}：这个项目还没过需求卡点/确认门。\n`
      + '先跑：node scripts/plan-questions.mjs "<需求>" --json\n'
      + '再初始化：node scripts/approvals.mjs init <project> --mode light|standard|full\n'
      + '确认后把 delivery/start 等阶段置为 approved；或设置 DSH_MOTION_ALLOW_UNCONFIRMED=1 仅用于调试。',
    )
  }
  if (report.status === 'pending') {
    throw new Error(
      `开工确认未通过（${report.path}）：还缺 ${report.missing.join('、')}。\n`
      + '用 node scripts/approvals.mjs set <project> <stage> approved --note "用户确认" 更新；\n'
      + '全部 approved 后才能渲染。',
    )
  }
  return report
}
