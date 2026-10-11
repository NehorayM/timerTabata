import { useEffect } from 'react'
import { formatDuration } from '../../../shared/format'
import { IconButton } from '../components/ui'
import { api, useFitText, useSession, useSettings } from '../hooks'
import { Progress, phaseLabel, sessionColor } from './Timer'

/** Compact always-on-top timer window. Shares the main-process engine with the main window. */
export function MiniTimer(): React.JSX.Element {
  const view = useSession()
  const settings = useSettings()
  const digits = view ? (view.status === 'finished' ? 'Done' : formatDuration(view.displaySeconds)) : '–'
  const [fitRef, fontSize] = useFitText(digits, 300, 'Roboto', 1.2)

  useEffect(() => {
    document.title = view ? `${phaseLabel(view)} ${digits} – TimerTabata` : 'TimerTabata – Mini timer'
  }, [view, digits])

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === ' ' && (e.target as HTMLElement).tagName !== 'BUTTON') {
        e.preventDefault()
        void api.command('toggle')
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const bg = view ? sessionColor(view, settings) : '#311b92'
  return (
    <div className="mini" style={{ background: bg }} data-phase={view?.phase ?? 'none'}>
      {view && <Progress view={view} />}
      <div className="mini-head">
        <span className="mini-phase" aria-live="polite">
          {view ? phaseLabel(view) : 'No workout running'}
          {view?.locked ? ' 🔒' : ''}
        </span>
        <div className="mini-actions">
          <IconButton
            icon={view?.status === 'running' ? 'pause' : 'play'}
            label={view?.status === 'running' ? 'Pause' : 'Resume'}
            disabled={!view || view.status === 'finished'}
            onClick={() => void api.command('toggle')}
          />
          <IconButton
            icon="pin"
            label={settings?.alwaysOnTopMini ? 'Disable always on top' : 'Keep on top'}
            pressed={!!settings?.alwaysOnTopMini}
            onClick={() => void api.setAlwaysOnTop('mini', !settings?.alwaysOnTopMini)}
          />
          <IconButton icon="openFull" label="Return to main window" onClick={() => void api.showMain()} />
          <IconButton icon="close" label="Close mini timer" onClick={() => void api.closeMini()} />
        </div>
      </div>
      <div className="mini-digits" ref={fitRef}>
        <span className="digits" role="timer" style={{ fontSize }}>
          {digits}
        </span>
      </div>
      {view && view.status !== 'finished' && (
        <div className="mini-foot">
          {view.index + 1}/{view.totalIntervals} · {view.set}/{view.sets}•{view.cycle}/{view.cycles}
        </div>
      )}
    </div>
  )
}
