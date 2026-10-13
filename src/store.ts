import { useSyncExternalStore } from 'react'
import { toast } from 'sonner'
import { g69, type Snapshot } from './hid/device'
import { PROFILE_BLOCKS, fromB64, toB64, type WritableBlock } from './hid/protocol'

export type Config = { rules: { exe: string; profile: string }[]; autoSwitch: boolean; dryRun: boolean; activeProfile?: string }
export type ProfileFile = { version: 1; device: 'G69'; blocks: Partial<Record<WritableBlock, string>> }

type Api = {
  profiles: {
    list(): Promise<string[]>
    read(n: string): Promise<ProfileFile>
    write(n: string, d: ProfileFile): Promise<void>
    remove(n: string): Promise<void>
    rename(a: string, b: string): Promise<void>
    exportFile(n: string, d: ProfileFile): Promise<void>
    importFile(): Promise<{ name: string; data: ProfileFile } | null>
  }
  backups: { write(d: ProfileFile): Promise<string>; list(): Promise<string[]>; read(n: string): Promise<ProfileFile>; open(): Promise<void> }
  config: { get(): Promise<Config>; set(p: Partial<Config>): Promise<Config> }
  autostart: { get(): Promise<boolean>; set(on: boolean): Promise<boolean> }
  processes(): Promise<string[]>
  pickExe(): Promise<string | null>
  openOriginal(): Promise<void>
  onForeground(cb: (exe: string) => void): () => void
  onTrayApply(cb: (profile: string) => void): () => void
  onOriginal(cb: (open: boolean) => void): () => void
}
export const api = (window as unknown as { api: Api }).api

type State = {
  snapshot: Snapshot | null
  connected: boolean
  busy: string | null
  originalOpen: boolean
  profiles: string[]
  config: Config
}

let state: State = { snapshot: null, connected: false, busy: null, originalOpen: false, profiles: [], config: { rules: [], autoSwitch: true, dryRun: false } }
const listeners = new Set<() => void>()
const set = (p: Partial<State>) => {
  state = { ...state, ...p }
  listeners.forEach((l) => l())
}
const subscribe = (l: () => void) => (listeners.add(l), () => void listeners.delete(l))
export const useStore = <T,>(sel: (s: State) => T) => useSyncExternalStore(subscribe, () => sel(state))
export const getState = () => state

export const toProfile = (s: Snapshot): ProfileFile => ({
  version: 1,
  device: 'G69',
  blocks: Object.fromEntries(PROFILE_BLOCKS.filter((n) => s[n]).map((n) => [n, toB64(s[n]!)])),
})
const fromProfile = (p: ProfileFile) =>
  Object.fromEntries(Object.entries(p.blocks).map(([k, v]) => [k, fromB64(v!)])) as Partial<Record<WritableBlock, Uint8Array>>

async function withBusy<T>(label: string, job: () => Promise<T>): Promise<T | undefined> {
  if (state.busy) {
    toast.warning(`Busy: ${state.busy}`)
    return
  }
  set({ busy: label })
  try {
    return await job()
  } catch (e) {
    toast.error(`${label} failed`, { description: String((e as Error).message ?? e) })
  } finally {
    set({ busy: null })
  }
}

async function refreshProfiles() {
  set({ profiles: await api.profiles.list() })
}

let backedUp = false
/** Connects, reads everything, takes a backup, creates "Default" on first launch. */
export async function connect(interactive = false) {
  await withBusy('Reading keyboard', async () => {
    if (!(await g69.connect(interactive))) return
    set({ connected: true })
    const snapshot = await g69.readAll()
    set({ snapshot })
    const p = toProfile(snapshot)
    if (!backedUp) {
      await api.backups.write(p)
      backedUp = true
    }
    if (!(await api.profiles.list()).includes('Default')) {
      await api.profiles.write('Default', p)
      await setConfig({ activeProfile: 'Default' })
      toast.success('Saved current keyboard settings as profile "Default"')
    }
    await refreshProfiles()
  })
}

/** Writes changed blocks, verifies by read-back, and saves them into the active profile. */
export async function writeBlocks(blocks: Partial<Record<WritableBlock, Uint8Array>>, what: string) {
  return withBusy(what, async () => {
    const bad = await g69.writeVerified(blocks)
    if (bad.length) {
      toast.error(`${what}: keyboard did not keep ${bad.join(', ')}`, { description: 'Use Profiles → Restore backup if anything looks wrong.' })
      set({ snapshot: { ...state.snapshot, ...Object.fromEntries(await Promise.all(bad.map(async (n) => [n, await g69.readBlock(n as WritableBlock)]))) } })
      return false
    }
    const snapshot = { ...state.snapshot, ...blocks }
    set({ snapshot })
    if (g69.dryRun) toast.info(`${what} (dry run — nothing sent)`)
    else {
      toast.success(what)
      if (state.config.activeProfile) await api.profiles.write(state.config.activeProfile, toProfile(snapshot))
    }
    return true
  })
}

export async function applyProfile(name: string, data?: ProfileFile) {
  const ok = await withBusy(`Applying "${name}"`, async () => {
    const file = data ?? (await api.profiles.read(name))
    const blocks = fromProfile(file)
    const bad = await g69.writeVerified(blocks)
    if (bad.length) throw new Error(`keyboard did not keep ${bad.join(', ')}`)
    set({ snapshot: { ...state.snapshot, ...blocks } })
    return true
  })
  if (ok) {
    if (!data) await setConfig({ activeProfile: name })
    else if (state.config.activeProfile && state.snapshot) await api.profiles.write(state.config.activeProfile, toProfile(state.snapshot))
    toast.success(data ? `Restored ${name}` : `Profile "${name}" applied`)
  }
  return !!ok
}

export async function saveProfile(name: string) {
  if (!state.snapshot) return
  await api.profiles.write(name, toProfile(state.snapshot))
  await setConfig({ activeProfile: name })
  await refreshProfiles()
}

export async function setConfig(p: Partial<Config>) {
  const config = await api.config.set(p)
  g69.dryRun = config.dryRun
  set({ config })
}

export async function init() {
  const config = await api.config.get()
  g69.dryRun = config.dryRun
  set({ config })
  await refreshProfiles()
  g69.subscribe(() => set({ connected: g69.connected }))
  navigator.hid.addEventListener('connect', () => !state.originalOpen && connect())
  navigator.hid.addEventListener('disconnect', (e) => {
    if (e.device === g69.device) g69.disconnect().then(() => set({ connected: false }))
  })
  api.onForeground((exe) => {
    const c = state.config
    if (!c.autoSwitch || !state.connected || state.busy || state.originalOpen) return
    const target = c.rules.find((r) => r.exe === exe)?.profile ?? 'Default'
    if (target !== c.activeProfile && state.profiles.includes(target)) applyProfile(target)
  })
  api.onTrayApply((p) => applyProfile(p))
  api.onOriginal(async (open) => {
    set({ originalOpen: open })
    if (open) await g69.disconnect()
    else {
      await connect()
      // Changes made in the original configurator become part of the active profile.
      if (state.snapshot && state.config.activeProfile) await api.profiles.write(state.config.activeProfile, toProfile(state.snapshot))
    }
  })
  await connect()
}

export { refreshProfiles }
