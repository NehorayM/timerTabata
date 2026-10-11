import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { ensureOnScreen } from '../../src/main/bounds'
import { linuxDesktopEntry, parseWorkoutArg, safeFileName, writeLinuxDesktopEntry } from '../../src/main/desktopShortcut'
import { checkAccelerator, registerGlobalShortcuts } from '../../src/main/globalShortcuts'
import { buildCapabilities, detectDisplayServer, needsX11Relaunch, ozoneFromArgv } from '../../src/main/platform'

const primary = { x: 0, y: 0, width: 1920, height: 1040 }

describe('window bounds', () => {
  it('keeps visible bounds and recentres bounds from a missing monitor', () => {
    const b = { x: 100, y: 100, width: 420, height: 860 }
    expect(ensureOnScreen(b, [primary], primary, b)).toEqual(b)
    const second = { x: 1920, y: 0, width: 1280, height: 1024 }
    expect(ensureOnScreen({ ...b, x: 2000 }, [primary, second], primary, b)).toMatchObject({ x: 2000 })
    const r = ensureOnScreen({ ...b, x: 2000 }, [primary], primary, b)
    expect(r.x + r.width).toBeLessThanOrEqual(1920)
    expect(ensureOnScreen({ x: 0, y: -500, width: 400, height: 600 }, [primary], primary, b).y).toBeGreaterThanOrEqual(0)
    expect(ensureOnScreen({ x: 0, y: 0, width: 4000, height: 3000 }, [primary], primary, b).width).toBeLessThanOrEqual(4000)
    expect(ensureOnScreen(undefined, [primary], primary, { width: 420, height: 2000 })).toMatchObject({ height: 1040, y: 0 })
  })
})

describe('desktop shortcuts', () => {
  it('parses and validates the workout argument', () => {
    expect(parseWorkoutArg(['electron', '.', '--workout=abc-123'])).toBe('abc-123')
    expect(parseWorkoutArg(['--workout=../../etc'])).toBeNull()
    expect(parseWorkoutArg([])).toBeNull()
  })
  it('writes a valid .desktop entry with quoted Exec args', () => {
    const entry = linuxDesktopEntry('Leg day אימון', 'id1', { exec: '/opt/Timer Tabata/timertabata', args: [], icon: '/x/icon.png' })
    expect(entry).toContain('Exec="/opt/Timer Tabata/timertabata" --workout=id1')
    expect(entry).toContain('Name=Leg day אימון – TimerTabata')
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tt-desk-'))
    const f = writeLinuxDesktopEntry(dir, 'w', 'id1', { exec: '/usr/bin/x', args: ['/app path'], icon: 'i' })
    expect(fs.readFileSync(f, 'utf8')).toMatch(/^Exec=\/usr\/bin\/x "\/app path" --workout=id1$/m)
    expect(safeFileName('a/b:c*?')).toBe('a_b_c__')
  })
})

describe('global shortcuts', () => {
  it('validates accelerators', () => {
    expect(checkAccelerator('CommandOrControl+Alt+P')).toBeNull()
    expect(checkAccelerator('P')).toMatch(/modifier/)
    expect(checkAccelerator('Alt+')).toMatch(/Malformed/)
    expect(checkAccelerator('Ctrl+Shift')).toMatch(/non-modifier/)
  })
  it('reports duplicates and OS collisions per action', () => {
    const taken = new Set(['Alt+Shift+T'])
    const registered: string[] = []
    const reg = {
      register: (a: string) => (taken.has(a) ? false : (registered.push(a), true)),
      unregisterAll: () => (registered.length = 0)
    }
    const st = registerGlobalShortcuts(reg, true, { toggle: 'Ctrl+Alt+P', next: 'CmdOrCtrl+Alt+P', previous: 'Ctrl+Alt+Left', stop: '', show: 'Alt+Shift+T' }, () => {})
    expect(st.map((s) => [s.action, s.ok])).toEqual([['toggle', true], ['next', false], ['previous', true], ['stop', false], ['show', false]])
    expect(st[1].error).toMatch(/Same shortcut/)
    expect(st[4].error).toMatch(/another application/)
    expect(registerGlobalShortcuts(reg, false, { toggle: 'Ctrl+Alt+P', next: '', previous: '', stop: '', show: '' }, () => {}).every((s) => !s.ok)).toBe(true)
    expect(registered).toHaveLength(0)
  })
})

describe('platform capabilities', () => {
  it('distinguishes X11, native Wayland and XWayland', () => {
    expect(detectDisplayServer({ XDG_SESSION_TYPE: 'x11' }, 'linux', '')).toBe('x11')
    expect(detectDisplayServer({ XDG_SESSION_TYPE: 'wayland' }, 'linux', '')).toBe('wayland')
    expect(detectDisplayServer({ WAYLAND_DISPLAY: 'wayland-0' }, 'linux', 'x11')).toBe('xwayland')
    expect(detectDisplayServer({}, 'win32', '')).toBe('windows')
  })
  it('reports limited topmost/shortcuts on Wayland and tray fallback without a host', () => {
    const w = buildCapabilities('linux', 'wayland', false)
    expect(w.alwaysOnTop.available).toBe(false)
    expect(w.globalShortcuts.available).toBe(false)
    expect(w.tray.available).toBe(false)
    expect(w.tray.note).toMatch(/minimizes/)
    const x = buildCapabilities('linux', 'x11', true)
    expect([x.alwaysOnTop.available, x.tray.available, x.globalShortcuts.available]).toEqual([true, true, true])
    expect(buildCapabilities('win32', 'windows', null).tray.available).toBe(true)
  })
})

describe('X11 preference on Wayland', () => {
  const wl = { XDG_SESSION_TYPE: 'wayland', WAYLAND_DISPLAY: 'wayland-0' }
  it('relaunches once with --ozone-platform=x11 only when needed', () => {
    expect(needsX11Relaunch('linux', wl, ['/opt/TimerTabata/timertabata'], true)).toBe(true)
    expect(needsX11Relaunch('linux', wl, ['/opt/TimerTabata/timertabata', '--ozone-platform=x11'], true)).toBe(false)
    expect(needsX11Relaunch('linux', wl, ['x'], false)).toBe(false)
    expect(needsX11Relaunch('linux', { XDG_SESSION_TYPE: 'x11' }, ['x'], true)).toBe(false)
    expect(needsX11Relaunch('win32', wl, ['x'], true)).toBe(false)
  })
  it('reads the effective platform from the real command line', () => {
    expect(ozoneFromArgv(['a', '--ozone-platform=x11'])).toBe('x11')
    expect(ozoneFromArgv(['a'])).toBe('')
    expect(detectDisplayServer(wl, 'linux', ozoneFromArgv(['a', '--ozone-platform=x11']))).toBe('xwayland')
  })
})
