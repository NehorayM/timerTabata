import { beforeEach, describe, expect, it } from 'vitest'
import { ManualClock } from '../../src/shared/engine'
import { SessionManager } from '../../src/main/session'
import { newWorkout } from '../../src/shared/workout'
import type { HistoryEntry, SessionCheckpoint, SessionView, SoundEvent, Workout } from '../../src/shared/types'

let clock: ManualClock
let views: (SessionView | null)[]
let sounds: SoundEvent[]
let checkpoints: (SessionCheckpoint | null)[]
let history: HistoryEntry[]
let m: SessionManager
let n = 0

const fixtureA = (): Workout => ({ ...newWorkout('wa', 1), prepare: 60, work: 45, rest: 60, cycles: 4, sets: 5 })

beforeEach(() => {
  clock = new ManualClock(0)
  views = []
  sounds = []
  checkpoints = []
  history = []
  m = new SessionManager({
    clock,
    wallNow: () => 1_700_000_000_000,
    newId: () => `id${++n}`,
    emit: (v) => views.push(v),
    sound: (s) => sounds.push(s),
    saveCheckpoint: (c) => checkpoints.push(c),
    addHistory: (h) => history.push(h)
  })
})

const last = (): SessionView => views[views.length - 1]!

describe('SessionManager', () => {
  it('starts with full duration and counters set/sets • cycle/cycles', () => {
    m.start(fixtureA())
    expect(last()).toMatchObject({ index: 0, displaySeconds: 60, status: 'running', set: 1, sets: 5, cycle: 1, cycles: 4, totalIntervals: 40 })
    clock.advance(3000)
    m.tick()
    expect(last().displaySeconds).toBe(57)
  })

  it('maps counters for Work #38 to 5/5 • 3/4', () => {
    m.start(fixtureA())
    for (let i = 0; i < 37; i++) m.command('next')
    expect(last()).toMatchObject({ index: 37, set: 5, cycle: 3 })
  })

  it('emits one transition sound for a delayed multi-phase tick, no stale countdown burst', () => {
    m.start(fixtureA())
    clock.advance(58_500)
    m.tick()
    expect(sounds).toEqual([{ kind: 'countdown', seconds: 2 }])
    clock.advance(200_000)
    m.tick()
    expect(sounds.slice(1)).toEqual([{ kind: 'transition', type: 'rest' }]) // 258.5 s is inside Rest #5
  })

  it('suspend pauses and OS resume leaves it paused', () => {
    m.start(fixtureA())
    clock.advance(10_000)
    m.suspend()
    expect(last().status).toBe('paused')
    clock.advance(3_600_000)
    m.tick()
    expect(last()).toMatchObject({ status: 'paused', displaySeconds: 50, index: 0 })
    expect(checkpoints[checkpoints.length - 1]).toMatchObject({ index: 0, remainingMs: 50_000 })
  })

  it('lock blocks skip/reset/stop/replace but allows pause, resume and unlock', () => {
    m.start(fixtureA())
    expect(m.command('lock')).toEqual({ ok: true })
    for (const c of ['next', 'previous', 'reset', 'stop'] as const) expect(m.command(c)).toEqual({ ok: false, error: 'locked' })
    expect(m.start(fixtureA(), { replace: true })).toEqual({ ok: false, error: 'locked' })
    expect(m.command('pause').ok).toBe(true)
    expect(m.command('resume').ok).toBe(true)
    expect(m.command('unlock').ok).toBe(true)
    expect(m.command('next').ok).toBe(true)
  })

  it('only one active session; replace requires confirmation flag', () => {
    m.start(fixtureA())
    expect(m.start(fixtureA())).toEqual({ ok: false, error: 'active' })
    expect(last().sessionId).toBe(views[0]!.sessionId)
    expect(m.start({ ...fixtureA(), id: 'other' }, { replace: true })).toEqual({ ok: true })
    expect(last().workout.id).toBe('other')
    expect(history).toHaveLength(1)
    expect(history[0].status).toBe('stopped')
  })

  it('uses a snapshot: mutating the source workout does not affect the session', () => {
    const w = fixtureA()
    m.start(w)
    w.work = 5
    w.name = 'changed'
    m.command('next')
    expect(last().workout.name).toBe('Workout')
    expect(last().displaySeconds).toBe(45)
  })

  it('records finished history once and clears the checkpoint', () => {
    const w = { ...newWorkout('w', 0), prepare: 0, work: 2, rest: 1, cycles: 2 }
    m.start(w)
    clock.advance(10_000)
    m.tick()
    expect(last().status).toBe('finished')
    expect(sounds[sounds.length - 1]).toEqual({ kind: 'finish' })
    expect(history).toEqual([expect.objectContaining({ status: 'finished', completedIntervals: 3, totalIntervals: 3, elapsedSeconds: 5 })])
    expect(checkpoints[checkpoints.length - 1]).toBeNull()
    m.command('stop')
    expect(history).toHaveLength(1)
    expect(views[views.length - 1]).toBeNull()
  })

  it('records stopped sessions with elapsed time', () => {
    m.start(fixtureA())
    clock.advance(70_000)
    m.tick()
    m.command('stop')
    expect(history[0]).toMatchObject({ status: 'stopped', completedIntervals: 1, elapsedSeconds: 70 })
  })

  it('checkpoints periodically, at transitions and pause, not every tick', () => {
    m.start(fixtureA())
    const base = checkpoints.length
    for (let i = 0; i < 5; i++) {
      clock.advance(1000)
      m.tick()
    }
    expect(checkpoints.length).toBe(base)
    for (let i = 0; i < 6; i++) {
      clock.advance(1000)
      m.tick()
    }
    expect(checkpoints.length).toBe(base + 1)
    m.command('pause')
    expect(checkpoints.length).toBe(base + 2)
  })

  it('recovers a paused session from a checkpoint after restart', () => {
    m.start(fixtureA())
    clock.advance(65_000)
    m.tick()
    m.persistForQuit()
    const cp = checkpoints[checkpoints.length - 1]!
    expect(cp).toMatchObject({ index: 1, remainingMs: 40_000 })
    expect(JSON.stringify(cp)).not.toContain('deadline')

    const clock2 = new ManualClock(99_999_999) // new process: unrelated monotonic origin
    const out: (SessionView | null)[] = []
    const m2 = new SessionManager({
      clock: clock2,
      wallNow: () => 0,
      newId: () => 'x',
      emit: (v) => out.push(v),
      sound: () => {},
      saveCheckpoint: () => {},
      addHistory: () => {}
    })
    m2.restore(JSON.parse(JSON.stringify(cp)))
    expect(out[out.length - 1]).toMatchObject({ status: 'paused', index: 1, displaySeconds: 40 })
    clock2.advance(100_000)
    m2.tick()
    expect(out[out.length - 1]).toMatchObject({ status: 'paused', displaySeconds: 40 })
    m2.command('resume')
    clock2.advance(40_000)
    m2.tick()
    expect(out[out.length - 1]).toMatchObject({ index: 2, status: 'running' })
  })

  it('reports total remaining time of the whole workout', () => {
    m.start(fixtureA())
    expect(last().totalRemainingMs).toBe(2_100_000)
    clock.advance(3000)
    m.tick()
    expect(Math.ceil(last().totalRemainingMs / 1000)).toBe(2097)
    m.command('next')
    expect(last().totalRemainingMs).toBe(2_040_000)
    m.command('pause')
    clock.advance(50_000)
    m.tick()
    expect(last().totalRemainingMs).toBe(2_040_000)
  })

  it('emits countdown events for the last 10 s and a halfway cue in Work', () => {
    const w = { ...newWorkout('w', 0), prepare: 0, work: 30, rest: 0, cycles: 1 }
    m.start(w)
    for (let i = 0; i < 30; i++) {
      clock.advance(1000)
      m.tick()
    }
    expect(sounds.filter((x) => x.kind === 'halfway')).toHaveLength(1)
    expect(sounds.filter((x) => x.kind === 'countdown').map((x) => (x as { seconds: number }).seconds)).toEqual([10, 9, 8, 7, 6, 5, 4, 3, 2, 1])
    expect(sounds[sounds.length - 1]).toEqual({ kind: 'finish' })
  })
})
