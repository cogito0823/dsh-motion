/**
 * 开发期热加载：按文件 mtime 重新 import，避免每次改 lib 都重启 Harness。
 *
 * 只对"实现"生效（ops/doctor）；工具名、描述、参数 schema 在 apply() 时
 * 注册，改这些仍然需要重启。样式、场景、tokens 是运行时读取的，本来就不用重启。
 */

import { statSync } from 'node:fs'

const cache = new Map()

export async function importFresh(url) {
  const href = typeof url === 'string' ? url : url.href
  if (process.env.DSH_MOTION_NO_FRESH === '1') return import(href)
  const mtime = statSync(new URL(href)).mtimeMs
  const hit = cache.get(href)
  if (hit && hit.mtime === mtime) return hit.module
  const module = await import(`${href}?t=${mtime}`)
  cache.set(href, { mtime, module })
  return module
}
