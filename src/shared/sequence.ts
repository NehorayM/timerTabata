import type { Interval, IntervalType, WorkoutTimes } from './types'

/**
 * The single source of truth for interval order, numbering, totals, counters and execution.
 *
 * Rules:
 *  1. Prepare once if > 0.
 *  2. Sets x Cycles Work intervals.
 *  3. Rest between Work intervals, never after the final Work.
 *  4. At a set boundary a positive "Rest between sets" REPLACES the ordinary Rest
 *     (zero means the ordinary Rest is used).
 *  5. Cool down once if > 0. Zero-duration intervals are omitted.
 */
export function generateSequence(w: WorkoutTimes): Interval[] {
  const out: Interval[] = []
  const push = (type: IntervalType, duration: number, set: number, cycle: number, id: string): void => {
    if (duration > 0) {
      out.push({ id, index: out.length, number: out.length + 1, type, duration, set, cycle })
    }
  }
  const sets = Math.max(1, w.sets)
  const cycles = Math.max(1, w.cycles)
  push('prepare', w.prepare, 1, 1, 'prepare')
  for (let s = 1; s <= sets; s++) {
    for (let c = 1; c <= cycles; c++) {
      push('work', w.work, s, c, `work-${s}-${c}`)
      if (s === sets && c === cycles) continue
      if (c === cycles && w.restBetweenSets > 0) push('setRest', w.restBetweenSets, s, c, `setrest-${s}`)
      else push('rest', w.rest, s, c, `rest-${s}-${c}`)
    }
  }
  push('cooldown', w.coolDown, sets, cycles, 'cooldown')
  return out
}

export function totalSeconds(seq: readonly Interval[]): number {
  let t = 0
  for (const i of seq) t += i.duration
  return t
}

export const INTERVAL_LABELS: Record<IntervalType, string> = {
  prepare: 'Prepare',
  work: 'Work',
  rest: 'Rest',
  setRest: 'Rest between sets',
  cooldown: 'Cool down'
}
