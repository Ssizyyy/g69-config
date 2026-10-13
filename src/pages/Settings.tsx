import { useEffect, useState, useSyncExternalStore } from 'react'
import { ExternalLink } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { g69 } from '@/hid/device'
import { api, setConfig, useStore } from '@/store'
import { cn } from '@/lib/utils'

export default function Settings() {
  const dryRun = useStore((s) => s.config.dryRun)
  const [autostart, setAutostart] = useState(false)
  const log = useSyncExternalStore(
    (l) => g69.subscribe(l),
    () => g69.log,
  )
  useEffect(() => void api.autostart.get().then(setAutostart), [])

  return (
    <div className="flex max-w-4xl flex-col gap-6">
      <h1 className="text-xl font-semibold">Settings</h1>

      <div className="flex flex-col divide-y rounded-xl border bg-card">
        <Row label="Start with Windows" hint="Starts hidden in the tray.">
          <Switch checked={autostart} onCheckedChange={async (v) => setAutostart(await api.autostart.set(v))} />
        </Row>
        <Row label="Dry run" hint="Log write commands instead of sending them. Reads still happen.">
          <Switch checked={dryRun} onCheckedChange={(v) => setConfig({ dryRun: v })} />
        </Row>
        <Row label="Original configurator (offline)" hint="Calibration, polling rate, firmware, macros and advanced keys. The app releases the keyboard while it is open.">
          <Button variant="outline" onClick={() => api.openOriginal()}>
            Open <ExternalLink />
          </Button>
        </Row>
      </div>

      <div className="flex flex-col gap-2">
        <Label>Packet log</Label>
        <div className="h-72 overflow-auto rounded-xl border bg-black/40 p-3 font-mono text-[11px] leading-relaxed">
          {log.slice(-200).map((e, i) => (
            <div key={i} className={cn(e.dir === 'out' && 'text-sky-300', e.dir === 'dry' && 'text-amber-300', e.dir === 'err' && 'text-red-400', e.dir === 'in' && 'text-emerald-300')}>
              {new Date(e.t).toLocaleTimeString()} {e.dir.padEnd(3)} {e.text}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

function Row({ label, hint, children }: { label: string; hint: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-6 px-4 py-4">
      <div>
        <div className="text-sm font-medium">{label}</div>
        <div className="text-xs text-muted-foreground">{hint}</div>
      </div>
      {children}
    </div>
  )
}
