#!/usr/bin/env node
/**
 * 打包前清理 Python 字节码：styles/<slug>/theme.py 被 manimgx import 时会生成
 * __pycache__，npm 的 files 白名单会把它们带进 tarball。
 */
import { readdirSync, rmSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const TARGETS = ['lib', 'scripts', 'styles', 'templates']

function clean(dir) {
  let removed = 0
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue
    const path = join(dir, entry.name)
    if (entry.name === '__pycache__') {
      rmSync(path, { recursive: true, force: true })
      removed += 1
      continue
    }
    removed += clean(path)
  }
  return removed
}

let removed = 0
for (const target of TARGETS) {
  const path = resolve(ROOT, target)
  try {
    removed += clean(path)
  } catch {
    // 目录不存在时忽略
  }
}
console.log(`clean __pycache__: ${removed} dir(s)`)
