import { useSyncExternalStore } from 'react'
import { toast } from 'sonner'
import { g69, type Snapshot } from './hid/device'
import { LED_WRITE_ONLY, PROFILE_BLOCKS, fromB64, toB64, type WritableBlock } from './hid/protocol'
import { LOCKED_FUNCS, SPARE_KEYS, decodeKey, funcId, spareAction, withKey } from './model/keys'

/** A combo is an Electron accelerator; an fn shortcut is an Fn-layer key that emits the spare key `fKey` (`prev` = the record it displaced). */
export type Shortcut = { kind: 'combo'; accelerator: string; profile: string } | { kind: 'fn'; fnPos: number; fKey: string; prev: number[]; profile: string }
export type ShortcutSpec = { kind: 'combo'; accelerator: string } | { kind: 'fn'; fnPos: number }
export type Config = { rules: { exe: string; profile: string }[]; shortcuts: Shortcut[]; autoSwitch: boolean; dryRun: boolean; activeProfile?: string }
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
  setShortcuts(list: Shortcut[]): Promise<{ config: Config } | { error: string }>
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

let state: State = { snapshot: null, connected: false, busy: null, originalOpen: false, profiles: [], config: { rules: [], shortcuts: [], autoSwitch: true, dryRun: false } }
const listeners = new Set<() => void>()
const set = (p: Partial<State>) => {
  state = { ...state, ...p }
  listeners.forEach((l) => l())
}
const subscribe = (l: () => void) => (listeners.add(l), () => void listeners.delete(l))
export const useStore = <T,>(sel: (s: State) => T) => useSyncExternalStore(subscribe, () => sel(state))
export const getState = () => state

export const toProfile = (snap: Snapshot): ProfileFile => {
  const s = snap.fn ? { ...snap, fn: withoutFnTriggers(snap.fn, state.config.shortcuts) } : snap
  return { version: 1, device: 'G69', blocks: Object.fromEntries(PROFILE_BLOCKS.filter((n) => s[n]).map((n) => [n, toB64(s[n]!)])) }
}
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

/** The keyboard never reports the LED colour back, so carry it over from what we last wrote. */
const keepColour = (read: Uint8Array, known: Uint8Array) => {
  const o = read.slice()
  for (const i of LED_WRITE_ONLY) o[i] = known[i]
  return o
}

let backedUp = false
/** Connects, reads everything, takes a backup, creates "Default" on first launch. */
export async function connect(interactive = false) {
  await withBusy('Reading keyboard', async () => {
    if (!(await g69.connect(interactive))) return
    set({ connected: true })
    const snapshot = await g69.readAll()
    const saved = state.config.activeProfile && (await api.profiles.read(state.config.activeProfile).catch(() => null))?.blocks.led
    if (saved && snapshot.led) snapshot.led = keepColour(snapshot.led, fromB64(saved))
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
      const reread = Object.fromEntries(await Promise.all(bad.map(async (n) => [n, await g69.readBlock(n as WritableBlock)])))
      if (reread.led && state.snapshot?.led) reread.led = keepColour(reread.led, state.snapshot.led)
      set({ snapshot: { ...state.snapshot, ...reread } })
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
    // Fn shortcuts must survive every switch, so they override that Fn-layer key in whichever profile is applied.
    const fn = blocks.fn ?? state.snapshot?.fn
    if (fn) blocks.fn = withFnTriggers(fn, state.config.shortcuts)
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

const withFnTriggers = (fn: Uint8Array, list: Shortcut[]) =>
  list.reduce((b, s) => (s.kind === 'fn' ? withKey(b, s.fnPos, spareAction(s.fKey)) : b), fn)
/** Profile files never store the trigger records: put back what each trigger displaced. */
const withoutFnTriggers = (fn: Uint8Array, list: Shortcut[]) =>
  list.reduce((b, s) => (s.kind === 'fn' ? withKey(b, s.fnPos, { type: 'other', raw: s.prev ?? [0, 0, 0, 0] }) : b), fn)

/** Binds (or with null clears) a profile's shortcut. Returns an error message, or null on success. */
export async function setShortcut(profile: string, spec: ShortcutSpec | null): Promise<string | null> {
  const cur = state.config.shortcuts
  const old = cur.find((s) => s.profile === profile)
  const rest = cur.filter((s) => s.profile !== profile)
  const fn = state.snapshot?.fn
  if ((old?.kind === 'fn' || spec?.kind === 'fn') && (!state.connected || !fn)) return 'Connect the keyboard first'
  // Free the old trigger key first (restoring the record it displaced) so nothing below reads the trigger as the key's own action.
  const cleared = fn && old?.kind === 'fn' ? withoutFnTriggers(fn, [old]) : fn
  let added: Shortcut | null = null
  if (spec?.kind === 'combo') added = { ...spec, profile }
  else if (spec) {
    if (LOCKED_FUNCS.has(funcId(decodeKey(cleared!, spec.fnPos)))) return 'That Fn key is reserved by the firmware'
    const fKey = SPARE_KEYS.find((f) => !rest.some((s) => s.kind === 'fn' && s.fKey === f))
    if (!fKey) return 'No spare keys left for Fn shortcuts'
    added = { kind: 'fn', fnPos: spec.fnPos, fKey, prev: Array.from(cleared!.subarray(4 * spec.fnPos, 4 * spec.fnPos + 4)), profile }
  }
  const next = added ? [...rest, added] : rest
  const res = await api.setShortcuts(next)
  if ('error' in res) return res.error
  set({ config: res.config })

  if (cleared && (old?.kind === 'fn' || added?.kind === 'fn')) {
    const ok = await writeBlocks({ fn: withFnTriggers(cleared, next) }, added ? `Fn shortcut for '${profile}'` : `Cleared Fn shortcut for '${profile}'`)
    if (!ok) {
      const back = await api.setShortcuts(cur)
      if ('config' in back) set({ config: back.config })
      return 'Could not write the Fn key to the keyboard'
    }
  }
  return null
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
  // Tray menu and profile shortcuts both land here.
  api.onTrayApply((p) => {
    if (!state.connected) return void toast.warning('Keyboard not connected')
    if (state.originalOpen) return void toast.warning('Close the original configurator first')
    applyProfile(p)
  })
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
