#!/usr/bin/env node
/**
 * 需求卡点：固定七题，一次弹完。
 *
 *   node scripts/plan-questions.mjs "做一条竖屏抖音短片，讲导数，要旁白" --json
 *   node scripts/plan-questions.mjs "用 3b1b 讲矩阵"
 *
 * 原则：
 *   1. 题目和题数固定——每次生成都是同样七题、同样顺序，不按关键词增删；
 *   2. 每题都带推断出的默认项（排第一、标“推荐”），用户可以直接一路确认；
 *   3. 选项带 `value`，落账时用 value，不靠中文标签反解。
 *
 * 固定顺序：受众 → 风格 → 交付 → 时长 → 画幅 → 帧率 → 旁白。
 * 顺序理由：受众定符号密度与推导长度，风格在其密度下选视觉语法，
 * 交付决定有无音轨，时长以这三者为前提；画幅/帧率是纯规格，旁白依赖交付。
 *
 * 跨题依赖：七题同时呈现，时长选项只能按“推断出的受众/交付”给；
 * 用户在同一轮改掉受众后，时长默认可能不再匹配——答完回显时复核一次。
 */
import { loadRegistry, routeStyle } from './route-style.mjs'

/** 固定题目集：顺序即呈现顺序，也是落账顺序。 */
export const QUESTION_IDS = ['audience', 'style', 'delivery', 'duration', 'aspect', 'fps', 'narration']

/** 帧率白名单：业界通用的整数档。分数帧率（23.976/29.97/59.94）走 Other 特例。 */
export const FPS_CHOICES = [24, 25, 30, 50, 60]
/** 默认帧率：网络交付的通行值。 */
export const DEFAULT_FPS = 30

const LABEL_OF_SIZE = {
  '1920x1080': '16:9 横屏 · 1920×1080',
  '3840x2160': '16:9 横屏 · 3840×2160（4K）',
  '1080x1920': '9:16 竖屏 · 1080×1920',
  '1080x1080': '1:1 方屏 · 1080×1080',
}
const DESC_OF_SIZE = {
  '1920x1080': '课件、网页、B站最常用；现有风格验证最充分。',
  '3840x2160': '投屏、电视、后期二次裁切；渲染量约为 1080p 的四倍。',
  '1080x1920': '抖音 / Reels / Shorts；字幕要抬进安全区。',
  '1080x1080': '信息流 / 方图；适合封面式构图。',
}
/** 画幅 key → 默认像素；4K 只给横屏，避免出现没人验过的 2160×3840。 */
const SIZE_OF = { '16:9': '1920x1080', '9:16': '1080x1920', '1:1': '1080x1080' }
const ASPECT_OF_SIZE = {
  '1920x1080': '16:9',
  '3840x2160': '16:9',
  '1080x1920': '9:16',
  '1080x1080': '1:1',
}

const ASPECT_HINTS = [
  { key: '9:16', words: ['竖屏', '抖音', '短视频', '手机', 'reels', 'shorts', 'tiktok', '快手', '视频号'] },
  { key: '1:1', words: ['方图', '正方形', '1:1', 'instagram', 'ig', '朋友圈'] },
  { key: '16:9', words: ['横屏', 'b站', 'bilibili', 'youtube', '课件', '投影', '网页', '16:9'] },
]

const DELIVERY = {
  narrated: {
    label: '旁白 + 字幕（推荐）',
    description: 'TTS + 烧录字幕，走 HyperFrames；交付最慢但最完整。',
  },
  silent: {
    label: '静音 mp4',
    description: '无音轨成片，适合循环、背景、现场讲解。',
  },
  frames: {
    label: '先出帧',
    description: '只出 PNG，几秒看版式；不生成视频，帧率不适用。',
  },
}

const NARRATION_WORDS = ['旁白', '配音', '讲解', '口播', '字幕', 'voiceover', 'narration', '声音']
const SILENT_WORDS = ['静音', '无声', '不要声音', '只要画面', 'loop', '循环']

const MATH_WORDS = ['数学', '公式', '导数', '几何', '概率', '微积分', '线代', '矩阵', '向量', '证明',
  '三角', '函数', '物理', '化学', '生物', '算法', '统计', '复数', '单位圆', '欧拉']
const AUDIENCE_WORDS = ['大众', '科普', '入门', '高中', '初中', '大学', '专业', '研究生', '论文', '工程师', '学生', '儿童', '小学']

const AUDIENCES = {
  high: { value: 'high', label: '高中', description: '保留公式，控制推导密度；默认按课标。' },
  university: { value: 'university', label: '大学 · 专业', description: '可以直接上定义、证明、矩阵；信息密度更高。' },
  general: { value: 'general', label: '大众科普', description: '少符号、多比喻；先讲清“它有什么用”。' },
  kids: { value: 'kids', label: '儿童 · 启蒙', description: '几乎不用符号，只留直觉和画面。' },
}
const GENERIC_AUDIENCES = {
  intro: { value: 'intro', label: '入门 · 泛科普', description: '第一次接触这个主题的人；术语先解释再用。' },
  pro: { value: 'pro', label: '专业 · 业内', description: '默认对方知道基础概念，直接讲结论与取舍。' },
  kids: AUDIENCES.kids,
}
const NARRATION = {
  'zh-neutral': { label: '中文 · 中性', description: '冷静克制，数学内容不出戏。' },
  'zh-warm': { label: '中文 · 温和', description: '更适合科普、课程；语速略慢。' },
  'en-neutral': { label: '英文 · 中性', description: '英文旁白 + 英文字幕。' },
  none: { label: '不需要旁白', description: '交付改成静音或只出帧时用这个。' },
}

const DURATION_BUCKETS = {
  narrated: [60, 45, 90],
  silent: [30, 15, 60],
  frames: [15, 30, 60],
}

function hits(brief, words) {
  const q = brief.toLowerCase()
  return words.filter((word) => q.includes(word.toLowerCase())).length
}

function explicitDuration(brief) {
  const match = /(\d+(?:\.\d+)?)\s*(秒|s\b|sec|分钟|min)/i.exec(brief)
  if (!match) return null
  const n = Number(match[1])
  return /分钟|min/i.test(match[2]) ? Math.round(n * 60) : Math.round(n)
}

function explicitFps(brief) {
  const match = /(\d{2,3})\s*(fps|帧)/i.exec(brief)
  if (!match) return null
  const n = Number(match[1])
  return FPS_CHOICES.includes(n) ? n : null
}

function explicitSize(brief) {
  const match = /(\d{3,4})\s*[x×*]\s*(\d{3,4})/i.exec(brief)
  if (!match) return null
  const size = `${match[1]}x${match[2]}`
  return LABEL_OF_SIZE[size] ? size : null
}

function aspectBlock(brief) {
  const wants4k = /4k|2160p?/i.test(brief)
  const scored = Object.keys(SIZE_OF).map((key) => ({
    key,
    score: hits(brief, ASPECT_HINTS.find((h) => h.key === key)?.words ?? []),
  }))
  scored.sort((a, b) => b.score - a.score || (a.key === '16:9' ? -1 : 1))
  const top = scored[0].key
  const second = top === '16:9' ? '9:16' : '16:9'
  const sizes = [explicitSize(brief) ?? (wants4k && top === '16:9' ? '3840x2160' : SIZE_OF[top])]
  for (const key of [second, top]) {
    if (!sizes.includes(SIZE_OF[key])) sizes.push(SIZE_OF[key])
  }
  if (ASPECT_OF_SIZE[sizes[0]] === '16:9' && !sizes.includes('3840x2160')) sizes.push('3840x2160')
  return {
    key: ASPECT_OF_SIZE[sizes[0]],
    size: sizes[0],
    question: {
      id: 'aspect',
      header: '画幅',
      question: '横屏、竖屏还是方屏？像素一并定下来。',
      options: sizes.map((size, index) => ({
        value: size,
        label: index === 0 ? `${LABEL_OF_SIZE[size]}（推荐）` : LABEL_OF_SIZE[size],
        description: `${DESC_OF_SIZE[size]}默认像素 ${size.replace('x', '×')}。`,
      })),
    },
  }
}

function deliveryBlock(brief) {
  const narration = hits(brief, NARRATION_WORDS)
  const silent = hits(brief, SILENT_WORDS)
  const inferred = narration > 0 && silent === 0 ? 'narrated' : silent > 0 && narration === 0 ? 'silent' : 'narrated'
  const order = [inferred, ...['narrated', 'silent', 'frames'].filter((key) => key !== inferred)]
  return {
    mode: inferred,
    question: {
      id: 'delivery',
      header: '交付',
      question: '做到哪一步？帧率与“要不要音频”都由它决定。',
      options: order.map((key, index) => ({
        value: key,
        label: index === 0 ? DELIVERY[key].label : DELIVERY[key].label.replace('（推荐）', ''),
        description: DELIVERY[key].description,
      })),
    },
  }
}

function durationHint(sec, delivery) {
  if (delivery === 'narrated') {
    const chars = `${Math.round(sec * 3.5)}–${Math.round(sec * 4.5)}`
    return `约 ${chars} 字旁白；${sec > 60 ? '需要分段与 animatic。' : sec <= 30 ? '只够讲一个点。' : '够讲一个直觉加一个小例子。'}`
  }
  if (delivery === 'silent') return `${sec} 秒静音成片，约 ${sec * DEFAULT_FPS} 帧。`
  return `时间轴按 ${sec} 秒排，页面/镜头约 ${Math.max(2, Math.round(sec / 6))} 个。`
}

function durationBlock(brief, delivery) {
  const fixed = explicitDuration(brief)
  const buckets = DURATION_BUCKETS[delivery]
  const secs = fixed ? [fixed, ...buckets.filter((value) => value !== fixed)] : buckets
  return {
    sec: secs[0],
    question: {
      id: 'duration',
      header: '时长',
      question: '这条片子多长？先定时长，帧数预算才算得出来。',
      options: secs.map((sec, index) => ({
        value: `${sec}s`,
        label: index === 0 ? `${sec} 秒（推荐）` : `${sec} 秒`,
        description: durationHint(sec, delivery),
      })),
    },
  }
}

function audienceBlock(brief, aspectKey) {
  const math = hits(brief, MATH_WORDS) > 0
  const named = AUDIENCE_WORDS.find((word) => brief.includes(word))
  const table = math ? AUDIENCES : GENERIC_AUDIENCES
  let order = math
    ? (aspectKey === '9:16' ? ['general', 'high', 'university'] : ['high', 'university', 'general'])
    : ['intro', 'pro', 'kids']
  if (named) {
    const mapped = /高中/.test(named) ? 'high'
      : /大学|专业|研究生|论文|工程师/.test(named) ? 'university'
        : /小学|儿童|初中/.test(named) ? 'kids'
          : 'general'
    if (table[mapped]) order = [mapped, ...order.filter((key) => key !== mapped)]
  }
  return {
    value: table[order[0]].value,
    question: {
      id: 'audience',
      header: '观众水平',
      question: '这条片给谁看？它决定符号密度和推导长度。',
      options: order.map((key, index) => {
        const item = table[key]
        return {
          value: item.value,
          label: index === 0 ? `${item.label}（推荐）` : item.label,
          description: item.description,
        }
      }),
    },
  }
}

function namedStyleSlug(brief, registry) {
  const q = brief.toLowerCase()
  const hit = registry.styles.find((style) =>
    q.includes(style.slug.toLowerCase()) || q.includes(String(style.name_cn).toLowerCase()))
  return hit?.slug ?? null
}

function styleBlock(brief, registry) {
  const bySlug = new Map(registry.styles.map((style) => [style.slug, style]))
  const named = namedStyleSlug(brief, registry)
  const routed = routeStyle(brief, registry)
  const ordered = [...(named ? [named] : []), ...routed.ranked.map((item) => item.slug)]
    .filter((slug, index, list) => bySlug.has(slug) && list.indexOf(slug) === index)
  const picked = ordered.slice(0, 3)

  const options = picked.map((slug, index) => {
    const style = bySlug.get(slug)
    return {
      value: slug,
      label: index === 0 ? `${style.name_cn}（推荐）` : `${style.name_cn}${slug === registry.default ? '（默认）' : ''}`,
      description: `${style.uses_cn?.join('、') ?? ''}${slug === named ? '；你点名要的' : ''}`,
    }
  })
  options.push({
    value: registry.default,
    label: picked.length ? '让你决定' : '让你决定（我先按默认做）',
    description: '不用现在选；我先按默认风格出 3 张帧，后面再换。',
  })
  return {
    value: picked[0] ?? registry.default,
    question: {
      id: 'style',
      header: '风格',
      question: '风格选哪个？选项是按题材推的，不是固定清单。',
      options,
    },
  }
}

function fpsBlock(brief, delivery) {
  const fixed = explicitFps(brief)
  const options = [{
    value: 'auto',
    label: '自动 · 按交付推导（推荐）',
    description: delivery === 'frames'
      ? '出帧时帧率不适用，账本记 N/A。'
      : `成片按 ${fixed ?? DEFAULT_FPS} fps；改交付时按同一规则重算。`,
  }]
  const first = fixed ?? DEFAULT_FPS
  const manual = [first, ...[DEFAULT_FPS, 60, 24, 50, 25].filter((value) => value !== first)].slice(0, 3)
  for (const fps of manual) {
    options.push({
      value: String(fps),
      label: `${fps} fps`,
      description: fps === DEFAULT_FPS
        ? '网络与移动默认档；广播 25/50、电影 23.976 在 Other 里写。'
        : fps === 60 ? '最平滑，适合快速运动；渲染量约为 30 fps 的两倍。'
          : fps === 24 ? '电影感，动态模糊更自然。'
            : '广播/电影常用档。',
    })
  }
  return {
    value: 'auto',
    question: {
      id: 'fps',
      header: '帧率',
      question: '帧率用哪个？“自动”会按交付形态推导。',
      options,
    },
  }
}

function narrationBlock(brief, delivery) {
  const english = /english|英文/i.test(brief)
  const order = english ? ['en-neutral', 'zh-neutral', 'zh-warm'] : ['zh-neutral', 'zh-warm', 'en-neutral']
  return {
    value: order[0],
    question: {
      id: 'narration',
      header: '旁白',
      question: delivery === 'narrated'
        ? '旁白用什么语言和声音？'
        : '这次交付没有音轨；若之后要加旁白，先在这里定语言和声音。',
      options: [
        ...order.map((key, index) => ({
          value: key,
          label: index === 0 ? `${NARRATION[key].label}（推荐）` : NARRATION[key].label,
          description: NARRATION[key].description,
        })),
        { value: 'none', label: NARRATION.none.label, description: NARRATION.none.description },
      ],
    },
  }
}

function gateModeOf(durationSec, delivery) {
  if (durationSec > 60) return 'full'
  if (delivery === 'narrated' || durationSec > 15) return 'standard'
  return 'light'
}

export function planQuestions(brief, registry = loadRegistry()) {
  const aspect = aspectBlock(brief)
  const delivery = deliveryBlock(brief)
  const audience = audienceBlock(brief, aspect.key)
  const style = styleBlock(brief, registry)
  const duration = durationBlock(brief, delivery.mode)
  const fps = fpsBlock(brief, delivery.mode)
  const narration = narrationBlock(brief, delivery.mode)

  const blocks = { audience, style, delivery, duration, aspect, fps, narration }
  const questions = QUESTION_IDS.map((id) => blocks[id].question)
  const durationSec = duration.sec
  const language = /english|英文/i.test(brief) ? 'en' : 'zh'

  return {
    brief,
    questionIds: [...QUESTION_IDS],
    questions,
    assumptions: {
      aspect: aspect.key,
      size: aspect.size,
      delivery: delivery.mode,
      style: style.value,
      audience: audience.value,
      narration: delivery.mode === 'narrated' ? { language, voice: 'neutral' } : null,
      durationSec,
      fps: 'auto',
      fpsResolved: delivery.mode === 'frames' ? null : DEFAULT_FPS,
      gateMode: gateModeOf(durationSec, delivery.mode),
      language,
      captions: delivery.mode === 'narrated',
      note: '七题固定；未回答的项按每题第一个选项（推荐项）执行。',
    },
    routing: routeStyle(brief, registry),
  }
}

/** 把 ask_user_question 的答案（label 或 value）折成落账用的 brief。 */
export function briefFromAnswers(plan, answers = {}) {
  const optionOf = (id) => {
    const question = plan.questions.find((item) => item.id === id)
    if (!question) return null
    const answer = answers[id]
    if (answer === undefined || answer === null || answer === '') return question.options[0]
    const picked = Array.isArray(answer) ? answer[0] : answer
    return question.options.find((option) => option.label === picked || option.value === picked)
      ?? question.options[0]
  }

  const delivery = optionOf('delivery').value
  const fpsAnswer = optionOf('fps').value
  const fps = fpsAnswer === 'auto' ? (delivery === 'frames' ? 'N/A' : `${DEFAULT_FPS}fps`) : `${fpsAnswer}fps`
  const duration = optionOf('duration').value
  const size = optionOf('aspect').value
  const narration = optionOf('narration').value
  const durationSec = Number(String(duration).replace(/s$/, ''))

  return {
    duration,
    aspect: size,
    fps,
    delivery,
    style: optionOf('style').value,
    audience: optionOf('audience').value,
    narration: delivery === 'narrated' ? narration : 'none',
    aspectKey: ASPECT_OF_SIZE[size] ?? '16:9',
    durationSec,
    gateMode: gateModeOf(durationSec, delivery),
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
    console.log(`题数: ${plan.questions.length}（固定七题）`)
    for (const [index, question] of plan.questions.entries()) {
      console.log(`\n${index + 1}. [${question.header}] ${question.question}`)
      for (const option of question.options) console.log(`   - ${option.label}：${option.description}`)
    }
    const fallback = briefFromAnswers(plan, {})
    console.log(`\n默认规格: ${fallback.audience} / ${fallback.style} / ${fallback.delivery} / ${fallback.duration} / ${fallback.aspect} / ${fallback.fps} / ${fallback.narration}`)
    console.log(`阶段: ${fallback.gateMode}`)
  }
}
