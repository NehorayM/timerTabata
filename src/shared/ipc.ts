import type {
  Capabilities,
  HistoryEntry,
  Result,
  SessionCheckpoint,
  SessionCommand,
  SessionView,
  Settings,
  ShortcutStatus,
  SoundEvent,
  Workout
} from './types'

export type StartSessionResult = { ok: true } | { ok: false; error: 'active' | 'locked' | 'not-found' }
export type CommandResult = { ok: true } | { ok: false; error: string }

export interface OpenWorkoutRequest {
  workoutId: string
  found: boolean
}

/** Events pushed from the main process. */
export interface ApiEvents {
  session: SessionView | null
  sound: SoundEvent
  workouts: Workout[]
  settings: Settings
  'open-workout': OpenWorkoutRequest
  notice: string
  'shortcut-status': ShortcutStatus[]
}

export const EVENT_CHANNELS = ['session', 'sound', 'workouts', 'settings', 'open-workout', 'notice', 'shortcut-status'] as const

/** The narrow API exposed to renderers via the preload script. */
export interface TimerApi {
  listWorkouts(): Promise<Workout[]>
  saveWorkout(w: Workout): Promise<Result<Workout>>
  deleteWorkout(id: string): Promise<Result>
  copyWorkout(id: string): Promise<Result<Workout>>
  setFavorite(id: string, favorite: boolean): Promise<Result<Workout>>
  setNotes(id: string, notes: string): Promise<Result<Workout>>
  /** Opens a save dialog; value is the written path, or null when canceled. */
  exportWorkout(id: string): Promise<Result<string | null>>
  /** Opens a file dialog; value is the imported workout, or null when canceled. */
  importWorkout(): Promise<Result<Workout | null>>
  createShortcut(id: string): Promise<Result<string>>
  /** Opens a file dialog and copies the image into app storage; value is the asset name or null. */
  pickImage(): Promise<Result<string | null>>
  getSettings(): Promise<Settings>
  updateSettings(patch: Partial<Settings>): Promise<Result<Settings>>
  getShortcutStatus(): Promise<ShortcutStatus[]>
  listHistory(): Promise<HistoryEntry[]>
  clearHistory(): Promise<void>
  getSession(): Promise<SessionView | null>
  startSession(workoutId: string, replace: boolean): Promise<StartSessionResult>
  command(cmd: SessionCommand): Promise<CommandResult>
  getRecovery(): Promise<SessionCheckpoint | null>
  resolveRecovery(accept: boolean): Promise<void>
  capabilities(): Promise<Capabilities>
  openMini(): Promise<void>
  closeMini(): Promise<void>
  showMain(): Promise<void>
  setAlwaysOnTop(target: 'main' | 'mini', on: boolean): Promise<Result<boolean>>
  takePendingOpen(): Promise<OpenWorkoutRequest | null>
  getProblems(): Promise<string[]>
  openDataDir(): Promise<string>
  on<K extends keyof ApiEvents>(event: K, cb: (payload: ApiEvents[K]) => void): () => void
}

export const INVOKE_CHANNELS = [
  'listWorkouts',
  'saveWorkout',
  'deleteWorkout',
  'copyWorkout',
  'setFavorite',
  'setNotes',
  'exportWorkout',
  'importWorkout',
  'createShortcut',
  'pickImage',
  'getSettings',
  'updateSettings',
  'getShortcutStatus',
  'listHistory',
  'clearHistory',
  'getSession',
  'startSession',
  'command',
  'getRecovery',
  'resolveRecovery',
  'capabilities',
  'openMini',
  'closeMini',
  'showMain',
  'setAlwaysOnTop',
  'takePendingOpen',
  'getProblems',
  'openDataDir'
] as const satisfies readonly Exclude<keyof TimerApi, 'on'>[]

export type InvokeChannel = (typeof INVOKE_CHANNELS)[number]

export const ASSET_SCHEME = 'tt-asset'
export const assetUrl = (name: string): string => `${ASSET_SCHEME}://img/${encodeURIComponent(name)}`
