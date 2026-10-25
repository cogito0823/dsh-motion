#!/usr/bin/env node
/**
 * 给已有项目补 motion.project.json（不移动文件）。
 *
 *   node scripts/project-adopt.mjs <project>
 *   node scripts/project-adopt.mjs <project> --name "欧拉公式" --primary-scene scene.py --force
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { basename, join, resolve } from 'node:path'

import { PROJECT_FILE, resolveProject, writeProjectManifest } from '../lib/project.js'

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

function main() {
  const args = parseArgs(process.argv.slice(2))
  const root = resolve(args._[0] ?? '.')
  if (!existsSync(root)) throw new Error(`目录不存在: ${root}`)
  if (existsSync(join(root, PROJECT_FILE)) && args.force !== true) {
    throw new Error(`${join(root, PROJECT_FILE)} 已存在（要重建加 --force）`)
  }
  const legacy = resolveProject(root, { allowLegacy: true })
  if (!legacy.legacy && !legacy.manifest) {
    throw new Error(
      `不是可识别的项目目录: ${root}\n`
      + '需要 timeline.json / narration.json / APPROVALS.json / DESIGN.md / scene.py 之一。',
    )
  }

  const manifest = writeProjectManifest(root, {
    name: args.name ?? basename(root),
    primaryScene: args['primary-scene'] ?? (existsSync(join(root, 'scene.py')) ? 'scene.py' : undefined),
    force: args.force === true,
  })
  for (const dir of ['out', 'audio', '.dsh-motion']) mkdirSync(join(root, dir), { recursive: true })

  const approvalsPath = join(root, 'APPROVALS.json')
  if (existsSync(approvalsPath)) {
    const data = JSON.parse(readFileSync(approvalsPath, 'utf8'))
    if (data.projectId !== manifest.id) {
      data.projectId = manifest.id
      writeFileSync(approvalsPath, `${JSON.stringify(data, null, 2)}\n`)
      console.log(`bound ${approvalsPath} -> ${manifest.id}`)
    }
  }

  console.log(`adopted ${root}`)
  console.log(`  id: ${manifest.id}`)
  console.log(`  manifest: ${manifest.path}`)
}

try {
  main()
} catch (error) {
  console.error(error?.message ?? String(error))
  process.exit(1)
}
