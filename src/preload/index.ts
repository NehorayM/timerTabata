import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron'
import { EVENT_CHANNELS, INVOKE_CHANNELS, type ApiEvents, type TimerApi } from '../shared/ipc'

const api: Record<string, unknown> = {}
for (const ch of INVOKE_CHANNELS) {
  api[ch] = (...args: unknown[]) => ipcRenderer.invoke(`tt:${ch}`, ...args)
}
api.on = <K extends keyof ApiEvents>(event: K, cb: (payload: ApiEvents[K]) => void): (() => void) => {
  if (!(EVENT_CHANNELS as readonly string[]).includes(event)) throw new Error(`Unknown event ${String(event)}`)
  const listener = (_e: IpcRendererEvent, payload: ApiEvents[K]): void => cb(payload)
  ipcRenderer.on(`tt-ev:${event}`, listener)
  return () => {
    ipcRenderer.removeListener(`tt-ev:${event}`, listener)
  }
}

contextBridge.exposeInMainWorld('api', api as unknown as TimerApi)
