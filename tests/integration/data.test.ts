import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { DataService } from '../../src/main/data'
import { newWorkout } from '../../src/shared/workout'

let dir: string
// 1x1 transparent PNG
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=', 'base64')

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tt-data-'))
})
afterEach(() => fs.rmSync(dir, { recursive: true, force: true }))

const make = (id = 'w1') => ({ ...newWorkout(id, 1000), prepare: 60, work: 45, rest: 60, cycles: 4, sets: 5 })

describe('DataService', () => {
  it('persists workouts, settings and history across reloads', () => {
    const d = new DataService(dir)
    expect(d.saveWorkout(make()).ok).toBe(true)
    expect(d.updateSettings({ volume: 0.3, restColor: '#123456' }).ok).toBe(true)
    d.addHistory({ id: 'h1', workoutId: 'w1', workoutName: 'Workout', startedAt: 1, endedAt: 2, status: 'finished', completedIntervals: 40, totalIntervals: 40, elapsedSeconds: 2100 })
    const d2 = new DataService(dir)
    expect(d2.listWorkouts()).toHaveLength(1)
    expect(d2.getWorkout('w1')).toMatchObject({ prepare: 60, sets: 5 })
    expect(d2.getSettings()).toMatchObject({ volume: 0.3, restColor: '#123456' })
    expect(d2.listHistory()[0]).toMatchObject({ status: 'finished' })
  })

  it('rejects invalid workouts without changing saved data', () => {
    const d = new DataService(dir)
    d.saveWorkout(make())
    for (const bad of [{ work: 0 }, { cycles: 0 }, { sets: 1.5 }, { rest: -1 }, { prepare: Number.POSITIVE_INFINITY }, { prepare: Number.NaN }, { name: '' }]) {
      const r = d.saveWorkout({ ...make(), ...bad })
      expect(r.ok, JSON.stringify(bad)).toBe(false)
    }
    expect(new DataService(dir).getWorkout('w1')).toMatchObject({ work: 45, cycles: 4, sets: 5, rest: 60 })
  })

  it('copy assigns a new id, favorite and notes persist, delete removes', () => {
    const d = new DataService(dir)
    d.saveWorkout(make())
    const c = d.copyWorkout('w1')
    expect(c.ok && c.value.id).not.toBe('w1')
    expect(c.ok && c.value.name).toBe('Workout (copy)')
    expect(d.patchWorkout('w1', { favorite: true, notes: 'הערה בעברית' }).ok).toBe(true)
    expect(d.deleteWorkout(c.ok ? c.value.id : '').ok).toBe(true)
    const d2 = new DataService(dir)
    expect(d2.listWorkouts().map((w) => w.id)).toEqual(['w1'])
    expect(d2.getWorkout('w1')).toMatchObject({ favorite: true, notes: 'הערה בעברית' })
    expect(d2.deleteWorkout('missing').ok).toBe(false)
  })

  it('owns imported images: moving the source does not break them; unreferenced images are deleted', () => {
    const d = new DataService(dir)
    const src = path.join(dir, 'pic.png')
    fs.writeFileSync(src, PNG)
    const img = d.importImage(src)
    expect(img.ok).toBe(true)
    if (!img.ok) return
    fs.rmSync(src)
    d.saveWorkout({ ...make(), workImage: img.value })
    expect(d.imagePath(img.value)).not.toBeNull()
    expect(d.importImage(path.join(dir, 'x.exe')).ok).toBe(false)
    d.copyWorkout('w1')
    d.deleteWorkout('w1')
    expect(d.imagePath(img.value)).not.toBeNull() // still used by the copy
    d.deleteWorkout(d.listWorkouts()[0].id)
    expect(d.imagePath(img.value)).toBeNull()
  })

  it('exports self-contained JSON and imports it as a new workout with its own image', () => {
    const d = new DataService(dir)
    const src = path.join(dir, 'pic.png')
    fs.writeFileSync(src, PNG)
    const img = d.importImage(src)
    if (!img.ok) throw new Error(img.error)
    d.saveWorkout({ ...make(), workDescription: 'יש להגיע ל 1200 הקלדות', restImage: img.value })
    const json = d.exportWorkout('w1')
    if (!json.ok) throw new Error(json.error)
    const parsed = JSON.parse(json.value)
    expect(parsed.format).toBe('timertabata-workout')
    expect(parsed.images.rest).toMatch(/^data:image\/png;base64,/)
    const r = d.importWorkout(json.value)
    if (!r.ok) throw new Error(r.error)
    expect(r.value.id).not.toBe('w1')
    expect(r.value.workDescription).toBe('יש להגיע ל 1200 הקלדות')
    expect(r.value.restImage).not.toBe(img.value)
    expect(d.imagePath(r.value.restImage!)).not.toBeNull()
  })

  it('rejects malformed imports', () => {
    const d = new DataService(dir)
    expect(d.importWorkout('{nope').ok).toBe(false)
    expect(d.importWorkout(JSON.stringify({ format: 'other' })).ok).toBe(false)
    const valid = JSON.parse((d.saveWorkout(make()), (d.exportWorkout('w1') as { value: string }).value))
    expect(d.importWorkout(JSON.stringify({ ...valid, workout: { ...valid.workout, work: 0 } })).ok).toBe(false)
    expect(d.importWorkout(JSON.stringify({ ...valid, images: { work: 'data:text/html;base64,AAAA' } })).ok).toBe(false)
    expect(d.listWorkouts()).toHaveLength(1)
    expect(fs.readdirSync(d.imagesDir)).toHaveLength(0)
  })

  it('recovers from corrupt storage using the backup, and keeps the corrupt file aside', () => {
    const d = new DataService(dir)
    d.saveWorkout(make('a'))
    d.saveWorkout(make('b')) // .bak now holds [a]
    fs.writeFileSync(path.join(dir, 'workouts.json'), '{"version":1,"workouts":[{"broken"')
    const d2 = new DataService(dir)
    expect(d2.listWorkouts().map((w) => w.id)).toEqual(['a'])
    expect(d2.problems[0]).toMatch(/workouts\.json was unreadable/)
    expect(fs.readdirSync(dir).some((f) => f.startsWith('workouts.json.corrupt-'))).toBe(true)
  })

  it('falls back to defaults when both file and backup are corrupt', () => {
    fs.writeFileSync(path.join(dir, 'settings.json'), 'garbage')
    const d = new DataService(dir)
    expect(d.getSettings().volume).toBe(0.8)
    expect(d.problems).toHaveLength(1)
  })

  it('upgrades partial settings with defaults and validates settings patches', () => {
    fs.writeFileSync(path.join(dir, 'settings.json'), JSON.stringify({ version: 1, settings: { muted: true } }))
    const d = new DataService(dir)
    expect(d.getSettings()).toMatchObject({ muted: true, volume: 0.8, closeToTray: true })
    expect(d.updateSettings({ volume: 7 }).ok).toBe(false)
    expect(d.updateSettings({ shortcuts: { next: 'Alt+N' } }).ok).toBe(true)
    expect(d.getSettings().shortcuts).toMatchObject({ next: 'Alt+N', toggle: 'CommandOrControl+Alt+P' })
  })

  it('stores and clears session checkpoints', () => {
    const d = new DataService(dir)
    expect(d.loadCheckpoint()).toBeNull()
    d.saveCheckpoint({ version: 1, sessionId: 's1', workout: make(), index: 3, remainingMs: 1234, locked: false, startedAt: 1, savedAt: 2 })
    expect(new DataService(dir).loadCheckpoint()).toMatchObject({ index: 3, remainingMs: 1234 })
    d.saveCheckpoint(null)
    expect(new DataService(dir).loadCheckpoint()).toBeNull()
  })
})
