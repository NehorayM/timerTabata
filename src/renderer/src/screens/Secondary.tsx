import { useEffect, useMemo, useState } from 'react'
import { formatDuration } from '../../../shared/format'
import { generateSequence } from '../../../shared/sequence'
import type { Capabilities, HistoryEntry, Settings, ShortcutAction, ShortcutStatus, Workout } from '../../../shared/types'
import { CARD_COLORS, phaseColor, workoutSummary } from '../../../shared/workout'
import { IntervalList } from '../components/IntervalList'
import { Icon } from '../components/Icon'
import { IconButton, Modal, useUi } from '../components/ui'
import { api, useApiEvent } from '../hooks'

function SubToolbar({ title, onBack, children }: { title: string; onBack: () => void; children?: React.ReactNode }): React.JSX.Element {
  return (
    <header className="toolbar list-toolbar">
      <IconButton icon="back" label="Back" onClick={onBack} />
      <h1 className="toolbar-title">
        <bdi>{title}</bdi>
      </h1>
      <div className="toolbar-actions">{children}</div>
    </header>
  )
}

// ---- Preview ---------------------------------------------------------------------------------

export function Preview({ workout, restColor, onBack, onStart }: { workout: Workout; restColor: string; onBack: () => void; onStart: () => void }): React.JSX.Element {
  const seq = useMemo(() => generateSequence(workout), [workout])
  return (
    <div className="screen preview-screen">
      <SubToolbar title="Preview" onBack={onBack} />
      <div className="preview-summary">
        <bdi>{workoutSummary(workout)}</bdi>
      </div>
      <IntervalList
        sequence={seq}
        workout={workout}
        activeIndex={null}
        className="preview-list"
        colorFor={(i) => phaseColor(i.type, restColor, workout.color)}
      />
      <footer className="bottom-actions single">
        <button className="start-btn" onClick={onStart}>
          <Icon name="play" />
          <span className="start-label">START</span>
        </button>
      </footer>
    </div>
  )
}

// ---- History ---------------------------------------------------------------------------------

export function History({ workout, onBack }: { workout: Workout | null; onBack: () => void }): React.JSX.Element {
  const ui = useUi()
  const [entries, setEntries] = useState<HistoryEntry[] | null>(null)
  const [onlyThis, setOnlyThis] = useState(!!workout)
  const load = (): void => void api.listHistory().then(setEntries)
  useEffect(load, [])
  useApiEvent('session', (v) => {
    if (v === null) load()
  })
  const shown = (entries ?? []).filter((e) => !onlyThis || !workout || e.workoutId === workout.id)
  const clear = async (): Promise<void> => {
    if (await ui.confirm('Clear history', 'Delete all recorded sessions?', 'Clear', true)) {
      await api.clearHistory()
      load()
    }
  }
  const fmtDate = (t: number): string => new Date(t).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })
  return (
    <div className="screen history-screen">
      <SubToolbar title="History" onBack={onBack}>
        <IconButton icon="delete" label="Clear history" onClick={() => void clear()} disabled={!entries?.length} />
      </SubToolbar>
      <main className="page-body">
        {workout && (
          <label className="switch-row">
            <input type="checkbox" checked={onlyThis} onChange={(e) => setOnlyThis(e.target.checked)} />
            <span>
              Only “<bdi>{workout.name}</bdi>”
            </span>
          </label>
        )}
        {entries && shown.length === 0 && <p className="muted">No sessions recorded yet.</p>}
        <ul className="history-list">
          {shown.map((e) => (
            <li key={e.id} className="history-item">
              <div className="history-top">
                <bdi className="history-name">{e.workoutName}</bdi>
                <span className={`status-chip ${e.status}`}>{e.status === 'finished' ? 'Finished' : 'Stopped'}</span>
              </div>
              <div className="muted">
                {fmtDate(e.startedAt)} · {formatDuration(e.elapsedSeconds)} · {e.completedIntervals}/{e.totalIntervals} intervals
              </div>
            </li>
          ))}
        </ul>
      </main>
    </div>
  )
}

// ---- Settings --------------------------------------------------------------------------------

const ACTION_LABELS: Record<ShortcutAction, string> = {
  toggle: 'Pause / resume',
  next: 'Next interval',
  previous: 'Previous interval',
  stop: 'Stop workout',
  show: 'Show window'
}

function acceleratorFromEvent(e: React.KeyboardEvent): string | null {
  const mods: string[] = []
  if (e.ctrlKey) mods.push('CommandOrControl')
  if (e.altKey) mods.push('Alt')
  if (e.shiftKey) mods.push('Shift')
  if (e.metaKey) mods.push('Super')
  const k = e.key
  if (['Control', 'Alt', 'Shift', 'Meta', 'AltGraph'].includes(k)) return null
  const map: Record<string, string> = { ArrowLeft: 'Left', ArrowRight: 'Right', ArrowUp: 'Up', ArrowDown: 'Down', ' ': 'Space', '+': 'Plus' }
  const key = map[k] ?? (k.length === 1 ? k.toUpperCase() : k)
  return [...mods, key].join('+')
}

export function SettingsScreen({
  settings,
  onBack,
  onImport
}: {
  settings: Settings
  onBack: () => void
  onImport: () => void
}): React.JSX.Element {
  const ui = useUi()
  const [caps, setCaps] = useState<Capabilities | null>(null)
  const [status, setStatus] = useState<ShortcutStatus[]>([])
  const [dataDir, setDataDir] = useState('')
  useEffect(() => {
    void api.capabilities().then(setCaps)
    void api.getShortcutStatus().then(setStatus)
  }, [])
  useApiEvent('shortcut-status', setStatus)

  const update = async (patch: Partial<Settings>): Promise<void> => {
    const r = await api.updateSettings(patch)
    if (!r.ok) ui.notify(r.error)
  }

  return (
    <div className="screen settings-screen">
      <SubToolbar title="Settings" onBack={onBack} />
      <main className="page-body">
        <section className="settings-group" aria-labelledby="sg-sound">
          <h2 id="sg-sound">Sound</h2>
          <label className="switch-row">
            <input type="checkbox" checked={settings.muted} onChange={(e) => void update({ muted: e.target.checked })} />
            <span>Mute all sounds</span>
          </label>
          <label className="slider-row">
            <span>Volume</span>
            <input
              type="range"
              min={0}
              max={100}
              step={5}
              value={Math.round(settings.volume * 100)}
              aria-valuetext={`${Math.round(settings.volume * 100)}%`}
              onChange={(e) => void update({ volume: Number(e.target.value) / 100 })}
            />
            <span className="slider-value">{Math.round(settings.volume * 100)}%</span>
          </label>
          <label className="select-row">
            <span>Sound style</span>
            <select value={settings.soundTheme} onChange={(e) => void update({ soundTheme: e.target.value as Settings['soundTheme'] })}>
              <option value="beep">Beep</option>
              <option value="bell">Bell</option>
              <option value="whistle">Whistle</option>
              <option value="digital">Digital watch</option>
            </select>
          </label>
          <label className="switch-row">
            <input type="checkbox" checked={settings.countdownBeeps} onChange={(e) => void update({ countdownBeeps: e.target.checked })} />
            <span>Countdown beeps at the end of each interval</span>
          </label>
          {settings.countdownBeeps && (
            <label className="select-row">
              <span>Countdown length</span>
              <select value={settings.countdownFrom} onChange={(e) => void update({ countdownFrom: Number(e.target.value) })}>
                {[1, 2, 3, 4, 5, 10].map((n) => (
                  <option key={n} value={n}>
                    Last {n} second{n === 1 ? '' : 's'}
                  </option>
                ))}
              </select>
            </label>
          )}
          <label className="switch-row">
            <input type="checkbox" checked={settings.halfwayAlert} onChange={(e) => void update({ halfwayAlert: e.target.checked })} />
            <span>Halfway cue during Work (intervals of 10 s or more)</span>
          </label>
          <button className="outline-btn" onClick={() => window.dispatchEvent(new CustomEvent('tt-test-sound'))}>
            <Icon name="volume" /> Test sound
          </button>
        </section>

        <section className="settings-group" aria-labelledby="sg-noise">
          <h2 id="sg-noise">Background noise</h2>
          <label className="select-row">
            <span>Noise</span>
            <select value={settings.noise} onChange={(e) => void update({ noise: e.target.value as Settings['noise'] })}>
              <option value="off">Off</option>
              <option value="white">White noise</option>
              <option value="pink">Pink noise</option>
              <option value="brown">Brown noise</option>
            </select>
          </label>
          <label className="slider-row">
            <span>Noise volume</span>
            <input
              type="range"
              min={0}
              max={100}
              step={5}
              value={Math.round(settings.noiseVolume * 100)}
              aria-valuetext={`${Math.round(settings.noiseVolume * 100)}%`}
              onChange={(e) => void update({ noiseVolume: Number(e.target.value) / 100 })}
            />
            <span className="slider-value">{Math.round(settings.noiseVolume * 100)}%</span>
          </label>
          <label className="select-row">
            <span>Play noise</span>
            <select value={settings.noiseDuring} onChange={(e) => void update({ noiseDuring: e.target.value as Settings['noiseDuring'] })}>
              <option value="session">During the whole workout</option>
              <option value="work">Only during Work</option>
            </select>
          </label>
          <p className="muted">Noise plays while a workout is running and stops when it is paused, finished or muted.</p>
        </section>

        <section className="settings-group" aria-labelledby="sg-display">
          <h2 id="sg-display">Timer display</h2>
          <label className="select-row">
            <span>Heading shows</span>
            <select value={settings.timerHeading} onChange={(e) => void update({ timerHeading: e.target.value as Settings['timerHeading'] })}>
              <option value="remaining">Total time remaining</option>
              <option value="phase">Phase name (Work / Rest…)</option>
            </select>
          </label>
          <label className="switch-row">
            <input type="checkbox" checked={settings.keepAwake} onChange={(e) => void update({ keepAwake: e.target.checked })} />
            <span>Keep the screen awake while a workout runs</span>
          </label>
          <label className="switch-row">
            <input
              type="checkbox"
              checked={settings.hardwareAcceleration}
              onChange={(e) => void update({ hardwareAcceleration: e.target.checked })}
            />
            <span>Use graphics (GPU) acceleration – restart required; turned off automatically if the graphics driver crashes</span>
          </label>
        </section>

        <section className="settings-group" aria-labelledby="sg-colors">
          <h2 id="sg-colors">Timer colors</h2>
          <div className="color-row">
            <span className="swatch" style={{ background: '#007c0e' }} /> Prepare
            <span className="swatch" style={{ background: '#e64a19' }} /> Work
          </div>
          <label className="color-row">
            <input type="color" value={settings.restColor} onChange={(e) => void update({ restColor: e.target.value })} aria-label="Rest color" />
            <span>Rest color (also used for rest between sets)</span>
          </label>
        </section>

        <section className="settings-group" aria-labelledby="sg-window">
          <h2 id="sg-window">Windows</h2>
          <label className="switch-row">
            <input type="checkbox" checked={settings.alwaysOnTopMain} onChange={(e) => void api.setAlwaysOnTop('main', e.target.checked)} />
            <span>Keep main window always on top</span>
          </label>
          <label className="switch-row">
            <input type="checkbox" checked={settings.alwaysOnTopMini} onChange={(e) => void api.setAlwaysOnTop('mini', e.target.checked)} />
            <span>Keep mini timer always on top</span>
          </label>
          {caps?.platform === 'linux' && (
            <label className="switch-row">
              <input type="checkbox" checked={settings.miniFocusable} onChange={(e) => void update({ miniFocusable: e.target.checked })} />
              <span>Let the mini timer take keyboard focus (off prevents it from grabbing typing after a keyboard-language switch)</span>
            </label>
          )}
          <label className="switch-row">
            <input type="checkbox" checked={settings.closeToTray} onChange={(e) => void update({ closeToTray: e.target.checked })} />
            <span>Closing the window hides it to the system tray</span>
          </label>
          {caps?.platform === 'linux' && (
            <label className="switch-row">
              <input type="checkbox" checked={settings.preferX11} onChange={(e) => void update({ preferX11: e.target.checked })} />
              <span>Use X11 (XWayland) on Wayland for always-on-top and global shortcuts (restart required)</span>
            </label>
          )}
          <button className="outline-btn" onClick={() => void api.openMini()}>
            <Icon name="mini" /> Open mini timer
          </button>
        </section>

        <section className="settings-group" aria-labelledby="sg-keys">
          <h2 id="sg-keys">Keyboard</h2>
          <p className="muted">
            In the timer: Space pause/resume · ←/→ previous/next · L lock · M mini timer · Esc back. Editor: Ctrl+S save.
          </p>
          <label className="switch-row">
            <input
              type="checkbox"
              checked={settings.globalShortcutsEnabled}
              onChange={(e) => void update({ globalShortcutsEnabled: e.target.checked })}
            />
            <span>Enable global shortcuts (work when the app is in the background)</span>
          </label>
          {settings.globalShortcutsEnabled &&
            (Object.keys(ACTION_LABELS) as ShortcutAction[]).map((a) => {
              const st = status.find((s) => s.action === a)
              return (
                <div className="shortcut-row" key={a}>
                  <span>{ACTION_LABELS[a]}</span>
                  <input
                    className="shortcut-input"
                    aria-label={`Shortcut for ${ACTION_LABELS[a]}`}
                    value={settings.shortcuts[a]}
                    readOnly
                    onKeyDown={(e) => {
                      if (e.key === 'Tab') return
                      e.preventDefault()
                      if (e.key === 'Backspace' || e.key === 'Delete') return void update({ shortcuts: { ...settings.shortcuts, [a]: '' } })
                      const acc = acceleratorFromEvent(e)
                      if (acc) void update({ shortcuts: { ...settings.shortcuts, [a]: acc } })
                    }}
                    placeholder="Press keys"
                  />
                  <span className={`shortcut-status ${st?.ok ? 'ok' : 'bad'}`}>{st ? (st.ok ? 'Active' : st.error) : ''}</span>
                </div>
              )
            })}
        </section>

        <section className="settings-group" aria-labelledby="sg-data">
          <h2 id="sg-data">Data</h2>
          <div className="button-row">
            <button className="outline-btn" onClick={onImport}>
              <Icon name="upload" /> Import workout…
            </button>
            <button className="outline-btn" onClick={() => void api.openDataDir().then(setDataDir)}>
              <Icon name="folder" /> Open data folder
            </button>
          </div>
          {dataDir && <p className="muted mono">{dataDir}</p>}
        </section>

        {caps && (
          <section className="settings-group" aria-labelledby="sg-caps">
            <h2 id="sg-caps">Desktop integration</h2>
            <p className="muted">
              Platform: {caps.platform} · display: {caps.displayServer}
            </p>
            {(
              [
                ['System tray', caps.tray],
                ['Always on top', caps.alwaysOnTop],
                ['Global shortcuts', caps.globalShortcuts]
              ] as const
            ).map(([name, c]) => (
              <div className="cap-row" key={name}>
                <span className={`status-chip ${c.available ? 'finished' : 'stopped'}`}>{c.available ? 'Available' : 'Limited'}</span>
                <div>
                  <strong>{name}</strong>
                  <div className="muted">{c.note}</div>
                </div>
              </div>
            ))}
          </section>
        )}
      </main>
    </div>
  )
}

// ---- Workout dialogs ---------------------------------------------------------------------------

export function WorkoutMetaDialog({
  workout,
  onSave,
  onClose
}: {
  workout: Workout
  onSave: (patch: Pick<Workout, 'name' | 'color'>) => void
  onClose: () => void
}): React.JSX.Element {
  const [name, setName] = useState(workout.name)
  const [color, setColor] = useState(workout.color)
  const valid = name.trim().length > 0 && name.trim().length <= 80
  return (
    <Modal
      title="Workout settings"
      onClose={onClose}
      actions={
        <>
          <button className="text-btn" onClick={onClose}>
            Cancel
          </button>
          <button className="text-btn primary" disabled={!valid} onClick={() => onSave({ name: name.trim(), color })}>
            Save
          </button>
        </>
      }
    >
      <label className="form-row">
        <span>Name</span>
        <input dir="auto" value={name} maxLength={80} onChange={(e) => setName(e.target.value)} aria-invalid={!valid} onKeyDown={(e) => e.key === 'Enter' && valid && onSave({ name: name.trim(), color })} />
      </label>
      <div className="form-row">
        <span id="color-label">Color</span>
        <div className="color-choices" role="radiogroup" aria-labelledby="color-label">
          {CARD_COLORS.map((c) => (
            <button
              key={c}
              role="radio"
              aria-checked={color === c}
              aria-label={`Color ${c}`}
              className={`color-choice ${color === c ? 'selected' : ''}`}
              style={{ background: c }}
              onClick={() => setColor(c)}
            >
              {color === c && <Icon name="check" />}
            </button>
          ))}
        </div>
      </div>
    </Modal>
  )
}

export function NotesDialog({ workout, onSave, onClose }: { workout: Workout; onSave: (notes: string) => void; onClose: () => void }): React.JSX.Element {
  const [notes, setNotes] = useState(workout.notes)
  return (
    <Modal
      title={`Notes – ${workout.name}`}
      onClose={onClose}
      actions={
        <>
          <button className="text-btn" onClick={onClose}>
            Cancel
          </button>
          <button className="text-btn primary" onClick={() => onSave(notes)}>
            Save
          </button>
        </>
      }
    >
      <textarea className="notes-area" dir="auto" rows={8} maxLength={10000} value={notes} onChange={(e) => setNotes(e.target.value)} aria-label="Notes" />
    </Modal>
  )
}
