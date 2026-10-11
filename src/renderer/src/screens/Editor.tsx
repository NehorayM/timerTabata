import { useEffect, useRef, useState } from 'react'
import { assetUrl } from '../../../shared/ipc'
import { MAX_COUNT, MAX_DURATION, formatDuration, parseCount, parseDuration } from '../../../shared/format'
import type { Workout } from '../../../shared/types'
import { workoutSummary } from '../../../shared/workout'
import { Icon, type IconName } from '../components/Icon'
import { IconButton } from '../components/ui'

type NumKey = 'prepare' | 'work' | 'rest' | 'cycles' | 'sets' | 'restBetweenSets' | 'coolDown'

export function Editor({
  draft,
  dirty,
  locked,
  onChange,
  onSave,
  onPreview,
  onHistory,
  onSettings,
  onEditMeta,
  onList,
  onStart,
  onNew,
  onPickImage
}: {
  draft: Workout
  dirty: boolean
  locked: boolean
  onChange: (patch: Partial<Workout>) => void
  onSave: () => void
  onPreview: () => void
  onHistory: () => void
  onSettings: () => void
  onEditMeta: () => void
  onList: () => void
  onStart: () => void
  onNew: () => void
  onPickImage: (which: 'work' | 'rest') => void
}): React.JSX.Element {
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
        e.preventDefault()
        onSave()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onSave])

  const num = (key: NumKey, icon: IconName, label: string, kind: 'duration' | 'count', min: number): React.JSX.Element => (
    <ValueRow key={key} id={key} icon={icon} label={label} kind={kind} min={min} value={draft[key]} onChange={(v) => onChange({ [key]: v })} />
  )

  return (
    <div className="screen editor-screen">
      <header className="toolbar editor-toolbar">
        <div className="toolbar-row">
          {dirty ? (
            <button className="save-btn" onClick={onSave} disabled={locked} aria-label="Save workout (Ctrl+S)" title="Save (Ctrl+S)">
              <Icon name="save" />
              <span>Save</span>
            </button>
          ) : (
            <span className="toolbar-gap" />
          )}
          <div className="toolbar-actions">
            <IconButton icon="eye" label="Preview" onClick={onPreview} />
            <IconButton icon="history" label="History" onClick={onHistory} />
            <IconButton icon="settings" label="Settings" onClick={onSettings} />
          </div>
        </div>
        <button className="summary" onClick={onEditMeta} title="Edit name and color" aria-label={`${workoutSummary(draft)}. Edit name and color`}>
          <bdi>{workoutSummary(draft)}</bdi>
        </button>
      </header>
      <main className="editor-body" aria-label="Workout settings">
        {num('prepare', 'walk', 'Prepare', 'duration', 0)}
        <PhaseSection
          id="work"
          icon="work"
          label="Work"
          description={draft.workDescription}
          image={draft.workImage}
          onDescription={(t) => onChange({ workDescription: t })}
          onImage={() => onPickImage('work')}
          onRemoveImage={() => onChange({ workImage: null })}
        >
          <ValueRow id="work" icon="timer" label="Work" hideLabel kind="duration" min={1} value={draft.work} onChange={(v) => onChange({ work: v })} />
        </PhaseSection>
        <PhaseSection
          id="rest"
          icon="rest"
          label="Rest"
          description={draft.restDescription}
          image={draft.restImage}
          onDescription={(t) => onChange({ restDescription: t })}
          onImage={() => onPickImage('rest')}
          onRemoveImage={() => onChange({ restImage: null })}
        >
          <ValueRow id="rest" icon="timer" label="Rest" hideLabel kind="duration" min={0} value={draft.rest} onChange={(v) => onChange({ rest: v })} />
        </PhaseSection>
        {num('cycles', 'repeat', 'Cycles', 'count', 1)}
        {num('sets', 'sets', 'Sets', 'count', 1)}
        {num('restBetweenSets', 'seat', 'Rest between sets', 'duration', 0)}
        {num('coolDown', 'sofa', 'Cool down', 'duration', 0)}
      </main>
      <footer className="bottom-actions">
        <button className="square-btn" onClick={onList} aria-label="Workout list" title="Workout list">
          <Icon name="list" />
        </button>
        <button className="start-btn" onClick={onStart}>
          <Icon name="play" />
          <span className="start-label">START</span>
        </button>
        <button className="square-btn" onClick={onNew} aria-label="New workout" title="New workout">
          <Icon name="add" />
        </button>
      </footer>
    </div>
  )
}

function PhaseSection({
  id,
  icon,
  label,
  description,
  image,
  onDescription,
  onImage,
  onRemoveImage,
  children
}: {
  id: string
  icon: IconName
  label: string
  description: string
  image: string | null
  onDescription: (t: string) => void
  onImage: () => void
  onRemoveImage: () => void
  children: React.ReactNode
}): React.JSX.Element {
  return (
    <section className="field phase-field" aria-labelledby={`${id}-label`}>
      <div className="field-icon">
        <Icon name={icon} />
      </div>
      <div className="field-main">
        <div className="field-label" id={`${id}-label`}>
          {label}
        </div>
        <input
          className="description"
          dir="auto"
          placeholder="Add description"
          aria-label={`${label} description`}
          maxLength={200}
          value={description}
          onChange={(e) => onDescription(e.target.value)}
        />
        {image && (
          <div className="image-preview">
            <img src={assetUrl(image)} alt={`${label} image`} />
            <button className="text-btn small" onClick={onRemoveImage}>
              Remove image
            </button>
          </div>
        )}
      </div>
      <IconButton icon="image" label={image ? `Change ${label.toLowerCase()} image` : `Add ${label.toLowerCase()} image`} className="image-btn" onClick={onImage} />
      {children}
    </section>
  )
}

function ValueRow({
  id,
  icon,
  label,
  hideLabel,
  kind,
  min,
  value,
  onChange
}: {
  id: string
  icon: IconName
  label: string
  hideLabel?: boolean
  kind: 'duration' | 'count'
  min: number
  value: number
  onChange: (v: number) => void
}): React.JSX.Element {
  const max = kind === 'duration' ? MAX_DURATION : MAX_COUNT
  const fmt = (v: number): string => (kind === 'duration' ? formatDuration(v) : String(v))
  const [text, setText] = useState(fmt(value))
  const [error, setError] = useState<string | null>(null)
  const [focused, setFocused] = useState(false)
  const valueRef = useRef(value)
  valueRef.current = value
  const repeat = useRef<{ t: ReturnType<typeof setTimeout> | null; n: number }>({ t: null, n: 0 })

  useEffect(() => {
    if (!focused) setText(fmt(value))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, focused])

  const commit = (): void => {
    const parsed = kind === 'duration' ? parseDuration(text) : parseCount(text)
    if (parsed === null || parsed < min || parsed > max) {
      setError(
        kind === 'duration'
          ? `Enter seconds or mm:ss${min > 0 ? ' greater than 0' : ''} (max 24:00:00)`
          : `Enter a whole number from 1 to ${MAX_COUNT}`
      )
      setText(fmt(value))
      return
    }
    setError(null)
    if (parsed !== value) onChange(parsed)
    setText(fmt(parsed))
  }

  const step = (dir: 1 | -1): void => {
    const n = repeat.current.n
    const size = kind === 'count' ? 1 : n > 40 ? 10 : n > 15 ? 5 : 1
    const next = Math.min(max, Math.max(min, valueRef.current + dir * size))
    if (next !== valueRef.current) {
      setError(null)
      valueRef.current = next
      onChange(next)
    }
  }
  const startHold = (dir: 1 | -1): void => {
    stopHold()
    repeat.current.n = 0
    step(dir)
    const loop = (delay: number): void => {
      repeat.current.t = setTimeout(() => {
        repeat.current.n++
        step(dir)
        loop(70)
      }, delay)
    }
    loop(450)
  }
  const stopHold = (): void => {
    if (repeat.current.t) clearTimeout(repeat.current.t)
    repeat.current.t = null
  }
  useEffect(() => stopHold, [])

  const stepBtn = (dir: 1 | -1): React.JSX.Element => {
    const disabled = dir < 0 ? value <= min : value >= max
    return (
      <button
        type="button"
        className="step-btn"
        aria-label={`${dir < 0 ? 'Decrease' : 'Increase'} ${label}`}
        disabled={disabled}
        onPointerDown={(e) => {
          if (e.button === 0) startHold(dir)
        }}
        onPointerUp={stopHold}
        onPointerLeave={stopHold}
        onPointerCancel={stopHold}
        onClick={(e) => {
          // Keyboard activation (pointer presses are handled on pointerdown).
          if (e.detail === 0) step(dir)
        }}
      >
        <Icon name={dir < 0 ? 'removeCircle' : 'addCircle'} />
      </button>
    )
  }

  const inner = (
    <>
      {!hideLabel && (
        <label className="field-label" htmlFor={`input-${id}`}>
          {label}
        </label>
      )}
      <div className="value-row">
        {stepBtn(-1)}
        <input
          id={`input-${id}`}
          className={`value-input ${error ? 'invalid' : ''}`}
          inputMode="numeric"
          aria-label={hideLabel ? `${label} duration` : undefined}
          aria-invalid={!!error}
          aria-describedby={error ? `err-${id}` : undefined}
          value={text}
          onFocus={(e) => {
            setFocused(true)
            e.currentTarget.select()
          }}
          onBlur={() => {
            setFocused(false)
            commit()
          }}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') e.currentTarget.blur()
            else if (e.key === 'Escape') {
              setText(fmt(value))
              setError(null)
            } else if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
              e.preventDefault()
              repeat.current.n = 0
              step(e.key === 'ArrowUp' ? 1 : -1)
              setText(fmt(valueRef.current))
            }
          }}
        />
        {stepBtn(1)}
      </div>
      {error && (
        <div className="field-error" id={`err-${id}`} role="alert">
          {error}
        </div>
      )}
    </>
  )

  if (hideLabel)
    return (
      <div className="value-sub">
        <div className="field-icon sub-icon">
          <Icon name={icon} />
        </div>
        <div className="field-main">{inner}</div>
      </div>
    )
  return (
    <section className="field">
      <div className="field-icon">
        <Icon name={icon} />
      </div>
      <div className="field-main">{inner}</div>
    </section>
  )
}
