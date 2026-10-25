/**
 * 读取项目里的 APPROVALS.json，供工具层做“开工确认”硬门。
 *
 * 脚本 scripts/approvals.mjs 负责写；这里只读，避免模型绕过。
 */
import { existsSync, readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'

const FILE = 'APPROVALS.json'

/** 需求必须锁死的三件事：不写下来就等于没确认。 */
export const REQUIRED_BRIEF = ['duration', 'aspect', 'delivery']
export const DELIVERY_MODES = ['frames', 'silent', 'narrated']

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

/** 需求阶段的结构化记录；缺字段视同没确认。 */
export function briefOf(data) {
  const requirements = data?.stages?.requirements
  if (!requirements || requirements.status !== 'approved') return null
  const brief = requirements.brief
  if (!brief || REQUIRED_BRIEF.some((key) => !brief[key])) return null
  return brief
}

export function readApprovals(file) {
  const path = findApprovals(file)
  if (!path) return { status: 'missing', path: null, missing: [], mode: null, brief: null }
  const data = JSON.parse(readFileSync(path, 'utf8'))
  const stages = Object.entries(data.stages ?? {})
  const missing = stages
    .filter(([, value]) => value.status !== 'approved')
    .map(([key, value]) => value.label ?? key)
  // 老账本：requirements 写的是 approved，但没落 时长/画幅/交付 → 仍算未确认
  const brief = briefOf(data)
  if (!brief && data.stages?.requirements?.status === 'approved') missing.push('需求（时长/画幅/交付）')
  return {
    status: missing.length ? 'pending' : 'approved',
    path,
    mode: data.mode ?? null,
    project: data.project ?? null,
    missing,
    brief,
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

/**
 * 出帧前的硬门：项目账本存在时，需求必须已锁（时长/画幅/交付）。
 *
 * 没有 APPROVALS.json 的场景视为临时探索，不拦——否则连调样式都得先开项目。
 */
export function assertBrief(file, { allow = false } = {}) {
  if (allow) return null
  const path = findApprovals(file)
  if (!path) return null
  const report = readApprovals(file)
  if (report.brief) return report
  const requirements = report.data?.stages?.requirements
  const hint = requirements?.status === 'approved'
    ? '需求阶段是 approved，但没有记录时长/画幅/交付。'
    : '需求阶段还没通过。'
  throw new Error(
    `需求未锁定（${path}）：${hint}\n`
    + '先问用户这三项，再落账：\n'
    + '  node scripts/approvals.mjs set <project> requirements approved \\\n'
    + '    --duration 30s --aspect 1920x1080 --delivery frames|silent|narrated --note "用户确认"\n'
    + '确认前不出帧；临时场景（没有 APPROVALS.json）不受此限，'
    + '调试可设 DSH_MOTION_ALLOW_UNCONFIRMED=1。',
  )
}
