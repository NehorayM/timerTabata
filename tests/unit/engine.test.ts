import { describe, expect, it } from 'vitest'
import { ManualClock, TimerEngine } from '../../src/shared/engine'
import { generateSequence } from '../../src/shared/sequence'
import type { WorkoutTimes } from '../../src/shared/types'

const A: WorkoutTimes = { prepare: 60, work: 45, rest: 60, cycles: 4, sets: 5, restBetweenSets: 0, coolDown: 0 }

function setup(w: WorkoutTimes = A): { clock: ManualClock; e: TimerEngine } {
  const clock = new ManualClock(1_000_000)
  const e = new TimerEngine(generateSequence(w), clock)
  return { clock, e }
}

describe('TimerEngine', () => {
  it('initially displays the full duration and rounds remaining up', () => {
    const { clock, e } = setup()
    expect(e.displaySeconds()).toBe(60)
    e.start()
    expect(e.displaySeconds()).toBe(60)
    clock.advance(1)
    expect(e.displaySeconds()).toBe(60)
    clock.advance(999)
    expect(e.displaySeconds()).toBe(59)
    clock.advance(2000)
    e.update()
    expect(e.displaySeconds()).toBe(57)
  })

  it('transitions exactly once at the deadline', () => {
    const { clock, e } = setup()
    e.start()
    clock.advance(59_999)
    expect(e.update().transitions).toBe(0)
    expect(e.index).toBe(0)
    clock.advance(1)
    expect(e.update().transitions).toBe(1)
    expect(e.index).toBe(1)
    expect(e.displaySeconds()).toBe(45)
    expect(e.update().transitions).toBe(0)
  })

  it('catches up across several intervals on a delayed tick without drift', () => {
    const { clock, e } = setup()
    e.start()
    // 60 prepare + 45 work + 60 rest + 45 work = 210 s, then 7.25 s into rest #5
    clock.advance(217_250)
    const r = e.update()
    expect(r.transitions).toBe(4)
    expect(e.index).toBe(4)
    expect(e.current?.type).toBe('rest')
    expect(e.remainingMs()).toBe(52_750)
    // further ticks continue from exact deadlines
    clock.advance(52_750)
    expect(e.update().transitions).toBe(1)
    expect(e.remainingMs()).toBe(45_000)
  })

  it('pause freezes remaining time and resume preserves it', () => {
    const { clock, e } = setup()
    e.start()
    clock.advance(12_300)
    e.pause()
    expect(e.status).toBe('paused')
    expect(e.remainingMs()).toBe(47_700)
    clock.advance(600_000)
    expect(e.update().transitions).toBe(0)
    expect(e.remainingMs()).toBe(47_700)
    e.resume()
    clock.advance(47_700)
    e.update()
    expect(e.index).toBe(1)
  })

  it('next/previous reset to full duration preserving running or paused state', () => {
    const { clock, e } = setup()
    expect(e.canPrevious()).toBe(false)
    expect(e.previous()).toBe(false)
    e.start()
    clock.advance(10_000)
    e.next()
    expect(e.index).toBe(1)
    expect(e.status).toBe('running')
    expect(e.remainingMs()).toBe(45_000)
    clock.advance(5_000)
    e.pause()
    e.previous()
    expect(e.index).toBe(0)
    expect(e.status).toBe('paused')
    expect(e.remainingMs()).toBe(60_000)
  })

  it('completes after the final interval; next disabled after completion', () => {
    const w: WorkoutTimes = { ...A, prepare: 0, cycles: 2, sets: 1 }
    const { clock, e } = setup(w)
    e.start()
    clock.advance(45_000 + 60_000 + 45_000)
    const r = e.update()
    expect(r.finished).toBe(true)
    expect(r.transitions).toBe(3)
    expect(e.status).toBe('finished')
    expect(e.index).toBe(3)
    expect(e.displaySeconds()).toBe(0)
    expect(e.canNext()).toBe(false)
    expect(e.next()).toBe(false)
    expect(e.previous()).toBe(true)
    expect(e.status).toBe('paused')
    expect(e.index).toBe(2)
    expect(e.next()).toBe(true)
    expect(e.status).toBe('finished')
  })

  it('restores paused from a checkpoint without absolute deadlines', () => {
    const clock = new ManualClock(5)
    const e = new TimerEngine(generateSequence(A), clock, { index: 37, remainingMs: 12_345 })
    expect(e.status).toBe('paused')
    expect(e.index).toBe(37)
    expect(e.displaySeconds()).toBe(13)
    e.resume()
    clock.advance(12_345)
    e.update()
    expect(e.index).toBe(38)
  })

  it('clamps invalid restore data', () => {
    const e = new TimerEngine(generateSequence(A), new ManualClock(), { index: 999, remainingMs: Number.NaN })
    expect(e.index).toBe(39)
    expect(e.remainingMs()).toBe(45_000)
  })
})
