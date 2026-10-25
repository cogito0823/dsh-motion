#!/usr/bin/env node
/**
 * 项目级确认记录：把“用户确认过什么”落成可追溯的 APPROVALS.json。
 *
 *   node scripts/approvals.mjs init <project> --mode light
 *   node scripts/approvals.mjs set <project> requirements approved \
 *     --duration 30s --aspect 1920x1080 --fps 30fps --delivery narrated \
 *     --style 3b1b --audience high --narration zh-neutral --note "用户确认"
 *   node scripts/approvals.mjs set <project> script_storyboard approved --note "用户确认"
 *   node scripts/approvals.mjs check <project>
 *   node scripts/approvals.mjs show <project>
 *
 * “需求”是硬门：必须带 --duration/--aspect/--fps/--delivery/--style/--audience
 * （narrated 时还要 --narration），否则 motion_frames 拒绝出帧。
 * 改需求会把下游阶段（脚本/分镜/视觉/交付/开工）重置为 pending。
 *
 * 模式：
 *   light    ≤15s、无旁白：需求 → 脚本+分镜 → 视觉 → 开工
 *   standard 15–60s 或有旁白：需求 → 脚本 → 分镜 → 视觉 → 交付 → 开工
 *   full     >60s 或多段/复杂旁白：再加 animatic
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'

import {
  DELIVERY_MODES,
  FPS_CHOICES,
  REQUIRED_BRIEF,
  briefHashOf,
  missingBriefFields,
  recordApprovalEvent,
} from '../lib/approvals.js'
import { PROJECT_FILE, readProjectManifest } from '../lib/project.js'

const FILE = 'APPROVALS.json'
const LABELS = {
  requirements: '需求',
  script: '脚本',
  script_storyboard: '脚本 + 分镜',
  storyboard: '分镜',
  animatic: 'Animatic',
  look: '视觉（DESIGN + 3 帧）',
  delivery: '交付清单',
  start: '开工',
}
const MODES = {
  light: ['requirements', 'script_storyboard', 'look', 'start'],
  standard: ['requirements', 'script', 'storyboard', 'look', 'delivery', 'start'],
  full: ['requirements', 'script', 'storyboard', 'animatic', 'look', 'delivery', 'start'],
}
const STATUSES = new Set(['pending', 'approved', 'rejected'])
const CONFIRMATION_REQUIRED = new Set(['requirements', 'start'])

/** 规格/创作项的格式约束：宁可报错，也不要存进一句含糊的 note。 */
const BRIEF_FORMATS = {
  duration: (value) => (/^\d+(\.\d+)?s$/.test(value) ? null : `时长写成 30s（带 s），收到的是 "${value}"`),
  aspect: (value) => (/^\d+x\d+$/.test(value) ? null : `画幅写成 1920x1080（宽x高），收到的是 "${value}"`),
  fps: (value, brief) => {
    if (value === 'N/A') {
      return brief.delivery === 'frames' ? null : '帧率只能写 N/A 当交付是 frames（只出帧）'
    }
    const match = /^(\d{2,3})(fps)?$/.exec(String(value))
    if (!match) return `帧率写成 30fps（或 30），收到的是 "${value}"`
    return FPS_CHOICES.includes(Number(match[1]))
      ? null
      : `帧率只收 ${FPS_CHOICES.join(' / ')}；分数帧率请显式说明`
  },
  delivery: (value) =>
    DELIVERY_MODES.includes(value) ? null : `交付只能是 ${DELIVERY_MODES.join(' / ')}，收到的是 "${value}"`,
  style: (value) => (/^[a-z0-9][a-z0-9-]{1,39}$/.test(value) ? null : `风格写 registry 的 slug，收到的是 "${value}"`),
  audience: (value) => (/^[\w\u4e00-\u9fa5-]{2,40}$/u.test(String(value)) ? null : `观众水平写成 high / university / general，收到的是 "${value}"`),
  narration: (value) => (
    ['zh-neutral', 'zh-warm', 'zh-strong', 'en-neutral', 'none'].includes(value)
      ? null
      : `旁白写成 zh-neutral / zh-warm / zh-strong / en-neutral / none，收到的是 "${value}"`
  ),
}

function fail(message) {
  console.error(message)
  process.exit(1)
}

function pathOf(project) {
  return join(resolve(project), FILE)
}

function read(project) {
  const file = pathOf(project)
  if (!existsSync(file)) fail(`找不到 ${file}；先运行 init`)
  return JSON.parse(readFileSync(file, 'utf8'))
}

function write(project, data) {
  const file = pathOf(project)
  mkdirSync(resolve(project), { recursive: true })
  writeFileSync(file, JSON.stringify(data, null, 2) + '\n')
  return file
}

function init(project, mode) {
  if (!MODES[mode]) fail(`mode 只能是 ${Object.keys(MODES).join(' / ')}`)
  const file = pathOf(project)
  if (existsSync(file)) fail(`${file} 已存在；要重建请先删除`)
  const stages = {}
  for (const stage of MODES[mode]) {
    stages[stage] = { label: LABELS[stage], status: 'pending', at: null, by: null, confirmation: null, note: '' }
  }
  const root = resolve(project)
  let projectId = null
  try {
    if (existsSync(join(root, PROJECT_FILE))) projectId = readProjectManifest(root).id
  } catch (error) {
    fail(`读取 ${PROJECT_FILE} 失败：${error.message}`)
  }
  const data = {
    version: 1,
    projectId,
    project: project,
    mode,
    createdAt: new Date().toISOString(),
    stages,
  }
  write(project, data)
  recordApprovalEvent(project, { action: 'approvals_init', outcome: 'init', mode })
  console.log(`created ${file} (${mode})`)
  console.log(`stages: ${MODES[mode].join(' → ')}`)
}

function set(project, stage, status, options) {
  if (!STATUSES.has(status)) fail(`status 只能是 ${[...STATUSES].join(' / ')}`)
  const data = read(project)
  const order = MODES[data.mode]
  if (!data.stages[stage]) fail(`${data.mode} 模式没有阶段: ${stage}（有: ${order.join(', ')}）`)
  if (status === 'approved') {
    const index = order.indexOf(stage)
    const missing = order.slice(0, index).filter((key) => data.stages[key].status !== 'approved')
    if (missing.length) fail(`不能跳过前置阶段: ${missing.map((key) => LABELS[key]).join('、')}`)
  }
  if (stage === 'requirements' && status === 'approved') {
    const brief = { ...(data.stages.requirements.brief ?? {}) }
    for (const key of [...REQUIRED_BRIEF, 'narration', 'title']) {
      if (options[key] !== undefined) brief[key] = options[key]
    }
    const missing = missingBriefFields(brief)
    if (missing.length) {
      fail(
        `确认需求必须落值：${missing.map((key) => `--${key}`).join(' / ')}\n`
        + '例如：--duration 30s --aspect 1920x1080 --fps 30fps --delivery narrated \\\n'
        + '      --style 3b1b --audience high --narration zh-neutral',
      )
    }
    for (const key of Object.keys(BRIEF_FORMATS)) {
      if (brief[key] === undefined) continue
      const problem = BRIEF_FORMATS[key](brief[key], brief)
      if (problem) fail(problem)
    }
    // 交付要旁白却把旁白写成 none：两个字段互相打架，宁可报错
    if (brief.delivery === 'narrated' && brief.narration === 'none') {
      fail('交付是 narrated，但旁白是 none；改 --delivery 或 --narration 再落账')
    }
    data.stages.requirements.brief = brief
    data.stages.requirements.briefHash = briefHashOf(brief)
  }

  if (status === 'approved' && CONFIRMATION_REQUIRED.has(stage) && !options.confirmation) {
    fail(
      `${LABELS[stage]} approved 需要用户确认凭据：--confirmation <ask_user_question 的 id>\n`
      + '例如：--confirmation q_01J... --by agent',
    )
  }
  if (options.confirmation && !/^[\w:.-]{3,120}$/.test(options.confirmation)) {
    fail(`confirmation 格式不合法: ${options.confirmation}`)
  }

  data.stages[stage] = {
    ...data.stages[stage],
    status,
    at: new Date().toISOString(),
    by: options.by ?? 'agent',
    confirmation: options.confirmation ?? data.stages[stage].confirmation ?? null,
    note: options.note ?? data.stages[stage].note ?? '',
  }

  // 需求一变，下游的“确认过”就作废：不能拿旧确认去出片。
  if (stage === 'requirements' && status === 'approved') {
    const index = order.indexOf('requirements')
    for (const key of order.slice(index + 1)) {
      if (data.stages[key].status === 'approved') {
        data.stages[key] = { ...data.stages[key], status: 'pending', at: null, confirmation: null, note: '需求已更新，需重新确认' }
      }
    }
  }

  write(project, data)
  recordApprovalEvent(project, {
    action: 'approvals_set',
    outcome: 'decision',
    stage,
    status,
    by: data.stages[stage].by,
    confirmation: data.stages[stage].confirmation ?? null,
    note: data.stages[stage].note ?? '',
  })
  console.log(`${stage} → ${status}${options.note ? ` (${options.note})` : ''}`)
}

function table(data) {
  const rows = Object.entries(data.stages).map(([key, value]) => {
    const mark = value.status === 'approved' ? '✅' : value.status === 'rejected' ? '❌' : '⬜'
    return `${mark} ${value.label.padEnd(14, ' ')} ${value.status.padEnd(8)} ${value.at ?? '-'} ${value.by ?? '-'} ${value.confirmation ? `ref=${value.confirmation}` : ''} ${value.note ?? ''}`
  })
  const brief = data.stages?.requirements?.brief
  const briefLine = brief
    ? `brief: ${brief.duration} · ${brief.aspect} · ${brief.fps} · ${brief.delivery}`
      + `${brief.style ? ` · ${brief.style}` : ''}${brief.audience ? ` · ${brief.audience}` : ''}`
      + `${brief.narration ? ` · ${brief.narration}` : ''}`
    : 'brief: （未记录：规格与创作项）'
  return [`project: ${data.project}  mode: ${data.mode}`, briefLine, ...rows].join('\n')
}

function check(project) {
  const data = read(project)
  if (data.projectId && existsSync(join(resolve(project), PROJECT_FILE))) {
    const manifest = readProjectManifest(resolve(project))
    if (data.projectId !== manifest.id) {
      console.error(`账本 projectId=${data.projectId} 与 manifest=${manifest.id} 不一致`)
      process.exit(1)
    }
  }
  console.log(table(data))
  const missing = Object.entries(data.stages)
    .filter(([, value]) => value.status !== 'approved')
    .map(([key]) => LABELS[key])
  if (missing.length) {
    console.error(`\n未确认: ${missing.join('、')}`)
    process.exit(1)
  }
  const missingBrief = missingBriefFields(data.stages?.requirements?.brief)
  if (missingBrief.length) {
    console.error(`\n需求缺这些项，视为未确认：${missingBrief.map((key) => `--${key}`).join(' / ')}`)
    process.exit(1)
  }
  if (data.stages.requirements.briefHash && briefHashOf(data.stages.requirements.brief) !== data.stages.requirements.briefHash) {
    console.error('\nrequirements.brief 与 briefHash 不一致，视为被改过')
    process.exit(1)
  }
  console.log('\nall approved')
}

const [command, project, ...rest] = process.argv.slice(2)
if (!command || !project) fail('用法: node scripts/approvals.mjs init|set|check|show <project> ...')

if (command === 'init') {
  const modeIndex = rest.indexOf('--mode')
  const mode = modeIndex >= 0 ? rest[modeIndex + 1] : 'light'
  init(project, mode)
} else if (command === 'set') {
  const [stage, status] = rest
  const noteIndex = rest.indexOf('--note')
  const byIndex = rest.indexOf('--by')
  if (!stage || !status) fail('用法: set <project> <stage> <approved|pending|rejected> --confirmation <id> [--by ...] [--note ...]')
  const flags = {}
  for (let i = 2; i < rest.length; i += 1) {
    if (!rest[i].startsWith('--')) continue
    flags[rest[i].slice(2)] = rest[i + 1]
    i += 1
  }
  set(project, stage, status, flags)
} else if (command === 'check') {
  check(project)
} else if (command === 'show') {
  console.log(table(read(project)))
} else {
  fail(`未知命令: ${command}`)
}
