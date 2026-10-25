#!/usr/bin/env node
/**
 * 环境自愈单元测试：解释器选择、force 路径保护、创建/补包的幂等流程。
 * 用一个假的 run() 模拟 python/pip，不联网、不碰真实 venv。
 */
import assert from 'node:assert/strict'
import { chmodSync, existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { homedir, tmpdir } from 'node:os'
import { join } from 'node:path'

import {
  assertSafeVenv,
  ensureVenv,
  moduleNameOf,
  pickPython,
  pythonCandidates,
} from '../lib/setup.js'

assert.equal(moduleNameOf('edge-tts'), 'edge_tts')
assert.equal(moduleNameOf('manimgx'), 'manimgx')
assert.throws(() => assertSafeVenv('/'), /拒绝删除/)
assert.throws(() => assertSafeVenv(homedir()), /拒绝删除/)
assert.deepEqual(pythonCandidates({ python: '/opt/x/python3.13' }), ['/opt/x/python3.13'])

// pickPython：跳过报错的候选，取第一个 >=3.10
const calls = []
const fakeVersion = async (bin) => {
  calls.push(bin)
  if (bin.endsWith('python3.15')) throw new Error('bad')
  return { stdout: bin.endsWith('python3.13') ? '3.13.2\n' : '3.12.1\n' }
}
const picked = await pickPython({ python: '/fake/python3.13' }, fakeVersion)
assert.equal(picked.version, '3.13.2')
assert.equal(picked.bin, '/fake/python3.13')

// 完整流程：venv 不存在 → 创建 → 缺包 → pip 安装 → 校验版本
const root = mkdtempSync(join(tmpdir(), 'dsh-motion-setup-'))
const venv = join(root, 'venv')
const py = join(venv, 'bin', 'python')

let installedModules = new Set()
const run = async (bin, args, options = {}) => {
  const script = args[1] ?? ''
  if (args[0] === '-c' && script.includes('sys.version_info')) {
    return { stdout: '3.13.2\n' }
  }
  if (args[0] === '-c' && script === 'import edge_tts') {
    if (!installedModules.has('edge_tts')) throw new Error('missing')
    return { stdout: '' }
  }
  if (args[0] === '-c' && /^import \w+$/.test(script)) {
    const mod = script.slice('import '.length)
    if (!installedModules.has(mod)) throw new Error(`missing ${mod}`)
    return { stdout: '' }
  }
  if (args[0] === '-c' && script.includes('importlib.metadata')) {
    const versions = { manimgx: '0.1.1', sympy: '1.14.0' }
    if (script.includes('edge-tts')) versions['edge-tts'] = '7.0.0'
    return { stdout: JSON.stringify(versions) }
  }
  if (args[0] === '-m' && args[1] === 'venv') {
    mkdirSync(join(args[2], 'bin'), { recursive: true })
    writeFileSync(join(args[2], 'bin', 'python'), '')
    chmodSync(join(args[2], 'bin', 'python'), 0o755)
    return { stdout: '' }
  }
  if (args[0] === '-m' && args[1] === 'pip') {
    for (const pkg of args.slice(3)) installedModules.add(pkg.replace(/-/g, '_'))
    return { stdout: '' }
  }
  throw new Error(`unexpected run: ${bin} ${args.join(' ')} ${JSON.stringify(options)}`)
}

try {
  const first = await ensureVenv({ venv, python: '/fake/python3.13' }, { run, packages: ['manimgx', 'sympy'] })
  assert.equal(first.created, true)
  assert.equal(first.venv, venv)
  assert.equal(first.basePython, '/fake/python3.13')
  assert.deepEqual(first.installed, ['manimgx', 'sympy'])
  assert.deepEqual(first.versions, { manimgx: '0.1.1', sympy: '1.14.0' })
  assert.equal(first.ready, true)
  assert.ok(existsSync(py))

  // 第二次：包已在，不再创建/安装
  const second = await ensureVenv({ venv, python: '/fake/python3.13' }, { run, packages: ['manimgx', 'sympy'] })
  assert.equal(second.created, false)
  assert.deepEqual(second.installed, [])

  // force：先删再建
  writeFileSync(join(venv, 'stale.txt'), 'x')
  const forced = await ensureVenv({ venv, python: '/fake/python3.13' }, { run, force: true, packages: ['manimgx'] })
  assert.equal(forced.created, true)
  assert.equal(forced.force, true)
  assert.ok(!existsSync(join(venv, 'stale.txt')), 'force 应清掉旧目录')

  // tts 追加依赖
  const tts = await ensureVenv({ venv, python: '/fake/python3.13' }, { run, tts: true, packages: ['manimgx', 'edge-tts'] })
  assert.deepEqual(tts.packages, ['manimgx', 'edge-tts'])
  assert.deepEqual(tts.installed, ['edge-tts'])
} finally {
  rmSync(root, { recursive: true, force: true })
}

console.log('ok  setup: python pick / create / install / force / tts')
