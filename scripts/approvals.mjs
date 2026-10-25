#!/usr/bin/env node
/**
 * 项目级确认记录：把“用户确认过什么”落成可追溯的 APPROVALS.json。
 *
 *   node scripts/approvals.mjs init <project> --mode light
 *   node scripts/approvals.mjs set <project> script_storyboard approved --note "用户确认"
 *   node scripts/approvals.mjs check <project>
 *   node scripts/approvals.mjs show <project>
 *
 * 模式：
 *   light    ≤15s、无旁白：需求 → 脚本+分镜 → 视觉 → 开工
 *   standard 15–60s 或有旁白：需求 → 脚本 → 分镜 → 视觉 → 交付 → 开工
 *   full     >60s 或多段/复杂旁白：再加 animatic
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'

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
    stages[stage] = { label: LABELS[stage], status: 'pending', at: null, by: null, note: '' }
  }
  const data = { version: 1, project: project, mode, createdAt: new Date().toISOString(), stages }
  write(project, data)
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
  data.stages[stage] = {
    ...data.stages[stage],
    status,
    at: new Date().toISOString(),
    by: options.by ?? 'user',
    note: options.note ?? data.stages[stage].note ?? '',
  }
  write(project, data)
  console.log(`${stage} → ${status}${options.note ? ` (${options.note})` : ''}`)
}

function table(data) {
  const rows = Object.entries(data.stages).map(([key, value]) => {
    const mark = value.status === 'approved' ? '✅' : value.status === 'rejected' ? '❌' : '⬜'
    return `${mark} ${value.label.padEnd(14, ' ')} ${value.status.padEnd(8)} ${value.at ?? '-'} ${value.note ?? ''}`
  })
  return [`project: ${data.project}  mode: ${data.mode}`, ...rows].join('\n')
}

function check(project) {
  const data = read(project)
  console.log(table(data))
  const missing = Object.entries(data.stages)
    .filter(([, value]) => value.status !== 'approved')
    .map(([key]) => LABELS[key])
  if (missing.length) {
    console.error(`\n未确认: ${missing.join('、')}`)
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
  if (!stage || !status) fail('用法: set <project> <stage> <approved|pending|rejected> [--note ...] [--by ...]')
  set(project, stage, status, {
    note: noteIndex >= 0 ? rest[noteIndex + 1] : undefined,
    by: byIndex >= 0 ? rest[byIndex + 1] : undefined,
  })
} else if (command === 'check') {
  check(project)
} else if (command === 'show') {
  console.log(table(read(project)))
} else {
  fail(`未知命令: ${command}`)
}
