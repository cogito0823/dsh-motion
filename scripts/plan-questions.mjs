#!/usr/bin/env node
/**
 * 需求卡点：从 brief 推断该问什么、该给哪些选项。
 *
 *   node scripts/plan-questions.mjs "做一条竖屏抖音短片，讲导数，要旁白" --json
 *   node scripts/plan-questions.mjs "用 3b1b 讲矩阵" 
 *
 * 输出可直接喂给 ask_user_question 的 questions；选项来自当前 styles/registry.json，
 * 不是写死的风格清单。能从 brief 推断的项不重复问。
 */
import { loadRegistry, routeStyle } from './route-style.mjs'

const ASPECTS = {
  '16:9': {
    label: '16:9 横屏 · 1920×1080',
    description: '课件、网页、B站/YouTube 最常用；现有风格验证最充分。',
  },
  '9:16': {
    label: '9:16 竖屏 · 1080×1920',
    description: '抖音 / Reels / Shorts；现有风格还没验过竖版，先出帧确认。',
  },
  '1:1': {
    label: '1:1 方屏 · 1080×1080',
    description: '信息流 / 方图；同样需要重新验帧。',
  },
}

const ASPECT_HINTS = [
  { key: '9:16', words: ['竖屏', '抖音', '短视频', '手机', 'reels', 'shorts', 'tiktok', '快手', '视频号'] },
  { key: '1:1', words: ['方图', '正方形', '1:1', 'instagram', 'ig', '朋友圈'] },
  { key: '16:9', words: ['横屏', 'b站', 'bilibili', 'youtube', '课件', '投影', '网页', '16:9'] },
]

const DELIVERY = {
  frames: {
    label: '先出帧（默认）',
    description: '只出 PNG 帧，几秒看版式；不生成视频。',
  },
  silent: {
    label: '静音 mp4',
    description: '生成无音轨的成片；适合循环、背景、无解说。',
  },
  narrated: {
    label: '旁白 + 字幕（HF）',
    description: 'TTS/录音、字幕、混音；需要 HyperFrames，交付最慢。',
  },
}

const NARRATION_WORDS = ['旁白', '配音', '讲解', '口播', '字幕', 'voiceover', 'narration', '声音']
const SILENT_WORDS = ['静音', '无声', '不要声音', '只要画面', 'loop', '循环']

function hits(brief, words) {
  const q = brief.toLowerCase()
  return words.filter((word) => q.includes(word.toLowerCase())).length
}

function aspectQuestion(brief) {
  const scored = Object.keys(ASPECTS).map((key) => ({
    key,
    score: hits(brief, ASPECT_HINTS.find((h) => h.key === key)?.words ?? []),
  }))
  scored.sort((a, b) => b.score - a.score || (a.key === '16:9' ? -1 : 1))
  const top = scored[0].key
  const second = top === '16:9' ? '9:16' : '16:9'
  return {
    id: 'aspect',
    header: '画幅',
    question: '这条片子要横屏、竖屏还是方屏？',
    options: [top, second].map((key) => ({ ...ASPECTS[key] })),
    defaultKey: top,
  }
}

function deliveryQuestion(brief) {
  const narration = hits(brief, NARRATION_WORDS)
  const silent = hits(brief, SILENT_WORDS)
  const order = narration > 0 ? ['narrated', 'silent', 'frames'] : silent > 0 ? ['silent', 'frames', 'narrated'] : ['frames', 'silent', 'narrated']
  return {
    id: 'delivery',
    header: '交付',
    question: '做到哪一步？',
    options: order.map((key) => ({ ...DELIVERY[key] })),
    defaultKey: order[0],
  }
}

function durationOf(brief) {
  const match = /(\d+(?:\.\d+)?)\s*(秒|s\b|sec|分钟|min)/i.exec(brief)
  if (!match) return null
  const n = Number(match[1])
  return /分钟|min/i.test(match[2]) ? Math.round(n * 60) : Math.round(n)
}

function hasNamedStyle(brief, registry) {
  const q = brief.toLowerCase()
  return registry.styles.some((style) =>
    q.includes(style.slug.toLowerCase()) || q.includes(String(style.name_cn).toLowerCase()))
}

function styleOptions(brief, registry) {
  const routed = routeStyle(brief, registry)
  const bySlug = new Map(registry.styles.map((style) => [style.slug, style]))
  const picked = routed.ranked.filter((item) => item.score > 0).slice(0, 3)
  if (picked.length === 0) {
    const fallback = bySlug.get(registry.default)
    return {
      defaultKey: registry.default,
      options: [
        {
          label: `${fallback.name_cn}（默认）`,
          description: `题材没有明显命中；先用默认。${fallback.uses_cn?.join('、') ?? ''}`,
        },
        { label: '让你决定（我先按默认做）', description: '不用现在选；我先按默认风格出 3 张帧，后面再换。' },
      ],
    }
  }
  const options = picked.map(({ slug, reasons }) => {
    const style = bySlug.get(slug)
    return {
      label: style.slug === registry.default ? `${style.name_cn}（默认）` : style.name_cn,
      description: `${style.uses_cn?.join('、') ?? ''}${reasons.length ? `；命中：${reasons.join('、')}` : ''}`,
    }
  })
  if (options.length < 2) {
    const fallback = bySlug.get(registry.default)
    if (picked[0].slug !== registry.default) {
      options.push({
        label: `${fallback.name_cn}（默认）`,
        description: `保底选项；${fallback.uses_cn?.join('、') ?? ''}`,
      })
    } else {
      options.push({ label: '让你决定（先按推荐做）', description: '先按推荐风格出 3 张帧，看完再换。' })
    }
  }
  return { defaultKey: picked[0].slug, options }
}

export function planQuestions(brief, registry = loadRegistry()) {
  const routed = routeStyle(brief, registry)
  const durationSec = durationOf(brief) ?? 10
  const aspect = aspectQuestion(brief)
  const delivery = deliveryQuestion(brief)
  const styles = styleOptions(brief, registry)
  const questions = [aspect, delivery]
  // 风格是口味选择：只要用户没点名，就给 top 选项；点名则直接跳过。
  if (!hasNamedStyle(brief, registry)) {
    questions.push({
      id: 'style',
      header: '风格',
      question: '风格选哪个？选项是按题材推的，不是固定清单。',
      options: styles.options,
    })
  }
  return {
    brief,
    questions: questions.map(({ defaultKey, ...question }) => question),
    assumptions: {
      aspect: aspect.defaultKey,
      delivery: delivery.defaultKey,
      style: routed.recommendation,
      durationSec,
      language: /english|英文/i.test(brief) ? 'en' : 'zh',
      captions: delivery.defaultKey === 'narrated',
      note: '未指定的项按 assumptions 执行；用户回答后覆盖。',
    },
    routing: routed,
  }
}

function isMain() {
  return process.argv[1] && new URL(import.meta.url).pathname === new URL(`file://${process.argv[1]}`).pathname
}

if (isMain()) {
  const args = process.argv.slice(2)
  const json = args.includes('--json')
  const brief = args.filter((a) => a !== '--json').join(' ').trim()
  if (!brief) {
    console.error('用法: node scripts/plan-questions.mjs "<需求>" [--json]')
    process.exit(1)
  }
  const plan = planQuestions(brief)
  if (json) {
    console.log(JSON.stringify(plan, null, 2))
  } else {
    console.log(`需求: ${plan.brief}`)
    for (const q of plan.questions) {
      console.log(`\n[${q.header}] ${q.question}`)
      for (const option of q.options) console.log(`  - ${option.label}：${option.description}`)
    }
    console.log(`\n默认时长: ${plan.assumptions.durationSec}s；语言: ${plan.assumptions.language}`)
  }
}
