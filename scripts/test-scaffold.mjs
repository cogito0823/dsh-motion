#!/usr/bin/env node
/**
 * 脚手架测试：模板可复制、占位符替换、timeline 可解析并通过自检、--force 覆盖。
 */
import assert from 'node:assert/strict'
import { existsSync, mkdtempSync, readFileSync, realpathSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { scaffoldProject } from './scaffold.mjs'
import { validateTimeline } from '../lib/timeline.js'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')

const dir = realpathSync(mkdtempSync(join(tmpdir(), 'dsh-motion-scaffold-')))
try {
  const home = join(dir, 'home')
  const dest = join(home, 'demo')
  const result = scaffoldProject(dest, { title: '测试片', duration: 12, workspace: home })
  assert.equal(result.title, '测试片')
  assert.equal(result.duration, 12)
  for (const file of ['scene.py', 'timeline.py', 'timeline.json', 'narration.json', 'assemble.py', 'DESIGN.md', 'README.md', '.gitignore', 'motion.project.json']) {
    assert.ok(existsSync(join(dest, file)), `缺少 ${file}`)
  }

  const timeline = JSON.parse(readFileSync(join(dest, 'timeline.json'), 'utf8'))
  const narration = JSON.parse(readFileSync(join(dest, 'narration.json'), 'utf8'))
  assert.equal(timeline.title, '测试片')
  assert.equal(timeline.durationSec, 12)
  assert.equal(narration.title, '测试片')
  assert.equal(narration.duration, 12)
  const manifest = JSON.parse(readFileSync(join(dest, 'motion.project.json'), 'utf8'))
  assert.equal(manifest.name, '测试片')
  assert.match(manifest.id, /^[a-z0-9-]+-[a-f0-9]{6}$/)
  assert.equal(manifest.primaryScene, 'scene.py')
  assert.equal(result.manifest.id, manifest.id)
  for (const sub of ['out', 'audio', '.dsh-motion']) assert.ok(existsSync(join(dest, sub)), `缺少 ${sub}/`)

  assert.equal(timeline.cues.length, 3)
  assert.match(readFileSync(join(dest, 'scene.py'), 'utf8'), /测试片/)
  assert.match(readFileSync(join(dest, 'README.md'), 'utf8'), /12s/)
  assert.equal(validateTimeline(timeline).ok, true)

  // 默认落到 workspace；同名目录自动加 -2
  const defaulted = scaffoldProject(undefined, { title: 'Default Film', duration: 5, workspace: home })
  assert.equal(defaulted.dest, join(home, 'default-film'))
  const second = scaffoldProject(undefined, { title: 'Default Film', duration: 5, workspace: home })
  assert.equal(second.dest, join(home, 'default-film-2'))
  const registry = JSON.parse(readFileSync(join(home, 'registry.json'), 'utf8'))
  assert.ok(registry.projects.some((item) => item.dir === 'default-film-2'), 'scaffold 后索引要更新')
  assert.ok(existsSync(join(defaulted.dest, 'motion.project.json')))

  // 拒绝建在 workspace 之外
  assert.throws(
    () => scaffoldProject(join(ROOT, 'projects', 'should-not-exist'), { title: 'x', workspace: home }),
    /会话项目集/,
  )

  // 非空目录默认拒绝
  assert.throws(() => scaffoldProject(dest, { title: 'x', workspace: home }), /目标非空/)
  // --force 覆盖
  const forced = scaffoldProject(dest, { title: '第二版', duration: 8, force: true, workspace: home })
  assert.equal(JSON.parse(readFileSync(join(forced.dest, 'timeline.json'), 'utf8')).title, '第二版')
} finally {
  rmSync(dir, { recursive: true, force: true })
}

console.log('ok  scaffold: copy / placeholders / timeline / force')
