/**
 * 读取项目里的 APPROVALS.json，供工具层做“开工确认”硬门。
 *
 * 脚本 scripts/approvals.mjs 负责写；这里只读，避免模型绕过。
 */
import { createHash } from 'node:crypto'
import { appendFileSync, existsSync, mkdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

import { resolveProject } from './project.js'

const FILE = 'APPROVALS.json'

/** 需求必须锁死的三件事：不写下来就等于没确认。 */
export const REQUIRED_BRIEF = ['duration', 'aspect', 'delivery']
export const DELIVERY_MODES = ['frames', 'silent', 'narrated']

/**
 * 审批审计：拒绝、绕过、放行都写 <project>/.dsh-motion/approvals.jsonl。
 * 只追加，失败不影响主流程。
 */
export function recordApprovalEvent(file, event = {}) {
  try {
    const project = resolveProject(file, { allowLegacy: true })
    if (!project.root) return null
    const path = join(project.root, '.dsh-motion', 'approvals.jsonl')
    mkdirSync(join(project.root, '.dsh-motion'), { recursive: true })
    appendFileSync(path, `${JSON.stringify({
      at: new Date().toISOString(),
      pid: process.pid,
      projectId: project.manifest?.id ?? null,
      ...event,
    })}\n`)
    return path
  } catch {
    return null
  }
}

/**
 * 只认项目根下的 APPROVALS.json，不再向上找父目录。
 * 根由 motion.project.json（或 legacy 标记）决定；没有根就没有账本。
 */
export function findApprovals(file) {
  const project = resolveProject(file, { allowLegacy: true })
  if (!project.root) return null
  const candidate = join(project.root, FILE)
  return existsSync(candidate) ? candidate : null
}

/** brief 的稳定哈希：字段排序后 JSON，用于发现手改 brief。 */
export function briefHashOf(brief) {
  if (!brief || typeof brief !== 'object') return null
  const keys = Object.keys(brief).sort()
  const canonical = JSON.stringify(Object.fromEntries(keys.map((key) => [key, brief[key]])))
  return createHash('sha256').update(canonical).digest('hex')
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
  const project = resolveProject(file, { allowLegacy: true })
  const path = findApprovals(file)
  if (!path) return { status: 'missing', path: null, missing: [], mode: null, brief: null }
  const data = JSON.parse(readFileSync(path, 'utf8'))

  // 账本必须属于当前项目：老账本没有 projectId 时放行，有则必须一致。
  if (project.manifest && data.projectId && data.projectId !== project.manifest.id) {
    return {
      status: 'mismatch',
      path,
      mode: data.mode ?? null,
      project: data.project ?? null,
      missing: ['账本与 motion.project.json 的 id 不一致'],
      brief: null,
      data,
    }
  }

  const stages = Object.entries(data.stages ?? {})
  const missing = stages
    .filter(([, value]) => value.status !== 'approved')
    .map(([key, value]) => value.label ?? key)
  // 老账本：requirements 写的是 approved，但没落 时长/画幅/交付 → 仍算未确认
  const brief = briefOf(data)
  if (!brief && data.stages?.requirements?.status === 'approved') missing.push('需求（时长/画幅/交付）')
  const storedHash = data.stages?.requirements?.briefHash
  if (brief && storedHash && briefHashOf(brief) !== storedHash) {
    return {
      status: 'tampered',
      path,
      mode: data.mode ?? null,
      project: data.project ?? null,
      missing: ['requirements.brief 与 briefHash 不一致'],
      brief: null,
      data,
    }
  }
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

export function assertApproved(file, { allow = false, action = 'motion_render' } = {}) {
  if (allow) {
    recordApprovalEvent(file, { action, outcome: 'bypass', reason: 'allowUnconfirmed' })
    return null
  }
  const report = readApprovals(file)
  if (report.status === 'missing') {
    recordApprovalEvent(file, { action, outcome: 'refused', reason: 'missing-ledger', path: report.path })
    throw new Error(
      `未找到 ${FILE}：这个项目还没过需求卡点/确认门。\n`
      + '先跑：node scripts/plan-questions.mjs "<需求>" --json\n'
      + '再初始化：node scripts/approvals.mjs init <project> --mode light|standard|full\n'
      + '确认后把 delivery/start 等阶段置为 approved。临时预览请用 motion_frames（不生成成片）。',
    )
  }
  if (report.status === 'mismatch' || report.status === 'tampered') {
    recordApprovalEvent(file, { action, outcome: 'refused', reason: report.status, path: report.path })
    throw new Error(
      `${FILE} 不可信（${report.path}）：${report.missing.join('、')}。\n`
      + (report.status === 'tampered'
        ? 'requirements.brief 被改过；重新确认需求并落账。'
        : '确认是不是把别的项目的账本复制过来了；重新 init 或修正 projectId。'),
    )
  }
  if (report.status === 'pending') {
    recordApprovalEvent(file, { action, outcome: 'refused', reason: `pending: ${report.missing.join('、')}`, path: report.path })
    throw new Error(
      `开工确认未通过（${report.path}）：还缺 ${report.missing.join('、')}。\n`
      + '用 node scripts/approvals.mjs set <project> <stage> approved --confirmation <ask_user_question id> 更新；\n'
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
export function assertBrief(file, { allow = false, action = 'motion_frames' } = {}) {
  if (allow) {
    recordApprovalEvent(file, { action, outcome: 'bypass', reason: 'allowUnconfirmed' })
    return null
  }
  const path = findApprovals(file)
  if (!path) return null
  const report = readApprovals(file)
  if (report.status === 'mismatch' || report.status === 'tampered') {
    recordApprovalEvent(file, { action, outcome: 'refused', reason: report.status, path: report.path })
    throw new Error(
      `${FILE} 不属于当前项目（${report.path}）：${report.missing.join('、')}。`,
    )
  }
  if (report.brief) return report
  const requirements = report.data?.stages?.requirements
  const hint = requirements?.status === 'approved'
    ? '需求阶段是 approved，但没有记录时长/画幅/交付。'
    : '需求阶段还没通过。'
  recordApprovalEvent(file, { action, outcome: 'refused', reason: 'requirements-not-locked', path })
  throw new Error(
    `需求未锁定（${path}）：${hint}\n`
    + '先问用户这三项，再落账：\n'
    + '  node scripts/approvals.mjs set <project> requirements approved \\\n'
    + '    --duration 30s --aspect 1920x1080 --delivery frames|silent|narrated --note "用户确认"\n'
    + '确认前不出帧；临时场景（没有 APPROVALS.json）不受此限，'
    + '临时预览请用 motion_frames。',
  )
}
