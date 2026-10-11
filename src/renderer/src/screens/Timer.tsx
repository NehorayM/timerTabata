import { useEffect, useMemo, useRef, useState } from 'react'
import { assetUrl } from '../../../shared/ipc'
import { formatDuration } from '../../../shared/format'
import { INTERVAL_LABELS, generateSequence, totalSeconds } from '../../../shared/sequence'
import type { SessionCommand, SessionView, Settings } from '../../../shared/types'
import { phaseColor } from '../../../shared/workout'
import { IntervalList, describe } from '../components/IntervalList'
import { Icon } from '../components/Icon'
import { IconButton } from '../components/ui'
import { api, useFitText } from '../hooks'

export function phaseLabel(v: SessionView): string {
  return v.phase === 'finish' ? 'Finish' : INTERVAL_LABELS[v.phase]
}

export function sessionColor(v: SessionView, s: Settings | null): string {
  return phaseColor(v.phase, s?.restColor ?? '#1565c0', v.workout.color)
}

/** Progress of the current interval, animated linearly between one-second updates. */
export function Progress({ view }: { view: SessionView }): React.JSX.Element {
  const d = view.intervalMs
  const running = view.status === 'running'
  const now = d ? 1 - view.remainingMs / d : 1
  const target = running && d ? 1 - Math.max(0, view.remainingMs - 1000) / d : now
  const [w, setW] = useState(now)
  useEffect(() => {
    setW(now)
    if (!running) return
    const r = requestAnimationFrame(() => requestAnimationFrame(() => setW(target)))
    return () => cancelAnimationFrame(r)
  }, [now, target, running])
  return (
    <div className="progress" role="progressbar" aria-label="Interval progress" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(now * 100)}>
      <div
        key={`${view.sessionId}-${view.index}`}
        className="progress-fill"
        style={{ width: `${Math.min(100, w * 100)}%`, transition: running && w === target && w !== now ? 'width 1s linear' : 'none' }}
      />
    </div>
  )
}

export function Timer({
  view,
  settings,
  onBack,
  onNotify
}: {
  view: SessionView
  settings: Settings | null
  onBack: () => void
  onNotify: (t: string) => void
}): React.JSX.Element {
  const seq = useMemo(() => generateSequence(view.workout), [view.workout])
  const finished = view.status === 'finished'
  const cur = seq[view.index]
  const digits = finished ? formatDuration(totalSeconds(seq)) : formatDuration(view.displaySeconds)
  const [fitRef, fontSize] = useFitText(digits)
  const [controlsVisible, setControlsVisible] = useState(false)
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const locked = view.locked
  const color = sessionColor(view, settings)
  const showRemaining = (settings?.timerHeading ?? 'remaining') === 'remaining' && !finished
  const totalLeft = formatDuration(Math.ceil(view.totalRemainingMs / 1000))

  const cmd = async (c: SessionCommand): Promise<void> => {
    const r = await api.command(c)
    if (!r.ok && r.error === 'locked') onNotify('Timer is locked – unlock it first')
  }

  const reveal = (): void => {
    setControlsVisible(true)
    if (hideTimer.current) clearTimeout(hideTimer.current)
    hideTimer.current = setTimeout(() => setControlsVisible(false), 3000)
  }
  useEffect(() => () => {
    if (hideTimer.current) clearTimeout(hideTimer.current)
  }, [])

  const latest = useRef({ view, onBack })
  latest.current = { view, onBack }
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.defaultPrevented || e.ctrlKey || e.metaKey || e.altKey) return
      const t = e.target as HTMLElement
      if (t.closest('input, textarea, [role="dialog"]')) return
      const v = latest.current.view
      switch (e.key) {
        case ' ':
        case 'k':
          if (t.tagName === 'BUTTON' && e.key === ' ') return
          void cmd('toggle')
          break
        case 'ArrowRight':
          void cmd('next')
          break
        case 'ArrowLeft':
          void cmd('previous')
          break
        case 'l':
        case 'L':
          void cmd(v.locked ? 'unlock' : 'lock')
          break
        case 'm':
        case 'M':
          void api.openMini()
          break
        case 'Escape':
          if (!v.locked) latest.current.onBack()
          break
        default:
          return
      }
      e.preventDefault()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const image = cur?.type === 'work' ? view.workout.workImage : cur && (cur.type === 'rest' || cur.type === 'setRest') ? view.workout.restImage : null
  const desc = cur ? describe(cur, view.workout) : ''
  const showControls = controlsVisible || view.status !== 'running'

  return (
    <div
      className="screen timer-screen"
      style={{ background: color, ['--phase-bg' as string]: color }}
      onMouseMove={reveal}
      onFocusCapture={reveal}
      data-phase={view.phase}
      data-status={view.status}
    >
      <Progress view={view} />
      <header className="timer-head">
        <IconButton
          icon={locked ? 'lock' : 'lockOpen'}
          label={locked ? 'Unlock timer' : 'Lock timer'}
          pressed={locked}
          className="timer-icon"
          onClick={() => void cmd(locked ? 'unlock' : 'lock')}
        />
        <div className="timer-center">
          {showRemaining ? (
            <h1 className="phase-heading heading-remaining" title="Total time remaining" aria-label={`${phaseLabel(view)} – ${totalLeft} total remaining`}>
              {totalLeft}
            </h1>
          ) : (
            <h1 className="phase-heading" aria-live="polite">
              {phaseLabel(view)}
            </h1>
          )}
          <div className={`timer-controls ${showControls ? 'visible' : ''}`} role="toolbar" aria-label="Session controls">
            <IconButton icon="back" label="Back to workouts (timer keeps running)" disabled={locked} onClick={onBack} />
            <IconButton icon="mini" label="Open mini timer" onClick={() => void api.openMini()} />
            <IconButton
              icon="pin"
              label={settings?.alwaysOnTopMain ? 'Disable always on top' : 'Keep window on top'}
              pressed={!!settings?.alwaysOnTopMain}
              onClick={() => void api.setAlwaysOnTop('main', !settings?.alwaysOnTopMain)}
            />
            <IconButton icon="replay" label="Reset to first interval" disabled={locked} onClick={() => void cmd('reset')} />
            <IconButton icon="stop" label={finished ? 'Close finished workout' : 'Stop workout'} disabled={locked} onClick={() => void cmd('stop')} />
          </div>
        </div>
        <IconButton
          icon={view.status === 'running' ? 'pause' : 'play'}
          label={view.status === 'running' ? 'Pause' : 'Resume'}
          className="timer-icon"
          disabled={finished}
          onClick={() => void cmd('toggle')}
        />
      </header>
      <div className="digits-area">
        {image && <img className="phase-image" src={assetUrl(image)} alt="" />}
        <div className="digits-box" ref={fitRef}>
          <span
            className="digits"
            style={{ fontSize }}
            role="timer"
            aria-label={finished ? `Workout complete, total ${digits}` : `${phaseLabel(view)}, ${digits} remaining`}
          >
            {digits}
          </span>
        </div>
        {(desc || finished) && (
          <div className="phase-desc" dir="auto">
            {finished ? 'Workout complete' : desc}
          </div>
        )}
      </div>
      <IntervalList sequence={seq} workout={view.workout} activeIndex={view.index} className="timer-list" />
      <footer className="timer-foot">
        <IconButton icon="prev" label="Previous interval" className="timer-icon" disabled={locked || (view.index === 0 && !finished)} onClick={() => void cmd('previous')} />
        <div className="counters" aria-label={`Set ${view.set} of ${view.sets}, cycle ${view.cycle} of ${view.cycles}`}>
          {view.set}/{view.sets}•{view.cycle}/{view.cycles}
        </div>
        <IconButton icon="next" label="Next interval" className="timer-icon" disabled={locked || finished} onClick={() => void cmd('next')} />
      </footer>
      {locked && <Icon name="lock" className="lock-badge" />}
    </div>
  )
}
