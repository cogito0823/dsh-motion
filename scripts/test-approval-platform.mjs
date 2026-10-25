#!/usr/bin/env node
/**
 * 平台级审批单测：账本未通过时走 ctx.approval.request；
 * allowed-once 放行并留痕，rejected 拒绝并留痕，已 approved 不打扰用户。
 */
import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { platformApproveRender } from '../lib/index.js'
import { writeProjectManifest } from '../lib/project.js'

const dir = realpathSync(mkdtempSync(join(tmpdir(), 'dsh-motion-platform-')))
try {
  const ws = join(dir, 'dsh-motion-projects')
  const root = join(ws, 'film')
  const config = { workspace: ws }
  mkdirSync(root, { recursive: true })
  writeFileSync(join(root, 'scene.py'), '')
  const manifest = writeProjectManifest(root, { name: 'platform' })
  const scene = join(root, 'scene.py')
  const exec = { agent: { id: 'agent' }, callId: 'call-1', signal: undefined }

  // 未过账本：允许一次
  writeFileSync(join(root, 'APPROVALS.json'), JSON.stringify({
    version: 1, projectId: manifest.id, mode: 'light',
    stages: { requirements: { status: 'pending' } },
  }))
  let asked = 0
  const allowCtx = { get: (name) => name === 'approval' ? { async request(request) { asked += 1; assert.equal(request.toolName, 'motion_render'); return 'allowed-once' } } : undefined }
  assert.equal(await platformApproveRender(allowCtx, config, scene, exec), true)
  assert.equal(asked, 1)

  // 拒绝
  const denyCtx = { get: (name) => name === 'approval' ? { async request() { return 'rejected' } } : undefined }
  await assert.rejects(() => platformApproveRender(denyCtx, config, scene, exec), /用户拒绝/)

  const lines = readFileSync(join(root, '.dsh-motion', 'approvals.jsonl'), 'utf8').trim().split('\n').map(JSON.parse)
  assert.ok(lines.some((line) => line.outcome === 'platform-approved'))
  assert.ok(lines.some((line) => line.outcome === 'platform-rejected'))

  // 已 approved：不再打扰用户，直接交给账本放行
  writeFileSync(join(root, 'APPROVALS.json'), JSON.stringify({
    version: 1, projectId: manifest.id, mode: 'light',
    stages: {
      requirements: {
        status: 'approved',
        brief: {
          duration: '5s', aspect: '1920x1080', fps: '30fps', delivery: 'silent',
          style: '3b1b', audience: 'high', narration: 'none',
        },
      },
    },
  }))
  let askedAgain = 0
  const approvedCtx = { get: (name) => name === 'approval' ? { async request() { askedAgain += 1; return 'allowed-once' } } : undefined }
  assert.equal(await platformApproveRender(approvedCtx, config, scene, exec), false)
  assert.equal(askedAgain, 0, '账本已通过时不该弹窗')
  const ledgerLines = readFileSync(join(root, '.dsh-motion', 'approvals.jsonl'), 'utf8').trim().split('\n').map(JSON.parse)
  assert.ok(ledgerLines.some((line) => line.outcome === 'ledger-approved'), '跳过审批也要留痕')

  // confirmEveryRender: 显式要求每次确认
  let forced = 0
  const forcedCtx = { get: (name) => name === 'approval' ? { async request() { forced += 1; return 'allowed-once' } } : undefined }
  assert.equal(await platformApproveRender(forcedCtx, { ...config, confirmEveryRender: true }, scene, exec), true)
  assert.equal(forced, 1)
} finally {
  rmSync(dir, { recursive: true, force: true })
}

console.log('ok  platform approval: ask / allow-once / reject / approved-skips / forced')
