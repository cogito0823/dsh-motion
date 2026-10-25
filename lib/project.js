/**
 * 项目根与 manifest：所有工具只认一个根。
 *
 * 标准：
 *   <projectsHome>/<slug>/motion.project.json
 *
 * 解析顺序：
 *   1. 最近的 motion.project.json（项目根）
 *   2. 老项目：同一目录有 timeline.json / narration.json / APPROVALS.json /
 *      DESIGN.md / scene.py（legacy 根）
 *   3. 都没有：unmanaged（探索场景；不写账本、不落项目输出）
 *
 * 不把 .git 当项目标记，也不向上继承父项目的 APPROVALS。
 */

import { randomBytes } from 'node:crypto'
import {
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs'
import { hostname, homedir } from 'node:os'
import { basename, dirname, extname, isAbsolute, join, relative, resolve } from 'node:path'

export const PROJECT_FILE = 'motion.project.json'
export const PROJECT_SCHEMA = 1
export const LEGACY_MARKERS = ['timeline.json', 'narration.json', 'APPROVALS.json', 'DESIGN.md', 'scene.py']
const PROJECT_ID = /^[A-Za-z0-9][A-Za-z0-9._-]{1,63}$/
const DEFAULT_STALE_MS = 2 * 60 * 60 * 1000

/** 用户项目工作区；插件/数据目录之外。 */
export function projectsHome(config = {}) {
  return resolve(
    config.projectsHome
    ?? process.env.MOTION_PROJECTS_HOME
    ?? join(homedir(), 'dsh-motion-projects'),
  )
}

/** 标题 → 目录名；中文等无 ASCII 字符时回退 project。 */
export function slugify(name) {
  const slug = String(name ?? '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40)
  return slug || 'project'
}

/** 稳定 id：slug + 6 位随机；目录改名后仍保留。 */
export function createProjectId(name, fallback = 'project') {
  const primary = slugify(name)
  const slug = primary === 'project' && fallback ? slugify(fallback) : primary
  return `${slug}-${randomBytes(3).toString('hex')}`
}

export function validateManifest(data, file = PROJECT_FILE) {
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    throw new Error(`${file}: manifest 必须是对象`)
  }
  if (Number(data.schema) !== PROJECT_SCHEMA) {
    throw new Error(`${file}: 不支持的 schema ${JSON.stringify(data.schema)}（期望 ${PROJECT_SCHEMA}）`)
  }
  if (typeof data.id !== 'string' || !PROJECT_ID.test(data.id)) {
    throw new Error(`${file}: id 非法（收到 ${JSON.stringify(data.id)}）`)
  }
  if (typeof data.name !== 'string' || !data.name.trim()) {
    throw new Error(`${file}: 缺少 name`)
  }
  if (data.primaryScene != null && typeof data.primaryScene !== 'string') {
    throw new Error(`${file}: primaryScene 必须是字符串`)
  }
  return data
}

export function readProjectManifest(root) {
  const file = join(resolve(root), PROJECT_FILE)
  let raw
  try {
    raw = readFileSync(file, 'utf8')
  } catch {
    throw new Error(`找不到 ${file}`)
  }
  let data
  try {
    data = JSON.parse(raw)
  } catch (error) {
    throw new Error(`${file}: JSON 解析失败（${error.message}）`)
  }
  return { ...validateManifest(data, file), path: file }
}

/** 写 manifest；已存在时默认拒绝，adopt/force 才覆盖。 */
export function writeProjectManifest(root, options = {}) {
  const dir = resolve(root)
  const file = join(dir, PROJECT_FILE)
  if (existsSync(file) && !options.force) throw new Error(`${file} 已存在`)
  const name = String(options.name ?? 'untitled').trim() || 'untitled'
  const data = {
    schema: PROJECT_SCHEMA,
    id: options.id ?? createProjectId(name, options.slug ?? basename(dir)),
    name,
    createdAt: new Date().toISOString(),
    primaryScene: options.primaryScene ?? 'scene.py',
  }
  validateManifest(data, file)
  mkdirSync(dir, { recursive: true })
  writeFileSync(file, `${JSON.stringify(data, null, 2)}\n`)
  return { ...data, path: file }
}

/** 从文件/目录向上找项目根；manifest 优先于 legacy。 */
export function resolveProject(target, options = {}) {
  const start = resolve(target)
  let dir
  let isDir = false
  try {
    const stat = statSync(start)
    isDir = stat.isDirectory()
    dir = isDir ? start : dirname(start)
  } catch {
    dir = extname(start) ? dirname(start) : start
    isDir = !extname(start)
  }
  const home = projectsHome(options.config ?? {})
  const startDir = dir
  const legacyAtStartOnly = isDir || extname(start).toLowerCase() === '.py'
  let legacy = null

  for (;;) {
    const manifestPath = join(dir, PROJECT_FILE)
    if (existsSync(manifestPath)) {
      return {
        root: dir,
        manifest: readProjectManifest(dir),
        manifestPath,
        legacy: false,
        unmanaged: false,
        start,
      }
    }
    const allowLegacyHere = !legacyAtStartOnly || dir === startDir
    if (!legacy && allowLegacyHere && LEGACY_MARKERS.some((marker) => existsSync(join(dir, marker)))) {
      legacy = { root: dir, manifest: null, manifestPath: null, legacy: true, unmanaged: false, start }
    }
    if (dir === home) break
    const parent = dirname(dir)
    if (parent === dir) break
    dir = parent
  }

  if (legacy && options.allowLegacy !== false) return legacy
  return { root: null, manifest: null, manifestPath: null, legacy: false, unmanaged: true, start }
}

/** 没有根时返回 null；调用方自行决定 explore 行为。 */
export function projectRootOf(target, options = {}) {
  return resolveProject(target, options).root
}

/** 项目内标准输出位置。 */
export function projectOut(root, kind, name) {
  return join(root, 'out', kind, name)
}

export function isInside(child, parent) {
  const rel = relative(resolve(parent), resolve(child))
  return rel === '' || (!rel.startsWith('..') && !isAbsolute(rel))
}

/**
 * 项目级互斥锁：写入 out/audio 之前拿锁，避免两个 render/tts 互相覆盖。
 * 返回 release()；拿不到锁时抛错。
 */
export function acquireProjectLock(root, options = {}) {
  if (!root) return () => {}
  const file = join(root, '.dsh-motion', 'project.lock')
  const staleMs = Number(options.staleMs ?? DEFAULT_STALE_MS)
  const token = {
    pid: process.pid,
    host: hostname(),
    command: options.command ?? 'motion',
    startedAt: new Date().toISOString(),
  }
  mkdirSync(dirname(file), { recursive: true })

  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      writeFileSync(file, `${JSON.stringify(token, null, 2)}\n`, { flag: 'wx' })
      return () => {
        try {
          const current = JSON.parse(readFileSync(file, 'utf8'))
          if (current.pid === token.pid && current.startedAt === token.startedAt) rmSync(file, { force: true })
        } catch {
          // 锁已被别人清掉/写坏时不强行删除
        }
      }
    } catch (error) {
      if (error?.code !== 'EEXIST') throw error
      let current = null
      try {
        current = JSON.parse(readFileSync(file, 'utf8'))
      } catch {
        current = null
      }
      const age = current?.startedAt ? Date.now() - Date.parse(current.startedAt) : staleMs
      if (!current || !Number.isFinite(age) || age > staleMs) {
        rmSync(file, { force: true })
        continue
      }
      throw new Error(
        `项目被占用：${file}\n`
        + `  命令: ${current.command ?? '?'}  pid=${current.pid}  host=${current.host}\n`
        + '等它结束，或确认锁已死后删除该文件。',
      )
    }
  }
  throw new Error(`拿不到项目锁：${file}`)
}
