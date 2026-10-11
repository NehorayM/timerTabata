import { z } from 'zod'
import { MAX_COUNT, MAX_DURATION } from './format'
import type { Settings, Workout } from './types'

export const ID_RE = /^[A-Za-z0-9_-]{1,64}$/
export const ASSET_RE = /^[a-f0-9-]{36}\.(png|jpe?g|gif|webp)$/

const duration = z.number().int().min(0).max(MAX_DURATION)
const count = z.number().int().min(1).max(MAX_COUNT)
const color = z.string().regex(/^#[0-9a-fA-F]{6}$/)
const text = (max: number): z.ZodString => z.string().max(max)

export const WorkoutSchema = z.object({
  id: z.string().regex(ID_RE),
  name: z.string().trim().min(1).max(80),
  color,
  prepare: duration,
  work: duration.min(1),
  rest: duration,
  cycles: count,
  sets: count,
  restBetweenSets: duration,
  coolDown: duration,
  workDescription: text(200),
  restDescription: text(200),
  workImage: z.string().regex(ASSET_RE).nullable(),
  restImage: z.string().regex(ASSET_RE).nullable(),
  notes: text(10000),
  favorite: z.boolean(),
  createdAt: z.number().int().nonnegative(),
  updatedAt: z.number().int().nonnegative(),
  lastUsedAt: z.number().int().nonnegative().nullable()
}) satisfies z.ZodType<Workout>

export const WorkoutsFileSchema = z.object({
  version: z.literal(1),
  workouts: z.array(WorkoutSchema)
})

const accelerator = z.string().max(64)

export const DEFAULT_REST_COLOR = '#1565c0'

export const SettingsSchema = z.object({
  volume: z.number().min(0).max(1).default(0.8),
  muted: z.boolean().default(false),
  countdownBeeps: z.boolean().default(true),
  restColor: color.default(DEFAULT_REST_COLOR),
  closeToTray: z.boolean().default(true),
  alwaysOnTopMain: z.boolean().default(false),
  alwaysOnTopMini: z.boolean().default(true),
  preferX11: z.boolean().default(false),
  globalShortcutsEnabled: z.boolean().default(false),
  shortcuts: z
    .object({
      toggle: accelerator.default('CommandOrControl+Alt+P'),
      next: accelerator.default('CommandOrControl+Alt+Right'),
      previous: accelerator.default('CommandOrControl+Alt+Left'),
      stop: accelerator.default('CommandOrControl+Alt+S'),
      show: accelerator.default('CommandOrControl+Alt+T')
    })
    .default({}),
  sort: z.enum(['updated', 'name', 'duration', 'created', 'used']).default('updated'),
  favoritesOnly: z.boolean().default(false),
  lastWorkoutId: z.string().regex(ID_RE).nullable().default(null)
}) satisfies z.ZodType<Settings, z.ZodTypeDef, unknown>

export const SettingsFileSchema = z.object({ version: z.literal(1), settings: SettingsSchema })

export const HistoryEntrySchema = z.object({
  id: z.string().regex(ID_RE),
  workoutId: z.string().regex(ID_RE),
  workoutName: z.string().max(80),
  startedAt: z.number().int().nonnegative(),
  endedAt: z.number().int().nonnegative(),
  status: z.enum(['finished', 'stopped']),
  completedIntervals: z.number().int().nonnegative(),
  totalIntervals: z.number().int().nonnegative(),
  elapsedSeconds: z.number().int().nonnegative()
})

export const HistoryFileSchema = z.object({ version: z.literal(1), entries: z.array(HistoryEntrySchema) })

export const CheckpointSchema = z.object({
  version: z.literal(1),
  sessionId: z.string().regex(ID_RE),
  workout: WorkoutSchema,
  index: z.number().int().nonnegative(),
  remainingMs: z.number().finite().nonnegative(),
  locked: z.boolean(),
  startedAt: z.number().int().nonnegative(),
  savedAt: z.number().int().nonnegative()
})

/** Exported ("shared") workout file. Images are embedded as data URLs so the file is self-contained. */
export const EXPORT_FORMAT = 'timertabata-workout'
export const ExportSchema = z.object({
  format: z.literal(EXPORT_FORMAT),
  version: z.literal(1),
  workout: WorkoutSchema.omit({ id: true, createdAt: true, updatedAt: true, lastUsedAt: true, workImage: true, restImage: true })
    .extend({ favorite: z.boolean().default(false), notes: text(10000).default('') }),
  images: z
    .object({
      work: z.string().max(14_000_000).nullable().default(null),
      rest: z.string().max(14_000_000).nullable().default(null)
    })
    .default({})
})

export type ExportFile = z.infer<typeof ExportSchema>

export function formatZodError(e: z.ZodError): string {
  return e.issues
    .slice(0, 3)
    .map((i) => `${i.path.join('.') || 'value'}: ${i.message}`)
    .join('; ')
}
