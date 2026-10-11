import type { TimerApi } from '../shared/ipc'

declare global {
  interface Window {
    api: TimerApi
  }
}

export {}
