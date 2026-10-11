import { describe, expect, it } from 'vitest'
import { ManualClock } from '../../src/shared/engine'
import { SessionManager } from '../../src/main/session'
import { newWorkout } from '../../src/shared/workout'
import type { SessionCommand, SessionView } from '../../src/shared/types'

/** Simulates the main process fan-out to the main and mini windows (both share one engine). */
describe('window synchronization', () => {
  it('commands from either window update every window, and a late window gets current state', () => {
    const clock = new ManualClock()
    const windows: Record<string, (SessionView | null)[]> = { main: [], mini: [] }
    const m = new SessionManager({
      clock,
      wallNow: () => 0,
      newId: () => 'id',
      emit: (v) => Object.values(windows).forEach((w) => w.push(v)),
      sound: () => {},
      saveCheckpoint: () => {},
      addHistory: () => {}
    })
    const fromWindow = (_w: 'main' | 'mini', c: SessionCommand) => m.command(c)
    m.start({ ...newWorkout('w', 0), prepare: 10 })
    fromWindow('mini', 'pause')
    expect(windows.main.at(-1)?.status).toBe('paused')
    expect(windows.mini.at(-1)?.status).toBe('paused')
    fromWindow('main', 'next')
    expect(windows.mini.at(-1)).toMatchObject({ phase: 'work', status: 'paused', displaySeconds: 20 })
    fromWindow('mini', 'lock')
    expect(fromWindow('mini', 'next')).toEqual({ ok: false, error: 'locked' })
    expect(windows.main.at(-1)?.locked).toBe(true)
    // a newly opened window asks for the current view
    expect(m.view()).toEqual(windows.main.at(-1))
    expect(windows.main).toEqual(windows.mini)
  })
})
