import fs from 'node:fs'
import path from 'node:path'

export interface LauncherInfo {
  /** Executable to run (packaged app, AppImage, or electron binary in development). */
  exec: string
  /** Extra leading args (the app path when running unpackaged). */
  args: string[]
  icon: string
}

export function workoutArg(id: string): string {
  return `--workout=${id}`
}

/** Extracts a workout id from a command line. */
export function parseWorkoutArg(argv: readonly string[]): string | null {
  for (const a of argv) {
    const m = a.match(/^--workout=([A-Za-z0-9_-]{1,64})$/)
    if (m) return m[1]
  }
  return null
}

export function safeFileName(name: string): string {
  // eslint-disable-next-line no-control-regex
  const cleaned = name.replace(/[\\/:*?"<>|\u0000-\u001f]/g, '_').replace(/\s+/g, ' ').trim()
  return (cleaned || 'Workout').slice(0, 60)
}

/** Quotes an argument for the Exec key of a .desktop file (freedesktop Desktop Entry spec). */
function desktopQuote(arg: string): string {
  if (/^[A-Za-z0-9_@%+=:,./-]+$/.test(arg)) return arg
  return `"${arg.replace(/(["`$\\])/g, '\\$1')}"`
}

export function linuxDesktopEntry(name: string, id: string, l: LauncherInfo): string {
  const exec = [l.exec, ...l.args, workoutArg(id)].map(desktopQuote).join(' ').replace(/%/g, '%%')
  return [
    '[Desktop Entry]',
    'Type=Application',
    'Version=1.0',
    `Name=${name.replace(/[\r\n]/g, ' ')} – TimerTabata`,
    'Comment=Open this workout in TimerTabata',
    `Exec=${exec}`,
    `Icon=${l.icon}`,
    'Terminal=false',
    'Categories=Utility;Sports;',
    ''
  ].join('\n')
}

export function writeLinuxDesktopEntry(dir: string, name: string, id: string, l: LauncherInfo): string {
  fs.mkdirSync(dir, { recursive: true })
  const file = path.join(dir, `timertabata-workout-${id}.desktop`)
  fs.writeFileSync(file, linuxDesktopEntry(name, id, l), { mode: 0o755 })
  return file
}
