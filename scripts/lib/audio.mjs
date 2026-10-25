/**
 * 旁白流水线的共用小工具：Python 解析、子进程、ffprobe、SRT 时间。
 * 只依赖 Node 标准库，不引入 npm 包。
 */
import { existsSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { execFile, spawnSync } from 'node:child_process'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)

export const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..', '..')

/**
 * 找一个带 edge_tts / numpy 的 Python。
 * 顺序：显式参数 → 环境变量 → 仓库内 .venv-tts → dsh-motion 的 venv → python3。
 */
export function resolvePython(explicit) {
  const candidates = [
    explicit,
    process.env.MOTION_TTS_PYTHON,
    join(repoRoot, '.venv-tts', 'bin', 'python'),
    join(homedir(), '.dsh', 'data', 'dsh-motion', 'venv', 'bin', 'python'),
    'python3',
  ].filter(Boolean)
  for (const candidate of candidates) {
    if (!candidate.includes('/') || existsSync(candidate)) return candidate
  }
  return 'python3'
}

export function run(command, args, { input, allowFail = false, timeout = 0 } = {}) {
  const result = spawnSync(command, args, {
    input,
    encoding: 'utf8',
    timeout: timeout || undefined,
    maxBuffer: 64 * 1024 * 1024,
  })
  if (result.error) {
    throw new Error(`${command} 启动失败: ${result.error.message}`)
  }
  if (result.status !== 0 && !allowFail) {
    const detail = (result.stderr || result.stdout || '').trim()
    throw new Error(`${command} 退出码 ${result.status}${detail ? `\n${detail}` : ''}`)
  }
  return { status: result.status, stdout: result.stdout ?? '', stderr: result.stderr ?? '' }
}

/**
 * 异步子进程：narrate 的并发 TTS 必须用异步，spawnSync 会阻塞事件循环，
 * 并行只会退化成串行。
 */
export async function runAsync(command, args, { timeout = 0, maxBuffer = 64 * 1024 * 1024 } = {}) {
  try {
    const { stdout, stderr } = await execFileAsync(command, args, {
      timeout: timeout || undefined,
      maxBuffer,
      encoding: 'utf8',
    })
    return { stdout, stderr }
  } catch (error) {
    const detail = String(error?.stderr || error?.stdout || error?.message || '').trim()
    throw new Error(`${command} 退出码 ${error?.code ?? '?'}${detail ? `\n${detail}` : ''}`)
  }
}

export function ffprobeDuration(file) {
  const { stdout } = run('ffprobe', [
    '-v', 'error',
    '-show_entries', 'format=duration',
    '-of', 'default=nw=1:nk=1',
    file,
  ])
  const value = Number.parseFloat(stdout.trim())
  if (!Number.isFinite(value)) throw new Error(`无法读取音频时长: ${file}`)
  return value
}

export function ffprobeStreamDuration(file, selector = 'v:0') {
  const result = run('ffprobe', [
    '-v', 'error',
    '-select_streams', selector,
    '-show_entries', 'stream=duration',
    '-of', 'default=nw=1:nk=1',
    file,
  ], { allowFail: true })
  const value = Number.parseFloat(result.stdout.trim())
  if (Number.isFinite(value)) return value
  return ffprobeDuration(file)
}

export function ffprobeVideoEnd(file) {
  const rate = run('ffprobe', [
    '-v', 'error',
    '-select_streams', 'v:0',
    '-show_entries', 'stream=r_frame_rate',
    '-of', 'default=nw=1:nk=1',
    file,
  ], { allowFail: true }).stdout.trim()
  const [num, den] = rate.split('/').map(Number)
  const frame = num && den ? den / num : 1 / 30
  const result = run('ffprobe', [
    '-v', 'error',
    '-select_streams', 'v:0',
    '-show_entries', 'packet=pts_time',
    '-of', 'csv=p=0',
    file,
  ], { allowFail: true })
  const times = result.stdout.split('\n').map(Number).filter(Number.isFinite)
  if (!times.length) return ffprobeStreamDuration(file)
  const last = times.reduce((max, value) => Math.max(max, value), -Infinity)
  return last + frame
}

export function srtTime(seconds) {
  const ms = Math.max(0, Math.round(seconds * 1000))
  const h = Math.floor(ms / 3_600_000)
  const m = Math.floor((ms % 3_600_000) / 60_000)
  const s = Math.floor((ms % 60_000) / 1000)
  const rest = ms % 1000
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')},${String(rest).padStart(3, '0')}`
}

/** 中文/中英混排字幕换行：优先在标点后断，单行不超过 max 个字符。 */
export function wrapCaption(text, max = 18) {
  const source = String(text).replace(/\s+/g, ' ').trim()
  if ([...source].length <= max) return source
  const pieces = source.split(/(?<=[，。；：！？、,.!?;:])/).filter(Boolean)
  const lines = []
  let current = ''
  const flush = () => {
    if (current.trim()) lines.push(current.trim())
    current = ''
  }
  for (const piece of pieces) {
    const candidate = current ? current + piece : piece
    if ([...candidate].length <= max) {
      current = candidate
      continue
    }
    flush()
    if ([...piece].length <= max) {
      current = piece
      continue
    }
    let chunk = ''
    for (const ch of piece) {
      if ([...chunk + ch].length > max) {
        if (chunk.trim()) lines.push(chunk.trim())
        chunk = ''
      }
      chunk += ch
    }
    current = chunk
  }
  flush()
  return lines.join('\n')
}
