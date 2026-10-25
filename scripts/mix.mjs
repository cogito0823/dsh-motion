#!/usr/bin/env node
/**
 * 混音：逐句人声 + 可选音乐 → 48 kHz / 24-bit 母带，并做 -14 LUFS / -1 dBTP。
 *
 *   node scripts/mix.mjs dsh-motion-projects/foo
 *   node scripts/mix.mjs dsh-motion-projects/foo --music assets/bed.wav --mux out.mp4 --mux-out out-narrated.mp4
 *
 * 依赖：ffmpeg/ffprobe、带 numpy 的 Python（默认 .venv-tts）。
 */
import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'

import { ffprobeDuration, ffprobeVideoEnd, repoRoot, resolvePython, run } from './lib/audio.mjs'
import { recordMetric } from '../lib/metrics.js'
import { acquireProjectLock } from '../lib/project.js'

const HELP = `用法: node scripts/mix.mjs <project> [选项]

  --timing <file>      默认 <project>/audio/edge/timing.json（其次 audio/say/timing.json）
  --out <file>         默认 <project>/audio/master.wav
  --music <file>       可选音乐铺底；不给则纯人声
  --duck <0-0.8>       人声期间中高频压低比例，默认 0.35
  --music-db <db>      音乐 RMS 相对人声 RMS，默认 -18
  --gap-min-db <db>    有音乐时，旁白间隙低于该电平告警，默认 -40
  --report-gaps        打印每个旁白间隙的 dB
  --lufs <value>       目标综合响度，默认 -14
  --tp <db>            目标真峰值，默认 -1
  --python <path>      指定带 numpy 的 Python
  --mux <video>        可选：把母带压进现有视频
  --mux-out <file>     默认 <video 去扩展名>-narrated.mp4
  --json               输出机器可读结果
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

function parseLoudnorm(stderr) {
  const start = stderr.indexOf('{')
  const end = stderr.lastIndexOf('}')
  if (start < 0 || end <= start) return null
  try {
    return JSON.parse(stderr.slice(start, end + 1))
  } catch {
    return null
  }
}

function measure(file, lufs, tp) {
  const result = run('ffmpeg', [
    '-hide_banner',
    '-i', file,
    '-af', `loudnorm=I=${lufs}:TP=${tp}:LRA=11:print_format=json`,
    '-f', 'null', '-',
  ], { allowFail: true })
  return parseLoudnorm(result.stderr)
}

function audioStream(file) {
  const result = run('ffprobe', [
    '-v', 'error',
    '-select_streams', 'a:0',
    '-show_entries', 'stream=sample_rate,channels,bits_per_sample',
    '-of', 'json',
    file,
  ], { allowFail: true })
  try {
    return JSON.parse(result.stdout).streams?.[0] ?? null
  } catch {
    return null
  }
}

function pickTiming(project, explicit) {
  if (explicit) return resolve(explicit)
  const candidates = [
    join(project, 'audio', 'edge', 'timing.json'),
    join(project, 'audio', 'say', 'timing.json'),
  ]
  const found = candidates.find((candidate) => existsSync(candidate))
  if (!found) throw new Error(`找不到 timing.json；先跑 narrate，或用 --timing 指定（找过 ${candidates.join(', ')}）`)
  return found
}

function main() {
  const started = Date.now()
  const args = parseArgs(process.argv.slice(2))
  if (args.help) {
    console.log(HELP)
    return
  }
  const project = resolve(args._[0] ?? '.')
  const timing = pickTiming(project, args.timing)
  if (!existsSync(timing)) throw new Error(`找不到 timing: ${timing}`)

  const out = resolve(args.out ?? join(project, 'audio', 'master.wav'))
  const outDir = dirname(out)
  mkdirSync(outDir, { recursive: true })
  const premaster = join(outDir, 'premaster.wav')
  const python = resolvePython(args.python)
  const helper = join(repoRoot, 'scripts', 'lib', 'mix_audio.py')
  const music = args.music ? resolve(args.music) : ''
  if (music && !existsSync(music)) throw new Error(`找不到音乐: ${music}`)

  const release = acquireProjectLock(project, { command: 'mix' })
  try {
    const mixResult = run(python, [
      helper,
      `--timing=${timing}`,
      `--out=${premaster}`,
      `--duck=${args.duck ?? 0.35}`,
      `--music-db=${args['music-db'] ?? -18}`,
      `--gap-min-db=${args['gap-min-db'] ?? -40}`,
      ...(music ? [`--music=${music}`] : []),
      '--json',
    ], { timeout: 30 * 60 * 1000 })
    const mix = JSON.parse(mixResult.stdout.trim().split('\n').filter(Boolean).at(-1))

    const lufs = Number(args.lufs ?? -14)
    const tp = Number(args.tp ?? -1)
    const measured = measure(premaster, lufs, tp)
    let filter = `loudnorm=I=${lufs}:TP=${tp}:LRA=11`
    if (measured) {
      filter = [
        `loudnorm=I=${lufs}:TP=${tp}:LRA=11`,
        `measured_I=${measured.input_i}`,
        `measured_LRA=${measured.input_lra}`,
        `measured_TP=${measured.input_tp}`,
        `measured_thresh=${measured.input_thresh}`,
        `offset=${measured.target_offset}`,
        'linear=true',
      ].join(':')
    }
    run('ffmpeg', [
      '-v', 'error', '-y',
      '-i', premaster,
      '-af', filter,
      '-ar', '48000',
      '-c:a', 'pcm_s24le',
      out,
    ])

    const final = measure(out, lufs, tp)
    const stream = audioStream(out)
    const summary = {
      project,
      timing,
      premaster,
      master: out,
      music: music || null,
      duration: Number(mix.duration),
      stems: mix.stems,
      voiceRms: mix.voiceRms,
      musicRms: mix.musicRms,
      duck: Number(args.duck ?? 0.35),
      loudness: final
        ? { lufs: Number(final.input_i), truePeakDb: Number(final.input_tp), lra: Number(final.input_lra) }
        : null,
      stream,
      gaps: mix.gaps ?? [],
      warnings: [...(mix.warnings ?? []), ...(mix.gapWarnings ?? [])],
    }

    if (args.mux) {
      const video = resolve(args.mux)
      if (!existsSync(video)) throw new Error(`找不到视频: ${video}`)
      const muxOut = resolve(args['mux-out'] ?? video.replace(/\.[^.]+$/, '') + '-narrated.mp4')
      const videoDuration = ffprobeVideoEnd(video)
      const audioDuration = ffprobeDuration(out)
      const pad = Math.max(0, audioDuration - videoDuration + 0.05)
      if (pad > 0.05) {
        // 画面比人声短：克隆最后一帧补足，避免旁白落在冻结/黑屏上。
        run('ffmpeg', [
          '-v', 'error', '-y',
          '-i', video,
          '-i', out,
          '-filter_complex', `[0:v]tpad=stop_mode=clone:stop_duration=${pad.toFixed(3)},fps=60[v]`,
          '-map', '[v]',
          '-map', '1:a:0',
          '-c:v', 'libx264',
          '-preset', 'medium',
          '-crf', '18',
          '-pix_fmt', 'yuv420p',
          '-r', '60',
          '-c:a', 'aac',
          '-b:a', '192k',
          '-shortest',
          '-movflags', '+faststart',
          muxOut,
        ], { timeout: 30 * 60 * 1000 })
        summary.padded = Number(pad.toFixed(3))
      } else {
        run('ffmpeg', [
          '-v', 'error', '-y',
          '-i', video,
          '-i', out,
          '-map', '0:v:0',
          '-map', '1:a:0',
          '-c:v', 'copy',
          '-c:a', 'aac',
          '-b:a', '192k',
          '-shortest',
          '-movflags', '+faststart',
          muxOut,
        ], { timeout: 30 * 60 * 1000 })
      }
      summary.mux = muxOut
      summary.muxDuration = ffprobeDuration(muxOut)
    }

    writeFileSync(join(outDir, 'mix.json'), `${JSON.stringify(summary, null, 2)}\n`)
    recordMetric(project, {
      phase: 'mix',
      activeSec: (Date.now() - started) / 1000,
      duration: summary.duration,
      music: Boolean(music),
      mux: Boolean(summary.mux),
    })

    if (args.json) {
      console.log(JSON.stringify(summary, null, 2))
      return
    }
    console.log(`mix    ${summary.duration.toFixed(2)}s  stems=${summary.stems}  duck=${summary.duck}`)
    if (summary.loudness) {
      console.log(`loud   ${summary.loudness.lufs.toFixed(1)} LUFS  TP ${summary.loudness.truePeakDb.toFixed(1)} dBTP`)
    }
    console.log(`master ${out}`)
    if (args['report-gaps'] && summary.gaps.length) {
      console.log('gap          duration   mix dB   voice dB')
      for (const gap of summary.gaps) {
        console.log(`${gap.from.toFixed(2)}–${gap.to.toFixed(2)}s  ${gap.duration.toFixed(2)}s  ${String(gap.mixDb).padStart(7)}  ${String(gap.voiceDb).padStart(8)}  ${gap.kind}`)
      }
    }
    if (summary.mux) console.log(`mux    ${summary.mux}  (${summary.muxDuration.toFixed(3)}s)`)
    for (const warning of summary.warnings) console.warn(`warn   ${warning}`)
  } finally {
    release()
  }
}

try {
  main()
} catch (error) {
  console.error(error.message)
  process.exit(1)
}
