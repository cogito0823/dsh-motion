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

test('需求必须落 时长/画幅/交付，否则拒绝', () => {
  const result = run(['set', project, 'requirements', 'approved', '--note', '只有备注'])
  assert.equal(result.code, 1)
  assert.match(result.out, /--duration/)
})

test('需求字段格式不对会报错', () => {
  const result = run([
    'set', project, 'requirements', 'approved',
    '--duration', '30', '--aspect', '1920x1080', '--delivery', 'narrated',
  ])
  assert.equal(result.code, 1)
  assert.match(result.out, /30s/)
})

test('按顺序全部确认后 check 通过', () => {
  assert.equal(run([
    'set', project, 'requirements', 'approved',
    '--duration', '30s', '--aspect', '1920x1080', '--delivery', 'narrated', '--confirmation', 'q-test-1', '--note', '需求',
  ]).code, 0)
  assert.equal(run(['set', project, 'script_storyboard', 'approved', '--note', '脚本+分镜']).code, 0)
  assert.equal(run(['set', project, 'look', 'approved', '--note', '3 帧']).code, 0)
  assert.equal(run(['set', project, 'start', 'approved', '--confirmation', 'q-test-2', '--note', '可以开始']).code, 0)
  assert.equal(run(['check', project]).code, 0)
})

test('改需求会把下游确认重置为 pending', () => {
  const dir = mkdtempSync(join(tmpdir(), 'dsh-approvals-reset-'))
  run(['init', dir, '--mode', 'light'])
  run(['set', dir, 'requirements', 'approved', '--duration', '15s', '--aspect', '1080x1920', '--delivery', 'silent', '--confirmation', 'q-test-3'])
  run(['set', dir, 'script_storyboard', 'approved', '--note', '脚本'])
  assert.equal(run(['check', dir]).code, 1)
  // 换交付方式：旧的“脚本已确认”必须作废
  assert.equal(run(['set', dir, 'requirements', 'approved', '--duration', '30s', '--aspect', '1920x1080', '--delivery', 'narrated', '--confirmation', 'q-test-4']).code, 0)
  const out = run(['show', dir]).out
  assert.match(out, /脚本.*pending/)
  rmSync(dir, { recursive: true, force: true })
})

test('requirements / start 必须有 confirmation', () => {
  const dir = mkdtempSync(join(tmpdir(), 'dsh-approvals-confirm-'))
  run(['init', dir, '--mode', 'light'])
  const missing = run([
    'set', dir, 'requirements', 'approved',
    '--duration', '10s', '--aspect', '1920x1080', '--delivery', 'silent',
  ])
  assert.equal(missing.code, 1)
  assert.match(missing.out, /confirmation/)
  assert.equal(run([
    'set', dir, 'requirements', 'approved',
    '--duration', '10s', '--aspect', '1920x1080', '--delivery', 'silent',
    '--confirmation', 'q-confirm-1',
  ]).code, 0)
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
