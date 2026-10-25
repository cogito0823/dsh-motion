/**
 * dsh-motion —— 代码生成的数学 / 科普动画
 *
 * 五个工具：
 *   motion_doctor   环境自检（先跑这个）
 *   motion_frames   极简模式：直接从场景出帧（默认，不生成视频）
 *   motion_render   渲染 Manim / manimgx 场景
 *   motion_probe    成片抽帧自检（空镜 / 过曝）
 *   formula_check   公式恒等校验（sympy）
 *
 * 知识层在 skills/ 里：animation-router / design-spec / qa-rubric。
 */

import { appendFileSync, mkdirSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

import { importFresh } from './fresh.js'

const OPS_URL = new URL('./ops.js', import.meta.url)
const DOCTOR_URL = new URL('./doctor.js', import.meta.url)

const ops = () => importFresh(OPS_URL)

export const name = 'motion'
export const inject = ['tools']

const LOG_DIR = join(process.env.DSH_HOME ?? join(homedir(), '.dsh'), 'logs')

function log(message) {
  try {
    mkdirSync(LOG_DIR, { recursive: true })
    appendFileSync(join(LOG_DIR, 'motion.log'), `${new Date().toISOString()} ${message}\n`)
  } catch {
    // 日志失败不影响工具
  }
}

function asText(value) {
  const text = typeof value === 'string' ? value : JSON.stringify(value, null, 2)
  return [{ type: 'text', text }]
}

const textOutput = { schema: { type: 'string' }, render: (_args, value) => asText(value) }

export function apply(ctx, config = {}) {
  ctx.tools.register({
    name: 'motion_doctor',
    description:
      '检查代码动画需要的环境：Node、FFmpeg、Python venv、manimgx、sympy、Chrome、HyperFrames。装完插件或渲染报错时先跑这个，返回表格与修法。',
    parameters: { type: 'object', properties: {}, additionalProperties: false },
    output: textOutput,
    timeoutMs: 120_000,
    async execute() {
      const { doctor } = await importFresh(DOCTOR_URL)
      const result = await doctor(config)
      log(`doctor ready=${JSON.stringify(result.ready)}`)
      return JSON.stringify(result, null, 2)
    },
  })

  ctx.tools.register({
    name: 'motion_frames',
    description:
      '极简模式（默认先用它）：直接从场景渲染关键帧，不生成视频、不用 HyperFrames。返回 storyboard PNG 路径与 layout 问题，几秒完成；先看帧改画面，满意后再决定是否渲染。',
    parameters: {
      type: 'object',
      properties: {
        file: { type: 'string', description: '场景 .py 文件的绝对路径' },
        scene: { type: 'string', description: '场景类名；文件里只有一个场景时可省略' },
        times: {
          type: 'array',
          items: { type: 'string' },
          description: '要看的时间点（秒）或 "end"，如 ["1.2","4.5","end"]；省略则采样每个 play 的结束帧',
        },
        out: { type: 'string', description: 'storyboard PNG 输出路径，默认与场景同目录' },
      },
      required: ['file'],
      additionalProperties: false,
    },
    output: textOutput,
    timeoutMs: 300_000,
    async execute(args) {
      const { inspectFrames } = await ops()
      const result = await inspectFrames(config, args)
      log(`frames ${result.file} samples=${result.requestedTimes.length || 'auto'} issues=${result.layoutProblems.length} ${result.wallSec}s`)
      return JSON.stringify(result, null, 2)
    },
  })

  ctx.tools.register({
    name: 'motion_render',
    description:
      '渲染一支数学/科普场景。engine="manimgx"（默认，数学/公式/坐标，无需 LaTeX，自带 layout 检查）或 "manim"（Manim CE 回退）。post 可加运动模糊/颗粒/暗角。返回时长/体积/布局问题清单。',
    parameters: {
      type: 'object',
      properties: {
        file: { type: 'string', description: '场景 .py 文件的绝对路径' },
        scene: { type: 'string', description: '场景类名；文件里只有一个场景时可省略' },
        engine: { type: 'string', enum: ['manimgx', 'manim'], description: '渲染器，默认 manimgx' },
        post: {
          type: 'object',
          description: '管线层后期：运动模糊/颗粒/暗角/调色。subframes=3 表示 3 倍帧率渲染后 tmix 合成。',
          properties: {
            subframes: { type: 'integer', description: '子帧数 1-8，默认 1' },
            grain: { type: 'number', description: '颗粒强度 0-30，0 为关' },
            vignette: { type: 'number', description: '暗角强度 2-8，0 为关' },
            grade: { type: 'string', enum: ['', 'cinematic', 'warm'], description: '调色预设' },
          },
          additionalProperties: false,
        },
        width: { type: 'integer', description: '像素宽，默认 1920' },
        height: { type: 'integer', description: '像素高，默认 1080' },
        fps: { type: 'integer', description: '帧率，默认 30，上限 60' },
        out: { type: 'string', description: '输出 mp4 路径，默认与场景同目录' },
      },
      required: ['file'],
      additionalProperties: false,
    },
    output: textOutput,
    timeoutMs: 900_000,
    async execute(args) {
      const { renderScene } = await ops()
      const result = await renderScene(config, args)
      log(`render ${result.output} ${result.durationSec}s engine=${result.engine} problems=${result.layoutProblems.length}`)
      return JSON.stringify(result, null, 2)
    },
  })

  ctx.tools.register({
    name: 'motion_probe',
    description:
      '成片自检：已有 mp4 时等间隔抽帧拼 contact sheet，报告全黑/过曝的空镜。写场景阶段请用 motion_frames 直接看帧，不必先渲染视频。',
    parameters: {
      type: 'object',
      properties: {
        video: { type: 'string', description: '要检查的 mp4 绝对路径' },
        frames: { type: 'integer', description: '抽帧数量，默认 12（2–24）' },
        out: { type: 'string', description: 'contact sheet 输出路径' },
      },
      required: ['video'],
      additionalProperties: false,
    },
    output: textOutput,
    timeoutMs: 300_000,
    async execute(args) {
      const { probeVideo } = await ops()
      const result = await probeVideo(config, args)
      log(`probe ${result.video} frames=${result.framesAnalyzed} blank=${result.blankFrames.length}`)
      return JSON.stringify(result, null, 2)
    },
  })

  ctx.tools.register({
    name: 'formula_check',
    description:
      '数学正确性门：用 sympy 判断两个表达式是否恒等（自动化简差值）。渲染任何公式之前先过这一关，例如 left="diff(0.6*x**3-1.8*x, x)"、right="1.8*x**2-1.8"。',
    parameters: {
      type: 'object',
      properties: {
        left: { type: 'string', description: '左表达式（sympy 语法）' },
        right: { type: 'string', description: '右表达式（sympy 语法）' },
      },
      required: ['left', 'right'],
      additionalProperties: false,
    },
    output: textOutput,
    timeoutMs: 60_000,
    async execute(args) {
      const { checkMath } = await ops()
      const result = await checkMath(config, args)
      log(`formula_check equal=${result.equal}`)
      return JSON.stringify(result, null, 2)
    },
  })

  log('registered 5 tools')
}
