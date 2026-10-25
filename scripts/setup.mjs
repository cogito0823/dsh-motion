#!/usr/bin/env node
/**
 * 命令行版 motion_setup：建/修 venv，装 manimgx、sympy。
 *
 *   node scripts/setup.mjs            # 缺什么补什么
 *   node scripts/setup.mjs --force    # 删掉旧 venv 重建
 *   node scripts/setup.mjs --tts      # 额外装 edge-tts / numpy
 *
 * Harness 内优先用 motion_setup 工具；这个脚本给开发/CI 用。
 */
import { ensureVenv } from '../lib/setup.js'

const args = process.argv.slice(2)
const started = Date.now()

try {
  const result = await ensureVenv({}, {
    force: args.includes('--force'),
    tts: args.includes('--tts'),
    onProgress: (message) => console.error(`· ${message}`),
  })
  console.log(JSON.stringify({ ...result, elapsed: `${((Date.now() - started) / 1000).toFixed(1)}s` }, null, 2))
} catch (error) {
  console.error(`setup 失败: ${error?.message ?? error}`)
  process.exit(1)
}
