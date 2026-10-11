import type { Settings, SoundEvent } from '../../shared/types'

let ctx: AudioContext | null = null

function audio(): AudioContext {
  if (!ctx) ctx = new AudioContext()
  if (ctx.state === 'suspended') void ctx.resume()
  return ctx
}

function tone(freq: number, startOffset: number, duration: number, volume: number, type: OscillatorType = 'sine'): void {
  const c = audio()
  const t0 = c.currentTime + startOffset
  const osc = c.createOscillator()
  const gain = c.createGain()
  osc.type = type
  osc.frequency.value = freq
  gain.gain.setValueAtTime(0.0001, t0)
  gain.gain.exponentialRampToValueAtTime(Math.max(0.0002, volume), t0 + 0.012)
  gain.gain.exponentialRampToValueAtTime(0.0001, t0 + duration)
  osc.connect(gain).connect(c.destination)
  osc.start(t0)
  osc.stop(t0 + duration + 0.02)
}

/** Recent sound events, kept for diagnostics and automated checks. */
export const soundLog: { ev: SoundEvent; played: boolean; at: number }[] = []
;(window as unknown as { __ttSoundLog: typeof soundLog }).__ttSoundLog = soundLog

/** Synthesized locally with Web Audio – no files, no network. */
export function playSound(ev: SoundEvent, s: Pick<Settings, 'muted' | 'volume' | 'countdownBeeps'>): void {
  const audible = !s.muted && s.volume > 0 && (ev.kind !== 'countdown' || s.countdownBeeps)
  soundLog.push({ ev, played: audible, at: Date.now() })
  if (soundLog.length > 50) soundLog.shift()
  if (!audible) return
  const v = Math.min(1, s.volume) * 0.6
  try {
    if (ev.kind === 'countdown') tone(660, 0, 0.12, v * 0.7, 'triangle')
    else if (ev.kind === 'finish') [523, 659, 784, 1047].forEach((f, i) => tone(f, i * 0.16, 0.35, v, 'triangle'))
    else if (ev.type === 'work') {
      tone(988, 0, 0.18, v, 'square')
      tone(988, 0.22, 0.3, v, 'square')
    } else tone(587, 0, 0.45, v, 'triangle')
  } catch (err) {
    console.warn('Audio unavailable', err)
  }
}
