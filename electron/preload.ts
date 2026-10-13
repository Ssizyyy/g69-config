import { contextBridge, ipcRenderer } from 'electron'

const invoke = (ch: string) => (...args: unknown[]) => ipcRenderer.invoke(ch, ...args)
const on = (ch: string) => (cb: (v: unknown) => void) => {
  const h = (_e: unknown, v: unknown) => cb(v)
  ipcRenderer.on(ch, h)
  return () => ipcRenderer.removeListener(ch, h)
}

contextBridge.exposeInMainWorld('api', {
  profiles: {
    list: invoke('profiles:list'),
    read: invoke('profiles:read'),
    write: invoke('profiles:write'),
    remove: invoke('profiles:delete'),
    rename: invoke('profiles:rename'),
    exportFile: invoke('profiles:export'),
    importFile: invoke('profiles:import'),
  },
  backups: { write: invoke('backups:write'), list: invoke('backups:list'), read: invoke('backups:read'), open: invoke('backups:open') },
  config: { get: invoke('config:get'), set: invoke('config:set') },
  autostart: { get: invoke('autostart:get'), set: invoke('autostart:set') },
  processes: invoke('processes:list'),
  pickExe: invoke('dialog:pickExe'),
  openOriginal: invoke('original:open'),
  onForeground: on('foreground'),
  onTrayApply: on('tray:apply'),
  onOriginal: on('original'),
})
