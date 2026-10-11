import { useEffect, useRef, useState } from 'react'
import type { ApiEvents } from '../../shared/ipc'
import type { SessionView, Settings, Workout } from '../../shared/types'

export const api = window.api

export function useApiEvent<K extends keyof ApiEvents>(event: K, cb: (payload: ApiEvents[K]) => void): void {
  const ref = useRef(cb)
  useEffect(() => {
    ref.current = cb
  })
  useEffect(() => api.on(event, (p) => ref.current(p)), [event])
}

export function useSession(): SessionView | null | undefined {
  const [s, setS] = useState<SessionView | null | undefined>(undefined)
  useEffect(() => {
    let alive = true
    void api.getSession().then((v) => alive && setS((cur) => (cur === undefined ? v : cur)))
    return () => {
      alive = false
    }
  }, [])
  useApiEvent('session', setS)
  return s
}

export function useSettings(): Settings | null {
  const [s, setS] = useState<Settings | null>(null)
  useEffect(() => {
    let alive = true
    void api.getSettings().then((v) => alive && setS(v))
    return () => {
      alive = false
    }
  }, [])
  useApiEvent('settings', setS)
  return s
}

export function useWorkouts(): Workout[] | null {
  const [w, setW] = useState<Workout[] | null>(null)
  useEffect(() => {
    let alive = true
    void api.listWorkouts().then((v) => alive && setW(v))
    return () => {
      alive = false
    }
  }, [])
  useApiEvent('workouts', setW)
  return w
}

/** Fits a single line of text into a box; returns the font size in px. */
export function useFitText(text: string, weight = 300, family = 'Roboto', maxRatio = 1.25): [React.RefObject<HTMLDivElement | null>, number] {
  const ref = useRef<HTMLDivElement | null>(null)
  const [box, setBox] = useState({ w: 0, h: 0 })
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const ro = new ResizeObserver(([e]) => setBox({ w: e.contentRect.width, h: e.contentRect.height }))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  const em = measureEm(text, weight, family)
  const size = Math.max(10, Math.floor(Math.min(box.h * maxRatio, (box.w * 0.94) / em)))
  return [ref, box.w ? size : 10]
}

let canvas: HTMLCanvasElement | null = null
const emCache = new Map<string, number>()
function measureEm(text: string, weight: number, family: string): number {
  // Digits share one advance width in Roboto, so cache by shape (digit -> 0).
  const key = `${weight}|${family}|${text.replace(/\d/g, '0')}`
  const hit = emCache.get(key)
  if (hit) return hit
  canvas ??= document.createElement('canvas')
  const c = canvas.getContext('2d')
  if (!c) return Math.max(1, text.length * 0.56)
  c.font = `${weight} 100px ${family}, sans-serif`
  const w = Math.max(0.3, c.measureText(text).width / 100)
  if (document.fonts.status === 'loaded') emCache.set(key, w)
  return w
}
