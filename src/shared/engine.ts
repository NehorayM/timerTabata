import type { Interval, SessionStatus } from './types'

/** Monotonic millisecond clock. Injected so tests can control time. */
export interface Clock {
  now(): number
}

export class ManualClock implements Clock {
  constructor(private t = 0) {}
  now(): number {
    return this.t
  }
  advance(ms: number): void {
    this.t += ms
  }
  set(ms: number): void {
    this.t = ms
  }
}

export interface EngineSnapshot {
  index: number
  status: SessionStatus
  remainingMs: number
}

export interface UpdateResult {
  /** Number of interval boundaries crossed during this update (including the final one into "finished"). */
  transitions: number
  finished: boolean
}

/**
 * Deadline-based interval timer. Time is derived from the injected monotonic clock;
 * callers may tick at any rate (ticks only refresh presentation). Deadlines are
 * advanced by exact interval durations, so delayed ticks catch up without drift.
 */
export class TimerEngine {
  private idx = 0
  private st: SessionStatus = 'paused'
  /** Monotonic deadline for the current interval while running. */
  private deadline = 0
  /** Remaining ms while paused. */
  private remaining: number

  constructor(
    private readonly seq: readonly Interval[],
    private readonly clock: Clock,
    init?: { index: number; remainingMs: number }
  ) {
    if (seq.length === 0) throw new Error('Empty sequence')
    this.remaining = this.fullMs(0)
    if (init) {
      const index = Math.min(Math.max(0, Math.floor(init.index)), seq.length - 1)
      this.idx = index
      const full = this.fullMs(index)
      this.remaining = Number.isFinite(init.remainingMs) ? Math.min(Math.max(1, init.remainingMs), full) : full
    }
  }

  get length(): number {
    return this.seq.length
  }
  get index(): number {
    return this.idx
  }
  get status(): SessionStatus {
    return this.st
  }
  get current(): Interval | undefined {
    return this.seq[this.idx]
  }

  private fullMs(i: number): number {
    return (this.seq[i]?.duration ?? 0) * 1000
  }

  /** Advances through any deadlines that have passed. Each boundary is crossed exactly once. */
  update(): UpdateResult {
    if (this.st !== 'running') return { transitions: 0, finished: this.st === 'finished' }
    const now = this.clock.now()
    let transitions = 0
    while (now >= this.deadline) {
      transitions++
      this.idx++
      if (this.idx >= this.seq.length) {
        this.finish()
        break
      }
      this.deadline += this.fullMs(this.idx)
    }
    return { transitions, finished: this.isFinished() }
  }

  isFinished(): boolean {
    return this.st === 'finished'
  }

  remainingMs(): number {
    if (this.st === 'finished') return 0
    if (this.st === 'paused') return this.remaining
    return Math.max(0, this.deadline - this.clock.now())
  }

  /** Whole seconds shown to the user: rounded up, so the full duration is shown initially. */
  displaySeconds(): number {
    return Math.ceil(this.remainingMs() / 1000)
  }

  start(): void {
    this.resume()
  }

  resume(): boolean {
    if (this.st !== 'paused') return false
    this.deadline = this.clock.now() + this.remaining
    this.st = 'running'
    return true
  }

  pause(): boolean {
    if (this.st !== 'running') return false
    this.update()
    if (this.st !== 'running') return false
    this.remaining = Math.max(1, this.deadline - this.clock.now())
    this.st = 'paused'
    return true
  }

  canPrevious(): boolean {
    return this.idx > 0 || this.st === 'finished'
  }
  canNext(): boolean {
    return this.st !== 'finished'
  }

  /** Moves to the next interval at its full duration, preserving running/paused. On the last interval it finishes. */
  next(): boolean {
    this.update()
    if (!this.canNext()) return false
    if (this.idx >= this.seq.length - 1) {
      this.finish()
      return true
    }
    this.jump(this.idx + 1, this.st)
    return true
  }

  /** Moves to the previous interval at its full duration, preserving running/paused. From "finished" it returns paused to the last interval. */
  previous(): boolean {
    this.update()
    if (!this.canPrevious()) return false
    if (this.st === 'finished') this.jump(this.seq.length - 1, 'paused')
    else this.jump(this.idx - 1, this.st)
    return true
  }

  /** Rewinds to the first interval, paused. */
  reset(): void {
    this.jump(0, 'paused')
  }

  snapshot(): EngineSnapshot {
    return { index: this.idx, status: this.st, remainingMs: this.remainingMs() }
  }

  private jump(index: number, status: SessionStatus): void {
    this.idx = index
    const full = this.fullMs(index)
    if (status === 'running') {
      this.deadline = this.clock.now() + full
      this.st = 'running'
    } else {
      this.remaining = full
      this.st = 'paused'
    }
  }

  private finish(): void {
    this.idx = this.seq.length
    this.remaining = 0
    this.st = 'finished'
  }
}
