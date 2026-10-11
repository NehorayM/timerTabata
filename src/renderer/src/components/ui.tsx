import { createContext, useCallback, useContext, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { Icon, type IconName } from './Icon'

// ---- Modal dialog ------------------------------------------------------------------------

export function Modal({
  title,
  onClose,
  children,
  actions,
  labelledBy = 'modal-title'
}: {
  title: string
  onClose: () => void
  children?: ReactNode
  actions: ReactNode
  labelledBy?: string
}): React.JSX.Element {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null
    const el = ref.current
    const first = el?.querySelector<HTMLElement>('[data-autofocus], input, textarea, select, button.primary, button')
    first?.focus()
    return () => prev?.focus?.()
  }, [])
  const onKey = (e: React.KeyboardEvent): void => {
    if (e.key === 'Escape') {
      e.stopPropagation()
      onClose()
    }
    if (e.key === 'Tab' && ref.current) {
      const f = [...ref.current.querySelectorAll<HTMLElement>('button, input, textarea, select, [tabindex="0"]')].filter((x) => !x.hasAttribute('disabled'))
      if (f.length === 0) return
      const i = f.indexOf(document.activeElement as HTMLElement)
      if (e.shiftKey && i <= 0) {
        e.preventDefault()
        f[f.length - 1].focus()
      } else if (!e.shiftKey && i === f.length - 1) {
        e.preventDefault()
        f[0].focus()
      }
    }
  }
  return (
    <div className="scrim" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="dialog" role="dialog" aria-modal="true" aria-labelledby={labelledBy} ref={ref} onKeyDown={onKey}>
        <h2 id={labelledBy}>{title}</h2>
        <div className="dialog-body">{children}</div>
        <div className="dialog-actions">{actions}</div>
      </div>
    </div>
  )
}

// ---- Promise-based choice dialogs -----------------------------------------------------------

export interface Choice<T> {
  label: string
  value: T
  primary?: boolean
  danger?: boolean
}

interface PendingChoice {
  title: string
  message: ReactNode
  choices: Choice<unknown>[]
  cancelValue: unknown
  resolve: (v: unknown) => void
}

interface UiApi {
  choose<T>(title: string, message: ReactNode, choices: Choice<T>[], cancelValue: T): Promise<T>
  confirm(title: string, message: ReactNode, okLabel?: string, danger?: boolean): Promise<boolean>
  notify(text: string): void
}

const UiCtx = createContext<UiApi | null>(null)

export function useUi(): UiApi {
  const v = useContext(UiCtx)
  if (!v) throw new Error('UiProvider missing')
  return v
}

export function UiProvider({ children }: { children: ReactNode }): React.JSX.Element {
  const [queue, setQueue] = useState<PendingChoice[]>([])
  const [toast, setToast] = useState<{ id: number; text: string } | null>(null)

  const choose = useCallback(<T,>(title: string, message: ReactNode, choices: Choice<T>[], cancelValue: T) => {
    return new Promise<T>((resolve) => {
      setQueue((q) => [...q, { title, message, choices: choices as Choice<unknown>[], cancelValue, resolve: resolve as (v: unknown) => void }])
    })
  }, [])
  const confirm = useCallback(
    (title: string, message: ReactNode, okLabel = 'OK', danger = false) =>
      choose(title, message, [{ label: 'Cancel', value: false }, { label: okLabel, value: true, primary: true, danger }], false),
    [choose]
  )
  const notify = useCallback((text: string) => setToast({ id: Date.now() + Math.random(), text }), [])

  useEffect(() => {
    if (!toast) return
    const t = setTimeout(() => setToast(null), 4000)
    return () => clearTimeout(t)
  }, [toast])

  const current = queue[0]
  const finish = (v: unknown): void => {
    current?.resolve(v)
    setQueue((q) => q.slice(1))
  }

  return (
    <UiCtx.Provider value={{ choose, confirm, notify }}>
      {children}
      {current && (
        <Modal
          title={current.title}
          onClose={() => finish(current.cancelValue)}
          labelledBy="choice-title"
          actions={current.choices.map((c) => (
            <button
              key={c.label}
              className={`text-btn ${c.primary ? 'primary' : ''} ${c.danger ? 'danger' : ''}`}
              data-autofocus={c.primary ? true : undefined}
              onClick={() => finish(c.value)}
            >
              {c.label}
            </button>
          ))}
        >
          <div className="dialog-message">{current.message}</div>
        </Modal>
      )}
      <div className="toast-region" aria-live="polite" role="status">
        {toast && (
          <div className="toast" key={toast.id}>
            <bdi>{toast.text}</bdi>
          </div>
        )}
      </div>
    </UiCtx.Provider>
  )
}

// ---- Popup menu ------------------------------------------------------------------------------

export interface MenuItem {
  label: string
  icon?: IconName
  onSelect: () => void
  checked?: boolean
  disabled?: boolean
  role?: 'menuitem' | 'menuitemradio' | 'menuitemcheckbox'
}

export function PopupMenu({
  anchor,
  items,
  onClose,
  label
}: {
  anchor: HTMLElement
  items: MenuItem[]
  onClose: () => void
  label: string
}): React.JSX.Element {
  const ref = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState<{ top: number; right: number } | null>(null)
  const closeRef = useRef(onClose)
  closeRef.current = onClose
  useLayoutEffect(() => {
    const r = anchor.getBoundingClientRect()
    const menuH = ref.current?.offsetHeight ?? 0
    const vw = window.innerWidth
    const vh = window.innerHeight
    // Like the reference popup: just below the anchor, right-aligned near the card edge.
    let top = r.bottom - 2
    if (top + menuH > vh - 8) top = Math.max(8, vh - 8 - menuH)
    setPos({ top, right: Math.max(7, vw - r.right - 23) })
  }, [anchor])
  const positioned = pos !== null
  useEffect(() => {
    if (positioned) ref.current?.querySelector<HTMLElement>('[role^="menuitem"]:not([disabled])')?.focus()
  }, [positioned])
  useEffect(() => {
    const menuEl = ref.current
    const onDown = (e: MouseEvent): void => {
      if (!menuEl?.contains(e.target as Node) && !anchor.contains(e.target as Node)) closeRef.current()
    }
    const onResize = (): void => closeRef.current()
    window.addEventListener('mousedown', onDown)
    window.addEventListener('resize', onResize)
    return () => {
      window.removeEventListener('mousedown', onDown)
      window.removeEventListener('resize', onResize)
      if (menuEl?.contains(document.activeElement) || document.activeElement === document.body) anchor.focus()
    }
  }, [anchor])
  const onKey = (e: React.KeyboardEvent): void => {
    const els = [...(ref.current?.querySelectorAll<HTMLElement>('[role^="menuitem"]:not([disabled])') ?? [])]
    const i = els.indexOf(document.activeElement as HTMLElement)
    if (e.key === 'ArrowDown') els[(i + 1) % els.length]?.focus()
    else if (e.key === 'ArrowUp') els[(i - 1 + els.length) % els.length]?.focus()
    else if (e.key === 'Home') els[0]?.focus()
    else if (e.key === 'End') els[els.length - 1]?.focus()
    else if (e.key === 'Escape' || e.key === 'Tab') {
      e.stopPropagation()
      onClose()
    } else return
    e.preventDefault()
  }
  return (
    <div
      className="menu"
      role="menu"
      aria-label={label}
      ref={ref}
      style={pos ? { top: pos.top, right: pos.right } : { visibility: 'hidden' }}
      onKeyDown={onKey}
    >
      {items.map((it) => (
        <button
          key={it.label}
          role={it.role ?? 'menuitem'}
          aria-checked={it.role && it.role !== 'menuitem' ? !!it.checked : undefined}
          className="menu-item"
          disabled={it.disabled}
          onClick={() => {
            onClose()
            it.onSelect()
          }}
        >
          {it.icon ? <Icon name={it.icon} /> : <span className="icon menu-check">{it.checked ? <Icon name="check" /> : null}</span>}
          <span>{it.label}</span>
        </button>
      ))}
    </div>
  )
}

export function IconButton({
  icon,
  label,
  onClick,
  className,
  disabled,
  pressed,
  id
}: {
  icon: IconName
  label: string
  onClick?: (e: React.MouseEvent<HTMLButtonElement>) => void
  className?: string
  disabled?: boolean
  pressed?: boolean
  id?: string
}): React.JSX.Element {
  return (
    <button
      type="button"
      id={id}
      className={`icon-btn ${className ?? ''}`}
      aria-label={label}
      title={label}
      onClick={onClick}
      disabled={disabled}
      aria-pressed={pressed}
    >
      <Icon name={icon} />
    </button>
  )
}
