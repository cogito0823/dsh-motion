/**
 * 项目根与 manifest：所有工具只认一个 workspace。
 *
 * 布局（workspace 就在会话工作目录下，不向上找）：
 *
 *   <workspace>/dsh-motion-projects/      ← 会话里的项目集合
 *     registry.json                       ← 派生索引，可删可重建，不参与寻址
 *     calculus-45s/
 *       motion.project.json               ← 身份（id）在这里
 *       APPROVALS.json
 *       scene.py  DESIGN.md  out/  audio/
 *
 * 三条不变量：
 *   1. 边界：解析永远不越过 workspace。外面的 scene.py 一律 unmanaged。
 *   2. 深度：项目必须是 workspace 的直接子目录；子目录里的 scene.py 不算新项目。
 *   3. 失败要响：缺 manifest、id 与账本不符、嵌套目录 → 报错并给修复命令，
 *      不 legacy、不向上继承、不静默降级。
 */

import { randomBytes } from 'node:crypto'
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  realpathSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs'
import { hostname } from 'node:os'
import { basename, dirname, extname, isAbsolute, join, relative, resolve, sep } from 'node:path'

export const PROJECT_FILE = 'motion.project.json'
export const PROJECT_SCHEMA = 1
/** 会话工作区下的项目集合目录名。 */
export const WORKSPACE_DIR = 'dsh-motion-projects'
export const REGISTRY_FILE = 'registry.json'
const PROJECT_ID = /^[A-Za-z0-9][A-Za-z0-9._-]{1,63}$/
const DEFAULT_STALE_MS = 2 * 60 * 60 * 1000
const MANAGED_DIRS = ['out', 'audio', '.dsh-motion']

/**
 * workspace 根：默认 `<会话 cwd>/dsh-motion-projects`。
 * 只认这一个位置——项目属于会话，不挂到家目录，也不向上搜同名目录。
 */
export function workspaceRoot(config = {}) {
  return resolve(
    config.workspace
    ?? config.projectsHome
    ?? process.env.MOTION_PROJECTS_HOME
    ?? join(process.cwd(), WORKSPACE_DIR),
  )
}

/**
 * 解析软链接后的绝对路径：macOS 的 /var → /private/var 会让字符串比较失效，
 * 统一按真实路径比较，避免“明明在 workspace 里却判成越界”。
 * 目标不存在时，向上找到第一个存在的祖先再拼回去。
 */
export function realish(target) {
  const abs = resolve(target)
  const parts = []
  let cursor = abs
  for (;;) {
    try {
      const real = realpathSync(cursor)
      return parts.length ? join(real, ...parts.reverse()) : real
    } catch {
      const parent = dirname(cursor)
      if (parent === cursor) return abs
      parts.push(basename(cursor))
      cursor = parent
    }
  }
}

/** @deprecated 旧名字，等价于 workspaceRoot。 */
export const projectsHome = workspaceRoot

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

/** 写 manifest；已存在时默认拒绝，repair/force 才覆盖。 */
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

function unmanaged(start, reason, extra = {}) {
  return {
    root: null,
    manifest: null,
    manifestPath: null,
    workspace: null,
    unmanaged: true,
    reason,
    start,
    ...extra,
  }
}

/**
 * 解析项目：ref 可以是
 *   · 项目目录名（workspace 相对，单段）      "calculus-45s"
 *   · 项目 id                                "calculus-45s-a1b2c3"
 *   · 项目内的绝对路径                        "/…/dsh-motion-projects/calculus-45s/scene.py"
 *
 * 不向上越界、不 legacy。找不到 manifest 时 fail loud（除非 mustExist=false）。
 */
export function resolveProject(ref, options = {}) {
  const ws = realish(options.workspace ? resolve(options.workspace) : workspaceRoot(options.config ?? {}))
  const start = String(ref ?? '')
  if (!start) throw new Error('resolveProject: 缺少项目引用')

  let target
  if (isAbsolute(start)) {
    target = realish(start)
  } else {
    // 先按 cwd 相对路径试（支持 "dsh-motion-projects/foo/scene.py"），
    // 只有“单段名字”才当作 workspace 里的项目目录名。
    const fromCwd = realish(resolve(start))
    if (isInside(fromCwd, ws)) {
      target = fromCwd
    } else if (!start.includes('/') && !start.includes('\\') && start !== '.' && start !== '..') {
      target = join(ws, start)
    } else {
      throw new Error(
        `无法解析项目引用 "${start}"。\n`
        + `  项目集: ${ws}\n`
        + '  用法: 单段目录名（"calculus-45s"）、项目内绝对路径，或 workspace 内的相对路径。',
      )
    }
  }

  // 绝对路径：判断是否落在 workspace 里。
  if (!isInside(target, ws)) {
    return unmanaged(start, 'outside-workspace', { workspace: ws })
  }

  let dir
  try {
    dir = statSync(target).isDirectory() ? target : dirname(target)
  } catch {
    // 还没生成的文件/目录：按扩展名判断是文件还是目录
    dir = extname(target) ? dirname(target) : target
  }

  const rel = relative(ws, dir)
  const depth = rel === '' ? 0 : rel.split(sep).length
  if (depth === 0) {
    if (options.mustExist === false) return unmanaged(start, 'is-workspace', { workspace: ws, projectPath: ws })
    throw new Error(`这里就是 workspace 本身，不是项目：${ws}`)
  }

  // 从目标目录往上找最近的 manifest，最多到 workspace 根（不越界）。
  let cursor = dir
  while (isInside(cursor, ws) && cursor !== ws) {
    if (existsSync(join(cursor, PROJECT_FILE))) {
      const projectDepth = relative(ws, cursor).split(sep).length
      if (projectDepth > 1) {
        throw new Error(
          `不允许嵌套项目：${cursor}\n`
            + `项目必须是 ${ws} 的直接子目录。把它移到 workspace 根下，或删掉它的 ${PROJECT_FILE}。`,
        )
      }
      return {
        root: cursor,
        manifest: readProjectManifest(cursor),
        manifestPath: join(cursor, PROJECT_FILE),
        workspace: ws,
        unmanaged: false,
        reason: null,
        start,
        dirName: relative(ws, cursor),
      }
    }
    cursor = dirname(cursor)
  }

  const projectPath = join(ws, rel.split(sep)[0])
  if (options.mustExist === false) {
    return unmanaged(start, 'missing-manifest', { workspace: ws, projectPath })
  }
  throw new Error(
    `不是项目：${projectPath} 下没有 ${PROJECT_FILE}。\n`
      + `修复：node scripts/projects.mjs repair ${rel.split(sep)[0]}   （补 manifest 并刷新索引）\n`
      + '或新建：node scripts/scaffold.mjs --title "片名" --duration 30',
  )
}

/** 兼容旧调用：拿不到根就返回 null。 */
export function projectRootOf(ref, options = {}) {
  try {
    return resolveProject(ref, { ...options, mustExist: false }).root
  } catch {
    return null
  }
}

/** 项目里的主场景文件；ref 可以是项目名、id 或项目内路径。 */
export function sceneOf(ref, options = {}) {
  const start = String(ref ?? '')
  // 看起来就是文件路径（相对或绝对）时直接当路径用；项目名才走 project 解析
  if (/\.py$/i.test(start) && (isAbsolute(start) || start.includes('/'))) return realish(start)
  const project = resolveProject(ref, options)
  if (!project.root) {
    throw new Error(
      `未知项目 "${start}"（${project.reason ?? '未托管'}）。\n`
        + `  项目集: ${project.workspace ?? workspaceRoot({})}\n`
        + '  看现有项目: node scripts/projects.mjs list\n'
        + '  新建: node scripts/scaffold.mjs --title "片名" --duration 30',
    )
  }
  const scene = project.manifest?.primaryScene ?? 'scene.py'
  return join(project.root, scene)
}

/** workspace 里的项目列表（扫描磁盘，不读 registry）。 */
export function listProjects(config = {}) {
  const ws = workspaceRoot(config)
  if (!existsSync(ws)) return []
  const out = []
  for (const entry of readdirSync(ws, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue
    if (entry.name.startsWith('.')) continue
    const dir = join(ws, entry.name)
    const file = join(dir, PROJECT_FILE)
    if (!existsSync(file)) continue
    try {
      const manifest = readProjectManifest(dir)
      out.push({ dir: entry.name, path: dir, id: manifest.id, name: manifest.name, createdAt: manifest.createdAt, primaryScene: manifest.primaryScene })
    } catch (error) {
      out.push({ dir: entry.name, path: dir, error: error.message })
    }
  }
  return out.sort((a, b) => String(a.dir).localeCompare(String(b.dir)))
}

/** 重建派生索引。registry 只是 cache：读路径从不依赖它。 */
export function rebuildRegistry(config = {}) {
  const ws = workspaceRoot(config)
  mkdirSync(ws, { recursive: true })
  const data = {
    schema: 1,
    workspace: ws,
    generatedAt: new Date().toISOString(),
    projects: listProjects(config).map(({ dir, id, name, createdAt, primaryScene, error }) => (
      error ? { dir, error } : { dir, id, name, createdAt, primaryScene }
    )),
  }
  const file = join(ws, REGISTRY_FILE)
  const tmp = `${file}.tmp`
  writeFileSync(tmp, `${JSON.stringify(data, null, 2)}\n`)
  renameSync(tmp, file)
  return { ...data, path: file }
}

/** 目录名冲突时加 -2 / -3。 */
export function uniqueDirName(ws, slug) {
  if (!existsSync(join(ws, slug))) return slug
  for (let index = 2; index < 100; index += 1) {
    const candidate = `${slug}-${index}`
    if (!existsSync(join(ws, candidate))) return candidate
  }
  throw new Error(`目录名冲突太多：${slug}`)
}

/** 项目内标准输出位置。 */
export function projectOut(root, kind, name) {
  return join(root, 'out', kind, name)
}

/** 新建项目骨架时要建的目录。 */
export function ensureProjectDirs(root) {
  for (const dir of MANAGED_DIRS) mkdirSync(join(root, dir), { recursive: true })
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
