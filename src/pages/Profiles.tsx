import { useEffect, useState } from 'react'
import { Check, Download, Pencil, Trash2, Upload } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { api, applyProfile, refreshProfiles, saveProfile, setConfig, useStore } from '@/store'

export default function Profiles() {
  const profiles = useStore((s) => s.profiles)
  const active = useStore((s) => s.config.activeProfile)
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
    setDialog(null)
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
              onClick={async () => confirm(`Delete profile "${p}"?`) && (await api.profiles.remove(p), refreshProfiles())}
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
