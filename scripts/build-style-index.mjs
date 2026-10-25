#!/usr/bin/env node
/**
 * 从 styles/<slug>/style.json 生成 styles/README.md 的风格表和 styles/registry.json。
 *
 *   node scripts/build-style-index.mjs          # 写入
 *   node scripts/build-style-index.mjs --check  # 只检查是否过期（CI/smoke 用）
 *
 * style.json 是唯一事实来源；表与 registry 不再手写，避免漂移。
 */
import { readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const STYLES_DIR = join(ROOT, 'styles')
const README = join(STYLES_DIR, 'README.md')
const REGISTRY = join(STYLES_DIR, 'registry.json')
const DESIGN = join(ROOT, 'DESIGN.md')

function defaultStyle() {
  const match = /^style:\s*(\S+)/m.exec(readFileSync(DESIGN, 'utf8'))
  if (!match) throw new Error('DESIGN.md 缺少 style:')
  return match[1]
}

function loadStyles() {
  return readdirSync(STYLES_DIR, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => {
      const file = join(STYLES_DIR, entry.name, 'style.json')
      return JSON.parse(readFileSync(file, 'utf8'))
    })
    .sort((a, b) => String(a.num).localeCompare(String(b.num)))
}

function sourceLabel(style) {
  const url = `${style.source ?? ''} ${style.secondary_source ?? ''}`
  if (url.includes('lemomo-ai')) return 'Lemo-Opuscar'
  if (url.includes('subinium')) return 'subinium + manim_skill'
  return 'external'
}

function renderTable(styles) {
  const lines = [
    '<!-- styles:start -->',
    '| 风格 | 适合 | 来源 | 入口 |',
    '|---|---|---|---|',
  ]
  for (const style of styles) {
    const label = style.slug === 'swiss-motion' ? `${style.cn}（默认）` : style.cn
    const uses = (style.uses_cn ?? style.uses ?? []).join('、')
    lines.push(`| \`${style.slug}\` / ${label} | ${uses} | ${sourceLabel(style)} | [STYLE](${style.slug}/STYLE.md) · [tokens](${style.slug}/tokens.json) · [theme](${style.slug}/theme.py) |`)
  }
  lines.push('<!-- styles:end -->')
  return lines.join('\n')
}

function updateReadme(styles) {
  const text = readFileSync(README, 'utf8')
  const start = text.indexOf('<!-- styles:start -->')
  const end = text.indexOf('<!-- styles:end -->')
  const block = renderTable(styles)
  if (start >= 0 && end > start) {
    return text.slice(0, start) + block + text.slice(end + '<!-- styles:end -->'.length)
  }
  return `${text.trimEnd()}\n\n${block}\n`
}

function buildRegistry(styles) {
  return {
    version: 1,
    generated: true,
    default: defaultStyle(),
    styles: styles.map((style) => ({
      slug: style.slug,
      num: style.num,
      name_cn: style.cn,
      name_en: style.en,
      category_cn: style.category_cn,
      uses: style.uses ?? [],
      uses_cn: style.uses_cn ?? [],
      keywords: style.keywords ?? [],
      avoid: style.avoid ?? [],
      aspect: style.aspect ?? ['16:9'],
      fps: style.fps ?? 30,
      complexity: style.complexity ?? 'medium',
      demo: style.demo ?? null,
      source: style.source ?? null,
    })),
  }
}

const styles = loadStyles()
const registry = buildRegistry(styles)
const readme = updateReadme(styles)
const registryText = JSON.stringify(registry, null, 2) + '\n'

if (process.argv.includes('--check')) {
  const stale = readFileSync(README, 'utf8') !== readme
    || readFileSync(REGISTRY, 'utf8') !== registryText
  if (stale) {
    console.error('styles/README.md 或 styles/registry.json 已过期；运行 node scripts/build-style-index.mjs')
    process.exit(1)
  }
  console.log('styles index is up to date')
} else {
  writeFileSync(README, readme)
  writeFileSync(REGISTRY, registryText)
  console.log(`wrote styles/README.md table and styles/registry.json (${styles.length} styles, default ${registry.default})`)
}
