import type { ShortcutAction, ShortcutStatus } from '../shared/types'

export const SHORTCUT_ACTIONS: ShortcutAction[] = ['toggle', 'next', 'previous', 'stop', 'show']

export interface ShortcutRegistrar {
  register(accelerator: string, cb: () => void): boolean
  unregisterAll(): void
}

const MODIFIERS = new Set(['CommandOrControl', 'CmdOrCtrl', 'Control', 'Ctrl', 'Alt', 'Option', 'AltGr', 'Shift', 'Super', 'Meta', 'Command', 'Cmd'])

/** Rejects accelerators that would swallow normal typing (no modifier) or are malformed. */
export function checkAccelerator(acc: string): string | null {
  const parts = acc.split('+').map((p) => p.trim())
  if (!acc.trim()) return 'Empty shortcut'
  if (parts.some((p) => p === '')) return 'Malformed shortcut'
  const mods = parts.slice(0, -1)
  const key = parts[parts.length - 1]
  if (mods.length === 0 || !mods.every((m) => MODIFIERS.has(m))) return 'Use at least one modifier (Ctrl, Alt, Shift, Super)'
  if (MODIFIERS.has(key)) return 'Shortcut needs a non-modifier key'
  if (new Set(mods).size !== mods.length) return 'Repeated modifier'
  return null
}

const normalize = (acc: string): string => {
  const parts = acc.split('+').map((p) => p.trim().toLowerCase().replace(/^(cmdorctrl|commandorcontrol|ctrl|control)$/, 'ctrl'))
  const key = parts.pop() ?? ''
  return [...parts.sort(), key].join('+')
}

/**
 * Registers enabled global shortcuts, reporting duplicates within the app and
 * collisions with other applications (register() returning false) per action.
 */
export function registerGlobalShortcuts(
  reg: ShortcutRegistrar,
  enabled: boolean,
  map: Record<ShortcutAction, string>,
  handler: (a: ShortcutAction) => void
): ShortcutStatus[] {
  reg.unregisterAll()
  const seen = new Map<string, ShortcutAction>()
  return SHORTCUT_ACTIONS.map((action) => {
    const accelerator = map[action] ?? ''
    if (!enabled) return { action, accelerator, ok: false, error: 'Global shortcuts are disabled' }
    if (!accelerator) return { action, accelerator, ok: false, error: 'Not set' }
    const invalid = checkAccelerator(accelerator)
    if (invalid) return { action, accelerator, ok: false, error: invalid }
    const key = normalize(accelerator)
    const dup = seen.get(key)
    if (dup) return { action, accelerator, ok: false, error: `Same shortcut as "${dup}"` }
    seen.set(key, action)
    let ok = false
    try {
      ok = reg.register(accelerator, () => handler(action))
    } catch {
      return { action, accelerator, ok: false, error: 'Invalid shortcut' }
    }
    return ok ? { action, accelerator, ok } : { action, accelerator, ok, error: 'Already used by another application or not permitted by the desktop' }
  })
}
