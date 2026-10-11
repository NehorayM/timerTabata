export interface Rect {
  x: number
  y: number
  width: number
  height: number
}

const MIN_VISIBLE = 80

function overlap(a: Rect, b: Rect): { w: number; h: number } {
  return {
    w: Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x),
    h: Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y)
  }
}

/**
 * Returns bounds that are reachable on the current monitors. If the saved window is no
 * longer meaningfully visible (e.g. a monitor was disconnected), it is centered on the
 * primary work area and shrunk to fit.
 */
export function ensureOnScreen(saved: Rect | undefined, workAreas: Rect[], primary: Rect, fallback: { width: number; height: number }): Rect {
  const size = saved ?? { ...fallback, x: 0, y: 0 }
  if (saved) {
    const visible = workAreas.some((wa) => {
      const o = overlap(saved, wa)
      // The title-bar area must be on screen so the user can grab the window.
      return o.w >= Math.min(MIN_VISIBLE, saved.width) && o.h >= Math.min(MIN_VISIBLE, saved.height) && saved.y >= wa.y - 8
    })
    if (visible) return saved
  }
  const width = Math.min(size.width, primary.width)
  const height = Math.min(size.height, primary.height)
  return {
    width,
    height,
    x: Math.round(primary.x + (primary.width - width) / 2),
    y: Math.round(primary.y + (primary.height - height) / 2)
  }
}
