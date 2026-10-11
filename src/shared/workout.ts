import { formatDuration, formatDurationLabel } from './format'
import { generateSequence, totalSeconds } from './sequence'
import type { IntervalType, Workout, WorkoutTimes } from './types'

/** Card colors sampled from the reference screenshots (purple, blue, green, magenta) plus extras. */
export const CARD_COLORS = ['#311b92', '#0277bd', '#6ba101', '#c51162', '#e64a19', '#00796b', '#5d4037', '#455a64']

export const PHASE_COLORS: Record<Exclude<IntervalType, 'rest' | 'setRest'>, string> = {
  prepare: '#007c0e',
  work: '#e64a19',
  cooldown: '#00796b'
}

export function phaseColor(type: IntervalType | 'finish', restColor: string, finishColor: string): string {
  if (type === 'rest' || type === 'setRest') return restColor
  if (type === 'finish') return finishColor
  return PHASE_COLORS[type]
}

export function newWorkout(id: string, now: number, color = CARD_COLORS[0]): Workout {
  return {
    id,
    name: 'Workout',
    color,
    prepare: 10,
    work: 20,
    rest: 10,
    cycles: 8,
    sets: 1,
    restBetweenSets: 0,
    coolDown: 0,
    workDescription: '',
    restDescription: '',
    workImage: null,
    restImage: null,
    notes: '',
    favorite: false,
    createdAt: now,
    updatedAt: now,
    lastUsedAt: null
  }
}

export function workoutTotals(w: WorkoutTimes): { seconds: number; intervals: number } {
  const seq = generateSequence(w)
  return { seconds: totalSeconds(seq), intervals: seq.length }
}

/** "5 x Workout: 35:00 • 40 intervals" (the "N x" prefix shows the number of sets when > 1). */
export function workoutSummary(w: Workout): string {
  const { seconds, intervals } = workoutTotals(w)
  const prefix = w.sets > 1 ? `${w.sets} x ` : ''
  return `${prefix}${w.name}: ${formatDuration(seconds)} • ${intervals} interval${intervals === 1 ? '' : 's'}`
}

export function totalLine(w: WorkoutTimes): string {
  const { seconds, intervals } = workoutTotals(w)
  return `Total: ${formatDuration(seconds)} • ${intervals} interval${intervals === 1 ? '' : 's'}`
}

export interface CardLine {
  label: string
  value: string
  description?: string
}

export function cardLines(w: Workout): CardLine[] {
  const lines: CardLine[] = []
  if (w.prepare > 0) lines.push({ label: 'Prepare', value: formatDurationLabel(w.prepare) })
  lines.push({ label: 'Work', value: formatDurationLabel(w.work), description: w.workDescription.trim() || undefined })
  if (w.rest > 0) lines.push({ label: 'Rest', value: formatDurationLabel(w.rest), description: w.restDescription.trim() || undefined })
  lines.push({ label: 'Cycles', value: String(w.cycles) })
  if (w.sets > 1) lines.push({ label: 'Sets', value: String(w.sets) })
  if (w.sets > 1 && w.restBetweenSets > 0)
    lines.push({ label: 'Rest between sets', value: formatDurationLabel(w.restBetweenSets) })
  if (w.coolDown > 0) lines.push({ label: 'Cool down', value: formatDurationLabel(w.coolDown) })
  return lines
}
