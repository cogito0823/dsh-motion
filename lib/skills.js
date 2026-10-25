/**
 * 把包内 `skills/` 注册成 Harness 的 skill provider。
 *
 * 为什么需要这一层：`@deepseek-ai/dsh-skill-filesystem` 只扫描
 * `<project>/.dsh/skills`、`~/.dsh/skills` 等固定根，包内的
 * `node_modules/dsh-motion/skills/` 不在其中。没有 provider，
 * animation-router / design-spec / qa-rubric 就只是“死文件”，
 * 模型每个会话都要自己 cat README 才能知道工作流。
 *
 * provider 接口（与 @deepseek-ai/dsh-skill-office 同形）：
 *   { name, list(): Promise<Candidate[]>, get(entry, options): Promise<Content> }
 */

import { readFileSync, readdirSync, statSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { join, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

export const PROVIDER_NAME = 'motion'
export const BUNDLED_SKILL_RANK = 600
export const SKILLS_ROOT = fileURLToPath(new URL('../skills/', import.meta.url))

const SKILL_NAME = /^[a-z0-9]+(?:-[a-z0-9]+)*$/

/** 解析 SKILL.md 的 YAML frontmatter；只取 name/description，不引入 YAML 依赖。 */
export function parseSkillMarkdown(raw, locator = '<inline>') {
  const text = String(raw ?? '')
  if (!text.startsWith('---')) {
    throw new Error(`skill 缺少 frontmatter: ${locator}`)
  }
  const end = text.indexOf('\n---', 3)
  if (end < 0) throw new Error(`skill frontmatter 未闭合: ${locator}`)
  const header = text.slice(3, end)
  const content = text.slice(end + 4).replace(/^(?:\r?\n)+/, '')

  const fields = {}
  for (const line of header.split(/\r?\n/)) {
    const match = /^([A-Za-z][\w-]*):\s*(.*)$/.exec(line)
    if (!match) continue
    let value = match[2].trim()
    if (
      (value.startsWith('"') && value.endsWith('"'))
      || (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1).replace(/\\"/g, '"')
    }
    fields[match[1]] = value
  }

  const name = fields.name
  if (!name || !SKILL_NAME.test(name)) {
    throw new Error(`skill 名称非法: ${JSON.stringify(name)} (${locator})`)
  }
  if (!fields.description) {
    throw new Error(`skill 缺少 description: ${locator}`)
  }
  return { name, description: fields.description, content }
}

/** 扫一个目录，返回排序后的候选 skill（只认含 SKILL.md 的子目录）。 */
export function listSkillCandidates(root = SKILLS_ROOT) {
  const candidates = []
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue
    const directory = join(root, entry.name)
    const locator = join(directory, 'SKILL.md')
    try {
      if (!statSync(locator).isFile()) continue
    } catch {
      continue
    }
    try {
      const parsed = parseSkillMarkdown(readFileSync(locator, 'utf8'), locator)
      candidates.push({
        name: parsed.name,
        description: parsed.description,
        invocation: { modelInvocable: true, userInvocable: true },
        provider: PROVIDER_NAME,
        source: 'bundled',
        rank: BUNDLED_SKILL_RANK,
        resourceBase: { kind: 'directory', path: directory.split(sep).join('/') },
        locator,
      })
    } catch {
      // 坏 skill 不该拖垮整个插件；doctor/smoke 会单独报出来。
    }
  }
  return candidates.sort((a, b) => a.name.localeCompare(b.name))
}

/** 构造 provider；候选在创建时一次性读入，正文在 get 时按需读盘。 */
export function createSkillProvider(root = SKILLS_ROOT) {
  const candidates = listSkillCandidates(root)
  const byName = new Map(candidates.map((item) => [item.name, item]))

  return {
    name: PROVIDER_NAME,
    candidates,
    list: async () => candidates,
    async get(entry, options = {}) {
      const candidate = byName.get(entry?.name) ?? entry
      if (!candidate?.locator) {
        throw new Error(`unknown skill: ${entry?.name ?? '<missing>'}`)
      }
      const raw = await readFile(candidate.locator, {
        encoding: 'utf8',
        signal: options.signal,
      })
      const parsed = parseSkillMarkdown(raw, candidate.locator)
      const { rank: _rank, locator: _locator, ...summary } = candidate
      return { ...summary, name: parsed.name, description: parsed.description, content: parsed.content }
    },
  }
}

/**
 * 注册到 ctx.skills。skills 服务缺失时只记日志，不影响工具本身。
 * 返回 disposer（或 null）。
 */
export function registerSkills(ctx, { root = SKILLS_ROOT, log = () => {} } = {}) {
  const skills = ctx?.get?.('skills') ?? ctx?.skills
  if (!skills?.registerProvider) {
    log('skills 服务不可用，跳过 skill 注册')
    return null
  }
  const provider = createSkillProvider(root)
  if (provider.candidates.length === 0) {
    log(`skills 目录为空：${root}`)
    return null
  }
  const dispose = skills.registerProvider(() => provider)
  log(`registered ${provider.candidates.length} skills: ${provider.candidates.map((item) => item.name).join(', ')}`)
  return dispose
}
