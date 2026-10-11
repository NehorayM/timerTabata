import fs from 'node:fs'
import path from 'node:path'
import { randomUUID } from 'node:crypto'
import {
  ASSET_RE,
  CheckpointSchema,
  EXPORT_FORMAT,
  ExportSchema,
  HistoryFileSchema,
  SettingsFileSchema,
  SettingsSchema,
  WorkoutSchema,
  WorkoutsFileSchema,
  formatZodError,
  type ExportFile
} from '../shared/schema'
import type { HistoryEntry, Result, SessionCheckpoint, Settings, Workout } from '../shared/types'
import { JsonFile, writeFileAtomic } from './store'

const IMAGE_MIME: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp'
}
export const MAX_IMAGE_BYTES = 10 * 1024 * 1024
const MAX_HISTORY = 1000

/**
 * All durable app data, stored as versioned JSON documents in the user-data directory.
 * Electron-free so it can be integration-tested with a temp directory.
 */
export class DataService {
  readonly imagesDir: string
  readonly problems: string[] = []
  private workouts: Workout[]
  private settings: Settings
  private history: HistoryEntry[]
  private readonly workoutsFile: JsonFile<{ version: 1; workouts: Workout[] }>
  private readonly settingsFile: JsonFile<{ version: 1; settings: Settings }>
  private readonly historyFile: JsonFile<{ version: 1; entries: HistoryEntry[] }>
  private readonly sessionFile: JsonFile<SessionCheckpoint | null>

  constructor(readonly dir: string, private readonly now: () => number = Date.now) {
    fs.mkdirSync(dir, { recursive: true })
    this.imagesDir = path.join(dir, 'images')
    fs.mkdirSync(this.imagesDir, { recursive: true })
    this.workoutsFile = new JsonFile(dir, 'workouts.json', WorkoutsFileSchema, () => ({ version: 1 as const, workouts: [] }))
    this.settingsFile = new JsonFile(dir, 'settings.json', SettingsFileSchema, () => ({
      version: 1 as const,
      settings: SettingsSchema.parse({})
    }))
    this.historyFile = new JsonFile(dir, 'history.json', HistoryFileSchema, () => ({ version: 1 as const, entries: [] }))
    this.sessionFile = new JsonFile(dir, 'session.json', CheckpointSchema.nullable(), () => null)
    const w = this.workoutsFile.load()
    const s = this.settingsFile.load()
    const h = this.historyFile.load()
    for (const r of [w, s, h]) if (r.problem) this.problems.push(r.problem)
    this.workouts = w.data.workouts
    this.settings = s.data.settings
    this.history = h.data.entries
  }

  // ---- workouts -------------------------------------------------------------------------

  listWorkouts(): Workout[] {
    return this.workouts.map((w) => ({ ...w }))
  }

  getWorkout(id: string): Workout | undefined {
    const w = this.workouts.find((x) => x.id === id)
    return w && { ...w }
  }

  saveWorkout(input: unknown): Result<Workout> {
    const r = WorkoutSchema.safeParse(input)
    if (!r.success) return { ok: false, error: formatZodError(r.error) }
    const existing = this.workouts.find((x) => x.id === r.data.id)
    for (const img of [r.data.workImage, r.data.restImage])
      if (img && !this.imageExists(img)) return { ok: false, error: 'Image file is missing' }
    const w: Workout = {
      ...r.data,
      createdAt: existing?.createdAt ?? r.data.createdAt ?? this.now(),
      updatedAt: this.now()
    }
    const next = existing ? this.workouts.map((x) => (x.id === w.id ? w : x)) : [...this.workouts, w]
    this.commitWorkouts(next)
    if (existing) this.cleanupImages([existing.workImage, existing.restImage])
    return { ok: true, value: { ...w } }
  }

  deleteWorkout(id: string): Result {
    const existing = this.workouts.find((x) => x.id === id)
    if (!existing) return { ok: false, error: 'Workout not found' }
    this.commitWorkouts(this.workouts.filter((x) => x.id !== id))
    this.cleanupImages([existing.workImage, existing.restImage])
    if (this.settings.lastWorkoutId === id) this.updateSettings({ lastWorkoutId: null })
    return { ok: true, value: null }
  }

  copyWorkout(id: string): Result<Workout> {
    const src = this.workouts.find((x) => x.id === id)
    if (!src) return { ok: false, error: 'Workout not found' }
    const t = this.now()
    const name = `${src.name} (copy)`.slice(0, 80)
    const copy: Workout = { ...src, id: randomUUID(), name, favorite: false, createdAt: t, updatedAt: t, lastUsedAt: null }
    // Images are shared by reference; files are only deleted when no workout uses them.
    this.commitWorkouts([...this.workouts, copy])
    return { ok: true, value: { ...copy } }
  }

  patchWorkout(id: string, patch: Partial<Pick<Workout, 'favorite' | 'notes' | 'lastUsedAt'>>): Result<Workout> {
    const src = this.workouts.find((x) => x.id === id)
    if (!src) return { ok: false, error: 'Workout not found' }
    const r = WorkoutSchema.safeParse({ ...src, ...patch })
    if (!r.success) return { ok: false, error: formatZodError(r.error) }
    const touch = patch.lastUsedAt === undefined
    const w = { ...r.data, updatedAt: touch ? this.now() : src.updatedAt }
    this.commitWorkouts(this.workouts.map((x) => (x.id === id ? w : x)))
    return { ok: true, value: { ...w } }
  }

  private commitWorkouts(next: Workout[]): void {
    this.workoutsFile.save({ version: 1, workouts: next })
    this.workouts = next
  }

  // ---- import / export ------------------------------------------------------------------

  exportWorkout(id: string): Result<string> {
    const w = this.workouts.find((x) => x.id === id)
    if (!w) return { ok: false, error: 'Workout not found' }
    const file: ExportFile = {
      format: EXPORT_FORMAT,
      version: 1,
      workout: {
        name: w.name,
        color: w.color,
        prepare: w.prepare,
        work: w.work,
        rest: w.rest,
        cycles: w.cycles,
        sets: w.sets,
        restBetweenSets: w.restBetweenSets,
        coolDown: w.coolDown,
        workDescription: w.workDescription,
        restDescription: w.restDescription,
        notes: w.notes,
        favorite: w.favorite
      },
      images: { work: this.imageDataUrl(w.workImage), rest: this.imageDataUrl(w.restImage) }
    }
    return { ok: true, value: JSON.stringify(file, null, 2) }
  }

  importWorkout(json: string): Result<Workout> {
    let raw: unknown
    try {
      raw = JSON.parse(json)
    } catch {
      return { ok: false, error: 'File is not valid JSON' }
    }
    const r = ExportSchema.safeParse(raw)
    if (!r.success) return { ok: false, error: `Not a valid workout file: ${formatZodError(r.error)}` }
    const created: string[] = []
    try {
      const workImage = r.data.images.work ? this.storeDataUrl(r.data.images.work) : null
      if (workImage) created.push(workImage)
      const restImage = r.data.images.rest ? this.storeDataUrl(r.data.images.rest) : null
      if (restImage) created.push(restImage)
      const t = this.now()
      const w: Workout = { ...r.data.workout, id: randomUUID(), workImage, restImage, createdAt: t, updatedAt: t, lastUsedAt: null }
      const saved = this.saveWorkout(w)
      if (!saved.ok) throw new Error(saved.error)
      return saved
    } catch (err) {
      for (const f of created) fs.rmSync(path.join(this.imagesDir, f), { force: true })
      return { ok: false, error: err instanceof Error ? err.message : String(err) }
    }
  }

  // ---- images ---------------------------------------------------------------------------

  /** Copies an image into the app-owned images directory and returns its asset name. */
  importImage(sourcePath: string): Result<string> {
    const ext = path.extname(sourcePath).slice(1).toLowerCase()
    if (!IMAGE_MIME[ext]) return { ok: false, error: 'Unsupported image type (use PNG, JPEG, GIF or WebP)' }
    let stat: fs.Stats
    try {
      stat = fs.statSync(sourcePath)
    } catch {
      return { ok: false, error: 'Image file not found' }
    }
    if (!stat.isFile() || stat.size > MAX_IMAGE_BYTES) return { ok: false, error: 'Image must be a file up to 10 MB' }
    const name = `${randomUUID()}.${ext === 'jpeg' ? 'jpg' : ext}`
    writeFileAtomic(path.join(this.imagesDir, name), fs.readFileSync(sourcePath))
    return { ok: true, value: name }
  }

  imagePath(name: string): string | null {
    if (!ASSET_RE.test(name)) return null
    const p = path.join(this.imagesDir, name)
    return fs.existsSync(p) ? p : null
  }

  private imageExists(name: string): boolean {
    return this.imagePath(name) !== null
  }

  private imageDataUrl(name: string | null): string | null {
    const p = name && this.imagePath(name)
    if (!p) return null
    const ext = path.extname(p).slice(1)
    return `data:${IMAGE_MIME[ext]};base64,${fs.readFileSync(p).toString('base64')}`
  }

  private storeDataUrl(url: string): string {
    const m = url.match(/^data:image\/(png|jpeg|gif|webp);base64,([A-Za-z0-9+/=]+)$/)
    if (!m) throw new Error('Embedded image is invalid')
    const buf = Buffer.from(m[2], 'base64')
    if (buf.length === 0 || buf.length > MAX_IMAGE_BYTES) throw new Error('Embedded image is too large')
    const name = `${randomUUID()}.${m[1] === 'jpeg' ? 'jpg' : m[1]}`
    writeFileAtomic(path.join(this.imagesDir, name), buf)
    return name
  }

  /** Deletes image files no longer referenced by any workout or the given extra references. */
  cleanupImages(candidates: (string | null)[], keep: (string | null)[] = []): void {
    const used = new Set<string>()
    for (const w of this.workouts) {
      if (w.workImage) used.add(w.workImage)
      if (w.restImage) used.add(w.restImage)
    }
    for (const k of keep) if (k) used.add(k)
    const cp = this.loadCheckpoint()
    if (cp?.workout.workImage) used.add(cp.workout.workImage)
    if (cp?.workout.restImage) used.add(cp.workout.restImage)
    for (const c of candidates) {
      if (c && !used.has(c) && ASSET_RE.test(c)) fs.rmSync(path.join(this.imagesDir, c), { force: true })
    }
  }

  /** Startup sweep of orphaned images (e.g. picked in an editor draft that was never saved). */
  sweepImages(keep: (string | null)[] = []): void {
    let files: string[] = []
    try {
      files = fs.readdirSync(this.imagesDir)
    } catch {
      return
    }
    this.cleanupImages(files.filter((f) => ASSET_RE.test(f)), keep)
    for (const f of files) if (f.includes('.tmp-')) fs.rmSync(path.join(this.imagesDir, f), { force: true })
  }

  // ---- settings -------------------------------------------------------------------------

  getSettings(): Settings {
    return structuredClone(this.settings)
  }

  updateSettings(patch: unknown): Result<Settings> {
    if (typeof patch !== 'object' || patch === null) return { ok: false, error: 'Invalid settings' }
    const merged = { ...this.settings, ...(patch as object) }
    if ('shortcuts' in (patch as object)) merged.shortcuts = { ...this.settings.shortcuts, ...(patch as { shortcuts: object }).shortcuts }
    const r = SettingsSchema.safeParse(merged)
    if (!r.success) return { ok: false, error: formatZodError(r.error) }
    this.settingsFile.save({ version: 1, settings: r.data })
    this.settings = r.data
    return { ok: true, value: this.getSettings() }
  }

  // ---- history --------------------------------------------------------------------------

  listHistory(): HistoryEntry[] {
    return this.history.map((h) => ({ ...h }))
  }

  addHistory(entry: HistoryEntry): void {
    const next = [entry, ...this.history].slice(0, MAX_HISTORY)
    this.historyFile.save({ version: 1, entries: next })
    this.history = next
  }

  clearHistory(): void {
    this.historyFile.save({ version: 1, entries: [] })
    this.history = []
  }

  // ---- session checkpoint ---------------------------------------------------------------

  loadCheckpoint(): SessionCheckpoint | null {
    const r = this.sessionFile.load()
    if (r.problem && !this.problems.includes(r.problem)) this.problems.push(r.problem)
    return r.data
  }

  saveCheckpoint(cp: SessionCheckpoint | null): void {
    if (cp === null) this.sessionFile.remove()
    else this.sessionFile.save(cp)
  }
}
