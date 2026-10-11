import { execFile } from 'node:child_process'
import type { Capabilities } from '../shared/types'

export type DisplayServer = Capabilities['displayServer']

/** The --ozone-platform value given on the real command line (read by Electron before app code runs). */
export function ozoneFromArgv(argv: readonly string[]): string {
  for (const a of argv) {
    const m = a.match(/^--ozone-platform=([\w-]+)$/)
    if (m) return m[1]
  }
  return ''
}

/**
 * "Use X11" must be decided before Chromium starts: appending --ozone-platform at runtime only
 * reaches child processes (the GPU process then draws via X11 into a Wayland window and nothing
 * appears). So on a Wayland session the app relaunches itself once with the switch.
 */
export function needsX11Relaunch(platform: string, env: NodeJS.ProcessEnv, argv: readonly string[], preferX11: boolean): boolean {
  const wayland = env.XDG_SESSION_TYPE === 'wayland' || !!env.WAYLAND_DISPLAY
  return platform === 'linux' && preferX11 && wayland && ozoneFromArgv(argv) === '' && env.TT_NO_RELAUNCH !== '1'
}

/** Which display server Electron actually renders through (X11 via XWayland counts as X11 for window features). */
export function detectDisplayServer(env: NodeJS.ProcessEnv, platform: string, ozoneSwitch: string): DisplayServer {
  if (platform === 'win32') return 'windows'
  if (platform !== 'linux') return 'other'
  const waylandSession = env.XDG_SESSION_TYPE === 'wayland' || !!env.WAYLAND_DISPLAY
  if (!waylandSession) return 'x11'
  // Electron >= 38 uses native Wayland in Wayland sessions unless forced to X11.
  return ozoneSwitch === 'x11' ? 'xwayland' : 'wayland'
}

/** Checks for a StatusNotifier host (KDE, GNOME + AppIndicator extension, XFCE, Cinnamon...). */
export function hasStatusNotifierWatcher(): Promise<boolean> {
  return new Promise((resolve) => {
    execFile(
      'dbus-send',
      [
        '--session',
        '--print-reply',
        '--dest=org.freedesktop.DBus',
        '/org/freedesktop/DBus',
        'org.freedesktop.DBus.NameHasOwner',
        'string:org.kde.StatusNotifierWatcher'
      ],
      { timeout: 1500 },
      (err, stdout) => resolve(!err && /boolean true/.test(stdout))
    )
  })
}

export function buildCapabilities(platform: string, display: DisplayServer, trayWatcher: boolean | null): Capabilities {
  const tray =
    platform === 'linux'
      ? trayWatcher
        ? { available: true, note: 'StatusNotifier tray host detected.' }
        : {
            available: false,
            note:
              'No StatusNotifier tray host detected (e.g. GNOME without the AppIndicator extension). ' +
              'Closing the window minimizes it instead; launching the app again restores it.'
          }
      : { available: true, note: 'System tray (notification area).' }
  const alwaysOnTop =
    display === 'wayland'
      ? {
          available: false,
          note:
            'Native Wayland compositors do not let apps keep themselves on top. Enable "Use X11 (XWayland)" ' +
            'in Settings and restart, or use your compositor\'s own "Always on top" window rule.'
        }
      : display === 'xwayland'
        ? { available: true, note: 'Running through XWayland; most compositors honour always-on-top for X11 windows.' }
        : { available: true, note: 'Native always-on-top window level.' }
  const globalShortcuts =
    display === 'wayland'
      ? {
          available: false,
          note:
            'Wayland blocks global key grabs; shortcuts may only work through the desktop portal or via XWayland. ' +
            'In-app keyboard controls always work.'
        }
      : { available: true, note: 'Registered system-wide; conflicts with other apps are reported per shortcut.' }
  return { platform, displayServer: display, tray, alwaysOnTop, globalShortcuts }
}
