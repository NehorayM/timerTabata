import fs from 'node:fs'
import path from 'node:path'
import { expect, test, type Page } from '@playwright/test'
import { ROOT, advance, launch, miniPage, referenceWorkouts, seed, setContentSize, tempDir } from '../e2e/helpers'

/**
 * Deterministic screenshots (frozen fake clock) for comparison against the reference
 * phone screenshots. Output: docs/visual-qa/actual/*.png. Run `npm run visual`, then
 * `python3 scripts/compare-visual.py` to build side-by-side comparisons.
 */
const OUT = path.join(ROOT, 'docs/visual-qa/actual')

async function shot(page: Page, name: string): Promise<void> {
  fs.mkdirSync(OUT, { recursive: true })
  await page.evaluate(() => document.fonts.ready)
  await page.waitForTimeout(350)
  await page.screenshot({ path: path.join(OUT, `${name}.png`), animations: 'disabled', caret: 'hide' })
}

async function noOverflow(page: Page): Promise<void> {
  const o = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth }))
  expect(o.sw, 'no horizontal overflow').toBeLessThanOrEqual(o.cw)
}

for (const size of [
  { tag: 'phone', w: 390, h: 844, scale: 1 },
  { tag: 'desktop', w: 1280, h: 800, scale: 1 },
  { tag: 'hidpi', w: 390, h: 844, scale: 2 }
]) {
  test(`capture ${size.tag}`, async () => {
    const userData = tempDir()
    seed(userData, referenceWorkouts(), { lastWorkoutId: 'ref-purple', closeToTray: false })
    const { app, page } = await launch({
      userData,
      env: { TT_NO_TRAY: '1' },
      args: size.scale !== 1 ? [`--force-device-scale-factor=${size.scale}`] : []
    })
    await setContentSize(app, 'main', size.w, size.h)
    // At 2x the requested height can exceed small screens (CI runners are 1024x768); the OS then clamps it.
    await page.waitForFunction(
      ([w, h, scale]) => window.innerWidth === w && (scale > 1 ? window.innerHeight > 300 : window.innerHeight === h),
      [size.w, size.h, size.scale]
    )
    const p = (n: string): string => `${size.tag}-${n}`

    // Editor (top) – reference image 2
    await expect(page.locator('.summary')).toHaveText('5 x Workout: 35:00 • 40 intervals')
    await noOverflow(page)
    await shot(page, p('editor-top'))

    // Editor (scrolled to bottom) – reference image 1
    await page.locator('.editor-body').evaluate((el) => (el.scrollTop = el.scrollHeight))
    await shot(page, p('editor-bottom'))
    await expect(page.locator('.start-btn')).toBeInViewport()

    // Workout list – reference image 4
    await page.getByRole('button', { name: 'Workout list' }).click()
    await expect(page.locator('.toolbar-title')).toHaveText('Workouts: 4')
    await noOverflow(page)
    await shot(page, p('list'))

    // Open overflow menu – reference image 3
    await page.getByRole('button', { name: 'More actions for Workout' }).first().click()
    await expect(page.getByRole('menu')).toBeVisible()
    await shot(page, p('list-menu'))
    await page.keyboard.press('Escape')

    // Timer: Prepare at 57 – reference image 5
    await page.getByRole('button', { name: 'Start Workout' }).first().click()
    await expect(page.locator('.timer-screen')).toHaveAttribute('data-phase', 'prepare')
    await advance(app, 3000)
    await expect(page.locator('.digits')).toHaveText('57')
    await page.getByRole('button', { name: 'Pause' }).waitFor()
    await noOverflow(page)
    await shot(page, p('timer-prepare'))

    // Timer: Work (reference image for Work was not provided; colour per spec)
    await advance(app, 57_000)
    await expect(page.locator('.timer-screen')).toHaveAttribute('data-phase', 'work')
    await advance(app, 3000)
    await shot(page, p('timer-work'))

    if (size.tag !== 'hidpi') {
      // Mini timer
      await page.keyboard.press('m')
      const mini = await miniPage(app)
      await setContentSize(app, 'mini', 320, 180)
      await mini.waitForFunction(() => window.innerWidth === 320 && window.innerHeight === 180)
      await expect(mini.locator('.digits')).toHaveText('42')
      await shot(mini, p('mini'))
      const o = await mini.evaluate(() => ({ sw: document.documentElement.scrollWidth, sh: document.documentElement.scrollHeight }))
      expect(o.sw).toBeLessThanOrEqual(320)
      expect(o.sh).toBeLessThanOrEqual(180)
    }
    await app.close()
  })
}
