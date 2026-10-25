/**
 * 环境预检：一次调用问清「能不能开工」。
 *
 * 为什么不是多次：每个独立检查都是一次模型往返（5–15 s），而不是一次 0.3 s 的子进程。
 * 所以字体验证、公式转换、常用 API 签名、渲染器版本全部塞进 probe_env.py 一个进程，
 * 外层再按文件指纹缓存整份报告——同一台机器上第二次调用直接命中，不再 spawn python。
 *
 * 只看「构造」不看「渲染」：渲染由项目自己的最小场景（首帧预算 ≤60 s）验证。
 */

import { execFile } from 'node:child_process'
import { createHash } from 'node:crypto'
import { readdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'

import { dirSig, readCache, statSig, writeCache } from './cache.js'
import { motionHome, resolveVenv, venvBinary } from './env.js'

const exec = promisify(execFile)

const PROBE_SCRIPT = join(dirname(fileURLToPath(import.meta.url)), 'probe_env.py')

/** venv 里 manimgx 包的位置：Unix 是 lib/python3.x/site-packages，Windows 是 Lib/site-packages。 */
function packageDir(venv) {
  try {
    for (const entry of readdirSync(join(venv, 'lib'))) {
      if (!entry.startsWith('python')) continue
      const candidate = join(venv, 'lib', entry, 'site-packages', 'manimgx')
      return candidate
    }
  } catch {
    // 落到 Windows 布局
  }
  return join(venv, 'Lib', 'site-packages', 'manimgx')
}

/**
 * 指纹：换机器、升级 manimgx、改探针脚本、重装 venv 都会变。
 * 只做 stat，不起进程，所以命中判定本身是微秒级。
 */
export function fingerprint(config = {}) {
  const venv = resolveVenv(config)
  return {
    node: process.versions.node,
    platform: `${process.platform}-${process.arch}`,
    venv,
    python: statSig(venvBinary(config, 'python')),
    manimgx: dirSig(packageDir(venv)),
    probe: statSig(PROBE_SCRIPT),
  }
}

/**
 * 缓存落点，按顺序尝试：显式配置 → 系统临时目录 → MOTION_HOME。
 *
 * 为什么不是 MOTION_HOME：Harness 的文件沙箱是 workspace-write，`~/.dsh` 通常写不进去
 * （EPERM）。临时目录可写、且同一台机器跨会话有效，所以排在前面。
 */
export function cacheCandidates(config = {}) {
  const list = []
  const explicit = config.cacheFile ?? process.env.MOTION_CACHE_FILE
  if (explicit) list.push(explicit)
  const tag = createHash('sha1').update(resolveVenv(config)).digest('hex').slice(0, 8)
  list.push(join(tmpdir(), `dsh-motion-preflight-${tag}.json`))
  list.push(join(motionHome(config), 'preflight.json'))
  return list
}

/** 命中第一个指纹一致且未过期的缓存。 */
export function readAnyCache(candidates, fingerprintValue, ttlMs) {
  for (const file of candidates) {
    const hit = readCache(file, fingerprintValue, ttlMs)
    if (hit) return { ...hit, file }
  }
  return null
}

/** 写入第一个可写落点；全被挡住时返回 null，不影响报告本身。 */
export function writeAnyCache(candidates, fingerprintValue, value) {
  for (const file of candidates) {
    const written = writeCache(file, fingerprintValue, value)
    if (written) return written
  }
  return null
}

/** 跑一次 Python 探针。返回 {ok, fonts, formulas, api, ...}，失败时带 errors。 */
export async function probeRuntime(config = {}) {
  const venv = resolveVenv(config)
  const python = venvBinary(config, 'python')
  const binDir = join(venv, process.platform === 'win32' ? 'Scripts' : 'bin')

  try {
    const { stdout } = await exec(python, [PROBE_SCRIPT], {
      timeout: 30_000,
      maxBuffer: 2 * 1024 * 1024,
      env: { ...process.env, PATH: `${binDir}${process.platform === 'win32' ? ';' : ':'}${process.env.PATH ?? ''}` },
    })
    const line = stdout.trim().split('\n').filter(Boolean).pop() ?? ''
    const parsed = JSON.parse(line)
    return { ok: parsed.ok !== false, ...parsed }
  } catch (err) {
    const detail = String(err.stderr || err.stdout || err.message || '').trim().split('\n').slice(-2).join(' ')
    return {
      ok: false,
      errors: [`probe failed: ${detail.slice(0, 300)}`],
      fonts: [],
      formulas: [],
      api: {},
    }
  }
}
