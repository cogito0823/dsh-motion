#!/usr/bin/env node
/**
 * 需求卡点：从 brief 推断该问什么、该给哪些选项。
 *
 *   node scripts/plan-questions.mjs "做一条竖屏抖音短片，讲导数，要旁白" --json
 *   node scripts/plan-questions.mjs "用 3b1b 讲矩阵"
 *
 * 原则：能推断的不问；选项按上下文生成，不写死。
 * 输出可直接交给 ask_user_question；最多 4 题。
 */
import { loadRegistry, routeStyle } from './route-style.mjs'

const MAX_QUESTIONS = 4

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

const MATH_WORDS = ['数学', '公式', '导数', '几何', '概率', '微积分', '线代', '矩阵', '向量', '证明',
  '三角', '函数', '物理', '化学', '生物', '算法', '统计', '复数', '单位圆', '欧拉']
const AUDIENCE_WORDS = ['大众', '科普', '入门', '高中', '初中', '大学', '专业', '研究生', '论文', '工程师', '学生']

const AUDIENCES = {
  general: { label: '大众科普', description: '少符号、多比喻；先讲清"为什么"。' },
  high: { label: '高中', description: '保留公式，控制推导密度；默认按课标。' },
  university: { label: '大学 / 专业', description: '可以直接上定义、证明、矩阵；密度更高。' },
}

function hits(brief, words) {
  const q = brief.toLowerCase()
  return words.filter((word) => q.includes(word.toLowerCase())).length
}

function aspectBlock(brief) {
  const scored = Object.keys(ASPECTS).map((key) => ({
    key,
    score: hits(brief, ASPECT_HINTS.find((h) => h.key === key)?.words ?? []),
  }))
  scored.sort((a, b) => b.score - a.score || (a.key === '16:9' ? -1 : 1))
  const explicit = scored.filter((item) => item.score > 0)
  const top = scored[0].key
  if (explicit.length === 1) {
    return { assumption: top, question: null }
  }
  const second = top === '16:9' ? '9:16' : '16:9'
  return {
    assumption: top,
    question: {
      id: 'aspect',
      header: '画幅',
      question: '这条片子要横屏、竖屏还是方屏？',
      options: [top, second].map((key) => ({ ...ASPECTS[key] })),
    },
  }
}

function deliveryBlock(brief) {
  const narration = hits(brief, NARRATION_WORDS)
  const silent = hits(brief, SILENT_WORDS)
  if (narration > 0 && silent === 0) return { assumption: 'narrated', question: null }
  if (silent > 0 && narration === 0) return { assumption: 'silent', question: null }
  const order = narration > 0 && silent > 0
    ? ['frames', 'silent', 'narrated']
    : ['frames', 'silent', 'narrated']
  return {
    assumption: order[0],
    question: {
      id: 'delivery',
      header: '交付',
      question: '做到哪一步？',
      options: order.map((key) => ({ ...DELIVERY[key] })),
    },
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

function styleBlock(brief, registry) {
  const routed = routeStyle(brief, registry)
  const bySlug = new Map(registry.styles.map((style) => [style.slug, style]))
  const picked = routed.ranked.filter((item) => item.score > 0).slice(0, 3)
  if (hasNamedStyle(brief, registry) || picked.length === 0) {
    const fallback = bySlug.get(registry.default)
    const options = picked.map(({ slug, reasons }) => {
      const style = bySlug.get(slug)
      return {
        label: style.slug === registry.default ? `${style.name_cn}（默认）` : style.name_cn,
        description: `${style.uses_cn?.join('、') ?? ''}${reasons.length ? `；命中：${reasons.join('、')}` : ''}`,
      }
    })
    if (picked.length === 0) {
      options.push(
        {
          label: `${fallback.name_cn}（默认）`,
          description: `题材没有明显命中；先用默认。${fallback.uses_cn?.join('、') ?? ''}`,
        },
        { label: '让你决定（我先按默认做）', description: '不用现在选；我先按默认风格出 3 张帧，后面再换。' },
      )
    }
    return {
      assumption: picked[0]?.slug ?? registry.default,
      question: hasNamedStyle(brief, registry) ? null : {
        id: 'style',
        header: '风格',
        question: '风格选哪个？选项是按题材推的，不是固定清单。',
        options,
      },
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
    options.push({
      label: `${fallback.name_cn}（默认）`,
      description: `保底选项；${fallback.uses_cn?.join('、') ?? ''}`,
    })
  }
  return {
    assumption: picked[0].slug,
    question: {
      id: 'style',
      header: '风格',
      question: '风格选哪个？选项是按题材推的，不是固定清单。',
      options,
    },
  }
}

function isMathTopic(brief) {
  return hits(brief, MATH_WORDS) > 0
}

function audienceBlock(brief, aspect) {
  if (!isMathTopic(brief) || hits(brief, AUDIENCE_WORDS) > 0) return null
  const order = aspect === '9:16'
    ? ['general', 'high', 'university']
    : ['high', 'university', 'general']
  return {
    assumption: order[0],
    question: {
      id: 'audience',
      header: '受众',
      question: '这条片给谁看？它决定符号密度和推导长度。',
      options: order.map((key) => ({ ...AUDIENCES[key] })),
    },
  }
}

function narrationBlock(brief, delivery) {
  if (delivery !== 'narrated') return null
  if (/english|英文|中文|chinese|双语|bilingual/i.test(brief)) return null
  const options = [
    { label: '中文 · 中性', description: '默认：跟随用户语言，冷静、克制。' },
    { label: '中文 · 温和', description: '更适合科普、课程。' },
    { label: '中文 · 有力', description: '更适合宣传、结论型短片。' },
    { label: '英文 · 中性', description: '需要英文旁白与英文字幕。' },
  ]
  return {
    assumption: { language: 'zh', voice: 'neutral' },
    question: {
      id: 'narration',
      header: '旁白',
      question: '旁白用什么语言和声音？语言默认跟随你。',
      options,
    },
  }
}

export function planQuestions(brief, registry = loadRegistry()) {
  const aspect = aspectBlock(brief)
  const delivery = deliveryBlock(brief)
  const style = styleBlock(brief, registry)
  const audience = audienceBlock(brief, aspect.assumption)
  const narration = narrationBlock(brief, delivery.assumption)

  const questions = [aspect.question, delivery.question, style.question, audience?.question, narration?.question]
    .filter(Boolean)
    .slice(0, MAX_QUESTIONS)

  const language = /english|英文/i.test(brief) ? 'en' : 'zh'
  return {
    brief,
    questions,
    assumptions: {
      aspect: aspect.assumption,
      delivery: delivery.assumption,
      style: style.assumption,
      audience: audience?.assumption ?? null,
      narration: narration?.assumption ?? (delivery.assumption === 'narrated' ? { language, voice: 'neutral' } : null),
      durationSec: durationOf(brief) ?? 10,
      language,
      captions: delivery.assumption === 'narrated',
      note: '未指定的项按 assumptions 执行；用户回答后覆盖。',
    },
    routing: routeStyle(brief, registry),
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
    console.log(`\n默认: ${plan.assumptions.aspect} / ${plan.assumptions.delivery} / ${plan.assumptions.style} / ${plan.assumptions.audience ?? '-'} / ${plan.assumptions.durationSec}s`)
  }
}
