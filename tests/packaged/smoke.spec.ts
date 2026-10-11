import fs from 'node:fs'
import path from 'node:path'
import { expect, test } from '@playwright/test'
import { ROOT, advance, launch, referenceWorkouts, seed, tempDir } from '../e2e/helpers'

/**
 * Launches packaged builds. Set TT_PACKAGED_EXE to an executable, or it defaults to the
 * unpacked electron-builder output for this platform. The AppImage runs with
 * APPIMAGE_EXTRACT_AND_RUN=1 so FUSE is not required.
 */
function candidates(): string[] {
  if (process.env.TT_PACKAGED_EXE) return process.env.TT_PACKAGED_EXE.split(path.delimiter)
  const rel = path.join(ROOT, 'release')
  if (process.platform === 'win32') return [path.join(rel, 'win-unpacked', 'TimerTabata.exe')]
  const out = [path.join(rel, 'linux-unpacked', 'timertabata')]
  const appImage = fs.existsSync(rel) ? fs.readdirSync(rel).find((f) => f.endsWith('.AppImage')) : undefined
  if (appImage) out.push(path.join(rel, appImage))
  return out
}

for (const exe of candidates()) {
  test(`packaged smoke: ${path.basename(exe)}`, async () => {
    test.skip(!fs.existsSync(exe), `${exe} not built`)
    const userData = tempDir()
    seed(userData, referenceWorkouts(), { lastWorkoutId: 'ref-purple' })
    const { app, page } = await launch({ userData, executablePath: exe, env: { TT_NO_TRAY: '1', APPIMAGE_EXTRACT_AND_RUN: '1' } })
    expect(await app.evaluate(({ app }) => app.isPackaged)).toBe(true)
    await expect(page.locator('.summary')).toHaveText('5 x Workout: 35:00 • 40 intervals')
    await page.getByRole('button', { name: 'START' }).click()
    await advance(app, 3000)
    await expect(page.locator('.timer-screen .digits')).toHaveText('57')
    await expect(page.locator('.counters')).toHaveText('1/5•1/4')
    // fonts and icons are bundled (offline)
    expect(await page.evaluate(() => document.fonts.check('300 40px Roboto'))).toBe(true)
    await expect(page.locator('.timer-head .icon svg').first()).toBeVisible()
    await app.close()
  })
}
