import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const SCRIPT = new URL('./approvals.mjs', import.meta.url).pathname
const project = mkdtempSync(join(tmpdir(), 'dsh-approvals-'))
let failed = 0

function run(args) {
  try {
    const out = execFileSync(process.execPath, [SCRIPT, ...args], { encoding: 'utf8', stdio: 'pipe' })
    return { code: 0, out }
  } catch (error) {
    return { code: error.status ?? 1, out: `${error.stdout ?? ''}${error.stderr ?? ''}` }
  }
}

/** 一套能过校验的最小需求字段（narrated）。 */
function briefArgs(overrides = {}) {
  const base = {
    duration: '30s', aspect: '1920x1080', fps: '30fps', delivery: 'narrated',
    style: '3b1b', audience: 'high', narration: 'zh-neutral',
  }
  const merged = { ...base, ...overrides }
  return Object.entries(merged).flatMap(([key, value]) => [`--${key}`, value])
}

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

run(['init', project, '--mode', 'light'])

test('刚 init 时 check 不通过', () => {
  assert.equal(run(['check', project]).code, 1)
})

test('不能跳过前置阶段', () => {
  assert.equal(run(['set', project, 'script_storyboard', 'approved']).code, 1)
})

test('需求必须落全规格与创作项，否则拒绝', () => {
  const result = run(['set', project, 'requirements', 'approved', '--note', '只有备注'])
  assert.equal(result.code, 1)
  assert.match(result.out, /--duration/)
  assert.match(result.out, /--fps/)
  assert.match(result.out, /--style/)
  assert.match(result.out, /--audience/)
})

test('需求字段格式不对会报错', () => {
  const result = run(['set', project, 'requirements', 'approved', ...briefArgs({ duration: '30' })])
  assert.equal(result.code, 1)
  assert.match(result.out, /30s/)
})

test('帧率只收通用整数档，出帧时允许 N/A', () => {
  const bad = run(['set', project, 'requirements', 'approved', ...briefArgs({ fps: '29.97' })])
  assert.equal(bad.code, 1)
  assert.match(bad.out, /30fps/)

  const naWrong = run(['set', project, 'requirements', 'approved', ...briefArgs({ fps: 'N/A' })])
  assert.equal(naWrong.code, 1)
  assert.match(naWrong.out, /N\/A/)

  const frames = run(['set', project, 'requirements', 'approved',
    ...briefArgs({ delivery: 'frames', fps: 'N/A', narration: 'none' }),
    '--confirmation', 'q-fps-1'])
  assert.equal(frames.code, 0)
})

test('narrated 时必须给旁白', () => {
  const dir = mkdtempSync(join(tmpdir(), 'dsh-approvals-narration-'))
  run(['init', dir, '--mode', 'standard'])
  const result = run([
    'set', dir, 'requirements', 'approved',
    '--duration', '30s', '--aspect', '1920x1080', '--fps', '30fps', '--delivery', 'narrated',
    '--style', '3b1b', '--audience', 'high', '--confirmation', 'q-narration-1',
  ])
  assert.equal(result.code, 1)
  assert.match(result.out, /--narration/)
  rmSync(dir, { recursive: true, force: true })
})

test('narrated + 旁白 none 互相矛盾时拒绝', () => {
  const result = run(['set', project, 'requirements', 'approved',
    ...briefArgs({ delivery: 'narrated', narration: 'none' }), '--confirmation', 'q-conflict-1'])
  assert.equal(result.code, 1)
  assert.match(result.out, /narrated/)
})

test('按顺序全部确认后 check 通过', () => {
  assert.equal(run([
    'set', project, 'requirements', 'approved',
    ...briefArgs({ duration: '30s' }), '--confirmation', 'q-test-1', '--note', '需求',
  ]).code, 0)
  assert.equal(run(['set', project, 'script_storyboard', 'approved', '--note', '脚本+分镜']).code, 0)
  assert.equal(run(['set', project, 'look', 'approved', '--note', '3 帧']).code, 0)
  assert.equal(run(['set', project, 'start', 'approved', '--confirmation', 'q-test-2', '--note', '可以开始']).code, 0)
  assert.equal(run(['check', project]).code, 0)
})

test('改需求会把下游确认重置为 pending', () => {
  const dir = mkdtempSync(join(tmpdir(), 'dsh-approvals-reset-'))
  run(['init', dir, '--mode', 'light'])
  run(['set', dir, 'requirements', 'approved',
    ...briefArgs({ duration: '15s', aspect: '1080x1920', delivery: 'silent', narration: 'none', fps: '30fps' }),
    '--confirmation', 'q-test-3'])
  run(['set', dir, 'script_storyboard', 'approved', '--note', '脚本'])
  assert.equal(run(['check', dir]).code, 1)
  // 换交付方式：旧的“脚本已确认”必须作废
  assert.equal(run(['set', dir, 'requirements', 'approved',
    ...briefArgs({ duration: '30s' }), '--confirmation', 'q-test-4']).code, 0)
  const out = run(['show', dir]).out
  assert.match(out, /脚本.*pending/)
  rmSync(dir, { recursive: true, force: true })
})

test('requirements / start 必须有 confirmation', () => {
  const dir = mkdtempSync(join(tmpdir(), 'dsh-approvals-confirm-'))
  run(['init', dir, '--mode', 'light'])
  const missing = run([
    'set', dir, 'requirements', 'approved',
    ...briefArgs({ duration: '10s', delivery: 'silent', narration: 'none' }),
  ])
  assert.equal(missing.code, 1)
  assert.match(missing.out, /confirmation/)
  assert.equal(run([
    'set', dir, 'requirements', 'approved',
    ...briefArgs({ duration: '10s', delivery: 'silent', narration: 'none' }),
    '--confirmation', 'q-confirm-1',
  ]).code, 0)
  const briefLine = run(['show', dir]).out
  assert.match(briefLine, /10s · 1920x1080 · 30fps · silent · 3b1b · high/)
  const ledger = JSON.parse(readFileSync(join(dir, 'APPROVALS.json'), 'utf8'))
  assert.equal(ledger.stages.requirements.by, 'agent')
  assert.equal(ledger.stages.requirements.confirmation, 'q-confirm-1')
  assert.ok(ledger.stages.requirements.briefHash)
  assert.equal(run(['set', dir, 'script_storyboard', 'approved']).code, 0)
  assert.equal(run(['set', dir, 'look', 'approved']).code, 0)
  assert.equal(run(['set', dir, 'start', 'approved']).code, 1)
  assert.equal(run(['set', dir, 'start', 'approved', '--confirmation', 'q-confirm-2']).code, 0)
  rmSync(dir, { recursive: true, force: true })
})

test('standard 模式包含独立脚本/分镜/交付', () => {
  const dir = mkdtempSync(join(tmpdir(), 'dsh-approvals-std-'))
  assert.equal(run(['init', dir, '--mode', 'standard']).code, 0)
  assert.match(run(['show', dir]).out, /脚本/)
  assert.match(run(['show', dir]).out, /分镜/)
  assert.match(run(['show', dir]).out, /交付清单/)
  rmSync(dir, { recursive: true, force: true })
})

rmSync(project, { recursive: true, force: true })

if (failed > 0) {
  console.error(`\n${failed} test(s) failed`)
  process.exit(1)
}
console.log('\ntest-approvals passed')
