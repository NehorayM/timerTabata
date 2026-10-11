export type IntervalType = 'prepare' | 'work' | 'rest' | 'setRest' | 'cooldown'

export interface Interval {
  /** Stable identifier derived from type/set/cycle, unique within a sequence. */
  id: string
  /** 0-based position in the sequence. */
  index: number
  /** 1-based number shown to the user. */
  number: number
  type: IntervalType
  /** Integer seconds, always > 0 (zero-duration intervals are omitted). */
  duration: number
  set: number
  cycle: number
}

export interface WorkoutTimes {
  prepare: number
  work: number
  rest: number
  cycles: number
  sets: number
  restBetweenSets: number
  coolDown: number
}

export interface Workout extends WorkoutTimes {
  id: string
  name: string
  color: string
  workDescription: string
  restDescription: string
  workImage: string | null
  restImage: string | null
  notes: string
  favorite: boolean
  createdAt: number
  updatedAt: number
  lastUsedAt: number | null
}

export type SortKey = 'updated' | 'name' | 'duration' | 'created' | 'used'

export type ShortcutAction = 'toggle' | 'next' | 'previous' | 'stop' | 'show'

export type SoundTheme = 'beep' | 'bell' | 'whistle' | 'digital'
export type NoiseKind = 'off' | 'white' | 'pink' | 'brown'
export type TimerHeading = 'remaining' | 'phase'

export interface Settings {
  volume: number
  muted: boolean
  countdownBeeps: boolean
  /** Countdown beeps for the last N seconds of an interval (1-10). */
  countdownFrom: number
  soundTheme: SoundTheme
  /** Short cue halfway through Work intervals of 10 s or more. */
  halfwayAlert: boolean
  noise: NoiseKind
  noiseVolume: number
  /** Play background noise during every running interval or only during Work. */
  noiseDuring: 'session' | 'work'
  /** What the faint timer heading shows. */
  timerHeading: TimerHeading
  /** Prevent display sleep while a workout runs. */
  keepAwake: boolean
  /** Let the mini timer take keyboard focus (off avoids focus stealing on Linux). */
  miniFocusable: boolean
  restColor: string
  closeToTray: boolean
  alwaysOnTopMain: boolean
  alwaysOnTopMini: boolean
  preferX11: boolean
  globalShortcutsEnabled: boolean
  shortcuts: Record<ShortcutAction, string>
  sort: SortKey
  favoritesOnly: boolean
  lastWorkoutId: string | null
}

export type SessionStatus = 'running' | 'paused' | 'finished'

export interface SessionView {
  sessionId: string
  workout: Workout
  /** Index into the generated sequence; equals sequence length when finished. */
  index: number
  status: SessionStatus
  /** Type of the current interval, or 'finish' after completion. */
  phase: IntervalType | 'finish'
  remainingMs: number
  displaySeconds: number
  /** Full duration of the current interval in ms (0 when finished). */
  intervalMs: number
  /** Remaining ms of the whole workout (current interval + all following). */
  totalRemainingMs: number
  locked: boolean
  set: number
  sets: number
  cycle: number
  cycles: number
  totalIntervals: number
}

export interface SessionCheckpoint {
  version: 1
  sessionId: string
  workout: Workout
  index: number
  remainingMs: number
  locked: boolean
  startedAt: number
  savedAt: number
}

export type HistoryStatus = 'finished' | 'stopped'

export interface HistoryEntry {
  id: string
  workoutId: string
  workoutName: string
  startedAt: number
  endedAt: number
  status: HistoryStatus
  completedIntervals: number
  totalIntervals: number
  elapsedSeconds: number
}

export type SessionCommand =
  | 'toggle'
  | 'pause'
  | 'resume'
  | 'next'
  | 'previous'
  | 'reset'
  | 'stop'
  | 'lock'
  | 'unlock'

export type SoundEvent =
  | { kind: 'transition'; type: IntervalType }
  | { kind: 'countdown'; seconds: number }
  | { kind: 'halfway' }
  | { kind: 'finish' }

export interface Capability {
  available: boolean
  note: string
}

export interface Capabilities {
  platform: string
  displayServer: 'windows' | 'x11' | 'wayland' | 'xwayland' | 'other'
  tray: Capability
  alwaysOnTop: Capability
  globalShortcuts: Capability
}

export interface ShortcutStatus {
  action: ShortcutAction
  accelerator: string
  ok: boolean
  error?: string
}

export type Result<T = null> = { ok: true; value: T } | { ok: false; error: string }
