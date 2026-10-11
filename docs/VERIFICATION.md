# Verification record

Environment of the recorded run: Linux container (kernel 6.18, x64), Node 22.22, Electron 43.7.9, Xvfb display
without a window manager, no D-Bus session bus, no audio device, no Wine. Date: 2026-10-11.

Status values: **passed** (executed here and passed), **configured** (set up but not executed here),
**blocked** (could not be executed here – reason given).

## Automated checks

| Check | Command | Linux | Windows |
| --- | --- | --- | --- |
| Typecheck (main, preload, renderer, tests) | `npm run typecheck` | passed | configured (CI) |
| Lint | `npm run lint` | passed | configured (CI) |
| Unit + integration (52 tests) | `npm test` | passed | configured (CI) |
| Production build | `npm run build` | passed | configured (CI) |
| Desktop E2E, real Electron app (18 tests) | `xvfb-run -a npx playwright test --project=e2e` | passed | configured (CI) |
| Visual capture 390×844, 1280×800, 2× DPI, mini 320×180 | `npm run visual` | passed | configured (CI) |
| Package AppImage + deb | `npm run dist:linux` | passed | – |
| Package NSIS installer | `npm run dist:win` | – | **blocked here**: electron-builder needs Wine on Linux (resource editing and uninstaller generation). Configured to build on `windows-latest` in CI. |
| Packaged smoke: `linux-unpacked/timertabata`, AppImage | `xvfb-run -a npx playwright test --project=packaged` | passed | configured (CI, `win-unpacked/TimerTabata.exe`) |
| `.deb` install | `dpkg -i release/*.deb` | partially: package unpacked to `/opt/TimerTabata` and the installed binary passed the smoke test; dpkg configuration **blocked** because the container lacks `libnotify4`, `xdg-utils`, `libsecret-1-0` and has no apt mirror access | – |

Unit/integration coverage: fixtures A/B/C, single set/cycle, zero-duration omission, set-boundary replacement,
cool-down, counter mapping (Work #38 = set 5, cycle 3), rounding/initial display, exact-once transitions,
pause/resume, next/previous preserving state, delayed ticks across several phases without drift or stale sound
bursts, completion, suspend policy, checkpoint/recovery without deadlines, lock rules, snapshots, persistence,
copy/favorite/notes/delete, image ownership, export/import validation, corrupt-storage recovery, settings upgrade,
window synchronization, off-screen window recovery, accelerator validation/collisions, Wayland/X11/tray capability
reporting, `.desktop` quoting.

E2E coverage (real Electron, fake monotonic clock unless noted): create/validate/edit/save/search/persist, unsaved
changes guard, Hebrew description/name/notes, every card-menu action incl. Share→Import round trip and Create
shortcut, preview of the full sequence, start/pause/resume/skip/finish, auto-follow and manual scroll, history,
lock across keyboard, renderer IPC, tray menu actions, global-shortcut handlers and mini window, main↔mini
synchronization, replace-session confirmation, snapshot isolation, suspend, quit → paused recovery and discard,
**real clock** with hidden windows (timing and sound events continue), mute, native always-on-top flag, global
shortcut registration + collision reporting, window bounds persistence + off-screen recovery, single-instance
forwarding of `--workout=<id>`, work image ownership and display, corrupt storage notice, editor scrolling with
fixed bottom actions, rest colour, reset and stop.

## Visual comparison

References (Android status/navigation bars cropped): `docs/visual-qa/reference/`.
Captures with frozen clock: `docs/visual-qa/actual/` (`phone-*`, `desktop-*`, `hidpi-*`, `*-mini`).
Side-by-side: `docs/visual-qa/compare/{editor-top,editor-bottom,list,list-menu,timer-prepare}.png`.

Corrections made after comparing: start-button icon collapsed by a CSS selector, editor horizontal overflow, row
heights (−5 px plain fields, −14 px Work/Rest), list title size/offset, card text weight (500) and title spacing,
menu anchoring and right margin, card/timer icon sizes, timer heading-row height, session controls moved out of the
digits, hover-only scrollbars.

Remaining intentional differences: one minute renders as `01:00` (formatting rule) where the reference shows `60`;
Previous is visibly disabled on the first interval; the toolbar count reflects the real number of workouts; Hebrew
falls back to the system font because Roboto has no Hebrew glyphs. The Work-phase reference image was not supplied
(only 5 of the 6 images were attached), so the Work colour could not be compared.

## Manual / native checks still required

These need a real desktop session and could not be observed in the headless container:

- **Windows**: install the NSIS build, run the E2E suite, verify tray, `.lnk` shortcut launch, always-on-top over
  other apps, SmartScreen behaviour of the unsigned installer.
- **Linux desktop**: tray icon on a StatusNotifier host (KDE/GNOME+AppIndicator), Wayland vs. XWayland always-on-top,
  global shortcuts on Wayland, `.desktop` shortcut appearing in the launcher, audible sounds on a real audio device,
  OS suspend/resume (simulated here through the same `powerMonitor` handler), HiDPI on a physical monitor.
