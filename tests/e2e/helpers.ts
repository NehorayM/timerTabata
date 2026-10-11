import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { _electron as electron, type ElectronApplication, type Page } from '@playwright/test'
import { newWorkout } from '../../src/shared/workout'
import type { Workout } from '../../src/shared/types'

export const ROOT = path.resolve(__dirname, '../..')

export interface Launched {
  app: ElectronApplication
  page: Page
  userData: string
}

export function tempDir(prefix = 'tt-e2e-'): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix))
}

/** The four workouts visible in the reference screenshots. */
export function referenceWorkouts(): Workout[] {
  const t = 1_760_000_000_000
  return [
    { ...newWorkout('ref-purple', t, '#311b92'), prepare: 60, work: 45, rest: 60, cycles: 4, sets: 5, updatedAt: t + 40 },
    {
      ...newWorkout('ref-blue', t, '#0277bd'),
      prepare: 10, work: 900, rest: 300, cycles: 8, workDescription: 'יש להגיע ל 1200 הקלדות', updatedAt: t + 30
    },
    { ...newWorkout('ref-green', t, '#6ba101'), prepare: 10, work: 900, rest: 60, cycles: 3, updatedAt: t + 20 },
    { ...newWorkout('ref-magenta', t, '#c51162'), prepare: 10, work: 20, rest: 10, cycles: 8, updatedAt: t + 10 }
  ]
}

export function seed(userData: string, workouts: Workout[], settings: Record<string, unknown> = {}): void {
  fs.mkdirSync(userData, { recursive: true })
  fs.writeFileSync(path.join(userData, 'workouts.json'), JSON.stringify({ version: 1, workouts }))
  fs.writeFileSync(path.join(userData, 'settings.json'), JSON.stringify({ version: 1, settings }))
}

export async function launch(
  opts: { userData?: string; env?: Record<string, string>; args?: string[]; executablePath?: string; fakeClock?: boolean } = {}
): Promise<Launched> {
  const userData = opts.userData ?? tempDir()
  const sandboxArgs = process.platform === 'linux' && process.getuid?.() === 0 ? ['--no-sandbox'] : []
  const app = await electron.launch({
    executablePath: opts.executablePath,
    args: [...sandboxArgs, ...(opts.executablePath ? [] : [path.join(ROOT, 'out/main/index.js')]), ...(opts.args ?? [])],
    env: {
      ...process.env,
      TT_TEST: '1',
      TT_FAKE_CLOCK: opts.fakeClock === false ? '0' : '1',
      TT_USER_DATA: userData,
      TT_SHORTCUT_DIR: path.join(userData, 'shortcuts'),
      ...opts.env
    } as Record<string, string>
  })
  const page = await mainPage(app)
  await page.waitForSelector('.screen')
  return { app, page, userData }
}

export async function mainPage(app: ElectronApplication): Promise<Page> {
  const isMain = (p: Page): boolean => p.url().includes('#main')
  for (let i = 0; i < 100; i++) {
    const p = app.windows().find(isMain)
    if (p) return p
    await new Promise((r) => setTimeout(r, 100))
  }
  throw new Error('main window not found')
}

export async function miniPage(app: ElectronApplication): Promise<Page> {
  for (let i = 0; i < 100; i++) {
    const p = app.windows().find((w) => w.url().includes('#mini'))
    if (p) {
      await p.waitForSelector('.mini')
      return p
    }
    await new Promise((r) => setTimeout(r, 100))
  }
  throw new Error('mini window not found')
}

/** Advances the injected monotonic clock in the main process and runs one engine tick. */
export async function advance(app: ElectronApplication, ms: number): Promise<void> {
  await app.evaluate((_e, ms) => (globalThis as unknown as { __tt: { advance(ms: number): void } }).__tt.advance(ms), ms)
}

export async function hook<T>(app: ElectronApplication, fn: string, ...args: unknown[]): Promise<T> {
  return app.evaluate(
    (_e, [fn, args]) => {
      const tt = (globalThis as unknown as { __tt: Record<string, (...a: unknown[]) => unknown> }).__tt
      return tt[fn as string](...(args as unknown[]))
    },
    [fn, args] as const
  ) as Promise<T>
}

export async function setTestHook(app: ElectronApplication, key: string, value: unknown): Promise<void> {
  await app.evaluate((_e, [k, v]) => {
    ;(globalThis as unknown as { __tt: Record<string, unknown> }).__tt[k as string] = v
  }, [key, value] as const)
}

export async function setContentSize(app: ElectronApplication, which: 'main' | 'mini', w: number, h: number): Promise<void> {
  await app.evaluate(
    (_e, [which, w, h]) => {
      const tt = (globalThis as unknown as { __tt: { windows: Record<string, Electron.BrowserWindow | null> } }).__tt
      const win = tt.windows[which as string]!
      win.setMinimumSize(100, 80)
      win.setContentSize(w as number, h as number)
    },
    [which, w, h] as const
  )
}

/** Quits like the tray "Quit" item does (app.quit -> before-quit), unlike ElectronApplication.close(). */
export async function quit(app: ElectronApplication): Promise<void> {
  const closed = new Promise<void>((r) => app.once('close', () => r()))
  await app.evaluate(({ app }) => setTimeout(() => app.quit(), 10))
  await closed
}
