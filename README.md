# TimerTabata

Offline interval / Tabata timer for **Windows and Linux**, built with Electron + React + TypeScript.
The UI reproduces the reference Android screenshots (workout list, editor, phase-coloured timer) on the desktop,
with a mini timer, system tray, always-on-top and global shortcuts.

No accounts, servers or network access are needed at runtime.

## Features

- **Workout list** – live count, search (name, descriptions, notes), sort/filter (incl. favourites only), coloured cards
  with totals, Play, and a menu with Edit, Preview, Settings (name/colour), Notes, Favorite, Copy, Share (JSON export),
  Create shortcut and Delete (confirmed). Import lives in Settings and in the empty state.
- **Editor** – Prepare, Work, Rest, Cycles, Sets, Rest between sets, Cool down; −/+ (hold to repeat) and typed input
  (`90`, `1:30`, `1:02:03`); Work/Rest description and image; name/colour via the summary line; explicit Save
  (Ctrl+S) with unsaved-changes protection; Preview, History and Settings in the toolbar.
- **Timer** – one deadline-based engine in the main process; phase colours, huge digits, numbered interval list with
  auto-follow (scroll away → “Current interval” button), Previous/Next, `set/sets • cycle/cycles` counters, Lock,
  Pause/Resume, Reset, Stop, Finish state, transition/countdown/finish sounds (Web Audio, volume/mute).
  Hovering/focusing the heading shows Back, Mini timer, Always on top, Reset and Stop.
- **Desktop** – mini timer window (frameless, draggable, resizable, always-on-top by default), native always-on-top,
  tray (Show, Pause/Resume, Stop, Quit), close-to-tray, optional global shortcuts with collision reporting, window
  position persistence with off-screen recovery, single instance, OS-suspend pauses the timer, crash/quit recovery.

### Keyboard

Timer: <kbd>Space</kbd> pause/resume · <kbd>←</kbd>/<kbd>→</kbd> previous/next · <kbd>L</kbd> lock ·
<kbd>M</kbd> mini timer · <kbd>Esc</kbd> back (the session keeps running). Editor: <kbd>Ctrl+S</kbd> save.
Global shortcuts (off by default) are configured in Settings → Keyboard.

## Requirements

- Node.js 22 and npm
- Linux: an X11 or Wayland desktop. Tests run headless under `xvfb-run`.
- Windows 10/11 x64.

## Commands

```bash
npm ci                 # install (downloads Electron)
npm run dev            # run with hot reload
npm run build          # production build into out/
npm start              # run the production build

npm run typecheck      # main, preload, renderer and tests
npm run lint
npm test               # unit + integration (Vitest, fake clocks)
npx playwright test --project=e2e        # desktop E2E against the real Electron app
npm run visual                           # deterministic screenshots -> docs/visual-qa/actual
python3 scripts/compare-visual.py        # side-by-side with references -> docs/visual-qa/compare
npx playwright test --project=packaged   # smoke-test packaged builds in release/

npm run dist:linux     # release/*.AppImage and release/*.deb
npm run dist:win       # release/*.exe (NSIS installer; build on Windows)
npm run icons          # regenerate build/icon.png and resources/icon.png
```

On a headless Linux machine prefix Playwright commands with `xvfb-run -a`. When running as root add nothing:
the test launcher passes `--no-sandbox` automatically in that case.

CI (`.github/workflows/ci.yml`) runs typecheck, lint, unit/integration, E2E + visual capture, packaging and a
packaged smoke test on `ubuntu-latest` and `windows-latest`, and uploads installers and screenshots as artifacts.

## Data

Everything is stored in the Electron user-data directory (`%APPDATA%\TimerTabata` on Windows,
`~/.config/TimerTabata` on Linux; Settings → Data → Open data folder):

| File | Content |
| --- | --- |
| `workouts.json` | workouts incl. notes and favourites (versioned, schema-validated) |
| `settings.json` | sound, colours, windows, shortcuts, sort/filter |
| `history.json` | finished/stopped sessions (latest 1000) |
| `session.json` | checkpoint of the active session (paused recovery after quit/crash) |
| `window-state.json` | main/mini window bounds |
| `images/` | copies of Work/Rest images owned by the app |

Writes go to a temp file, are fsync'ed and renamed; the previous version is kept as `*.bak`. A corrupt file is moved
aside (`*.corrupt-<time>`), the backup (or defaults) is loaded and the user is notified.

Shared workouts are `*.timertabata.json` files (`format: "timertabata-workout"`, `version: 1`) with images embedded
as data URLs; imports are validated and always get a new ID.

“Create shortcut” writes `~/.local/share/applications/timertabata-workout-<id>.desktop` on Linux and a `.lnk` on the
Windows desktop. Both launch the app with `--workout=<id>`; a deleted workout shows a notice instead.

## Sequence rules and product assumptions

The single generated sequence drives preview, totals, numbering, counters and execution:

1. Prepare once if > 0. 2. Sets × Cycles Work intervals. 3. Rest between Work intervals, never after the final Work.
4. At a set boundary a positive *Rest between sets* **replaces** the ordinary Rest (0 = use ordinary Rest).
5. Cool down once if > 0. Zero-duration intervals are omitted.

Assumptions (behaviour not shown in the references):

- **Time format**: seconds below one minute, `mm:ss` below one hour, `h:mm:ss` above – applied everywhere. The
  reference editor/timer list shows `60` for one minute; by this rule it is shown as `01:00`.
- **Colours**: Prepare `#007c0e` and card/toolbar colours are sampled from the screenshots. The Work-phase
  screenshot was not supplied, so Work uses red-orange `#e64a19`. Rest defaults to blue `#1565c0` (configurable, also
  used for Rest between sets), Cool down teal `#00796b`, Finish uses the workout colour.
- **“5 x Workout”** in the editor summary is the number of sets (omitted when Sets = 1).
- **History icon** in the editor opens recorded sessions (finished or stopped), filterable to the current workout.
- **Editor toolbar Settings** opens app settings; the card menu's *Settings* edits the workout's name and colour.
- **Lock** blocks Next/Previous/Reset/Stop, replacing the session and editing/saving workouts from every surface
  (main window, mini timer, tray, shortcuts, IPC). Pause/Resume and Unlock stay available. While locked the main
  window stays on the timer.
- **Finish**: the timer shows the total workout time and a highlighted “Finish” row; Previous returns (paused) to the
  last interval, Next is disabled.
- **Suspend**: the session pauses on OS suspend and stays paused after resume.
- **Recovery**: checkpoints are written on start, transitions, pause/commands, every 10 s while running and on quit.
  Only interval index and remaining ms are stored (no monotonic deadlines); recovery always resumes paused.
- Starting a workout with unsaved edits asks to save first (the timer runs the saved workout snapshot).
- Limits: durations up to 24:00:00, Cycles/Sets 1–99.

## Platform notes

- **Wayland**: compositors do not allow apps to keep themselves on top or grab global keys. Settings → Desktop
  integration reports this; enable *Use X11 (XWayland)* (restart required) or use the compositor's own
  window rule. In-app keyboard controls always work.
- **Tray on Linux** needs a StatusNotifier host (KDE, Cinnamon, XFCE, GNOME + AppIndicator extension). Without one,
  closing the main window during a workout asks whether to minimize or quit, and launching the app again restores
  the existing window (single instance).
- **Unsigned installers**: no code-signing certificate is configured. Windows SmartScreen will warn
  (“More info → Run anyway”); the AppImage needs `chmod +x`.
- Sounds are synthesized locally with Web Audio and keep playing when windows are hidden/minimized
  (`backgroundThrottling: false`; timing itself runs in the main process).

## Security

`contextIsolation` on, `nodeIntegration` off, sandboxed renderers, strict CSP, navigation and `window.open` blocked,
a narrow typed preload API (`src/shared/ipc.ts`) whose arguments are validated with zod in the main process, and
images served through a custom `tt-asset:` protocol restricted to the app's image folder.
Test hooks are only installed when the `TT_TEST=1` environment variable is set.

## Project layout

```
src/shared     sequence generator, formatter, timer engine, schemas, IPC contract
src/main       Electron main: session manager, storage, windows, tray, shortcuts, platform detection
src/preload    contextBridge API
src/renderer   React UI (list, editor, timer, mini timer, preview, history, settings)
tests/unit     fixtures, engine, session, desktop helpers
tests/integration  storage/import/export, window synchronization
tests/e2e      Playwright Electron tests of the real app
tests/visual   deterministic screenshot capture
tests/packaged smoke tests of packaged builds
docs/visual-qa reference crops, captures and side-by-side comparisons
```

## Verification status

See [docs/VERIFICATION.md](docs/VERIFICATION.md) for what was executed, on which platform, and what remains.

## Licenses

Apache-2.0 (see `LICENSE`). Material Design icons © Google (Apache-2.0); Roboto / Roboto Condensed fonts (OFL-1.1),
bundled via `@fontsource`.
