#!/usr/bin/env node
/**
 * 显式风格路由：按 registry 打分，给出 top 3、推荐与置信度。
 *
 *   node scripts/route-style.mjs "导数 切线"
 *   node scripts/route-style.mjs "矩阵 特征值" --json
 *   node scripts/route-style.mjs "用 3b1b 风格讲单位圆"
 *
 * 规则：用户点名风格 > 关键词/uses 打分 > 默认风格；分数并列或为 0 时要求确认。
 */
import { readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const DEFAULT_REGISTRY = join(HERE, '..', 'styles', 'registry.json')

export function loadRegistry(path = DEFAULT_REGISTRY) {
  return JSON.parse(readFileSync(path, 'utf8'))
}

function scoreOne(style, query) {
  const q = query.toLowerCase()
  const reasons = []
  let score = 0

  if (q === style.slug.toLowerCase() || q === style.name_cn.toLowerCase()) {
    score += 12
    reasons.push('点名风格')
  } else if (q.includes(style.slug.toLowerCase()) || q.includes(style.name_cn.toLowerCase())) {
    score += 8
    reasons.push('点名风格')
  }

  const keywords = (style.keywords ?? []).filter((k) => q.includes(k.toLowerCase()))
  if (keywords.length) {
    score += keywords.length * 3
    reasons.push(`关键词: ${keywords.join(', ')}`)
  }

  const uses = [...(style.uses ?? []), ...(style.uses_cn ?? [])]
    .filter((u) => q.includes(u.toLowerCase()))
  if (uses.length) {
    score += uses.length * 2
    reasons.push(`用途: ${uses.join(', ')}`)
  }

  const avoided = (style.avoid ?? []).filter((a) => q.includes(a.toLowerCase()))
  if (avoided.length) {
    score -= avoided.length * 2
    reasons.push(`冲突: ${avoided.join(', ')}`)
  }

  return { slug: style.slug, score: Math.max(score, 0), reasons }
}

export function routeStyle(query, registry) {
  const q = String(query ?? '').trim()
  const styles = registry.styles ?? []
  const fallback = registry.default ?? styles[0]?.slug ?? null
  if (!q) {
    return { query: q, ranked: [], recommendation: fallback, confidence: 'low', needsConfirmation: true, reason: '空查询，使用默认风格' }
  }

  const ranked = styles
    .map((style) => scoreOne(style, q))
    .sort((a, b) => b.score - a.score || a.slug.localeCompare(b.slug))

  const top = ranked[0]
  if (!top || top.score === 0) {
    return { query: q, ranked: ranked.slice(0, 3), recommendation: fallback, confidence: 'low', needsConfirmation: true, reason: '没有命中关键词，使用默认风格' }
  }

  const tie = ranked[1] && ranked[1].score === top.score
  const lead = top.score - (ranked[1]?.score ?? 0)
  const confidence = tie ? 'medium' : top.score >= 6 && lead >= 3 ? 'high' : top.score >= 3 ? 'medium' : 'low'
  return {
    query: q,
    ranked: ranked.slice(0, 3),
    recommendation: top.slug,
    confidence,
    needsConfirmation: tie || confidence !== 'high',
    reason: tie ? '前两名同分，需要确认' : top.reasons.join('；'),
  }
}

function isMain() {
  return process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)
}

if (isMain()) {
  const args = process.argv.slice(2)
  const json = args.includes('--json')
  const rest = args.filter((a) => a !== '--json')
  const query = rest.join(' ').trim()
  if (!query) {
    console.error('用法: node scripts/route-style.mjs "<题材>" [--json]')
    process.exit(1)
  }
  const result = routeStyle(query, loadRegistry())
  if (json) {
    console.log(JSON.stringify(result, null, 2))
  } else {
    console.log(`推荐: ${result.recommendation}  (${result.confidence})`)
    console.log(`原因: ${result.reason}`)
    console.log('候选:')
    for (const [i, item] of result.ranked.entries()) {
      console.log(`  ${i + 1}. ${item.slug}  ${item.score}  ${item.reasons.join('；')}`)
    }
    if (result.needsConfirmation) console.log('需要确认：分数不唯一或置信度低，先问用户再写 DESIGN.md。')
  }
}
