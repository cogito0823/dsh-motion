#!/usr/bin/env node
/**
 * 会话项目集的管理命令。
 *
 *   node scripts/projects.mjs list
 *   node scripts/projects.mjs repair [<目录名>]     补 manifest / 重绑 id / 重建索引
 *   node scripts/projects.mjs rename <旧目录名> <新目录名>
 *   node scripts/projects.mjs show <目录名>
 *
 * 只在 <cwd>/dsh-motion-projects 里操作；路径越界直接报错，不向上找、不 legacy。
 */
import { existsSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { basename, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import {
  PROJECT_FILE,
  listProjects,
  readProjectManifest,
  rebuildRegistry,
  resolveProject,
  uniqueDirName,
  workspaceRoot,
  writeProjectManifest,
} from '../lib/project.js'

const HELP = `用法: node scripts/projects.mjs <command>

  list                     列出项目（扫描磁盘，不读 registry）
  show <目录名>            打印 manifest 与账本绑定
  repair [<目录名>]        补 manifest / 重绑 APPROVALS.projectId，然后重建 registry.json
  rename <旧> <新>         改目录名（id 不变），然后重建 registry.json
  registry                 只重建 registry.json

项目集固定为 <cwd>/dsh-motion-projects（可用 MOTION_PROJECTS_HOME 覆盖）。
`

function main() {
  const [command, ...rest] = process.argv.slice(2)
  const ws = workspaceRoot({})
  if (!command || command === '--help' || command === 'help') {
    console.log(HELP)
    return
  }

  if (command === 'list') {
    const projects = listProjects({ workspace: ws })
    if (!projects.length) {
      console.log(`(空) ${ws}`)
      console.log('新建: node scripts/scaffold.mjs --title "片名" --duration 30')
      return
    }
    for (const project of projects) {
      console.log(project.error
        ? `✗ ${project.dir}  ${project.error}`
        : `· ${project.dir}  ${project.id}  ${project.name}`)
    }
    return
  }

  if (command === 'registry') {
    const result = rebuildRegistry({ workspace: ws })
    console.log(`registry: ${result.path} (${result.projects.length} projects)`)
    return
  }

  if (command === 'show') {
    const ref = rest[0]
    if (!ref) throw new Error('show 需要目录名')
    const project = resolveProject(ref, { workspace: ws })
    console.log(`root: ${project.root}`)
    console.log(`id:   ${project.manifest.id}`)
    console.log(`name: ${project.manifest.name}`)
    const approvals = join(project.root, 'APPROVALS.json')
    if (existsSync(approvals)) {
      const data = JSON.parse(readFileSync(approvals, 'utf8'))
      const bound = data.projectId ?? null
      console.log(`ledger: ${bound === project.manifest.id ? '已绑定' : `未绑定（${bound ?? '无 id'}）`}`)
    } else {
      console.log('ledger: 还没有 APPROVALS.json')
    }
    return
  }

  if (command === 'rename') {
    const [from, to] = rest
    if (!from || !to) throw new Error('rename 需要旧目录名和新目录名')
    const project = resolveProject(from, { workspace: ws })
    const targetName = uniqueDirName(ws, basename(to))
    const target = join(ws, targetName)
    renameSync(project.root, target)
    rebuildRegistry({ workspace: ws })
    console.log(`renamed ${basename(project.root)} → ${targetName}（id 不变: ${project.manifest.id}）`)
    return
  }

  if (command === 'repair') {
    const ref = rest[0]
    const targets = ref ? [ref] : listProjects({ workspace: ws }).map((item) => item.dir)
    if (!targets.length) {
      console.log(`(空) ${ws}`)
      return
    }
    for (const dir of targets) {
      const root = join(ws, dir)
      if (!existsSync(root)) throw new Error(`目录不存在: ${root}`)
      let manifest = null
      try {
        manifest = readProjectManifest(root)
      } catch {
        manifest = null
      }
      if (!manifest) {
        manifest = writeProjectManifest(root, {
          name: basename(root),
          primaryScene: existsSync(join(root, 'scene.py')) ? 'scene.py' : undefined,
        })
        console.log(`+ ${dir}: 补了 ${PROJECT_FILE} (${manifest.id})`)
      }
      const approvals = join(root, 'APPROVALS.json')
      if (existsSync(approvals)) {
        const data = JSON.parse(readFileSync(approvals, 'utf8'))
        if (data.projectId !== manifest.id) {
          data.projectId = manifest.id
          writeFileSync(approvals, `${JSON.stringify(data, null, 2)}\n`)
          console.log(`= ${dir}: 账本重绑 → ${manifest.id}`)
        }
      }
    }
    const result = rebuildRegistry({ workspace: ws })
    console.log(`registry: ${result.path} (${result.projects.length} projects)`)
    return
  }

  throw new Error(`未知命令: ${command}\n\n${HELP}`)
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))) {
  try {
    main()
  } catch (error) {
    console.error(error?.message ?? String(error))
    process.exit(1)
  }
}
