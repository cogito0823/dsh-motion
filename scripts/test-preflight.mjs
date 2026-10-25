#!/usr/bin/env node
/**
 * 预检缓存单元测试：指纹失效、TTL、坏文件不炸、落点顺序。
 * 不依赖 Python 与网络：只测 cache.js / preflight.js 的纯逻辑。
 */
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { readCache, statSig, writeCache } from '../lib/cache.js'
import { FINGERPRINT_SCHEMA, cacheCandidates, fingerprint } from '../lib/preflight.js'

const dir = mkdtempSync(join(tmpdir(), 'dsh-motion-preflight-'))
const file = join(dir, 'cache.json')
const fp = { node: '26.0.0', venv: '/tmp/venv', probe: '1:2' }

try {
  // 缺失文件
  assert.equal(statSig(join(dir, 'nope.json')), 'missing')

  // 写→读
  assert.equal(writeCache(file, fp, { ready: { math: true } }), file)
  const hit = readCache(file, fp, 60_000)
  assert.ok(hit, '同指纹应命中')
  assert.equal(hit.value.ready.math, true)
  assert.ok(hit.ageMs >= 0 && hit.ageMs < 60_000)

  // 指纹变了就失效
  assert.equal(readCache(file, { ...fp, probe: '1:3' }, 60_000), null, '指纹变化应失效')

  // 过期就失效
  assert.equal(readCache(file, fp, 0), null, 'TTL=0 应失效')

  // 坏文件不抛
  writeFileSync(file, '{not json')
  assert.equal(readCache(file, fp, 60_000), null, '坏 JSON 应返回 null')

  // 写不进去返回 null，不抛
  assert.equal(writeCache('/dev/null/nested/x.json', fp, {}), null)

  // 指纹不随 Node 版本分叉：探针在 venv Python 里跑，Harness 与 CLI 应共用缓存
  const fpNow = fingerprint({})
  assert.equal(fpNow.schema, FINGERPRINT_SCHEMA)
  assert.ok(!('node' in fpNow), '指纹不应包含 Node 版本')
  assert.ok(fpNow.platform.includes(process.platform), '指纹应包含平台')

  // 落点：显式配置优先；否则临时目录在这台机器上比 MOTION_HOME 更可能可写
  const explicit = cacheCandidates({ cacheFile: join(dir, 'explicit.json') })
  assert.equal(explicit[0], join(dir, 'explicit.json'))
  assert.ok(explicit.length >= 2, '至少两个候选落点')
  assert.ok(cacheCandidates({}).some((p) => p.startsWith(tmpdir())), '应包含临时目录')
} finally {
  rmSync(dir, { recursive: true, force: true })
}

console.log('ok  preflight cache: fingerprint / ttl / corrupt / fallback')
