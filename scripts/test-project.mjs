#!/usr/bin/env node
/**
 * 项目解析测试：workspace 边界、深度、manifest 必需、registry、锁。
 */
import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { assertApproved, readApprovals } from '../lib/approvals.js'
import {
  PROJECT_FILE,
  acquireProjectLock,
  createProjectId,
  isInside,
  listProjects,
  projectOut,
  rebuildRegistry,
  resolveProject,
  sceneOf,
  slugify,
  uniqueDirName,
  validateManifest,
  workspaceRoot,
  writeProjectManifest,
} from '../lib/project.js'

const dir = realpathSync(mkdtempSync(join(tmpdir(), 'dsh-motion-project-')))
try {
  const ws = join(dir, 'dsh-motion-projects')
  mkdirSync(ws, { recursive: true })
  process.chdir(dir) // 相对路径按 cwd 解析，切到 workspace 上一级
  const opts = { workspace: ws }

  // 正常项目：从场景文件、从产物路径都能回到项目根
  const film = join(ws, 'euler')
  mkdirSync(join(film, 'out'), { recursive: true })
  writeFileSync(join(film, 'scene.py'), '')
  const manifest = writeProjectManifest(film, { name: '欧拉公式', primaryScene: 'scene.py' })
  assert.match(manifest.id, /^euler-[a-f0-9]{6}$/)
  assert.equal(validateManifest(manifest).schema, 1)

  const fromScene = resolveProject(join(film, 'scene.py'), opts)
  assert.equal(fromScene.root, film)
  assert.equal(fromScene.manifest.id, manifest.id)

  const fromOut = resolveProject(join(film, 'out', 'clip.mp4'), opts)
  assert.equal(fromOut.root, film, 'out 里的产物应回到项目根')

  const byName = resolveProject('euler', opts)
  assert.equal(byName.root, film, '单段目录名可直接寻址')
  assert.equal(sceneOf('euler', opts), join(film, 'scene.py'), '项目名解析到主场景')

  // 嵌套 manifest 直接拒绝（不静默归到父项目）
  const nested = join(film, 'scenes', 'alt')
  mkdirSync(nested, { recursive: true })
  writeFileSync(join(nested, 'scene.py'), '')
  writeProjectManifest(nested, { name: 'alt' })
  assert.throws(() => resolveProject(join(nested, 'scene.py'), opts), /嵌套项目/)

  // 子目录里的普通场景文件仍归父项目（out/、audio/、scenes/ 都是项目内目录）
  const subScene = join(film, 'scenes', 'plain.py')
  writeFileSync(subScene, '')
  assert.equal(resolveProject(subScene, opts).root, film)

  // 没有 manifest 的目录不是项目：legacy 标记不再被认
  const legacy = join(ws, 'legacy')
  mkdirSync(legacy, { recursive: true })
  writeFileSync(join(legacy, 'scene.py'), '')
  writeFileSync(join(legacy, 'APPROVALS.json'), JSON.stringify({ version: 1, stages: {} }))
  assert.throws(() => resolveProject(join(legacy, 'scene.py'), opts), /不是项目/)
  assert.equal(resolveProject(join(legacy, 'scene.py'), { ...opts, mustExist: false }).unmanaged, true)
  assert.equal(readApprovals(join(legacy, 'scene.py'), opts).status, 'missing')

  // workspace 之外：unmanaged，且必须报得出来
  const outside = join(dir, 'elsewhere')
  mkdirSync(outside, { recursive: true })
  writeFileSync(join(outside, 'scene.py'), '')
  const outsideResolved = resolveProject(join(outside, 'scene.py'), opts)
  assert.equal(outsideResolved.root, null)
  assert.equal(outsideResolved.unmanaged, true)
  assert.equal(outsideResolved.reason, 'outside-workspace')

  // 相对引用：单段名字走 workspace，带目录的相对路径按 cwd 解析，越界直接拒绝
  const byRelative = resolveProject(join('dsh-motion-projects', 'euler'), opts)
  assert.equal(byRelative.root, film, 'workspace 内的相对路径可用')
  assert.throws(() => resolveProject('../escape', opts), /无法解析/)

  // workspace 默认在 cwd 下
  assert.equal(workspaceRoot({}), join(process.cwd(), 'dsh-motion-projects'))

  // 账本：父项目的账本不放行另一个项目
  writeFileSync(join(film, 'APPROVALS.json'), JSON.stringify({
    version: 1,
    projectId: manifest.id,
    mode: 'light',
    stages: { requirements: { status: 'pending' } },
  }))
  assert.equal(readApprovals(join(legacy, 'scene.py'), opts).status, 'missing', 'legacy 目录拿不到别人的账本')

  // 账本 projectId 不匹配：拒绝
  const other = join(ws, 'other')
  mkdirSync(other, { recursive: true })
  writeFileSync(join(other, 'scene.py'), '')
  const otherManifest = writeProjectManifest(other, { name: 'other' })
  writeFileSync(join(other, 'APPROVALS.json'), JSON.stringify({
    version: 1,
    projectId: 'not-this-one',
    mode: 'light',
    stages: { requirements: { status: 'approved' } },
  }))
  assert.equal(readApprovals(join(other, 'scene.py'), opts).status, 'mismatch')

  // 审计与 tampered 检测
  const audit = join(ws, 'audit')
  mkdirSync(audit, { recursive: true })
  writeFileSync(join(audit, 'scene.py'), '')
  const auditManifest = writeProjectManifest(audit, { name: 'audit' })
  writeFileSync(join(audit, 'APPROVALS.json'), JSON.stringify({
    version: 1,
    projectId: auditManifest.id,
    mode: 'light',
    stages: { requirements: { status: 'pending' } },
  }))
  assert.throws(() => assertApproved(join(audit, 'scene.py'), { action: 'test-render', ...opts }), /开工确认未通过/)
  assertApproved(join(audit, 'scene.py'), { allow: true, action: 'test-bypass', ...opts })
  const auditLines = readFileSync(join(audit, '.dsh-motion', 'approvals.jsonl'), 'utf8').trim().split('\n').map(JSON.parse)
  assert.equal(auditLines[0].outcome, 'refused')
  assert.equal(auditLines[1].outcome, 'bypass')

  writeFileSync(join(audit, 'APPROVALS.json'), JSON.stringify({
    version: 1,
    projectId: auditManifest.id,
    mode: 'light',
    stages: {
      requirements: {
        status: 'approved',
        brief: {
          duration: '10s', aspect: '1920x1080', fps: '30fps', delivery: 'silent',
          style: '3b1b', audience: 'high', narration: 'none',
        },
        briefHash: 'not-the-real-hash',
      },
    },
  }))
  assert.equal(readApprovals(join(audit, 'scene.py'), opts).status, 'tampered')

  // 列举与索引：registry 是 cache，可删可重建
  assert.deepEqual(listProjects(opts).map((item) => item.dir), ['audit', 'euler', 'other'], '没有 manifest 的目录不算项目')
  const registry = rebuildRegistry(opts)
  assert.equal(registry.projects.length, 3)
  assert.ok(registry.projects.some((item) => item.id === manifest.id))
  const raw = JSON.parse(readFileSync(registry.path, 'utf8'))
  assert.equal(raw.workspace, ws)
  rmSync(registry.path)
  assert.equal(listProjects(opts).length, 3, 'registry 删掉不影响列举')

  // 目录名冲突
  const unique = uniqueDirName(ws, 'euler')
  assert.equal(unique, 'euler-2')

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

  assert.ok(PROJECT_FILE)
} finally {
  rmSync(dir, { recursive: true, force: true })
}

console.log('ok  project: workspace / depth / manifest / registry / lock')
