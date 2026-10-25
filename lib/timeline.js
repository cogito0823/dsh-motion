/**
 * 时间轴契约：timeline.json 的校验（纯函数，不依赖 manimgx）。
 *
 * 设计目标：把“cue 晚了 / 旁白压到下一拍 / 总时长对不上”从渲染后才发现的
 * 返工，提前成一次可失败的检查。场景侧用 templates/project/timeline.py 的
 * TimedScene.cue() 做运行时告警；这里做定稿前的静态校验。
 */

const ID = (value) => String(value ?? '').trim()

/** 把 "30s" / "1m" / "1m30s" / "00:30" / 30 统一成秒；无法解析返回 null。 */
export function parseDurationToSec(value) {
  if (typeof value === 'number') return Number.isFinite(value) && value > 0 ? value : null
  const text = String(value ?? '').trim()
  if (!text) return null
  if (/^\d+(?:\.\d+)?$/.test(text)) {
    const number = Number(text)
    return Number.isFinite(number) && number > 0 ? number : null
  }
  const clock = /^(\d+):(\d{2})(?::(\d{2}))?$/.exec(text)
  if (clock) {
    const [, a, b, c] = clock
    const seconds = c === undefined
      ? Number(a) * 60 + Number(b)
      : Number(a) * 3600 + Number(b) * 60 + Number(c)
    return seconds > 0 ? seconds : null
  }
  const units = [...text.matchAll(/(\d+(?:\.\d+)?)\s*(h|m|s)/gi)]
  if (!units.length) return null
  let total = 0
  for (const [, number, unit] of units) {
    const factor = unit.toLowerCase() === 'h' ? 3600 : unit.toLowerCase() === 'm' ? 60 : 1
    total += Number(number) * factor
  }
  return total > 0 ? total : null
}

/**
 * 校验 timeline（可带 narration timing）。
 * @returns {{ok:boolean, strictOk:boolean, issues:Array, summary:object}}
 */
export function validateTimeline(timeline, options = {}) {
  const issues = []
  const add = (level, code, message, extra = {}) => issues.push({ level, code, message, ...extra })
  const tolerance = Number(options.tolerance ?? 0.05)
  const lateThreshold = Number(options.lateThreshold ?? 0.35)
  const durationSec = Number(options.durationSec ?? timeline?.durationSec)

  if (!timeline || typeof timeline !== 'object' || Array.isArray(timeline)) {
    add('error', 'schema', 'timeline 必须是对象')
    return { ok: false, strictOk: false, issues, summary: { cues: 0, errors: 1, warnings: 0 } }
  }
  const cues = Array.isArray(timeline.cues) ? timeline.cues : []
  if (!cues.length) add('error', 'no-cues', 'timeline.cues 为空')
  if (!Number.isFinite(durationSec) || durationSec <= 0) {
    add('error', 'duration', '缺少有效的 durationSec（或 --duration）')
  }

  if (
    Number.isFinite(Number(timeline.durationSec))
    && Number.isFinite(durationSec)
    && Math.abs(Number(timeline.durationSec) - durationSec) > tolerance
  ) {
    add('warn', 'timeline-duration-mismatch', `timeline.durationSec=${timeline.durationSec}s 与片长 ${durationSec}s 不一致`, {
      expectedSec: durationSec,
      actualSec: Number(timeline.durationSec),
    })
  }

  const ids = new Set()
  let previousAt = -Infinity
  cues.forEach((cue, index) => {
    const id = ID(cue?.id)
    const label = id || `#${index + 1}`
    if (!id) add('error', 'cue-id', `第 ${index + 1} 个 cue 缺少 id`, { cueId: label })
    if (id && ids.has(id)) add('error', 'duplicate-id', `cue id 重复: ${id}`, { cueId: id })
    if (id) ids.add(id)

    const at = Number(cue?.at)
    if (!Number.isFinite(at) || at < 0) {
      add('error', 'cue-at', `${label} 的 at 必须是非负秒数`, { cueId: label })
      return
    }
    if (at < previousAt - tolerance) {
      add('error', 'order', `${label} 的 at=${at}s 早于前一个 cue ${previousAt}s`, { cueId: label, expectedSec: previousAt, actualSec: at })
    }
    previousAt = Math.max(previousAt, at)
    if (Number.isFinite(durationSec) && at > durationSec + tolerance) {
      add('error', 'beyond-duration', `${label} 的 at=${at}s 超过片长 ${durationSec}s`, { cueId: label, expectedSec: durationSec, actualSec: at })
    }

    const hold = cue?.hold == null ? 0 : Number(cue.hold)
    if (!Number.isFinite(hold) || hold < 0) {
      add('error', 'hold', `${label} 的 hold 必须是非负秒数`, { cueId: label })
    } else if (Number.isFinite(durationSec) && at + hold > durationSec + tolerance) {
      add('error', 'beyond-duration', `${label} 的结束 ${(at + hold).toFixed(2)}s 超过片长 ${durationSec}s`, {
        cueId: label,
        expectedSec: durationSec,
        actualSec: Number((at + hold).toFixed(3)),
      })
    }
  })

  const timing = options.timing
  const lines = Array.isArray(timing?.lines) ? timing.lines : null
  if (lines) {
    const byId = new Map(lines.map((line) => [ID(line.id), line]))
    const mapped = new Set()
    cues.forEach((cue, index) => {
      if (cue?.lineId == null) return
      const lineId = ID(cue.lineId)
      mapped.add(lineId)
      const line = byId.get(lineId)
      const label = ID(cue.id) || `#${index + 1}`
      if (!line) {
        add('warn', 'missing-line', `${label} 指向的旁白 L${lineId} 不存在`, { cueId: label, lineId })
        return
      }
      const at = Number(cue.at)
      const lineStart = Number(line.start)
      const lineEnd = Number(line.end)
      const late = lineStart - at
      if (Number.isFinite(late) && late > lateThreshold) {
        add('warn', 'narration-late', `${label} 的画面在 ${at}s，旁白 L${lineId} 到 ${lineStart.toFixed(2)}s 才起（晚 ${late.toFixed(2)}s）`, {
          cueId: label,
          lineId,
          driftSec: Number(late.toFixed(3)),
          expectedSec: at,
          actualSec: lineStart,
        })
      }
      const next = cues[index + 1]
      if (next && Number.isFinite(lineEnd) && lineEnd > Number(next.at) + tolerance) {
        add('warn', 'narration-overlap', `旁白 L${lineId} 到 ${lineEnd.toFixed(2)}s，压过下一拍 ${ID(next.id) || `#${index + 2}`} 的 ${Number(next.at)}s`, {
          cueId: label,
          lineId,
          expectedSec: Number(next.at),
          actualSec: lineEnd,
        })
      }
    })
    for (const line of lines) {
      const id = ID(line.id)
      if (!mapped.has(id)) {
        add('warn', 'unmapped-line', `旁白 L${id} 没有对应的 timeline cue`, { lineId: id })
      }
    }
    if (Number.isFinite(durationSec) && Number.isFinite(Number(timing.duration))) {
      const timingDuration = Number(timing.duration)
      if (Math.abs(timingDuration - durationSec) > tolerance) {
        add('warn', 'duration-mismatch', `timing.duration=${timingDuration}s 与片长 ${durationSec}s 不一致`, {
          expectedSec: durationSec,
          actualSec: timingDuration,
        })
      }
    }
  }

  const errors = issues.filter((issue) => issue.level === 'error').length
  const warnings = issues.filter((issue) => issue.level === 'warn').length
  return {
    ok: errors === 0,
    strictOk: errors === 0 && warnings === 0,
    issues,
    summary: {
      durationSec: Number.isFinite(durationSec) ? durationSec : null,
      cues: cues.length,
      lines: lines?.length ?? 0,
      errors,
      warnings,
      firstCueSec: cues.length ? Number(cues[0].at) : null,
      lastCueEndSec: cues.length
        ? Number((Number(cues[cues.length - 1].at) + Number(cues[cues.length - 1].hold ?? 0)).toFixed(3))
        : null,
    },
  }
}

/** 从 narration timing 里取行；没有 timing 时返回 null。 */
export function timingFromJson(raw) {
  if (!raw || typeof raw !== 'object') return null
  if (!Array.isArray(raw.lines)) return null
  return raw
}
