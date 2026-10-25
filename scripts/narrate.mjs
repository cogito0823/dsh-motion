#!/usr/bin/env node
/**
 * 逐句旁白：文本 → 音频 + 词级时间轴 + SRT。
 *
 *   node scripts/narrate.mjs ~/dsh-motion-projects/foo
 *   node scripts/narrate.mjs ~/dsh-motion-projects/foo --provider edge --voice zh-CN-XiaoxiaoNeural --rate +10%
 *   node scripts/narrate.mjs ~/dsh-motion-projects/foo --provider say --voice Tingting --rate 230
 *
 * 免费路线：edge-tts（无需账号，带词级边界）；离线兜底：macOS say。
 * 产物默认写到 <project>/audio/<provider>/。
 */
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'

import { ffprobeDuration, repoRoot, resolvePython, run, runAsync, srtTime, wrapCaption } from './lib/audio.mjs'
import { recordMetric } from '../lib/metrics.js'
import { acquireProjectLock } from '../lib/project.js'

const HELP = `用法: node scripts/narrate.mjs <project> [选项]

  --provider edge|say   默认 edge（免费、无需账号、带词级时间戳）；say 为 macOS 离线兜底
  --voice <name>        edge 默认 zh-CN-XiaoxiaoNeural；say 默认 Tingting
  --rate <value>        edge 用 +10% / -5%；say 用 230（词/分钟）
  --pitch <value>       edge 用 +0Hz
  --volume <value>      edge 用 +0%
  --out <dir>           默认 <project>/audio/<provider>
  --python <path>       指定带 edge-tts 的 Python（默认自动找 .venv-tts）
  --duration <sec>      成片时长；默认读 narration.json 的 duration
  --gap <sec>           两句之间的最小间隔，默认 0.12
  --shift               起点早于上一句结束时，顺延而不是只警告
  --force               忽略缓存，全部重生成
  --concurrency <n>     并发合成句数，默认 3（上限 6）
  --json                输出机器可读结果
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

function fail(message) {
  throw new Error(message)
}

function sha256(value) {
  return createHash('sha256').update(value).digest('hex')
}

function edgeRate(value) {
  if (typeof value === 'number') return `${value >= 0 ? '+' : ''}${value}%`
  const text = String(value ?? '').trim()
  if (!text) return '+0%'
  if (/^[+-]?\d+(\.\d+)?%$/.test(text)) {
    return text.startsWith('-') ? text : `+${text.replace(/^\+/, '')}`
  }
  if (/^[+-]?\d+(\.\d+)?$/.test(text)) {
    const number = Number(text)
    return `${number >= 0 ? '+' : ''}${text}%`
  }
  return text
}

function edgePitch(value) {
  const text = String(value ?? '+0Hz').trim()
  if (/^[+-]?\d+(\.\d+)?Hz$/.test(text)) {
    return text.startsWith('-') ? text : `+${text.replace(/^\+/, '')}`
  }
  return text
}

function edgeVolume(value) {
  const text = String(value ?? '+0%').trim()
  if (/^[+-]?\d+(\.\d+)?%$/.test(text)) {
    return text.startsWith('-') ? text : `+${text.replace(/^\+/, '')}`
  }
  return text
}

function isEdgeVoice(voice) {
  return typeof voice === 'string' && /^[a-z]{2,3}-[A-Z]{2}-/.test(voice)
}

function tokenize(text) {
  return String(text).match(/[\u3400-\u9fff]|[A-Za-z]+|\d+(?:\.\d+)?|[^\s]/g) ?? []
}

/**
 * say 不提供词级时间：按 token 权重把语音时长均摊。
 * 只用于离线兜底，字幕会标注 estimated。
 */
function estimateWords(text, duration) {
  const tokens = tokenize(text)
  if (!tokens.length) return []
  const weights = tokens.map((token) => (/[\u3400-\u9fff]/.test(token) ? 1 : Math.max(1, token.length * 0.55)))
  const total = weights.reduce((sum, value) => sum + value, 0)
  const speech = Math.max(0.4, duration - 0.18)
  let cursor = 0.06
  return tokens.map((token, index) => {
    const span = (speech * weights[index]) / total
    const word = {
      text: token,
      start: Number(cursor.toFixed(3)),
      end: Number((cursor + span).toFixed(3)),
    }
    cursor += span
    return word
  })
}

async function edgeOne({ python, text, voice, rate, pitch, volume, out, wordsOut, proxy, retries }) {
  const helper = join(repoRoot, 'scripts', 'lib', 'tts_edge.py')
  await runAsync(python, [
    helper,
    `--text=${text}`,
    `--voice=${voice}`,
    `--rate=${rate}`,
    `--pitch=${pitch}`,
    `--volume=${volume}`,
    `--out=${out}`,
    `--words-out=${wordsOut}`,
    `--retries=${retries}`,
    ...(proxy ? [`--proxy=${proxy}`] : []),
  ], { timeout: 15 * 60 * 1000 })
  return JSON.parse(readFileSync(wordsOut, 'utf8'))
}

function sayOne({ text, voice, rate, out }) {
  if (process.platform !== 'darwin') fail('say 只在 macOS 可用；这个平台请用 --provider edge')
  const aiff = `${out}.aiff`
  run('say', ['-v', voice, '-r', String(rate), '-o', aiff, text], { timeout: 5 * 60 * 1000 })
  try {
    run('ffmpeg', ['-v', 'error', '-y', '-i', aiff, '-ar', '48000', '-ac', '1', '-b:a', '192k', out])
  } finally {
    rmSync(aiff, { force: true })
  }
  const duration = ffprobeDuration(out)
  return {
    ok: true,
    provider: 'say',
    voice,
    rate: String(rate),
    duration,
    speechEnd: Math.max(0.1, duration - 0.12),
    words: estimateWords(text, duration),
    estimated: true,
  }
}

/** 小并发池：按输入顺序返回结果，任意一个失败会向上抛。 */
async function pool(items, limit, worker) {
  const results = new Array(items.length)
  let next = 0
  const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (true) {
      const index = next++
      if (index >= items.length) return
      results[index] = await worker(items[index], index)
    }
  })
  await Promise.all(runners)
  return results
}

async function main() {
  const args = parseArgs(process.argv.slice(2))
  if (args.help) {
    console.log(HELP)
    return
  }
  const project = resolve(args._[0] ?? '.')
  const specPath = join(project, 'narration.json')
  if (!existsSync(specPath)) fail(`找不到 ${specPath}`)
  const spec = JSON.parse(readFileSync(specPath, 'utf8'))
  const rawLines = Array.isArray(spec.lines) ? spec.lines : []
  if (!rawLines.length) fail(`${specPath} 里没有 lines`)

  const provider = String(args.provider ?? spec.provider ?? 'edge')
  if (!['edge', 'say'].includes(provider)) fail(`不支持的 provider: ${provider}`)

  const edgeCfg = spec.edge ?? {}
  const voice = provider === 'edge'
    ? (args.voice
        ?? edgeCfg.voice
        ?? (isEdgeVoice(spec.voice) ? spec.voice : 'zh-CN-XiaoxiaoNeural'))
    : (args.voice ?? spec.voice ?? 'Tingting')
  const rate = provider === 'edge'
    ? edgeRate(args.rate ?? edgeCfg.rate ?? '+0%')
    : String(args.rate ?? spec.rate ?? 230)
  const pitch = edgePitch(args.pitch ?? edgeCfg.pitch ?? '+0Hz')
  const volume = edgeVolume(args.volume ?? edgeCfg.volume ?? '+0%')
  const proxy = args.proxy ?? edgeCfg.proxy ?? ''
  const retries = Number(args.retries ?? edgeCfg.retries ?? 5)

  const outDir = resolve(args.out ?? join(project, 'audio', provider))
  mkdirSync(outDir, { recursive: true })
  const python = resolvePython(args.python)
  if (provider === 'edge') {
    try {
      run(python, ['-c', 'import edge_tts'])
    } catch {
      fail(`Python ${python} 里没有 edge-tts。先调用 motion_setup({tts:true})，或 node scripts/setup.mjs --tts；手动兜底：python3 -m venv .venv-tts && .venv-tts/bin/pip install edge-tts numpy`)
    }
  }
  const force = Boolean(args.force)
  const gap = Number(args.gap ?? 0.12)
  const concurrency = provider === 'say'
    ? 1
    : Math.max(1, Math.min(6, Number(args.concurrency ?? 3) || 3))
  const warnings = []
  const seen = new Set()
  const totalStarted = Date.now()

  const specs = []
  for (let index = 0; index < rawLines.length; index++) {
    const raw = rawLines[index]
    const id = String(raw.id ?? index + 1)
    if (seen.has(id)) fail(`重复的旁白 id: ${id}`)
    seen.add(id)
    const text = String(raw.text ?? '').trim()
    if (!text) fail(`第 ${index + 1} 句没有 text`)
    const stem = join(outDir, `l${id}.mp3`)
    const metaPath = join(outDir, `l${id}.json`)
    const key = sha256([
      provider, voice, rate, pitch, volume, text, proxy, 'narrate-v1',
    ].join('\u0000'))
    specs.push({ id, text, stem, metaPath, key, raw })
  }

  async function generate(spec) {
    let cached = null
    if (!force && existsSync(spec.stem) && existsSync(spec.metaPath)) {
      try {
        cached = JSON.parse(readFileSync(spec.metaPath, 'utf8'))
      } catch {
        cached = null
      }
    }
    const reusable = cached && cached.key === spec.key && Array.isArray(cached.words)
    if (reusable) {
      process.stderr.write(`cache  L${spec.id}\n`)
      return { meta: cached, cached: true, elapsedMs: 0 }
    }

    process.stderr.write(`tts    L${spec.id}${provider === 'edge' ? ` · ${voice} · ${rate}` : ` · ${voice} · ${rate}wpm`}\n`)
    const started = Date.now()
    let meta = provider === 'edge'
      ? await edgeOne({
          python, text: spec.text, voice, rate, pitch, volume,
          out: spec.stem, wordsOut: spec.metaPath, proxy, retries,
        })
      : sayOne({ text: spec.text, voice, rate, out: spec.stem })
    const elapsedMs = Date.now() - started
    meta = {
      ...meta, key: spec.key, provider, voice, rate, pitch, volume,
      text: spec.text, createdAt: new Date().toISOString(),
    }
    writeFileSync(spec.metaPath, `${JSON.stringify(meta, null, 2)}\n`)
    process.stderr.write(`done   L${spec.id} ${(elapsedMs / 1000).toFixed(2)}s\n`)
    return { meta, cached: false, elapsedMs }
  }

  const release = acquireProjectLock(project, { command: 'narrate' })
  try {
    const generated = await pool(specs, concurrency, generate)
    const cacheHits = generated.filter((item) => item.cached).length
    const ttsMs = generated.reduce((sum, item) => sum + item.elapsedMs, 0)

    const lines = []
    let cursor = 0
    let lastAudioEnd = 0
    for (let index = 0; index < specs.length; index++) {
      const spec = specs[index]
      const { meta } = generated[index]
      const { id, text } = spec
      const requested = Number(spec.raw.start)
      let start = Number.isFinite(requested) ? requested : cursor
      if (start < 0) start = 0
      if (start < lastAudioEnd - 0.001) {
        if (args.shift) {
          warnings.push(`L${id} 起点 ${start.toFixed(2)}s 与上一句冲突，顺延到 ${lastAudioEnd.toFixed(2)}s`)
          start = lastAudioEnd
        } else {
          warnings.push(`L${id} 起点 ${start.toFixed(2)}s 早于上一句音频结束 ${lastAudioEnd.toFixed(2)}s，可能重叠`)
        }
      }
      const audioEnd = start + meta.duration
      const speechEnd = start + meta.speechEnd
      lines.push({
        id,
        start: Number(start.toFixed(3)),
        end: Number(speechEnd.toFixed(3)),
        audioEnd: Number(audioEnd.toFixed(3)),
        text,
        estimated: Boolean(meta.estimated),
        words: meta.words.map((word) => ({
          text: word.text,
          start: Number((start + word.start).toFixed(3)),
          end: Number((start + word.end).toFixed(3)),
        })),
      })
      lastAudioEnd = audioEnd
      cursor = audioEnd + gap
    }

    const finalAudioEnd = Math.max(...lines.map((line) => line.audioEnd))
    const duration = Number(args.duration ?? spec.duration ?? Math.max(30, finalAudioEnd + 0.5))
    if (finalAudioEnd > duration + 0.01) {
      warnings.push(`最后一句结束于 ${finalAudioEnd.toFixed(2)}s，超过成片时长 ${duration}s`)
    }

    const timing = {
      version: 1,
      provider,
      voice,
      rate,
      pitch: provider === 'edge' ? pitch : null,
      volume: provider === 'edge' ? volume : null,
      duration,
      generatedAt: new Date().toISOString(),
      source: specPath,
      lines,
    }
    const timingPath = join(outDir, 'timing.json')
    writeFileSync(timingPath, `${JSON.stringify(timing, null, 2)}\n`)

    const srt = []
    lines.forEach((line, index) => {
      let end = line.end + 0.18
      if (index < lines.length - 1) end = Math.min(end, lines[index + 1].start - 0.08)
      end = Math.max(end, line.start + 0.5)
      srt.push(
        String(index + 1),
        `${srtTime(line.start)} --> ${srtTime(Math.min(end, duration))}`,
        wrapCaption(line.text, 18),
        '',
      )
    })
    const srtPath = join(outDir, 'captions.srt')
    writeFileSync(srtPath, srt.join('\n'))

    const summary = {
      project,
      provider,
      voice,
      rate,
      outDir,
      timing: timingPath,
      srt: srtPath,
      duration,
      lines: lines.map((line) => ({
        id: line.id,
        start: line.start,
        end: line.end,
        audioEnd: line.audioEnd,
        text: line.text,
        estimated: line.estimated,
      })),
      concurrency,
      cacheHits,
      ttsMs,
      ttsWallMs: Date.now() - totalStarted,
      totalMs: Date.now() - totalStarted,
      warnings,
    }

    recordMetric(project, {
      phase: 'tts',
      activeSec: summary.totalMs / 1000,
      cacheHits: summary.cacheHits,
      lines: summary.lines.length,
      provider,
      concurrency,
    })

    if (args.json) {
      console.log(JSON.stringify(summary, null, 2))
      return
    }
    console.log(`旁白 ${provider} · ${voice} · ${rate} · cache ${cacheHits}/${lines.length} · ${(summary.totalMs / 1000).toFixed(2)}s`)
    for (const line of lines) {
      console.log(
        `L${line.id.padEnd(2)} ${line.start.toFixed(2).padStart(5)}s → ${line.end.toFixed(2).padStart(5)}s`
        + `  (${(line.end - line.start).toFixed(2)}s)  ${line.text}`
        + (line.estimated ? '  [estimated]' : ''),
      )
    }
    for (const warning of warnings) console.warn(`warn   ${warning}`)
    console.log(`timing ${timingPath}`)
    console.log(`srt    ${srtPath}`)
  } finally {
    release()
  }
}

main().catch((error) => {
  console.error(error.message)
  process.exit(1)
})
