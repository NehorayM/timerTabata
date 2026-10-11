export const MAX_DURATION = 24 * 3600
export const MAX_COUNT = 99

const pad = (n: number): string => String(n).padStart(2, '0')

/** Seconds below one minute, mm:ss below one hour, h:mm:ss above. */
export function formatDuration(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds))
  if (s < 60) return String(s)
  if (s < 3600) return `${pad(Math.floor(s / 60))}:${pad(s % 60)}`
  return `${Math.floor(s / 3600)}:${pad(Math.floor((s % 3600) / 60))}:${pad(s % 60)}`
}

/** Same as formatDuration but sub-minute values carry a unit ("45 sec"), as on workout cards. */
export function formatDurationLabel(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds))
  return s < 60 ? `${s} sec` : formatDuration(s)
}

/**
 * Parses user input: plain seconds ("90"), m:ss ("1:30") or h:mm:ss ("1:02:03").
 * Returns null for anything invalid, non-finite or above MAX_DURATION.
 */
export function parseDuration(input: string): number | null {
  const t = input.trim()
  let value: number
  let m: RegExpMatchArray | null
  if (/^\d{1,6}$/.test(t)) value = Number(t)
  else if ((m = t.match(/^(\d{1,4}):([0-5]?\d)$/))) value = Number(m[1]) * 60 + Number(m[2])
  else if ((m = t.match(/^(\d{1,2}):([0-5]\d):([0-5]\d)$/)))
    value = Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3])
  else return null
  if (!Number.isFinite(value) || !Number.isInteger(value) || value > MAX_DURATION) return null
  return value
}

export function parseCount(input: string): number | null {
  const t = input.trim()
  if (!/^\d{1,3}$/.test(t)) return null
  const n = Number(t)
  return n >= 1 && n <= MAX_COUNT ? n : null
}
