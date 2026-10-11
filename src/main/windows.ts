import path from 'node:path'
import { BrowserWindow, screen } from 'electron'
import { z } from 'zod'
import { ensureOnScreen, type Rect } from './bounds'
import { JsonFile } from './store'

const RectSchema = z.object({ x: z.number().int(), y: z.number().int(), width: z.number().int().min(100), height: z.number().int().min(80) })
const StateSchema = z.object({ main: RectSchema.optional(), mini: RectSchema.optional(), mainMaximized: z.boolean().optional() })
type WindowState = z.infer<typeof StateSchema>

export const MAIN_DEFAULT = { width: 420, height: 860 }
export const MINI_DEFAULT = { width: 320, height: 180 }

export interface WindowHooks {
  onMainClose: (e: Electron.Event) => void
  onMiniClosed: () => void
  alwaysOnTopMain: () => boolean
  alwaysOnTopMini: () => boolean
}

export class WindowManager {
  main: BrowserWindow | null = null
  mini: BrowserWindow | null = null
  private readonly stateFile: JsonFile<WindowState>
  private state: WindowState
  private saveTimer: NodeJS.Timeout | null = null

  constructor(userData: string, private readonly hooks: WindowHooks) {
    this.stateFile = new JsonFile(userData, 'window-state.json', StateSchema, () => ({}))
    this.state = this.stateFile.load().data
  }

  private webPreferences(): Electron.WebPreferences {
    return {
      preload: path.join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      // Timing lives in the main process, but sounds play in the renderer and must not be throttled when hidden.
      backgroundThrottling: false,
      spellcheck: false
    }
  }

  private load(win: BrowserWindow, hash: string): void {
    const devUrl = process.env.ELECTRON_RENDERER_URL
    if (devUrl) void win.loadURL(`${devUrl}#${hash}`)
    else void win.loadFile(path.join(__dirname, '../renderer/index.html'), { hash })
  }

  private placement(saved: Rect | undefined, def: { width: number; height: number }): Rect {
    const displays = screen.getAllDisplays().map((d) => d.workArea)
    return ensureOnScreen(saved, displays, screen.getPrimaryDisplay().workArea, def)
  }

  createMain(): BrowserWindow {
    const b = this.placement(this.state.main, MAIN_DEFAULT)
    const win = new BrowserWindow({
      ...b,
      minWidth: 320,
      minHeight: 480,
      show: false,
      title: 'TimerTabata',
      backgroundColor: '#ffffff',
      autoHideMenuBar: true,
      webPreferences: this.webPreferences()
    })
    win.setMenuBarVisibility(false)
    if (this.hooks.alwaysOnTopMain()) win.setAlwaysOnTop(true, 'floating')
    win.once('ready-to-show', () => {
      if (this.state.mainMaximized) win.maximize()
      if (process.env.TT_HIDDEN !== '1') win.show()
    })
    win.on('close', (e) => this.hooks.onMainClose(e))
    const persist = (): void => this.scheduleSave('main', win)
    win.on('resize', persist)
    win.on('move', persist)
    win.on('closed', () => {
      this.main = null
    })
    this.load(win, 'main')
    this.main = win
    return win
  }

  openMini(): BrowserWindow {
    if (this.mini && !this.mini.isDestroyed()) {
      this.mini.show()
      return this.mini
    }
    const b = this.placement(this.state.mini, MINI_DEFAULT)
    const win = new BrowserWindow({
      ...b,
      minWidth: 200,
      minHeight: 110,
      frame: false,
      resizable: true,
      maximizable: false,
      fullscreenable: false,
      show: false,
      title: 'TimerTabata – Mini timer',
      backgroundColor: '#007c0e',
      webPreferences: this.webPreferences()
    })
    if (this.hooks.alwaysOnTopMini()) win.setAlwaysOnTop(true, 'floating')
    win.once('ready-to-show', () => win.show())
    const persist = (): void => this.scheduleSave('mini', win)
    win.on('resize', persist)
    win.on('move', persist)
    win.on('closed', () => {
      this.mini = null
      this.hooks.onMiniClosed()
    })
    this.load(win, 'mini')
    this.mini = win
    return win
  }

  closeMini(): void {
    if (this.mini && !this.mini.isDestroyed()) this.mini.close()
  }

  showMain(): void {
    const w = this.main
    if (!w || w.isDestroyed()) return
    if (w.isMinimized()) w.restore()
    w.show()
    w.focus()
  }

  all(): BrowserWindow[] {
    return [this.main, this.mini].filter((w): w is BrowserWindow => !!w && !w.isDestroyed())
  }

  isOurContents(id: number): boolean {
    return this.all().some((w) => w.webContents.id === id)
  }

  private scheduleSave(which: 'main' | 'mini', win: BrowserWindow): void {
    if (win.isDestroyed()) return
    const maximized = which === 'main' ? win.isMaximized() : undefined
    if (!win.isMinimized() && !win.isMaximized() && !win.isFullScreen()) this.state[which] = win.getNormalBounds()
    if (maximized !== undefined) this.state.mainMaximized = maximized
    if (this.saveTimer) clearTimeout(this.saveTimer)
    this.saveTimer = setTimeout(() => this.flush(), 400)
  }

  flush(): void {
    if (this.saveTimer) clearTimeout(this.saveTimer)
    this.saveTimer = null
    try {
      this.stateFile.save(this.state)
    } catch (err) {
      console.error('Failed to save window state', err)
    }
  }
}
