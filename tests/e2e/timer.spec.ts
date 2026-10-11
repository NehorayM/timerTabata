import fs from 'node:fs'
import path from 'node:path'
import { spawn } from 'node:child_process'
import { expect, test, type ElectronApplication, type Page } from '@playwright/test'
import { ROOT, advance, hook, launch, miniPage, quit, referenceWorkouts, seed, tempDir } from './helpers'

type View = { index: number; status: string; displaySeconds: number; locked: boolean; phase: string } | null

const sessionView = (app: ElectronApplication): Promise<View> =>
  app.evaluate(() => (globalThis as unknown as { __tt: { manager: { view(): View } } }).__tt.manager.view())
const digits = (p: Page) => p.locator('.timer-screen .digits')
const heading = (p: Page) => p.locator('.phase-heading')

async function startFixtureA(env: Record<string, string> = { TT_NO_TRAY: '1' }, extraSettings = {}) {
  const userData = tempDir()
  seed(userData, referenceWorkouts(), { lastWorkoutId: 'ref-purple', ...extraSettings })
  const l = await launch({ userData, env })
  await l.page.getByRole('button', { name: 'START' }).click()
  await expect(heading(l.page)).toHaveText('Prepare')
  return l
}

test('start, countdown, pause/resume, skips and counters', async () => {
  const { app, page } = await startFixtureA()
  await expect(digits(page)).toHaveText('01:00') // 60 s is not "below one minute"
  await expect(page.locator('.counters')).toHaveText('1/5•1/4')
  await expect(page.locator('.interval-row.active')).toHaveText('1. Prepare: 01:00')
  await expect(page.getByRole('button', { name: 'Previous interval' })).toBeDisabled()
  await advance(app, 3000)
  await expect(digits(page)).toHaveText('57')

  // pause freezes, resume preserves
  await page.keyboard.press('Space')
  await expect(page.getByRole('button', { name: 'Resume' })).toBeVisible()
  await advance(app, 30_000)
  await expect(digits(page)).toHaveText('57')
  await page.getByRole('button', { name: 'Resume' }).click()
  await advance(app, 999)
  await expect(digits(page)).toHaveText('57')
  await advance(app, 1)
  await expect(digits(page)).toHaveText('56')

  // next resets to the full duration and keeps running
  await page.getByRole('button', { name: 'Next interval' }).click()
  await expect(heading(page)).toHaveText('Work')
  await expect(digits(page)).toHaveText('45')
  await expect(page.locator('.timer-screen')).toHaveCSS('background-color', 'rgb(230, 74, 25)')
  await advance(app, 5000)
  await expect(digits(page)).toHaveText('40')
  // previous, while paused, stays paused
  await page.getByRole('button', { name: 'Pause' }).click()
  await page.keyboard.press('ArrowLeft')
  await expect(heading(page)).toHaveText('Prepare')
  await expect(digits(page)).toHaveText('01:00')
  await expect(page.getByRole('button', { name: 'Resume' })).toBeVisible()

  // Work #38 = set 5, cycle 3
  for (let i = 0; i < 37; i++) await page.keyboard.press('ArrowRight')
  await expect(page.locator('.interval-row.active')).toHaveText('38. Work: 45')
  await expect(page.locator('.counters')).toHaveText('5/5•3/4')
  await expect(page.locator('.interval-row.active')).toBeInViewport()

  // manual scroll suspends auto-follow; "Current interval" returns
  await page.locator('.interval-list').evaluate((el) => el.scrollTo({ top: 0 }))
  await page.locator('.interval-list').dispatchEvent('wheel')
  await expect(page.getByRole('button', { name: 'Current interval' })).toBeVisible()
  await expect(page.locator('.interval-row.active')).not.toBeInViewport()
  await page.getByRole('button', { name: 'Current interval' }).click()
  await expect(page.locator('.interval-row.active')).toBeInViewport()

  // finish after the final interval; delayed tick catches up over several phases
  await page.getByRole('button', { name: 'Resume' }).click()
  await advance(app, 45_000 + 60_000 + 45_000)
  await expect(heading(page)).toHaveText('Finish')
  await expect(page.locator('.interval-row.active')).toHaveText('Finish')
  await expect(page.getByRole('button', { name: 'Next interval' })).toBeDisabled()
  await expect(page.getByRole('button', { name: 'Previous interval' })).toBeEnabled()
  const sounds = await page.evaluate(() => (window as unknown as { __ttSoundLog: { ev: { kind: string } }[] }).__ttSoundLog.map((s) => s.ev.kind))
  expect(sounds[sounds.length - 1]).toBe('finish')
  expect(sounds.filter((k) => k === 'finish')).toHaveLength(1)

  // history records finished
  await page.getByRole('button', { name: 'Close finished workout' }).click()
  await page.getByRole('button', { name: 'History' }).click()
  await expect(page.locator('.history-item').first()).toContainText('Finished')
  await app.close()
})

test('lock blocks skip/stop/reset/editing on every surface; pause and unlock stay available', async () => {
  const { app, page } = await startFixtureA({})
  const view = (): Promise<View> => sessionView(app)
  await page.keyboard.press('l')
  await expect(page.getByRole('button', { name: 'Unlock timer' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Next interval' })).toBeDisabled()
  await expect(page.getByRole('button', { name: 'Previous interval' })).toBeDisabled()

  // keyboard
  await page.keyboard.press('ArrowRight')
  await page.keyboard.press('Escape')
  expect((await view())?.index).toBe(0)
  await expect(heading(page)).toHaveText('Prepare')

  // IPC from renderer (stop, save workout)
  expect(await page.evaluate(() => window.api.command('stop'))).toEqual({ ok: false, error: 'locked' })
  const save = await page.evaluate(() => window.api.listWorkouts().then((w) => window.api.saveWorkout({ ...w[0], name: 'hacked' })))
  expect(save.ok).toBe(false)
  expect(await page.evaluate(() => window.api.startSession('ref-blue', true))).toEqual({ ok: false, error: 'locked' })

  // tray (if available) and global shortcuts
  const menu = await hook<{ label: string; enabled: boolean }[] | null>(app, 'trayMenu')
  if (menu) {
    expect(menu.find((m) => m.label === 'Stop')?.enabled).toBe(false)
    await hook(app, 'trayClick', 'Stop')
  }
  await hook(app, 'shortcut', 'next')
  await hook(app, 'shortcut', 'stop')
  expect((await view())?.index).toBe(0)
  expect(await view()).not.toBeNull()

  // mini window: pause/resume allowed
  await page.keyboard.press('m')
  const mini = await miniPage(app)
  await mini.getByRole('button', { name: 'Pause' }).click()
  await expect(page.getByRole('button', { name: 'Resume' })).toBeVisible()
  await expect(mini.locator('.mini-phase')).toContainText('🔒')
  if (menu) {
    await hook(app, 'trayClick', 'Resume')
    await expect(page.getByRole('button', { name: 'Pause' })).toBeVisible()
  }

  // unlock restores control
  await page.getByRole('button', { name: 'Unlock timer' }).click()
  await page.keyboard.press('ArrowRight')
  await expect(heading(page)).toHaveText('Work')
  await hook(app, 'shortcut', 'next')
  await expect(heading(page)).toHaveText('Rest')
  await app.close()
})

test('mini timer and main window stay in sync through the shared engine', async () => {
  const { app, page } = await startFixtureA()
  await page.keyboard.press('m')
  const mini = await miniPage(app)
  await advance(app, 2000)
  await expect(mini.locator('.digits')).toHaveText('58')
  await expect(digits(page)).toHaveText('58')
  await mini.getByRole('button', { name: 'Pause' }).click()
  await expect(page.getByRole('button', { name: 'Resume' })).toBeVisible()
  await advance(app, 10_000)
  await expect(mini.locator('.digits')).toHaveText('58')
  await page.getByRole('button', { name: 'Resume' }).click()
  await expect(mini.getByRole('button', { name: 'Pause' })).toBeVisible()
  await page.getByRole('button', { name: 'Next interval' }).click()
  await expect(mini.locator('.mini-phase')).toHaveText('Work')
  await expect(mini.locator('.mini')).toHaveCSS('background-color', 'rgb(230, 74, 25)')
  // mini always-on-top uses the native window flag
  expect(await hook(app, 'isAlwaysOnTop', 'mini')).toBe(true)
  await mini.getByRole('button', { name: 'Disable always on top' }).click()
  await expect.poll(() => hook(app, 'isAlwaysOnTop', 'mini')).toBe(false)
  // return to main
  await mini.getByRole('button', { name: 'Return to main window' }).click()
  await mini.getByRole('button', { name: 'Close mini timer' }).click()
  await expect.poll(() => app.windows().filter((w) => w.url().includes('#mini')).length).toBe(0)
  await app.close()
})

test('navigation never stops a session; replacing asks and cancel preserves', async () => {
  const { app, page } = await startFixtureA()
  await advance(app, 5000)
  await page.keyboard.press('Escape')
  await expect(page.locator('.summary')).toBeVisible()
  await expect(page.locator('.session-banner')).toContainText('Prepare 55')
  await advance(app, 1000)
  await expect(page.locator('.session-banner')).toContainText('Prepare 54')
  await page.getByRole('button', { name: 'Workout list' }).click()
  await page.getByRole('button', { name: 'Start Workout' }).nth(1).click()
  const dlg = page.getByRole('dialog', { name: 'Replace current workout?' })
  await dlg.getByRole('button', { name: 'Cancel' }).click()
  await expect(page.locator('.session-banner')).toContainText('Prepare 54')
  await page.getByRole('button', { name: 'Start Workout' }).nth(1).click()
  await dlg.getByRole('button', { name: 'Replace' }).click()
  await expect(digits(page)).toHaveText('10')
  await expect(page.locator('.counters')).toHaveText('1/1•1/8')
  const history = await page.evaluate(() => window.api.listHistory())
  expect(history[0]).toMatchObject({ status: 'stopped', workoutId: 'ref-purple' })
  // editing/deleting the saved workout cannot mutate the running snapshot
  await page.evaluate(() => window.api.deleteWorkout('ref-blue'))
  await page.keyboard.press('ArrowRight')
  await expect(digits(page)).toHaveText('15:00')
  await app.close()
})

test('suspend pauses; quit offers paused recovery from the checkpoint', async () => {
  const { app, page, userData } = await startFixtureA()
  await advance(app, 65_000)
  await expect(heading(page)).toHaveText('Work')
  await hook(app, 'suspend')
  await expect(page.getByRole('button', { name: 'Resume' })).toBeVisible()
  await advance(app, 100_000)
  await expect(digits(page)).toHaveText('40')
  await page.getByRole('button', { name: 'Resume' }).click()
  await advance(app, 2000)
  await quit(app)
  const cp = JSON.parse(fs.readFileSync(path.join(userData, 'session.json'), 'utf8'))
  expect(cp).toMatchObject({ index: 1, remainingMs: 38_000 })
  expect(Object.keys(cp)).not.toContain('deadline')

  const again = await launch({ userData, env: { TT_NO_TRAY: '1' } })
  const dlg = again.page.getByRole('dialog', { name: 'Resume interrupted workout?' })
  await expect(dlg).toContainText('interval 2')
  await dlg.getByRole('button', { name: 'Resume (paused)' }).click()
  await expect(heading(again.page)).toHaveText('Work')
  await expect(digits(again.page)).toHaveText('38')
  await expect(again.page.getByRole('button', { name: 'Resume' })).toBeVisible()
  await again.app.close()

  // discarding records the session as stopped and clears the checkpoint
  const third = await launch({ userData, env: { TT_NO_TRAY: '1' } })
  await third.page.getByRole('dialog', { name: 'Resume interrupted workout?' }).getByRole('button', { name: 'Discard' }).click()
  await expect.poll(() => fs.existsSync(path.join(userData, 'session.json'))).toBe(false)
  const h = await third.page.evaluate(() => window.api.listHistory())
  expect(h[0]).toMatchObject({ status: 'stopped' })
  await third.app.close()
})

test('real clock: timing and sounds continue while the window is hidden', async () => {
  const userData = tempDir()
  const w = { ...referenceWorkouts()[0], id: 'short', prepare: 2, work: 2, rest: 1, cycles: 2, sets: 1 }
  seed(userData, [w], { lastWorkoutId: 'short' })
  const { app, page } = await launch({ userData, fakeClock: false, env: { TT_NO_TRAY: '1' } })
  await page.getByRole('button', { name: 'START' }).click()
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().forEach((x) => x.hide()))
  await page.waitForTimeout(3300)
  const v = await sessionView(app)
  expect(v?.phase).toBe('work')
  await page.waitForTimeout(4000)
  const done = await sessionView(app)
  expect(done?.status).toBe('finished')
  const log = await page.evaluate(() => (window as unknown as { __ttSoundLog: { ev: { kind: string }; played: boolean }[] }).__ttSoundLog)
  expect(log.map((s) => s.ev.kind)).toEqual(expect.arrayContaining(['transition', 'countdown', 'finish']))
  expect(log.every((s) => s.played)).toBe(true)
  await app.close()
})

test('mute and volume settings apply to sounds', async () => {
  const { app, page } = await startFixtureA({ TT_NO_TRAY: '1' }, { muted: true })
  await advance(app, 60_000)
  const log = await page.evaluate(() => (window as unknown as { __ttSoundLog: { ev: { kind: string }; played: boolean }[] }).__ttSoundLog)
  expect(log.find((s) => s.ev.kind === 'transition')?.played).toBe(false)
  await app.close()
})

test('always on top toggles the native window flag', async () => {
  const { app, page } = await startFixtureA()
  expect(await hook(app, 'isAlwaysOnTop', 'main')).toBe(false)
  await page.mouse.move(200, 60)
  await page.getByRole('button', { name: 'Keep window on top' }).click()
  await expect.poll(() => hook(app, 'isAlwaysOnTop', 'main')).toBe(true)
  await page.getByRole('button', { name: 'Disable always on top' }).click()
  await expect.poll(() => hook(app, 'isAlwaysOnTop', 'main')).toBe(false)
  await app.close()
})

test('global shortcuts register and report collisions', async () => {
  const { app, page } = await startFixtureA()
  await page.evaluate(() => window.api.updateSettings({ globalShortcutsEnabled: true, shortcuts: { toggle: 'CommandOrControl+Alt+P', next: 'CommandOrControl+Alt+P', previous: 'P', stop: 'CommandOrControl+Alt+S', show: 'CommandOrControl+Alt+T' } }))
  const status = await page.evaluate(() => window.api.getShortcutStatus())
  expect(status.find((s) => s.action === 'next')).toMatchObject({ ok: false, error: 'Same shortcut as "toggle"' })
  expect(status.find((s) => s.action === 'previous')?.error).toMatch(/modifier/)
  expect(status.find((s) => s.action === 'toggle')?.ok).toBe(true)
  await hook(app, 'shortcut', 'toggle')
  await expect(page.getByRole('button', { name: 'Resume' })).toBeVisible()
  await app.close()
})

test('window bounds persist and are recovered on-screen when a monitor disappears', async () => {
  const userData = tempDir()
  seed(userData, referenceWorkouts())
  const first = await launch({ userData, env: { TT_NO_TRAY: '1' } })
  await first.app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setBounds({ x: 100, y: 80, width: 500, height: 700 }))
  await first.page.waitForTimeout(600)
  await first.app.close()
  const second = await launch({ userData, env: { TT_NO_TRAY: '1' } })
  const b = await second.app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].getBounds())
  expect(b).toMatchObject({ width: 500, height: 700 })
  await second.app.close()
  // simulate a saved position on a now-missing monitor
  fs.writeFileSync(path.join(userData, 'window-state.json'), JSON.stringify({ main: { x: 5000, y: 3000, width: 500, height: 700 } }))
  const third = await launch({ userData, env: { TT_NO_TRAY: '1' } })
  const vis = await third.app.evaluate(({ BrowserWindow, screen }) => {
    const r = BrowserWindow.getAllWindows()[0].getBounds()
    const wa = screen.getPrimaryDisplay().workArea
    return r.x >= wa.x && r.y >= wa.y && r.x + r.width <= wa.x + wa.width && r.y + r.height <= wa.y + wa.height
  })
  expect(vis).toBe(true)
  await third.app.close()
})

test('single instance: a second launch forwards the workout and exits', async () => {
  const userData = tempDir()
  seed(userData, referenceWorkouts())
  const { app, page } = await launch({ userData, env: { TT_NO_TRAY: '1' } })
  const electronBin = path.join(ROOT, 'node_modules/electron/dist', fs.readFileSync(path.join(ROOT, 'node_modules/electron/path.txt'), 'utf8').trim())
  // Same flag Playwright passes to the first instance (Ubuntu 24 restricts the Chromium sandbox on CI runners).
  const sandbox = process.platform === 'linux' ? ['--no-sandbox'] : []
  const child = spawn(electronBin, [...sandbox, path.join(ROOT, 'out/main/index.js'), '--workout=ref-blue'], {
    env: { ...process.env, TT_USER_DATA: userData, TT_TEST: '1', TT_NO_TRAY: '1' },
    stdio: 'ignore'
  })
  const code = await new Promise<number | null>((r) => child.on('exit', r))
  expect(code).toBe(0)
  await expect(page.locator('.summary')).toHaveText('Workout: 2:35:10 • 16 intervals')
  await app.close()
})

test('settings rest colour applies; reset and stop controls work', async () => {
  const { app, page } = await startFixtureA()
  await page.evaluate(() => window.api.updateSettings({ restColor: '#6a1b9a' }))
  await page.keyboard.press('ArrowRight')
  await page.keyboard.press('ArrowRight')
  await expect(heading(page)).toHaveText('Rest')
  await expect(page.locator('.timer-screen')).toHaveCSS('background-color', 'rgb(106, 27, 154)')
  await page.keyboard.press('Space')
  await page.getByRole('button', { name: 'Reset to first interval' }).click()
  await expect(heading(page)).toHaveText('Prepare')
  await expect(page.locator('.interval-row.active')).toHaveText('1. Prepare: 01:00')
  await page.getByRole('button', { name: 'Stop workout' }).click()
  await expect(page.locator('.summary')).toBeVisible()
  await expect(page.locator('.session-banner')).toHaveCount(0)
  // the settings screen exposes the capability report
  await page.getByRole('button', { name: 'Settings', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Desktop integration' })).toBeVisible()
  await expect(page.getByText('Always on top', { exact: true })).toBeVisible()
  await app.close()
})
