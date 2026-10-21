import { useEffect, useState } from 'react'
import { Check, Download, Keyboard, Pencil, Trash2, Upload } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { KeyboardView } from '@/components/KeyboardView'
import { keyByPos } from '@/model/layout'
import { api, applyProfile, refreshProfiles, saveProfile, setConfig, setShortcut, useStore, type Shortcut } from '@/store'

const CODES: Record<string, string> = {
  Space: 'Space', Tab: 'Tab', Enter: 'Return', Escape: 'Esc', Backspace: 'Backspace', Delete: 'Delete', Insert: 'Insert', Home: 'Home', End: 'End',
  PageUp: 'PageUp', PageDown: 'PageDown', ArrowUp: 'Up', ArrowDown: 'Down', ArrowLeft: 'Left', ArrowRight: 'Right',
  Minus: '-', Equal: '=', BracketLeft: '[', BracketRight: ']', Backslash: '\\', Semicolon: ';', Quote: "'", Backquote: '`', Comma: ',', Period: '.', Slash: '/',
}
/** Electron accelerator for a keydown, or null while only modifiers are held / the key has no accelerator name. */
function toAccelerator(e: React.KeyboardEvent) {
  const m = /^Key([A-Z])$|^Digit(\d)$|^(F\d{1,2})$|^Numpad(\d)$/.exec(e.code)
  const key = m ? (m[1] ?? m[2] ?? m[3] ?? `num${m[4]}`) : CODES[e.code]
  if (!key) return null
  const mods = [e.ctrlKey && 'Ctrl', e.altKey && 'Alt', e.shiftKey && 'Shift', e.metaKey && 'Super'].filter(Boolean)
  return { accel: [...mods, key].join('+'), bare: !mods.length && !/^F\d/.test(key) }
}
const describe = (s: Shortcut) => (s.kind === 'combo' ? s.accelerator : `Fn + ${keyByPos.get(s.fnPos)?.label}`)

export default function Profiles() {
  const profiles = useStore((s) => s.profiles)
  const active = useStore((s) => s.config.activeProfile)
  const shortcuts = useStore((s) => s.config.shortcuts)
  const [sc, setSc] = useState<{ profile: string; mode: 'combo' | 'fn'; accel: string; fnPos: number | null; error: string } | null>(null)
  const connected = useStore((s) => s.connected && !!s.snapshot)
  const busy = useStore((s) => !!s.busy)
  const [backups, setBackups] = useState<string[]>([])
  const [dialog, setDialog] = useState<{ mode: 'new' | 'rename'; from?: string } | null>(null)
  const [name, setName] = useState('')

  useEffect(() => void api.backups.list().then(setBackups), [])

  const submit = async () => {
    const n = name.trim()
    if (!n) return
    if (dialog?.mode === 'new') await saveProfile(n)
    else if (dialog?.from) await api.profiles.rename(dialog.from, n)
    await refreshProfiles()
    if (dialog?.mode === 'rename' && active === dialog.from) await setConfig({ activeProfile: n })
    else if (dialog?.mode === 'rename') await setConfig({}) // pick up remapped rules/shortcuts
    setDialog(null)
  }

  const openShortcut = (profile: string) => {
    const cur = shortcuts.find((s) => s.profile === profile)
    setSc({ profile, mode: cur?.kind ?? 'combo', accel: cur?.kind === 'combo' ? cur.accelerator : '', fnPos: cur?.kind === 'fn' ? cur.fnPos : null, error: '' })
  }
  const saveShortcut = async (spec: Parameters<typeof setShortcut>[1]) => {
    if (!sc) return
    const error = await setShortcut(sc.profile, spec)
    if (error) setSc({ ...sc, error })
    else setSc(null)
  }

  return (
    <div className="flex max-w-3xl flex-col gap-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold">Profiles</h1>
          <p className="text-sm text-muted-foreground">Changes you make are saved into the active profile. Applying a profile rewrites the whole keyboard.</p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            onClick={async () => {
              const r = await api.profiles.importFile()
              if (r) await api.profiles.write(r.name, r.data), refreshProfiles()
            }}
          >
            <Upload /> Import
          </Button>
          <Button disabled={!connected} onClick={() => (setName(''), setDialog({ mode: 'new' }))}>
            Save current as new…
          </Button>
        </div>
      </div>

      <div className="flex flex-col divide-y rounded-xl border bg-card">
        {profiles.map((p) => (
          <div key={p} className="flex items-center gap-3 px-4 py-3">
            <div className="flex w-5 justify-center">{p === active && <Check className="size-4 text-primary" />}</div>
            <div className="flex-1 font-medium">{p}</div>
            {shortcuts.find((s) => s.profile === p) && (
              <span className="rounded-md border px-2 py-0.5 font-mono text-xs text-muted-foreground">{describe(shortcuts.find((s) => s.profile === p)!)}</span>
            )}
            <Button size="icon" variant="ghost" title="Shortcut" onClick={() => openShortcut(p)}>
              <Keyboard />
            </Button>
            <Button size="sm" disabled={!connected || busy || p === active} onClick={() => applyProfile(p)}>
              Apply
            </Button>
            <Button size="icon" variant="ghost" title="Export" onClick={async () => api.profiles.exportFile(p, await api.profiles.read(p))}>
              <Download />
            </Button>
            <Button size="icon" variant="ghost" title="Rename" disabled={p === 'Default'} onClick={() => (setName(p), setDialog({ mode: 'rename', from: p }))}>
              <Pencil />
            </Button>
            <Button
              size="icon"
              variant="ghost"
              title="Delete"
              disabled={p === 'Default' || p === active}
              onClick={async () => {
                if (!confirm(`Delete profile "${p}"?`)) return
                // Free its Fn key on the keyboard before the shortcut record disappears.
                const err = shortcuts.some((s) => s.profile === p) && (await setShortcut(p, null))
                if (err) return void toast.error(`Could not remove the shortcut: ${err}`)
                await api.profiles.remove(p)
                await refreshProfiles()
                await setConfig({})
              }}
            >
              <Trash2 />
            </Button>
          </div>
        ))}
      </div>

      <div className="flex flex-col gap-3 rounded-xl border bg-card p-4">
        <div className="flex items-center justify-between">
          <div>
            <div className="font-medium">Backups</div>
            <p className="text-xs text-muted-foreground">A full backup is taken every time the app connects, before anything is written.</p>
          </div>
          <Button variant="outline" size="sm" onClick={() => api.backups.open()}>
            Open folder
          </Button>
        </div>
        <div className="flex max-h-56 flex-col gap-1 overflow-auto">
          {backups.map((b) => (
            <div key={b} className="flex items-center justify-between rounded-md px-2 py-1 text-sm hover:bg-accent">
              <span className="font-mono text-xs">{b}</span>
              <Button
                size="sm"
                variant="secondary"
                disabled={!connected || busy}
                onClick={async () => confirm(`Restore backup ${b}? This rewrites the whole keyboard.`) && applyProfile(`backup ${b}`, await api.backups.read(b))}
              >
                Restore
              </Button>
            </div>
          ))}
        </div>
      </div>

      <Dialog open={!!sc} onOpenChange={(o) => !o && setSc(null)}>
        <DialogContent className="sm:max-w-5xl">
          <DialogHeader>
            <DialogTitle>Shortcut for "{sc?.profile}"</DialogTitle>
          </DialogHeader>
          {sc && (
            <div className="flex flex-col gap-4">
              <div className="flex gap-2">
                <Button size="sm" variant={sc.mode === 'combo' ? 'default' : 'secondary'} onClick={() => setSc({ ...sc, mode: 'combo', error: '' })}>
                  Key combo
                </Button>
                <Button size="sm" variant={sc.mode === 'fn' ? 'default' : 'secondary'} onClick={() => setSc({ ...sc, mode: 'fn', error: '' })}>
                  Fn + key
                </Button>
              </div>
              {sc.mode === 'combo' ? (
                <>
                  <Input
                    autoFocus
                    readOnly
                    value={sc.accel}
                    placeholder="Click here and press the combo, e.g. Ctrl+Alt+1"
                    onKeyDown={(e) => {
                      e.preventDefault()
                      const r = toAccelerator(e)
                      if (!r) return
                      setSc({ ...sc, accel: r.accel, error: r.bare ? 'Add a modifier (Ctrl, Alt, Shift) so it does not hijack normal typing' : '' })
                    }}
                  />
                  <p className="text-xs text-muted-foreground">Works system-wide while the app is running, including in the tray. One modifier set plus one key.</p>
                </>
              ) : (
                <>
                  <KeyboardView
                    selected={new Set(sc.fnPos != null ? [sc.fnPos] : [])}
                    onKey={(k) => setSc({ ...sc, fnPos: k.pos, error: '' })}
                    sub={(k) => shortcuts.find((s) => s.kind === 'fn' && s.fnPos === k.pos)?.profile}
                    marked={(k) => shortcuts.some((s) => s.kind === 'fn' && s.fnPos === k.pos)}
                    disabled={(k) => k.label === 'Fn'}
                  />
                  <p className="text-xs text-muted-foreground">
                    Pick the key to press together with Fn. The keyboard handles Fn itself, so that Fn-layer key is rewritten to send a spare key (F13–F24) the app listens for. It overrides that key in every profile.
                  </p>
                </>
              )}
              {sc.error && <p className="text-sm text-destructive">{sc.error}</p>}
            </div>
          )}
          <DialogFooter>
            {shortcuts.some((s) => s.profile === sc?.profile) && (
              <Button variant="outline" onClick={() => saveShortcut(null)}>
                Clear
              </Button>
            )}
            <Button
              disabled={!sc || (sc.mode === 'combo' ? !sc.accel || !!sc.error : sc.fnPos == null)}
              onClick={() => sc && saveShortcut(sc.mode === 'combo' ? { kind: 'combo', accelerator: sc.accel } : { kind: 'fn', fnPos: sc.fnPos! })}
            >
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!dialog} onOpenChange={(o) => !o && setDialog(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{dialog?.mode === 'new' ? 'Save current settings as profile' : 'Rename profile'}</DialogTitle>
          </DialogHeader>
          <Input autoFocus value={name} placeholder="e.g. Valorant" onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && submit()} />
          <DialogFooter>
            <Button onClick={submit} disabled={!name.trim()}>
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
