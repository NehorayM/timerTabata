import { useCallback, useEffect, useRef, useState } from 'react'
import { formatDuration } from '../../shared/format'
import type { OpenWorkoutRequest } from '../../shared/ipc'
import type { SessionCheckpoint, Settings, Workout } from '../../shared/types'
import { CARD_COLORS, newWorkout } from '../../shared/workout'
import { playSound } from './audio'
import { Modal, useUi } from './components/ui'
import { api, useApiEvent, useSession, useSettings, useWorkouts } from './hooks'
import { Editor } from './screens/Editor'
import { History, NotesDialog, Preview, SettingsScreen, WorkoutMetaDialog } from './screens/Secondary'
import { Timer, phaseLabel, sessionColor } from './screens/Timer'
import { WorkoutList, type CardActions } from './screens/WorkoutList'

type Route =
  | { name: 'list' }
  | { name: 'editor' }
  | { name: 'timer' }
  | { name: 'preview'; workout: Workout; back: Route }
  | { name: 'settings'; back: Route }
  | { name: 'history'; workout: Workout | null; back: Route }

interface EditorState {
  original: Workout | null
  draft: Workout
}

type DialogState = { kind: 'meta' | 'notes'; workout: Workout; target: 'draft' | 'saved' } | null

const EDITABLE: (keyof Workout)[] = [
  'name', 'color', 'prepare', 'work', 'rest', 'cycles', 'sets', 'restBetweenSets', 'coolDown',
  'workDescription', 'restDescription', 'workImage', 'restImage'
]
const editableKey = (w: Workout): string => JSON.stringify(EDITABLE.map((k) => w[k]))

export function App(): React.JSX.Element {
  const ui = useUi()
  const workouts = useWorkouts()
  const settings = useSettings()
  const session = useSession()
  const [route, setRoute] = useState<Route | null>(null)
  const [editor, setEditor] = useState<EditorState | null>(null)
  const [dialog, setDialog] = useState<DialogState>(null)
  const [recovery, setRecovery] = useState<SessionCheckpoint | null>(null)
  const settingsRef = useRef<Settings | null>(null)
  settingsRef.current = settings

  const dirty = !!editor && (!editor.original || editableKey(editor.original) !== editableKey(editor.draft))
  const locked = !!session?.locked

  // ---- sounds (played only by the main window) ----
  useApiEvent('sound', (ev) => settingsRef.current && playSound(ev, settingsRef.current))
  useEffect(() => {
    const test = (): void => {
      if (settingsRef.current) playSound({ kind: 'transition', type: 'work' }, { ...settingsRef.current, muted: false })
    }
    window.addEventListener('tt-test-sound', test)
    return () => window.removeEventListener('tt-test-sound', test)
  }, [])
  useApiEvent('notice', (t) => ui.notify(t))

  // ---- editor helpers ----
  const openEditor = useCallback((w: Workout) => {
    setEditor({ original: w, draft: w })
    setRoute({ name: 'editor' })
  }, [])

  const saveDraft = async (): Promise<Workout | null> => {
    if (!editor) return null
    const r = await api.saveWorkout(editor.draft)
    if (!r.ok) {
      ui.notify(`Not saved: ${r.error}`)
      return null
    }
    setEditor({ original: r.value, draft: r.value })
    void api.updateSettings({ lastWorkoutId: r.value.id })
    ui.notify('Workout saved')
    return r.value
  }

  /** Resolves true when it is OK to leave the editor (saved, discarded or clean). */
  const guardEditor = async (): Promise<boolean> => {
    if (!editor || !dirty) return true
    const choice = await ui.choose(
      'Unsaved changes',
      <>
        Save changes to “<bdi>{editor.draft.name}</bdi>”?
      </>,
      [
        { label: 'Cancel', value: 'cancel' },
        { label: 'Discard', value: 'discard', danger: true },
        { label: 'Save', value: 'save', primary: true }
      ],
      'cancel'
    )
    if (choice === 'cancel') return false
    if (choice === 'save') return (await saveDraft()) !== null
    setEditor(editor.original ? { original: editor.original, draft: editor.original } : null)
    return true
  }

  const createWorkout = async (): Promise<void> => {
    if (!(await guardEditor())) return
    const color = CARD_COLORS[(workouts?.length ?? 0) % CARD_COLORS.length]
    setEditor({ original: null, draft: newWorkout(crypto.randomUUID(), Date.now(), color) })
    setRoute({ name: 'editor' })
  }

  // ---- sessions ----
  const startWorkout = async (id: string): Promise<void> => {
    let r = await api.startSession(id, false)
    if (!r.ok && r.error === 'active') {
      const ok = await ui.confirm('Replace current workout?', 'A workout is already in progress. Stop it and start this one?', 'Replace')
      if (!ok) return
      r = await api.startSession(id, true)
    }
    if (r.ok) setRoute({ name: 'timer' })
    else ui.notify(r.error === 'locked' ? 'Unlock the running timer first' : r.error === 'not-found' ? 'Workout not found' : 'Could not start')
  }

  const startFromEditor = async (): Promise<void> => {
    if (!editor) return
    let id = editor.original?.id ?? null
    if (dirty) {
      const choice = await ui.choose(
        'Save before starting?',
        'The timer runs the saved workout.',
        [
          { label: 'Cancel', value: 'cancel' },
          ...(editor.original ? [{ label: 'Start last saved', value: 'saved' }] : []),
          { label: 'Save & start', value: 'save', primary: true }
        ],
        'cancel'
      )
      if (choice === 'cancel') return
      if (choice === 'save') id = (await saveDraft())?.id ?? null
    }
    if (id) await startWorkout(id)
  }

  const handleOpen = useCallback(
    async (req: OpenWorkoutRequest | null) => {
      if (!req) return
      const s = await api.getSession()
      if (s?.locked) {
        ui.notify('Unlock the timer to open another workout')
        setRoute({ name: 'timer' })
        return
      }
      const w = (await api.listWorkouts()).find((x) => x.id === req.workoutId)
      if (!w) {
        ui.notify('The workout for this shortcut no longer exists')
        setRoute((r) => r ?? { name: 'list' })
        return
      }
      if (!(await guardEditorRef.current())) return
      openEditor(w)
    },
    [openEditor, ui]
  )
  const guardEditorRef = useRef(guardEditor)
  guardEditorRef.current = guardEditor
  useApiEvent('open-workout', (req) => void handleOpen(req))

  // ---- initial route ----
  const initialized = useRef(false)
  useEffect(() => {
    if (initialized.current || !workouts || !settings || session === undefined) return
    initialized.current = true
    if (session && session.status !== 'finished') setRoute({ name: 'timer' })
    else {
      const last = workouts.find((w) => w.id === settings.lastWorkoutId)
      if (last) openEditor(last)
      else setRoute({ name: 'list' })
    }
    void api.getRecovery().then(setRecovery)
    void api.takePendingOpen().then((r) => handleOpen(r))
    void api.getProblems().then((p) => p.forEach((m) => ui.notify(`Data recovered: ${m}`)))
  }, [workouts, settings, session, openEditor, handleOpen, ui])

  // ---- keep editor in sync with external changes (favorite/notes/rename from the list) ----
  useEffect(() => {
    if (!workouts) return
    setEditor((e) => {
      if (!e?.original) return e
      const fresh = workouts.find((w) => w.id === e.original!.id)
      if (!fresh || fresh.updatedAt === e.original.updatedAt && fresh.lastUsedAt === e.original.lastUsedAt) return e
      const wasDirty = editableKey(e.original) !== editableKey(e.draft)
      const meta = { favorite: fresh.favorite, notes: fresh.notes, lastUsedAt: fresh.lastUsedAt, updatedAt: fresh.updatedAt, createdAt: fresh.createdAt }
      return { original: fresh, draft: wasDirty ? { ...e.draft, ...meta } : fresh }
    })
  }, [workouts])

  // ---- lock forces the timer; ending a session leaves the timer ----
  useEffect(() => {
    if (!route) return
    if (session?.locked && route.name !== 'timer') setRoute({ name: 'timer' })
    else if (session === null && route.name === 'timer') setRoute(editor ? { name: 'editor' } : { name: 'list' })
    else if (route.name === 'editor' && !editor) setRoute({ name: 'list' })
  }, [session, route, editor])

  if (!route || !workouts || !settings || session === undefined) return <div className="loading" aria-busy="true" />

  const cardActions: CardActions = {
    edit: async (w) => {
      if (editor?.original?.id !== w.id && !(await guardEditor())) return
      openEditor(editor?.original?.id === w.id ? editor.original : w)
    },
    preview: (w) => setRoute({ name: 'preview', workout: w, back: route }),
    settings: (w) => setDialog({ kind: 'meta', workout: w, target: 'saved' }),
    notes: (w) => setDialog({ kind: 'notes', workout: w, target: 'saved' }),
    favorite: async (w) => {
      const r = await api.setFavorite(w.id, !w.favorite)
      ui.notify(r.ok ? (r.value.favorite ? 'Added to favorites' : 'Removed from favorites') : r.error)
    },
    copy: async (w) => {
      const r = await api.copyWorkout(w.id)
      ui.notify(r.ok ? `Copied as “${r.value.name}”` : r.error)
    },
    share: async (w) => {
      const r = await api.exportWorkout(w.id)
      if (!r.ok) ui.notify(r.error)
      else if (r.value) ui.notify(`Exported to ${r.value}`)
    },
    shortcut: async (w) => {
      const r = await api.createShortcut(w.id)
      ui.notify(r.ok ? `Shortcut created: ${r.value}` : r.error)
    },
    remove: async (w) => {
      const ok = await ui.confirm('Delete workout?', <>“<bdi>{w.name}</bdi>” will be permanently deleted.</>, 'Delete', true)
      if (!ok) return
      const r = await api.deleteWorkout(w.id)
      if (!r.ok) return ui.notify(r.error)
      if (editor?.original?.id === w.id) setEditor(null)
      ui.notify('Workout deleted')
    },
    start: (w) => void startWorkout(w.id)
  }

  const importWorkout = async (): Promise<void> => {
    const r = await api.importWorkout()
    if (!r.ok) ui.notify(`Import failed: ${r.error}`)
    else if (r.value) {
      ui.notify(`Imported “${r.value.name}”`)
      setRoute({ name: 'list' })
    }
  }

  const goList = async (): Promise<void> => {
    if (await guardEditor()) setRoute({ name: 'list' })
  }

  let screen: React.JSX.Element
  switch (route.name) {
    case 'timer':
      screen = session ? (
        <Timer view={session} settings={settings} onNotify={ui.notify} onBack={() => setRoute(editor ? { name: 'editor' } : { name: 'list' })} />
      ) : (
        <div className="loading" />
      )
      break
    case 'editor':
      screen = editor ? (
        <Editor
          draft={editor.draft}
          dirty={dirty}
          locked={locked}
          onChange={(patch) => setEditor((e) => (e ? { ...e, draft: { ...e.draft, ...patch } } : e))}
          onSave={() => void saveDraft()}
          onPreview={() => setRoute({ name: 'preview', workout: editor.draft, back: route })}
          onHistory={() => setRoute({ name: 'history', workout: editor.original, back: route })}
          onSettings={() => setRoute({ name: 'settings', back: route })}
          onEditMeta={() => setDialog({ kind: 'meta', workout: editor.draft, target: 'draft' })}
          onList={() => void goList()}
          onStart={() => void startFromEditor()}
          onNew={() => void createWorkout()}
          onPickImage={async (which) => {
            const r = await api.pickImage()
            if (!r.ok) ui.notify(r.error)
            else if (r.value) setEditor((e) => (e ? { ...e, draft: { ...e.draft, [which === 'work' ? 'workImage' : 'restImage']: r.value } } : e))
          }}
        />
      ) : (
        <div className="loading" />
      )
      break
    case 'preview':
      screen = (
        <Preview
          workout={route.workout}
          restColor={settings.restColor}
          onBack={() => setRoute(route.back)}
          onStart={async () => {
            const saved = workouts.find((w) => w.id === route.workout.id)
            if (!saved) return ui.notify('Save the workout before starting it')
            if (editor?.draft.id === saved.id && dirty) return void startFromEditor()
            await startWorkout(saved.id)
          }}
        />
      )
      break
    case 'settings':
      screen = <SettingsScreen settings={settings} onBack={() => setRoute(route.back)} onImport={() => void importWorkout()} />
      break
    case 'history':
      screen = <History workout={route.workout} onBack={() => setRoute(route.back)} />
      break
    default:
      screen = (
        <WorkoutList
          workouts={workouts}
          settings={settings}
          actions={cardActions}
          onBack={editor ? () => setRoute({ name: 'editor' }) : null}
          onSettings={() => setRoute({ name: 'settings', back: route })}
          onCreate={() => void createWorkout()}
          onImport={() => void importWorkout()}
          onSortChange={(p) => void api.updateSettings(p)}
        />
      )
  }

  return (
    <div className="app">
      {screen}
      {session && route.name !== 'timer' && (
        <button className="session-banner" style={{ background: sessionColor(session, settings) }} onClick={() => setRoute({ name: 'timer' })}>
          <span>
            {phaseLabel(session)} {session.status === 'finished' ? '' : formatDuration(session.displaySeconds)}
            {session.status === 'paused' ? ' (paused)' : ''}
          </span>
          <span className="banner-action">Return to timer</span>
        </button>
      )}
      {dialog?.kind === 'meta' && (
        <WorkoutMetaDialog
          workout={dialog.workout}
          onClose={() => setDialog(null)}
          onSave={async (patch) => {
            setDialog(null)
            if (dialog.target === 'draft') setEditor((e) => (e ? { ...e, draft: { ...e.draft, ...patch } } : e))
            else {
              const r = await api.saveWorkout({ ...dialog.workout, ...patch })
              ui.notify(r.ok ? 'Workout updated' : r.error)
            }
          }}
        />
      )}
      {dialog?.kind === 'notes' && (
        <NotesDialog
          workout={dialog.workout}
          onClose={() => setDialog(null)}
          onSave={async (notes) => {
            setDialog(null)
            const r = await api.setNotes(dialog.workout.id, notes)
            ui.notify(r.ok ? 'Notes saved' : r.error)
          }}
        />
      )}
      {recovery && !session && (
        <Modal
          title="Resume interrupted workout?"
          onClose={() => {
            setRecovery(null)
            void api.resolveRecovery(false)
          }}
          actions={
            <>
              <button
                className="text-btn danger"
                onClick={() => {
                  setRecovery(null)
                  void api.resolveRecovery(false)
                }}
              >
                Discard
              </button>
              <button
                className="text-btn primary"
                onClick={() => {
                  setRecovery(null)
                  void api.resolveRecovery(true).then(() => setRoute({ name: 'timer' }))
                }}
              >
                Resume (paused)
              </button>
            </>
          }
        >
          <RecoveryInfo cp={recovery} />
        </Modal>
      )}
    </div>
  )
}

function RecoveryInfo({ cp }: { cp: SessionCheckpoint }): React.JSX.Element {
  return (
    <p className="dialog-message">
      “<bdi>{cp.workout.name}</bdi>” was interrupted at interval {cp.index + 1} with {formatDuration(Math.ceil(cp.remainingMs / 1000))} remaining. It
      will resume paused from the last saved checkpoint ({new Date(cp.savedAt).toLocaleTimeString()}).
    </p>
  )
}

