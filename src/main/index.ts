import fs from 'node:fs'
import path from 'node:path'
import { randomUUID } from 'node:crypto'
import { pathToFileURL } from 'node:url'
import {
  app,
  dialog,
  globalShortcut,
  ipcMain,
  Menu,
  nativeImage,
  net,
  powerMonitor,
  powerSaveBlocker,
  protocol,
  shell,
  Tray,
  type IpcMainInvokeEvent
} from 'electron'
import { z } from 'zod'
import { ManualClock, type Clock } from '../shared/engine'
import { ASSET_SCHEME, type ApiEvents, type InvokeChannel, type OpenWorkoutRequest, type StartSessionResult } from '../shared/ipc'
import { ID_RE } from '../shared/schema'
import { INTERVAL_LABELS } from '../shared/sequence'
import { formatDuration } from '../shared/format'
import type { Capabilities, SessionCheckpoint, SessionCommand, SessionView, ShortcutAction, ShortcutStatus } from '../shared/types'
import { DataService } from './data'
import { parseWorkoutArg, safeFileName, workoutArg, writeLinuxDesktopEntry } from './desktopShortcut'
import { registerGlobalShortcuts } from './globalShortcuts'
import { buildCapabilities, detectDisplayServer, hasStatusNotifierWatcher } from './platform'
import { SessionManager } from './session'
import { WindowManager } from './windows'

const TEST = process.env.TT_TEST === '1'
if (process.env.TT_USER_DATA) app.setPath('userData', path.resolve(process.env.TT_USER_DATA))

protocol.registerSchemesAsPrivileged([
  { scheme: ASSET_SCHEME, privileges: { standard: true, secure: true, supportFetchAPI: true } }
])
app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required')

const data = new DataService(app.getPath('userData'))
if (process.platform === 'linux' && data.getSettings().preferX11) app.commandLine.appendSwitch('ozone-platform', 'x11')

function resourcePath(file: string): string {
  return app.isPackaged ? path.join(process.resourcesPath, file) : path.join(__dirname, '../../resources', file)
}

function main(): void {
  if (!app.requestSingleInstanceLock()) {
    app.quit()
    return
  }

  const fakeClock = TEST && process.env.TT_FAKE_CLOCK === '1' ? new ManualClock(1_000_000) : null
  const clock: Clock = fakeClock ?? { now: () => performance.now() }
  let quitting = false
  let tray: Tray | null = null
  let caps: Capabilities = buildCapabilities(process.platform, 'other', null)
  let shortcutStatus: ShortcutStatus[] = []
  let pendingRecovery: SessionCheckpoint | null = data.loadCheckpoint()
  let pendingOpen: OpenWorkoutRequest | null = null
  let ticker: NodeJS.Timeout | null = null
  let lastTrayKey = ''
  const testHooks: Record<string, unknown> = {}

  const windows = new WindowManager(app.getPath('userData'), {
    onMainClose: (e) => onMainClose(e),
    onMiniClosed: () => {},
    alwaysOnTopMain: () => data.getSettings().alwaysOnTopMain,
    alwaysOnTopMini: () => data.getSettings().alwaysOnTopMini,
    miniFocusable: () => data.getSettings().miniFocusable
  })

  function send<K extends keyof ApiEvents>(event: K, payload: ApiEvents[K], target: 'all' | 'main' = 'all'): void {
    const wins = target === 'all' ? windows.all() : windows.main && !windows.main.isDestroyed() ? [windows.main] : []
    for (const w of wins) w.webContents.send(`tt-ev:${event}`, payload)
  }

  const manager = new SessionManager({
    clock,
    wallNow: () => Date.now(),
    newId: () => randomUUID(),
    emit: (view) => {
      send('session', view)
      updateTray(view)
      updateTicker()
      updateKeepAwake()
    },
    sound: (ev) => send('sound', ev, 'main'),
    saveCheckpoint: (cp) => {
      try {
        data.saveCheckpoint(cp)
      } catch (err) {
        console.error('checkpoint failed', err)
      }
    },
    addHistory: (h) => {
      try {
        data.addHistory(h)
      } catch (err) {
        console.error('history failed', err)
      }
    }
  })

  let awakeId: number | null = null
  /** Keeps the display on while a workout runs (if enabled). */
  function updateKeepAwake(): void {
    const want = manager.running && data.getSettings().keepAwake
    if (want && awakeId === null) awakeId = powerSaveBlocker.start('prevent-display-sleep')
    else if (!want && awakeId !== null) {
      powerSaveBlocker.stop(awakeId)
      awakeId = null
    }
  }

  function updateTicker(): void {
    if (fakeClock) return
    if (manager.running && !ticker) ticker = setInterval(() => manager.tick(), 100)
    else if (!manager.running && ticker) {
      clearInterval(ticker)
      ticker = null
    }
  }

  function runCommand(cmd: SessionCommand, origin: string): void {
    const r = manager.command(cmd)
    if (!r.ok && r.error === 'locked') send('notice', `Timer is locked – unlock it to ${cmd} (${origin}).`, 'main')
  }

  // ---- tray -----------------------------------------------------------------------------

  function trayUsable(): boolean {
    return !!tray && caps.tray.available
  }

  function updateTray(view: SessionView | null): void {
    if (!tray) return
    if (view) {
      const cur = view.phase === 'finish' ? 'Finish' : `${INTERVAL_LABELS[view.phase]} ${formatDuration(view.displaySeconds)}`
      tray.setToolTip(`TimerTabata – ${cur}`)
    } else tray.setToolTip('TimerTabata')
    const key = view ? `${view.status}|${view.locked}` : 'none'
    if (key === lastTrayKey) return
    lastTrayKey = key
    tray.setContextMenu(Menu.buildFromTemplate(trayTemplate(view)))
  }

  function trayTemplate(view: SessionView | null): Electron.MenuItemConstructorOptions[] {
    const active = !!view && view.status !== 'finished'
    return [
      { label: 'Show TimerTabata', click: () => windows.showMain() },
      {
        label: view?.status === 'running' ? 'Pause' : 'Resume',
        enabled: active,
        click: () => runCommand('toggle', 'tray')
      },
      { label: 'Stop', enabled: !!view && !view.locked, click: () => runCommand('stop', 'tray') },
      { type: 'separator' },
      {
        label: 'Quit',
        click: () => {
          quitting = true
          app.quit()
        }
      }
    ]
  }

  function createTray(): void {
    try {
      const img = nativeImage.createFromPath(resourcePath('icon.png'))
      const size = process.platform === 'win32' ? 16 : 22
      tray = new Tray(img.isEmpty() ? img : img.resize({ width: size, height: size }))
      tray.setToolTip('TimerTabata')
      tray.on('click', () => windows.showMain())
      lastTrayKey = ''
      updateTray(manager.view())
    } catch (err) {
      console.error('Tray unavailable', err)
      tray = null
      caps = { ...caps, tray: { available: false, note: `Tray could not be created: ${String(err)}` } }
    }
  }

  // ---- shortcuts --------------------------------------------------------------------------

  function shortcutAction(a: ShortcutAction): void {
    if (a === 'show') windows.showMain()
    else runCommand(a, 'global shortcut')
  }

  function applyShortcuts(): void {
    const s = data.getSettings()
    shortcutStatus = registerGlobalShortcuts(globalShortcut, s.globalShortcutsEnabled, s.shortcuts, shortcutAction)
    send('shortcut-status', shortcutStatus)
  }

  // ---- window lifecycle -----------------------------------------------------------------

  function onMainClose(e: Electron.Event): void {
    if (quitting) return
    const win = windows.main
    if (trayUsable() && data.getSettings().closeToTray) {
      e.preventDefault()
      win?.hide()
      return
    }
    if (manager.inProgress) {
      e.preventDefault()
      const choice =
        typeof testHooks.closeChoice === 'number'
          ? (testHooks.closeChoice as number)
          : dialog.showMessageBoxSync(win!, {
              type: 'question',
              buttons: ['Keep running (minimize)', 'Quit', 'Cancel'],
              defaultId: 0,
              cancelId: 2,
              title: 'Workout in progress',
              message: 'A workout is in progress.',
              detail: 'Quitting saves a paused checkpoint you can resume next time.'
            })
      if (choice === 0) win?.minimize()
      else if (choice === 1) {
        quitting = true
        app.quit()
      }
      return
    }
    quitting = true
    windows.closeMini()
  }

  function openWorkoutRequest(id: string): OpenWorkoutRequest {
    return { workoutId: id, found: !!data.getWorkout(id) }
  }

  // ---- IPC ------------------------------------------------------------------------------

  const Id = z.string().regex(ID_RE)
  const Cmd = z.enum(['toggle', 'pause', 'resume', 'next', 'previous', 'reset', 'stop', 'lock', 'unlock'])

  function handle(ch: InvokeChannel, fn: (...args: unknown[]) => unknown): void {
    ipcMain.handle(`tt:${ch}`, (e: IpcMainInvokeEvent, ...args: unknown[]) => {
      if (!windows.isOurContents(e.sender.id)) throw new Error('Untrusted sender')
      return fn(...args)
    })
  }

  const locked = { ok: false as const, error: 'Unlock the timer first' }
  const broadcastWorkouts = (): void => send('workouts', data.listWorkouts())

  async function pickPath(kind: 'open' | 'save', opts: Electron.OpenDialogOptions & Electron.SaveDialogOptions): Promise<string | null> {
    const key = kind === 'open' ? 'nextOpenPath' : 'nextSavePath'
    if (TEST && key in testHooks) {
      const p = testHooks[key] as string | null
      delete testHooks[key]
      return p
    }
    const parent = windows.main ?? undefined
    if (kind === 'open') {
      const r = parent ? await dialog.showOpenDialog(parent, { ...opts, properties: ['openFile'] }) : await dialog.showOpenDialog(opts)
      return r.canceled ? null : (r.filePaths[0] ?? null)
    }
    const r = parent ? await dialog.showSaveDialog(parent, opts) : await dialog.showSaveDialog(opts)
    return r.canceled ? null : (r.filePath ?? null)
  }

  function registerIpc(): void {
    handle('listWorkouts', () => data.listWorkouts())
    handle('saveWorkout', (w) => {
      if (manager.locked) return locked
      const r = data.saveWorkout(w)
      if (r.ok) broadcastWorkouts()
      return r
    })
    handle('deleteWorkout', (id) => {
      if (manager.locked) return locked
      const r = data.deleteWorkout(Id.parse(id))
      if (r.ok) broadcastWorkouts()
      return r
    })
    handle('copyWorkout', (id) => {
      if (manager.locked) return locked
      const r = data.copyWorkout(Id.parse(id))
      if (r.ok) broadcastWorkouts()
      return r
    })
    handle('setFavorite', (id, fav) => {
      if (manager.locked) return locked
      const r = data.patchWorkout(Id.parse(id), { favorite: z.boolean().parse(fav) })
      if (r.ok) broadcastWorkouts()
      return r
    })
    handle('setNotes', (id, notes) => {
      if (manager.locked) return locked
      const r = data.patchWorkout(Id.parse(id), { notes: z.string().max(10000).parse(notes) })
      if (r.ok) broadcastWorkouts()
      return r
    })
    handle('exportWorkout', async (id) => {
      const w = data.getWorkout(Id.parse(id))
      if (!w) return { ok: false, error: 'Workout not found' }
      const json = data.exportWorkout(w.id)
      if (!json.ok) return json
      const target = await pickPath('save', {
        title: 'Share workout',
        defaultPath: path.join(app.getPath('documents'), `${safeFileName(w.name)}.timertabata.json`),
        filters: [{ name: 'TimerTabata workout', extensions: ['json'] }]
      })
      if (!target) return { ok: true, value: null }
      try {
        fs.writeFileSync(target, json.value)
        return { ok: true, value: target }
      } catch (err) {
        return { ok: false, error: `Could not write file: ${String(err)}` }
      }
    })
    handle('importWorkout', async () => {
      if (manager.locked) return locked
      const src = await pickPath('open', {
        title: 'Import workout',
        filters: [{ name: 'TimerTabata workout', extensions: ['json'] }]
      })
      if (!src) return { ok: true, value: null }
      let text: string
      try {
        const st = fs.statSync(src)
        if (st.size > 40 * 1024 * 1024) return { ok: false, error: 'File is too large' }
        text = fs.readFileSync(src, 'utf8')
      } catch (err) {
        return { ok: false, error: `Could not read file: ${String(err)}` }
      }
      const r = data.importWorkout(text)
      if (r.ok) broadcastWorkouts()
      return r
    })
    handle('createShortcut', (id) => {
      const w = data.getWorkout(Id.parse(id))
      if (!w) return { ok: false, error: 'Workout not found' }
      try {
        const exec = process.env.APPIMAGE || process.execPath
        const args = app.isPackaged ? [] : [app.getAppPath()]
        if (process.platform === 'win32') {
          const dir = process.env.TT_SHORTCUT_DIR || app.getPath('desktop')
          const file = path.join(dir, `${safeFileName(w.name)} - TimerTabata.lnk`)
          const ok = shell.writeShortcutLink(file, 'create', {
            target: exec,
            args: [...args.map((a) => `"${a}"`), workoutArg(w.id)].join(' '),
            description: `Open ${w.name} in TimerTabata`,
            icon: process.execPath,
            iconIndex: 0
          })
          return ok ? { ok: true, value: file } : { ok: false, error: 'Windows refused to create the shortcut' }
        }
        if (process.platform === 'linux') {
          const dir = process.env.TT_SHORTCUT_DIR || path.join(app.getPath('home'), '.local/share/applications')
          const file = writeLinuxDesktopEntry(dir, w.name, w.id, { exec, args, icon: resourcePath('icon.png') })
          return { ok: true, value: file }
        }
        return { ok: false, error: 'Shortcuts are supported on Windows and Linux only' }
      } catch (err) {
        return { ok: false, error: `Could not create shortcut: ${String(err)}` }
      }
    })
    handle('pickImage', async () => {
      const src = await pickPath('open', {
        title: 'Choose image',
        filters: [{ name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'gif', 'webp'] }]
      })
      if (!src) return { ok: true, value: null }
      return data.importImage(src)
    })
    handle('getSettings', () => data.getSettings())
    handle('updateSettings', (patch) => {
      const r = data.updateSettings(patch)
      if (!r.ok) return r
      const p = patch as Record<string, unknown>
      if ('alwaysOnTopMain' in p) windows.main?.setAlwaysOnTop(r.value.alwaysOnTopMain, 'floating')
      if ('alwaysOnTopMini' in p) windows.mini?.setAlwaysOnTop(r.value.alwaysOnTopMini, 'floating')
      if ('miniFocusable' in p && process.platform === 'linux') windows.mini?.setFocusable(r.value.miniFocusable)
      if ('keepAwake' in p) updateKeepAwake()
      if ('globalShortcutsEnabled' in p || 'shortcuts' in p) applyShortcuts()
      send('settings', r.value)
      return r
    })
    handle('getShortcutStatus', () => shortcutStatus)
    handle('listHistory', () => data.listHistory())
    handle('clearHistory', () => data.clearHistory())
    handle('getSession', () => manager.view())
    handle('startSession', (id, replace): StartSessionResult => {
      const w = data.getWorkout(Id.parse(id))
      if (!w) return { ok: false, error: 'not-found' }
      const r = manager.start(w, { replace: z.boolean().parse(replace) })
      if (r.ok) {
        data.patchWorkout(w.id, { lastUsedAt: Date.now() })
        data.updateSettings({ lastWorkoutId: w.id })
        broadcastWorkouts()
      }
      return r
    })
    handle('command', (cmd) => manager.command(Cmd.parse(cmd)))
    handle('getRecovery', () => pendingRecovery)
    handle('resolveRecovery', (accept) => {
      const cp = pendingRecovery
      pendingRecovery = null
      if (!cp || manager.active) return
      manager.restore(cp)
      if (!z.boolean().parse(accept)) {
        manager.command('unlock')
        manager.command('stop')
      }
    })
    handle('capabilities', () => caps)
    handle('openMini', () => {
      windows.openMini()
    })
    handle('closeMini', () => windows.closeMini())
    handle('showMain', () => windows.showMain())
    handle('setAlwaysOnTop', (target, on) => {
      const t = z.enum(['main', 'mini']).parse(target)
      const flag = z.boolean().parse(on)
      const r = data.updateSettings(t === 'main' ? { alwaysOnTopMain: flag } : { alwaysOnTopMini: flag })
      if (!r.ok) return r
      const win = t === 'main' ? windows.main : windows.mini
      win?.setAlwaysOnTop(flag, 'floating')
      send('settings', r.value)
      return { ok: true, value: win ? win.isAlwaysOnTop() : flag }
    })
    handle('takePendingOpen', () => {
      const p = pendingOpen
      pendingOpen = null
      return p
    })
    handle('getProblems', () => data.problems.splice(0))
    handle('openDataDir', async () => {
      const dir = app.getPath('userData')
      if (!TEST) await shell.openPath(dir)
      return dir
    })
  }

  // ---- startup --------------------------------------------------------------------------

  app.on('second-instance', (_e, argv) => {
    windows.showMain()
    const id = parseWorkoutArg(argv)
    if (id) send('open-workout', openWorkoutRequest(id), 'main')
  })

  app.on('web-contents-created', (_e, contents) => {
    contents.on('will-navigate', (ev) => ev.preventDefault())
    contents.setWindowOpenHandler(() => ({ action: 'deny' }))
  })

  app.on('before-quit', () => {
    quitting = true
    manager.persistForQuit()
    windows.flush()
  })

  app.on('will-quit', () => {
    globalShortcut.unregisterAll()
    if (ticker) clearInterval(ticker)
    tray?.destroy()
  })

  app.on('window-all-closed', () => app.quit())

  app.whenReady().then(async () => {
    Menu.setApplicationMenu(null)
    protocol.handle(ASSET_SCHEME, (req) => {
      const name = decodeURIComponent(new URL(req.url).pathname.replace(/^\//, ''))
      const p = data.imagePath(name)
      if (!p) return new Response('Not found', { status: 404 })
      return net.fetch(pathToFileURL(p).toString())
    })
    data.sweepImages(pendingRecovery ? [pendingRecovery.workout.workImage, pendingRecovery.workout.restImage] : [])

    const display = detectDisplayServer(process.env, process.platform, app.commandLine.getSwitchValue('ozone-platform'))
    const watcher = process.platform === 'linux' ? await hasStatusNotifierWatcher() : null
    caps = buildCapabilities(process.platform, display, watcher)

    const initialId = parseWorkoutArg(process.argv)
    if (initialId) pendingOpen = openWorkoutRequest(initialId)

    registerIpc()
    windows.createMain()
    if (process.env.TT_NO_TRAY !== '1') createTray()
    applyShortcuts()

    powerMonitor.on('suspend', () => manager.suspend())
    // Resume leaves the session paused (policy); just refresh views.
    powerMonitor.on('resume', () => send('session', manager.view()))

    if (TEST) {
      Object.assign(testHooks, {
        clock: fakeClock,
        advance: (ms: number) => {
          fakeClock?.advance(ms)
          manager.tick()
        },
        manager,
        data,
        windows,
        caps: () => caps,
        suspend: () => manager.suspend(),
        trayMenu: () => (tray ? trayTemplate(manager.view()).map((i) => ({ label: i.label, enabled: i.enabled !== false })) : null),
        trayClick: (label: string) => {
          const item = trayTemplate(manager.view()).find((i) => i.label === label)
          if (item && item.enabled !== false) (item.click as () => void)()
        },
        shortcut: (a: ShortcutAction) => shortcutAction(a),
        isAlwaysOnTop: (t: 'main' | 'mini') => (t === 'main' ? windows.main : windows.mini)?.isAlwaysOnTop() ?? null,
        isFocusable: (t: 'main' | 'mini') => (t === 'main' ? windows.main : windows.mini)?.isFocusable() ?? null,
        keepAwakeActive: () => awakeId !== null && powerSaveBlocker.isStarted(awakeId)
      })
      ;(globalThis as unknown as { __tt: unknown }).__tt = testHooks
    }
  })
}

main()
