import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, rmSync } from 'node:fs'
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

test('按顺序全部确认后 check 通过', () => {
  assert.equal(run(['set', project, 'requirements', 'approved', '--note', '需求']).code, 0)
  assert.equal(run(['set', project, 'script_storyboard', 'approved', '--note', '脚本+分镜']).code, 0)
  assert.equal(run(['set', project, 'look', 'approved', '--note', '3 帧']).code, 0)
  assert.equal(run(['set', project, 'start', 'approved', '--note', '可以开始']).code, 0)
  assert.equal(run(['check', project]).code, 0)
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
