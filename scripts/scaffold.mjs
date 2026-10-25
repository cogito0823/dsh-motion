#!/usr/bin/env node
/**
 * 从 templates/project 复制一份项目骨架，并填入标题/时长。
 *
 *   node scripts/scaffold.mjs --title "欧拉公式" --duration 10
 *   node scripts/scaffold.mjs ~/dsh-motion-projects/my-film --title "欧拉公式" --duration 10
 *   node scripts/scaffold.mjs <dest> --force
 */
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { basename, dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { isInside, projectsHome, slugify, writeProjectManifest } from '../lib/project.js'
const TEMPLATE = join(dirname(fileURLToPath(import.meta.url)), '..', 'templates', 'project')
const PACKAGE_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')

const HELP = `用法: node scripts/scaffold.mjs [dest] [选项]

  --title <text>       片名，默认目录名
  --duration <sec>     片长，默认 10
  --projects-home <dir> 项目工作区，默认 ~/dsh-motion-projects
  --allow-inside-repo  允许建在插件包内（仅维护者）
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
  const target = assertSafeDest(
    dest ?? join(projectsHome(options), slugify(title)),
  )
  const duration = Number(options.duration ?? 10)
  if (!Number.isFinite(duration) || duration <= 0) throw new Error(`duration 必须是正数: ${options.duration}`)
  if (isInside(target, PACKAGE_ROOT) && options.allowInsideRepo !== true) {
    throw new Error(
      `拒绝在插件包内创建项目: ${target}\n`
      + `请用项目工作区（默认 ${projectsHome(options)}），维护者确需放包内时加 --allow-inside-repo。`,
    )
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

  for (const dir of ['out', 'audio', '.dsh-motion']) mkdirSync(join(target, dir), { recursive: true })
  const manifest = writeProjectManifest(target, {
    name: title,
    primaryScene: 'scene.py',
    slug: basename(target),
  })
  return {
    dest: target,
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
    projectsHome: args['projects-home'],
    allowInsideRepo: args['allow-inside-repo'] === true,
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
