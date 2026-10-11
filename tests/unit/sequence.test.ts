import { describe, expect, it } from 'vitest'
import { generateSequence, totalSeconds, INTERVAL_LABELS } from '../../src/shared/sequence'
import { formatDuration, formatDurationLabel, parseCount, parseDuration } from '../../src/shared/format'
import { cardLines, newWorkout, workoutSummary } from '../../src/shared/workout'
import type { WorkoutTimes } from '../../src/shared/types'

const times = (p: Partial<WorkoutTimes>): WorkoutTimes => ({
  prepare: 0,
  work: 0,
  rest: 0,
  cycles: 1,
  sets: 1,
  restBetweenSets: 0,
  coolDown: 0,
  ...p
})

const label = (seq: ReturnType<typeof generateSequence>, n: number): string =>
  `${n}. ${INTERVAL_LABELS[seq[n - 1].type]}: ${formatDuration(seq[n - 1].duration)}`

describe('fixture A: Prepare=60 Work=45 Rest=60 Cycles=4 Sets=5', () => {
  const seq = generateSequence(times({ prepare: 60, work: 45, rest: 60, cycles: 4, sets: 5 }))
  it('has 1 prepare + 20 work + 19 rest = 40 intervals and 35:00', () => {
    expect(seq).toHaveLength(40)
    expect(seq.filter((i) => i.type === 'prepare')).toHaveLength(1)
    expect(seq.filter((i) => i.type === 'work')).toHaveLength(20)
    expect(seq.filter((i) => i.type === 'rest')).toHaveLength(19)
    expect(totalSeconds(seq)).toBe(2100)
    expect(formatDuration(totalSeconds(seq))).toBe('35:00')
  })
  it('ends with 38. Work: 45; 39. Rest: 60; 40. Work: 45', () => {
    expect(label(seq, 38)).toBe('38. Work: 45')
    expect(label(seq, 39)).toBe('39. Rest: 01:00')
    expect(label(seq, 40)).toBe('40. Work: 45')
    expect(seq[39].type).toBe('work')
  })
  it('maps Work #38 to set 5, cycle 3 and the first rows to the screenshot', () => {
    expect(seq[37]).toMatchObject({ number: 38, set: 5, cycle: 3, type: 'work' })
    expect(seq.slice(0, 6).map((i) => `${i.type}:${i.duration}`)).toEqual([
      'prepare:60', 'work:45', 'rest:60', 'work:45', 'rest:60', 'work:45'
    ])
    expect(seq[0]).toMatchObject({ set: 1, cycle: 1 })
  })
  it('has stable unique ids and sequential numbering', () => {
    expect(new Set(seq.map((i) => i.id)).size).toBe(40)
    seq.forEach((i, k) => expect([i.index, i.number]).toEqual([k, k + 1]))
    expect(generateSequence(times({ prepare: 60, work: 45, rest: 60, cycles: 4, sets: 5 })).map((i) => i.id)).toEqual(
      seq.map((i) => i.id)
    )
  })
  it('rest belongs to the preceding work', () => {
    const rest = seq[2]
    expect(rest).toMatchObject({ type: 'rest', set: 1, cycle: 1 })
    expect(seq[8]).toMatchObject({ type: 'rest', set: 1, cycle: 4 }) // rest after the set-1 final work
  })
})

describe('fixture B: Prepare=10 Work=900 Rest=300 Cycles=8', () => {
  it('has 16 intervals and 2:35:10', () => {
    const seq = generateSequence(times({ prepare: 10, work: 900, rest: 300, cycles: 8 }))
    expect(seq).toHaveLength(16)
    expect(totalSeconds(seq)).toBe(9310)
    expect(formatDuration(9310)).toBe('2:35:10')
  })
})

describe('fixture C: Prepare=10 Work=900 Rest=60 Cycles=3', () => {
  it('has 6 intervals and 47:10', () => {
    const seq = generateSequence(times({ prepare: 10, work: 900, rest: 60, cycles: 3 }))
    expect(seq).toHaveLength(6)
    expect(totalSeconds(seq)).toBe(2830)
    expect(formatDuration(2830)).toBe('47:10')
  })
})

describe('sequence rules', () => {
  it('single set and cycle is one work interval', () => {
    const seq = generateSequence(times({ work: 30 }))
    expect(seq).toEqual([{ id: 'work-1-1', index: 0, number: 1, type: 'work', duration: 30, set: 1, cycle: 1 }])
  })
  it('omits zero-duration prepare, rest and cooldown', () => {
    const seq = generateSequence(times({ work: 30, cycles: 3 }))
    expect(seq.map((i) => i.type)).toEqual(['work', 'work', 'work'])
  })
  it('positive rest between sets replaces ordinary rest at set boundaries', () => {
    const seq = generateSequence(times({ work: 20, rest: 10, cycles: 2, sets: 3, restBetweenSets: 90 }))
    expect(seq.map((i) => `${i.type}:${i.duration}`)).toEqual([
      'work:20', 'rest:10', 'work:20', 'setRest:90',
      'work:20', 'rest:10', 'work:20', 'setRest:90',
      'work:20', 'rest:10', 'work:20'
    ])
    expect(seq[3]).toMatchObject({ id: 'setrest-1', set: 1, cycle: 2 })
  })
  it('zero rest between sets falls back to ordinary rest', () => {
    const seq = generateSequence(times({ work: 20, rest: 10, cycles: 2, sets: 2 }))
    expect(seq.map((i) => i.type)).toEqual(['work', 'rest', 'work', 'rest', 'work', 'rest', 'work'])
  })
  it('appends cooldown once with the last set/cycle', () => {
    const seq = generateSequence(times({ prepare: 5, work: 20, rest: 10, cycles: 2, sets: 2, coolDown: 120 }))
    expect(seq[seq.length - 1]).toMatchObject({ type: 'cooldown', duration: 120, set: 2, cycle: 2 })
    expect(seq[seq.length - 2].type).toBe('work')
  })
})

describe('formatting and parsing', () => {
  it('formats seconds, mm:ss and h:mm:ss', () => {
    expect(formatDuration(0)).toBe('0')
    expect(formatDuration(57)).toBe('57')
    expect(formatDuration(60)).toBe('01:00')
    expect(formatDuration(3599)).toBe('59:59')
    expect(formatDuration(3600)).toBe('1:00:00')
    expect(formatDurationLabel(45)).toBe('45 sec')
    expect(formatDurationLabel(300)).toBe('05:00')
  })
  it('parses seconds and mm:ss and rejects invalid input', () => {
    expect(parseDuration('90')).toBe(90)
    expect(parseDuration(' 1:30 ')).toBe(90)
    expect(parseDuration('01:00')).toBe(60)
    expect(parseDuration('1:02:03')).toBe(3723)
    for (const bad of ['', 'abc', '-5', '1.5', '1:60', 'NaN', 'Infinity', '1e3', '99999999', '25:00:00'])
      expect(parseDuration(bad)).toBeNull()
    expect(parseCount('4')).toBe(4)
    for (const bad of ['0', '-1', '2.5', '100', 'x']) expect(parseCount(bad)).toBeNull()
  })
  it('builds the screenshot summary and card lines', () => {
    const w = { ...newWorkout('a', 0), prepare: 60, work: 45, rest: 60, cycles: 4, sets: 5 }
    expect(workoutSummary(w)).toBe('5 x Workout: 35:00 • 40 intervals')
    expect(cardLines(w).map((l) => `${l.label}: ${l.value}`)).toEqual([
      'Prepare: 01:00', 'Work: 45 sec', 'Rest: 01:00', 'Cycles: 4', 'Sets: 5'
    ])
    const b = { ...newWorkout('b', 0), prepare: 10, work: 900, rest: 300, cycles: 8, workDescription: 'יש להגיע ל 1200 הקלדות' }
    expect(cardLines(b).map((l) => `${l.label}: ${l.value}`)).toEqual([
      'Prepare: 10 sec', 'Work: 15:00', 'Rest: 05:00', 'Cycles: 8'
    ])
    expect(cardLines(b)[1].description).toBe('יש להגיע ל 1200 הקלדות')
  })
})
