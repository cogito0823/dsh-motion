#!/usr/bin/env node
/**
 * 项目根/manifest/锁测试：最近 manifest、legacy、父账本不继承、输出路径、锁。
 */
import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { assertApproved, readApprovals } from '../lib/approvals.js'
import {
  acquireProjectLock,
  createProjectId,
  isInside,
  projectOut,
  resolveProject,
  slugify,
  validateManifest,
  writeProjectManifest,
} from '../lib/project.js'

const dir = mkdtempSync(join(tmpdir(), 'dsh-motion-project-'))
try {
  const home = join(dir, 'projects')
  mkdirSync(home, { recursive: true })

  // 正常项目
  const film = join(home, 'euler')
  mkdirSync(join(film, 'out'), { recursive: true })
  writeFileSync(join(film, 'scene.py'), '')
  const manifest = writeProjectManifest(film, { name: '欧拉公式', primaryScene: 'scene.py' })
  assert.match(manifest.id, /^euler-[a-f0-9]{6}$/)
  assert.equal(validateManifest(manifest).schema, 1)

  const fromScene = resolveProject(join(film, 'scene.py'), { projectsHome: home })
  assert.equal(fromScene.root, film)
  assert.equal(fromScene.manifest.id, manifest.id)
  assert.equal(fromScene.legacy, false)

  const fromOut = resolveProject(join(film, 'out', 'clip.mp4'), { projectsHome: home })
  assert.equal(fromOut.root, film, 'out 里的视频应回到项目根')

  // 父项目 manifest 不能盖住子项目自己的 manifest
  const child = join(film, 'scenes', 'alt')
  mkdirSync(child, { recursive: true })
  writeFileSync(join(child, 'scene.py'), '')
  const childManifest = writeProjectManifest(child, { name: 'alt' })
  const childResolved = resolveProject(join(child, 'scene.py'), { projectsHome: home })
  assert.equal(childResolved.root, child)
  assert.equal(childResolved.manifest.id, childManifest.id)

  // 父账本不继承：子项目有 manifest 时只认自己的根
  const parentApprovals = {
    version: 1,
    projectId: manifest.id,
    mode: 'light',
    stages: {
      requirements: { status: 'approved', brief: { duration: '30s', aspect: '1920x1080', delivery: 'silent' } },
      script_storyboard: { status: 'approved' },
      look: { status: 'approved' },
      start: { status: 'approved' },
    },
  }
  writeFileSync(join(film, 'APPROVALS.json'), JSON.stringify(parentApprovals))
  const childApprovals = readApprovals(join(child, 'scene.py'))
  assert.equal(childApprovals.status, 'missing', '父账本不能给子项目放行')

  // projectId 不匹配：拒绝
  writeFileSync(join(child, 'APPROVALS.json'), JSON.stringify({ ...parentApprovals, projectId: 'other-id' }))
  assert.equal(readApprovals(join(child, 'scene.py')).status, 'mismatch')

  // 审计：拒绝/绕过都落 .dsh-motion/approvals.jsonl
  const audit = join(home, 'audit')
  mkdirSync(audit, { recursive: true })
  writeFileSync(join(audit, 'scene.py'), '')
  const auditManifest = writeProjectManifest(audit, { name: 'audit' })
  writeFileSync(join(audit, 'APPROVALS.json'), JSON.stringify({
    version: 1,
    projectId: auditManifest.id,
    mode: 'light',
    stages: { requirements: { status: 'pending' } },
  }))
  assert.throws(() => assertApproved(join(audit, 'scene.py'), { action: 'test-render' }), /开工确认未通过/)
  assertApproved(join(audit, 'scene.py'), { allow: true, action: 'test-bypass' })
  const auditLines = readFileSync(join(audit, '.dsh-motion', 'approvals.jsonl'), 'utf8').trim().split('\n').map(JSON.parse)
  assert.equal(auditLines[0].outcome, 'refused')
  assert.equal(auditLines[0].action, 'test-render')
  assert.equal(auditLines[1].outcome, 'bypass')

  // brief 被手改：hash 不一致 -> tampered
  writeFileSync(join(audit, 'APPROVALS.json'), JSON.stringify({
    version: 1,
    projectId: auditManifest.id,
    mode: 'light',
    stages: {
      requirements: {
        status: 'approved',
        brief: { duration: '10s', aspect: '1920x1080', delivery: 'silent' },
        briefHash: 'not-the-real-hash',
      },
    },
  }))
  assert.equal(readApprovals(join(audit, 'scene.py')).status, 'tampered')

  // 只有 scene.py 的目录是 legacy，不是正式项目
  const legacy = join(dir, 'legacy')
  mkdirSync(legacy, { recursive: true })
  writeFileSync(join(legacy, 'scene.py'), '')
  const legacyResolved = resolveProject(join(legacy, 'scene.py'), { projectsHome: home })
  assert.equal(legacyResolved.root, legacy)
  assert.equal(legacyResolved.legacy, true)

  // 子目录里的独立 .py 不能继承父级 legacy 账本
  const parentLegacy = join(dir, 'parent-legacy')
  mkdirSync(join(parentLegacy, 'child'), { recursive: true })
  writeFileSync(join(parentLegacy, 'APPROVALS.json'), '{}')
  writeFileSync(join(parentLegacy, 'child', 'main.py'), '')
  const noInherit = resolveProject(join(parentLegacy, 'child', 'main.py'), { projectsHome: home })
  assert.equal(noInherit.root, null, '子目录 .py 不应继承父级 legacy')
  assert.equal(noInherit.unmanaged, true)
  const noInheritDir = resolveProject(join(parentLegacy, 'child'), { projectsHome: home })
  assert.equal(noInheritDir.root, null, '子目录本身也不应继承父级 legacy')

  // 完全无标记：unmanaged，不把 .git 当根
  const loose = join(dir, 'loose')
  mkdirSync(join(loose, '.git'), { recursive: true })
  const looseResolved = resolveProject(join(loose, 'scene.py'), { projectsHome: home })
  assert.equal(looseResolved.root, null)
  assert.equal(looseResolved.unmanaged, true)

  // 输出路径
  assert.equal(projectOut(film, 'render', 'main.mp4'), join(film, 'out', 'render', 'main.mp4'))
  assert.equal(isInside(join(film, 'out'), film), true)
  assert.equal(isInside(join(dir, 'elsewhere'), film), false)

  // slug / id
  assert.equal(slugify('Euler Formula!'), 'euler-formula')
  assert.equal(slugify('欧拉公式'), 'project')
  assert.match(createProjectId('欧拉公式'), /^project-[a-f0-9]{6}$/)

  // manifest 重复写默认拒绝
  assert.throws(() => writeProjectManifest(film, { name: 'x' }), /已存在/)

  // 锁：拿到后第二次失败；release 后可再拿；过期锁可清
  const release = acquireProjectLock(film, { command: 'test' })
  assert.throws(() => acquireProjectLock(film, { command: 'second' }), /项目被占用/)
  release()
  const release2 = acquireProjectLock(film, { command: 'again' })
  release2()

  writeFileSync(join(film, '.dsh-motion', 'project.lock'), JSON.stringify({
    pid: 1, host: 'x', command: 'stale', startedAt: '2000-01-01T00:00:00.000Z',
  }))
  const release3 = acquireProjectLock(film, { command: 'after-stale' })
  release3()
} finally {
  rmSync(dir, { recursive: true, force: true })
}

console.log('ok  project: manifest / root / legacy / out / lock')
