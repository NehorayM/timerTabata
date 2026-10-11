import type { NoiseKind, Settings, SoundEvent, SoundTheme } from '../../shared/types'

let ctx: AudioContext | null = null

function audio(): AudioContext {
  if (!ctx) ctx = new AudioContext()
  if (ctx.state === 'suspended') void ctx.resume()
  return ctx
}

function tone(freq: number, startOffset: number, duration: number, volume: number, type: OscillatorType = 'sine', glideTo?: number): void {
  const c = audio()
  const t0 = c.currentTime + startOffset
  const osc = c.createOscillator()
  const gain = c.createGain()
  osc.type = type
  osc.frequency.setValueAtTime(freq, t0)
  if (glideTo) osc.frequency.exponentialRampToValueAtTime(glideTo, t0 + duration)
  gain.gain.setValueAtTime(0.0001, t0)
  gain.gain.exponentialRampToValueAtTime(Math.max(0.0002, volume), t0 + 0.012)
  gain.gain.exponentialRampToValueAtTime(0.0001, t0 + duration)
  osc.connect(gain).connect(c.destination)
  osc.start(t0)
  osc.stop(t0 + duration + 0.02)
}

/** A bell: a few inharmonic partials with a long decay. */
function bell(freq: number, at: number, v: number, length = 1.2): void {
  tone(freq, at, length, v, 'sine')
  tone(freq * 2.76, at, length * 0.6, v * 0.35, 'sine')
  tone(freq * 5.4, at, length * 0.3, v * 0.15, 'sine')
}

type Cue = 'work' | 'rest' | 'countdown' | 'finish' | 'halfway'

const THEMES: Record<SoundTheme, (cue: Cue, v: number) => void> = {
  beep: (cue, v) => {
    if (cue === 'countdown') tone(660, 0, 0.12, v * 0.7, 'triangle')
    else if (cue === 'halfway') tone(784, 0, 0.15, v * 0.6, 'triangle')
    else if (cue === 'finish') [523, 659, 784, 1047].forEach((f, i) => tone(f, i * 0.16, 0.35, v, 'triangle'))
    else if (cue === 'work') {
      tone(988, 0, 0.18, v, 'square')
      tone(988, 0.22, 0.3, v, 'square')
    } else tone(587, 0, 0.45, v, 'triangle')
  },
  bell: (cue, v) => {
    if (cue === 'countdown') bell(1318, 0, v * 0.5, 0.4)
    else if (cue === 'halfway') bell(1046, 0, v * 0.5, 0.6)
    else if (cue === 'finish') [784, 988, 1175, 1568].forEach((f, i) => bell(f, i * 0.25, v, 1.6))
    else if (cue === 'work') {
      bell(880, 0, v)
      bell(880, 0.3, v)
    } else bell(587, 0, v, 1.5)
  },
  whistle: (cue, v) => {
    if (cue === 'countdown') tone(2200, 0, 0.1, v * 0.5, 'sine')
    else if (cue === 'halfway') tone(1800, 0, 0.2, v * 0.5, 'sine', 2400)
    else if (cue === 'finish') [0, 0.35, 0.7].forEach((t) => tone(2600, t, 0.28, v, 'sine', 2900))
    else if (cue === 'work') tone(2500, 0, 0.6, v, 'sine', 3100)
    else tone(2400, 0, 0.5, v * 0.8, 'sine', 1600)
  },
  digital: (cue, v) => {
    if (cue === 'countdown') tone(1200, 0, 0.06, v * 0.6, 'square')
    else if (cue === 'halfway') [0, 0.1].forEach((t) => tone(1500, t, 0.06, v * 0.5, 'square'))
    else if (cue === 'finish') [0, 0.12, 0.24, 0.5, 0.62, 0.74].forEach((t) => tone(1800, t, 0.08, v, 'square'))
    else if (cue === 'work') [0, 0.12, 0.24].forEach((t) => tone(1600, t, 0.08, v, 'square'))
    else [0, 0.15].forEach((t) => tone(900, t, 0.1, v, 'square'))
  }
}

/** Recent sound events, kept for diagnostics and automated checks. */
export const soundLog: { ev: SoundEvent; played: boolean; at: number }[] = []
;(window as unknown as { __ttSoundLog: typeof soundLog }).__ttSoundLog = soundLog

type SoundSettings = Pick<Settings, 'muted' | 'volume' | 'countdownBeeps' | 'countdownFrom' | 'soundTheme' | 'halfwayAlert'>

export function isAudible(ev: SoundEvent, s: SoundSettings): boolean {
  if (s.muted || s.volume <= 0) return false
  if (ev.kind === 'countdown') return s.countdownBeeps && ev.seconds <= s.countdownFrom
  if (ev.kind === 'halfway') return s.halfwayAlert
  return true
}

/** Synthesized locally with Web Audio – no files, no network. */
export function playSound(ev: SoundEvent, s: SoundSettings): void {
  const audible = isAudible(ev, s)
  soundLog.push({ ev, played: audible, at: Date.now() })
  if (soundLog.length > 50) soundLog.shift()
  if (!audible) return
  const cue: Cue = ev.kind === 'transition' ? (ev.type === 'work' ? 'work' : 'rest') : ev.kind
  try {
    ;(THEMES[s.soundTheme] ?? THEMES.beep)(cue, Math.min(1, s.volume) * 0.6)
  } catch (err) {
    console.warn('Audio unavailable', err)
  }
}

// ---- Background noise ----------------------------------------------------------------------

const noiseBuffers = new Map<NoiseKind, AudioBuffer>()

function noiseBuffer(kind: Exclude<NoiseKind, 'off'>): AudioBuffer {
  const cached = noiseBuffers.get(kind)
  if (cached) return cached
  const c = audio()
  const len = c.sampleRate * 4
  const buf = c.createBuffer(1, len, c.sampleRate)
  const d = buf.getChannelData(0)
  let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0, last = 0
  for (let i = 0; i < len; i++) {
    const w = Math.random() * 2 - 1
    if (kind === 'white') d[i] = w * 0.5
    else if (kind === 'pink') {
      // Paul Kellet's refined pink-noise filter.
      b0 = 0.99886 * b0 + w * 0.0555179
      b1 = 0.99332 * b1 + w * 0.0750759
      b2 = 0.969 * b2 + w * 0.153852
      b3 = 0.8665 * b3 + w * 0.3104856
      b4 = 0.55 * b4 + w * 0.5329522
      b5 = -0.7616 * b5 - w * 0.016898
      d[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362) * 0.11
      b6 = w * 0.115926
    } else {
      last = (last + 0.02 * w) / 1.02
      d[i] = last * 3.5
    }
  }
  // Cross-fade the loop seam to avoid a click every 4 s.
  const fade = Math.floor(c.sampleRate * 0.05)
  for (let i = 0; i < fade; i++) {
    const t = i / fade
    d[len - fade + i] = d[len - fade + i] * (1 - t) + d[i] * t
  }
  noiseBuffers.set(kind, buf)
  return buf
}

let noise: { kind: NoiseKind; src: AudioBufferSourceNode; gain: GainNode } | null = null

export const noiseState = { kind: 'off' as NoiseKind, volume: 0 }
;(window as unknown as { __ttNoise: typeof noiseState }).__ttNoise = noiseState

/** Starts, retunes or stops the background noise. `kind = 'off'` or volume 0 stops it. */
export function setNoise(kind: NoiseKind, volume: number): void {
  noiseState.kind = volume > 0 ? kind : 'off'
  noiseState.volume = kind === 'off' ? 0 : volume
  try {
    if (kind === 'off' || volume <= 0) {
      if (noise) {
        const n = noise
        noise = null
        const t = audio().currentTime
        n.gain.gain.setTargetAtTime(0, t, 0.08)
        n.src.stop(t + 0.4)
      }
      return
    }
    const c = audio()
    const level = Math.min(1, volume) * 0.5
    if (noise && noise.kind === kind) {
      noise.gain.gain.setTargetAtTime(level, c.currentTime, 0.1)
      return
    }
    setNoise('off', 0)
    noiseState.kind = kind
    noiseState.volume = volume
    const src = c.createBufferSource()
    src.buffer = noiseBuffer(kind)
    src.loop = true
    const gain = c.createGain()
    gain.gain.setValueAtTime(0.0001, c.currentTime)
    gain.gain.setTargetAtTime(level, c.currentTime, 0.15)
    src.connect(gain).connect(c.destination)
    src.start()
    noise = { kind, src, gain }
  } catch (err) {
    console.warn('Audio unavailable', err)
  }
}
