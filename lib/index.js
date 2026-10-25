/**
 * dsh-motion —— 代码生成的数学 / 科普动画
 *
 * 六个工具：
 *   motion_doctor   环境自检（先跑这个）
 *   motion_setup    自愈：建 venv / 装 manimgx、sympy（可选 TTS）
 *   motion_frames   极简模式：直接从场景出帧（默认，不生成视频）
 *   motion_render   渲染 Manim / manimgx 场景
 *   motion_probe    成片抽帧自检（空镜 / 过曝）
 *   formula_check   公式恒等校验（sympy）
 *
 * 知识层在 skills/ 里：animation-router / design-spec / qa-rubric，
 * 由 apply() 注册成 ctx.skills provider（见 lib/skills.js）。
 */

import { appendFileSync, mkdirSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

import { readApprovals, recordApprovalEvent } from './approvals.js'
import { importFresh } from './fresh.js'
import { resolveProject } from './project.js'
import { registerSkills } from './skills.js'

const OPS_URL = new URL('./ops.js', import.meta.url)
const DOCTOR_URL = new URL('./doctor.js', import.meta.url)
const SETUP_URL = new URL('./setup.js', import.meta.url)

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

/**
 * 正式渲染的平台级审批：账本没通过时，走 Harness 的 ctx.approval.request，
 * 让用户在界面里看到一次“是否允许渲染”，而不是让模型自己写 approved。
 * 返回 true 表示用户本次允许（ops 会以 allowUnconfirmed 放行这一次）。
 */
export async function platformApproveRender(ctx, config, file, exec) {
  try {
    let project
    try {
      project = resolveProject(file, { config, mustExist: false })
    } catch {
      return false
    }
    if (!project.root) return false
    const report = readApprovals(file, { config })

    // 账本已经全部 approved：需求/脚本/分镜/开工都确认过了，渲染不再重复问。
    // 想恢复“每次都问”，配 confirmEveryRender: true。
    if (config.confirmEveryRender !== true && report.status === 'approved') {
      recordApprovalEvent(file, {
        action: 'motion_render',
        outcome: 'ledger-approved',
        reason: '账本已通过，跳过平台审批',
      }, { config })
      return false
    }

    const approval = ctx.get?.('approval') ?? ctx.approval
    if (!approval?.request || !exec?.agent || !exec?.callId) return false

    const reason = report.status === 'approved'
      ? `motion_render 需要用户确认本次渲染：${project.root}`
      : `motion_render 需要确认：${project.root} 的账本${report.status === 'missing' ? '不存在' : `未通过（${report.missing?.join('、') || report.status}）`}`
    const outcome = await approval.request({
      agent: exec.agent,
      toolName: 'motion_render',
      callId: exec.callId,
      reason,
      signal: exec.signal,
    })
    if (outcome === 'allowed-once') {
      recordApprovalEvent(file, { action: 'motion_render', outcome: 'platform-approved', reason }, { config })
      return true
    }
    recordApprovalEvent(file, { action: 'motion_render', outcome: 'platform-rejected', reason, decision: outcome }, { config })
    throw new Error(`用户拒绝了本次渲染（${outcome}）。先过确认门再渲染。`)
  } catch (error) {
    if (String(error?.message).includes('用户拒绝')) throw error
    return false
  }
}

export function apply(ctx, config = {}) {
  // 知识层：把包内 skills/ 注册成 provider，让 animation-router 等进入会话目录。
  // 用 ctx.inject 等 skills 服务就绪；老 Harness 没有 inject 时直接尝试一次。
  try {
    if (typeof ctx.inject === 'function') {
      ctx.inject(['skills'], (skillsCtx) => registerSkills(skillsCtx, { log }))
    } else {
      registerSkills(ctx, { log })
    }
  } catch (err) {
    log(`skills registration failed: ${err?.message ?? err}`)
  }

  ctx.tools.register({
    name: 'motion_doctor',
    description:
      '环境预检：一次调用给出 Node / FFmpeg / venv / manimgx / sympy / Chrome / HyperFrames，真实可用的中文字体清单（用缺字体基线排除静默回退）、公式转换（Typst）以及 API/函数/rate。开工前跑一次即可（按指纹缓存 12 h，不随 Node 版本分叉）；缺 venv 或包时用 motion_setup，别再手跑 python3 -m venv。',
    parameters: { type: 'object', properties: {}, additionalProperties: false },
    output: textOutput,
    timeoutMs: 120_000,
    async execute() {
      const { doctor } = await importFresh(DOCTOR_URL)
      const result = await doctor(config)
      log(`doctor ready=${JSON.stringify(result.ready)} cached=${result.cached?.hit ?? false} ${result.elapsedMs ?? '?'}ms`)
      return JSON.stringify(result, null, 2)
    },
  })

  ctx.tools.register({
    name: 'motion_setup',
    description:
      '创建/修复 Python venv 并安装 manimgx、sympy（tts=true 时加 edge-tts）。当 motion_doctor 报 ready.math=false 或缺包时调用；在宿主进程里执行，不受模型 bash 的 workspace-write 沙箱限制。force=true 会删掉旧 venv 重建。',
    parameters: {
      type: 'object',
      properties: {
        force: { type: 'boolean', description: '删除旧 venv 后重建，默认 false' },
        tts: { type: 'boolean', description: '同时安装旁白依赖 edge-tts / numpy，默认 false' },
      },
      additionalProperties: false,
    },
    output: textOutput,
    timeoutMs: 900_000,
    async execute(args) {
      const { ensureVenv } = await importFresh(SETUP_URL)
      const result = await ensureVenv(config, args)
      log(`setup venv=${result.venv} created=${result.created} installed=${result.installed.join(',') || 'none'} ${result.elapsedMs}ms`)
      return JSON.stringify(result, null, 2)
    },
  })

  ctx.tools.register({
    name: 'motion_frames',
    description:
      '极简模式（默认先用它）：直接从场景渲染关键帧，不生成视频、不用 HyperFrames。返回 storyboard PNG 路径、layout 问题（layoutIssues 带帧序号）与耗时，几秒完成。项目有 APPROVALS.json 时，需求（时长/画幅/帧率/交付/风格/受众/旁白）未锁会拒绝出帧。',
    parameters: {
      type: 'object',
      properties: {
        file: { type: 'string', description: '项目名（dsh-motion-projects 下的目录名）或场景 .py 的绝对路径' },
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
      '渲染一支数学/科普场景。必须有 motion.project.json（项目根）；engine="manimgx"（默认，数学/公式/坐标，无需 LaTeX，自带 layout 检查）或 "manim"（Manim CE 回退）。post 可加运动模糊/颗粒/暗角。返回时长/体积/布局问题清单。APPROVALS.json 是前置账本：账本已通过时直接渲染，账本缺失/未通过时走一次平台审批（ctx.approval）；CLI 无平台时只校验账本。',
    parameters: {
      type: 'object',
      properties: {
        file: { type: 'string', description: '项目名（dsh-motion-projects 下的目录名）或场景 .py 的绝对路径' },
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
    async execute(args, exec) {
      const platformApproved = await platformApproveRender(ctx, config, args.file, exec)
      const callConfig = platformApproved ? { ...config, allowUnconfirmed: true } : config
      const { renderScene } = await ops()
      const result = await renderScene(callConfig, args)
      log(`render ${result.output} ${result.durationSec}s engine=${result.engine} problems=${result.layoutProblems.length}`)
      return JSON.stringify(result, null, 2)
    },
  })

  ctx.tools.register({
    name: 'motion_probe',
    description:
      '成片自检：已有 mp4 时等间隔抽帧拼 contact sheet，报告全黑/过曝的空镜，并给出 fps/帧数/VFR/CFR（raw 是 VFR 时不要当 CFR 中间片）。写场景阶段请用 motion_frames 直接看帧，不必先渲染视频。',
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

  log('registered 6 tools')
}
