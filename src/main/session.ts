import { TimerEngine, type Clock } from '../shared/engine'
import { generateSequence } from '../shared/sequence'
import type {
  HistoryEntry,
  Interval,
  SessionCheckpoint,
  SessionCommand,
  SessionView,
  SoundEvent,
  Workout
} from '../shared/types'

export interface SessionDeps {
  clock: Clock
  /** Wall-clock time (ms since epoch) for history/checkpoint metadata only. */
  wallNow: () => number
  newId: () => string
  emit: (view: SessionView | null) => void
  sound: (ev: SoundEvent) => void
  saveCheckpoint: (cp: SessionCheckpoint | null) => void
  addHistory: (entry: HistoryEntry) => void
  /** Periodic checkpoint interval while running (ms of monotonic time). */
  checkpointEveryMs?: number
}

interface ActiveSession {
  id: string
  workout: Workout
  seq: Interval[]
  /** after[i] = seconds of all intervals following i. */
  after: number[]
  engine: TimerEngine
  locked: boolean
  startedAt: number
  recorded: boolean
  lastCheckpointAt: number
  lastDisplay: number
  lastIndex: number
}

export type CommandResult = { ok: true } | { ok: false; error: 'no-session' | 'locked' | 'not-allowed' }
export type StartResult = { ok: true } | { ok: false; error: 'active' | 'locked' }

const LOCK_BLOCKED: ReadonlySet<SessionCommand> = new Set(['next', 'previous', 'reset', 'stop'])

/**
 * Owns the single active session. All windows, tray and shortcuts route commands here;
 * every state change is emitted to all listeners.
 */
export class SessionManager {
  private s: ActiveSession | null = null
  private readonly checkpointEvery: number

  constructor(private readonly d: SessionDeps) {
    this.checkpointEvery = d.checkpointEveryMs ?? 10_000
  }

  get active(): boolean {
    return this.s !== null
  }
  /** True when a session exists that has not finished. */
  get inProgress(): boolean {
    return this.s !== null && this.s.engine.status !== 'finished'
  }
  get running(): boolean {
    return this.s?.engine.status === 'running'
  }
  get locked(): boolean {
    return this.s?.locked ?? false
  }

  start(workout: Workout, opts: { replace?: boolean } = {}): StartResult {
    if (this.s) {
      if (this.s.locked) return { ok: false, error: 'locked' }
      if (this.inProgress && !opts.replace) return { ok: false, error: 'active' }
      this.end('stopped')
    }
    // Snapshot: later edits/deletes of the saved workout cannot mutate the running session.
    const snapshot: Workout = structuredClone(workout)
    this.s = this.create(this.d.newId(), snapshot, this.d.wallNow())
    this.s.engine.start()
    this.checkpoint()
    this.emit()
    return { ok: true }
  }

  /** Restores a checkpoint as a paused session. Absolute deadlines are never persisted. */
  restore(cp: SessionCheckpoint): boolean {
    if (this.s) return false
    const s = this.create(cp.sessionId, cp.workout, cp.startedAt, { index: cp.index, remainingMs: cp.remainingMs })
    s.locked = cp.locked
    this.s = s
    this.checkpoint()
    this.emit()
    return true
  }

  command(cmd: SessionCommand): CommandResult {
    const s = this.s
    if (!s) return { ok: false, error: 'no-session' }
    if (s.locked && LOCK_BLOCKED.has(cmd)) return { ok: false, error: 'locked' }
    const e = s.engine
    let ok = true
    switch (cmd) {
      case 'toggle':
        ok = e.status === 'running' ? e.pause() : e.resume()
        break
      case 'pause':
        ok = e.pause()
        break
      case 'resume':
        ok = e.resume()
        break
      case 'next':
        ok = e.next()
        if (ok && e.status === 'finished') this.onFinished()
        break
      case 'previous':
        ok = e.previous()
        break
      case 'reset':
        e.reset()
        break
      case 'lock':
        s.locked = true
        break
      case 'unlock':
        s.locked = false
        break
      case 'stop':
        this.end('stopped')
        this.emit()
        return { ok: true }
    }
    if (!ok) return { ok: false, error: 'not-allowed' }
    s.lastIndex = e.index
    s.lastDisplay = e.displaySeconds()
    this.checkpoint()
    this.emit()
    return { ok: true }
  }

  /** Called by the presentation tick loop. Emits only when what the user sees changes. */
  tick(): void {
    const s = this.s
    if (!s || s.engine.status !== 'running') return
    const r = s.engine.update()
    const display = s.engine.displaySeconds()
    if (r.transitions > 0) {
      // A delayed tick may cross several boundaries; only the final state gets a sound.
      if (r.finished) this.onFinished()
      else this.d.sound({ kind: 'transition', type: s.engine.current!.type })
      s.lastIndex = s.engine.index
      s.lastDisplay = display
      this.checkpoint()
      this.emit()
      return
    }
    if (display !== s.lastDisplay) {
      // Countdown events cover the last 10 s; the renderer applies the user's countdown length.
      if (display >= 1 && display <= 10) this.d.sound({ kind: 'countdown', seconds: display })
      const cur = s.engine.current
      if (cur?.type === 'work' && cur.duration >= 10 && display === Math.floor(cur.duration / 2)) this.d.sound({ kind: 'halfway' })
      s.lastDisplay = display
      if (this.d.clock.now() - s.lastCheckpointAt >= this.checkpointEvery) this.checkpoint()
      this.emit()
    }
  }

  /** OS suspend: pause and persist. Resume from suspend leaves the session paused. */
  suspend(): void {
    if (this.s?.engine.status === 'running') this.command('pause')
    else this.checkpoint()
  }

  /** Graceful quit: keep a paused checkpoint so the session can be recovered on next launch. */
  persistForQuit(): void {
    const s = this.s
    if (!s || s.engine.status === 'finished') return
    s.engine.update()
    if (s.engine.status === 'running') s.engine.pause()
    this.checkpoint()
  }

  view(): SessionView | null {
    const s = this.s
    if (!s) return null
    const e = s.engine
    const cur = e.current
    const last = s.seq[s.seq.length - 1]
    return {
      sessionId: s.id,
      workout: s.workout,
      index: e.index,
      status: e.status,
      phase: cur?.type ?? 'finish',
      remainingMs: e.remainingMs(),
      displaySeconds: e.displaySeconds(),
      intervalMs: (cur?.duration ?? 0) * 1000,
      totalRemainingMs: cur ? e.remainingMs() + s.after[e.index] * 1000 : 0,
      locked: s.locked,
      set: (cur ?? last).set,
      sets: s.workout.sets,
      cycle: (cur ?? last).cycle,
      cycles: s.workout.cycles,
      totalIntervals: s.seq.length
    }
  }

  checkpointData(): SessionCheckpoint | null {
    const s = this.s
    if (!s || s.engine.status === 'finished') return null
    const snap = s.engine.snapshot()
    return {
      version: 1,
      sessionId: s.id,
      workout: s.workout,
      index: snap.index,
      remainingMs: Math.round(snap.remainingMs),
      locked: s.locked,
      startedAt: s.startedAt,
      savedAt: this.d.wallNow()
    }
  }

  private create(id: string, workout: Workout, startedAt: number, init?: { index: number; remainingMs: number }): ActiveSession {
    const seq = generateSequence(workout)
    const engine = new TimerEngine(seq, this.d.clock, init)
    const after: number[] = new Array(seq.length).fill(0)
    for (let i = seq.length - 2; i >= 0; i--) after[i] = after[i + 1] + seq[i + 1].duration
    return {
      id,
      workout,
      seq,
      after,
      engine,
      locked: false,
      startedAt,
      recorded: false,
      lastCheckpointAt: this.d.clock.now(),
      lastDisplay: engine.displaySeconds(),
      lastIndex: engine.index
    }
  }

  private onFinished(): void {
    this.d.sound({ kind: 'finish' })
    this.record('finished')
  }

  private record(status: 'finished' | 'stopped'): void {
    const s = this.s
    if (!s || s.recorded) return
    s.recorded = true
    const e = s.engine
    const completed = Math.min(e.index, s.seq.length)
    let elapsed = 0
    for (let i = 0; i < completed; i++) elapsed += s.seq[i].duration
    if (e.status !== 'finished' && e.current) elapsed += e.current.duration - e.remainingMs() / 1000
    this.d.addHistory({
      id: this.d.newId(),
      workoutId: s.workout.id,
      workoutName: s.workout.name,
      startedAt: s.startedAt,
      endedAt: this.d.wallNow(),
      status,
      completedIntervals: completed,
      totalIntervals: s.seq.length,
      elapsedSeconds: Math.max(0, Math.round(elapsed))
    })
  }

  private end(status: 'finished' | 'stopped'): void {
    this.record(status)
    this.s = null
    this.d.saveCheckpoint(null)
  }

  private checkpoint(): void {
    if (!this.s) return
    this.s.lastCheckpointAt = this.d.clock.now()
    this.d.saveCheckpoint(this.checkpointData())
  }

  private emit(): void {
    this.d.emit(this.view())
  }
}
