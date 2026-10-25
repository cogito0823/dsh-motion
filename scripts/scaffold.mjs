#!/usr/bin/env node
/**
 * 从 templates/project 复制一份项目骨架，并填入标题/时长。
 *
 *   node scripts/scaffold.mjs --title "欧拉公式" --duration 10
 *   node scripts/scaffold.mjs my-film --title "欧拉公式" --duration 10
 *
 * 默认落在 <会话 cwd>/dsh-motion-projects/<slug>，建完自动刷新 registry.json。
 */
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { basename, dirname, isAbsolute, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import {
  ensureProjectDirs,
  isInside,
  rebuildRegistry,
  slugify,
  uniqueDirName,
  workspaceRoot,
  writeProjectManifest,
} from '../lib/project.js'
const TEMPLATE = join(dirname(fileURLToPath(import.meta.url)), '..', 'templates', 'project')
const PACKAGE_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')

const HELP = `用法: node scripts/scaffold.mjs [dest] [选项]

  --title <text>       片名，默认目录名
  --duration <sec>     片长，默认 10
  --workspace <dir>    项目集目录，默认 <cwd>/dsh-motion-projects（--projects-home 同义，保留兼容）
  --force              目标非空时先删掉再建（慎用）
`

function parseArgs(argv) {
  const args = { _: [] }
  for (let i = 0; i < argv.length; i++) {
    const token = argv[i]
    if (!token.startsWith('--')) {
      args._.push(token)
      continue
    }
    const eq = token.indexOf('=')
    if (eq >= 0) {
      args[token.slice(2, eq)] = token.slice(eq + 1)
      continue
    }
    const key = token.slice(2)
    const next = argv[i + 1]
    if (next !== undefined && !next.startsWith('--')) {
      args[key] = next
      i++
    } else {
      args[key] = true
    }
  }
  return args
}

function safeTitle(value) {
  return String(value ?? '')
    .replace(/[\u0000-\u001f]/g, ' ')
    .replace(/"/g, "'")
    .trim()
}

function assertSafeDest(target) {
  const path = resolve(target)
  if (path === '/' || path === resolve(homedir()) || path.length < 6) {
    throw new Error(`拒绝写入可疑路径: ${path}`)
  }
  return path
}

function walk(dir) {
  const files = []
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) files.push(...walk(path))
    else if (entry.isFile()) files.push(path)
  }
  return files
}

/** 只替换文本模板；二进制（preview.jpg 等）原样复制。 */
function fill(file, vars) {
  if (!/\.(json|md|py|mjs|txt|yml|yaml)$/.test(file)) return
  let text = readFileSync(file, 'utf8')
  for (const [key, value] of Object.entries(vars)) {
    text = text.split(`{{${key}}}`).join(String(value))
  }
  writeFileSync(file, text)
}

/**
 * @param {string} dest 目标目录
 * @param {{title?: string, duration?: number, force?: boolean}} options
 */
export function scaffoldProject(dest, options = {}) {
  if (!existsSync(TEMPLATE)) throw new Error(`找不到模板: ${TEMPLATE}`)
  const fallbackTitle = dest ? basename(resolve(dest)) : 'untitled'
  const title = safeTitle(options.title ?? fallbackTitle) || 'untitled'
  const ws = workspaceRoot(options)
  let target
  if (dest && !isAbsolute(dest) && !dest.includes('/')) {
    // 相对的单段名字 = 项目目录名，落在 workspace 里
    target = assertSafeDest(join(ws, dest))
  } else if (dest) {
    const chosen = resolve(dest)
    if (!isInside(chosen, ws)) {
      throw new Error(
        `项目必须建在会话项目集里: ${ws}\n`
        + `  收到: ${chosen}\n`
        + '要建别处请先 export MOTION_PROJECTS_HOME=<目录>。',
      )
    }
    target = assertSafeDest(chosen)
  } else {
    target = assertSafeDest(join(ws, uniqueDirName(ws, slugify(title))))
  }
  const duration = Number(options.duration ?? 10)
  if (!Number.isFinite(duration) || duration <= 0) throw new Error(`duration 必须是正数: ${options.duration}`)
  if (!isInside(target, ws)) {
    throw new Error(`项目必须建在 ${ws} 下，收到 ${target}`)
  }

  if (existsSync(target)) {
    const entries = readdirSync(target)
    if (entries.length > 0) {
      if (!options.force) throw new Error(`目标非空: ${target}（要覆盖请加 --force）`)
      rmSync(target, { recursive: true, force: true })
    }
  }
  mkdirSync(target, { recursive: true })
  cpSync(TEMPLATE, target, { recursive: true })

  const round = (value) => Math.round(value * 100) / 100
  const atPoint = round(duration * 0.22)
  const atClose = round(duration * 0.68)
  const vars = {
    TITLE: title,
    DURATION: String(duration),
    HOLD_HOOK: String(round(duration * 0.18)),
    AT_POINT: String(atPoint),
    HOLD_POINT: String(round(duration * 0.3)),
    AT_CLOSE: String(atClose),
    HOLD_CLOSE: String(round(duration * 0.22)),
    LINE1: '0.1',
    LINE2: String(round(atPoint + 0.2)),
    LINE3: String(round(atClose + 0.2)),
  }
  const ignoreTemplate = join(target, 'gitignore.txt')
  if (existsSync(ignoreTemplate)) renameSync(ignoreTemplate, join(target, '.gitignore'))
  for (const file of walk(target)) fill(file, vars)

  ensureProjectDirs(target)
  const manifest = writeProjectManifest(target, {
    name: title,
    primaryScene: 'scene.py',
    slug: basename(target),
  })
  rebuildRegistry(options)
  return {
    dest: target,
    workspace: ws,
    title,
    duration,
    manifest,
    files: walk(target).map((file) => file.slice(target.length + 1)).sort(),
  }
}

function main() {
  const args = parseArgs(process.argv.slice(2))
  if (args.help) {
    console.log(HELP)
    return
  }
  const dest = args._[0]
  const result = scaffoldProject(dest, {
    title: args.title,
    duration: args.duration === undefined ? 10 : Number(args.duration),
    workspace: args.workspace ?? args['projects-home'],
    force: args.force === true,
  })
  console.log(`scaffold ${result.dest}`)
  console.log(`  ${result.title} · ${result.duration}s · ${result.manifest.id} · ${result.files.length} files`)
  for (const file of result.files) console.log(`  ${file}`)
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))) {
  try {
    main()
  } catch (error) {
    console.error(error?.message ?? String(error))
    process.exit(1)
  }
}
