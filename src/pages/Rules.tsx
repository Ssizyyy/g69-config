import { useState } from 'react'
import { FolderOpen, Plus, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { api, setConfig, useStore } from '@/store'

export default function Rules() {
  const config = useStore((s) => s.config)
  const profiles = useStore((s) => s.profiles)
  const [running, setRunning] = useState<string[] | null>(null)

  const rules = config.rules
  const save = (r: typeof rules) => setConfig({ rules: r })
  const add = (exe: string) => {
    if (!rules.some((r) => r.exe === exe)) save([...rules, { exe, profile: profiles.find((p) => p !== 'Default') ?? 'Default' }])
    setRunning(null)
  }

  return (
    <div className="flex max-w-3xl flex-col gap-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold">App Rules</h1>
          <p className="text-sm text-muted-foreground">When an app stays focused for 2 seconds its profile is applied. Any other app uses "Default".</p>
        </div>
        <div className="flex items-center gap-3">
          <Label htmlFor="auto">Auto-switch</Label>
          <Switch id="auto" checked={config.autoSwitch} onCheckedChange={(v) => setConfig({ autoSwitch: v })} />
        </div>
      </div>

      <div className="flex flex-col divide-y rounded-xl border bg-card">
        {rules.length === 0 && <div className="px-4 py-6 text-sm text-muted-foreground">No rules yet.</div>}
        {rules.map((r, i) => (
          <div key={r.exe} className="flex items-center gap-3 px-4 py-3">
            <div className="flex-1 font-mono text-sm">{r.exe}.exe</div>
            <Select value={r.profile} onValueChange={(v) => save(rules.map((x, j) => (j === i ? { ...x, profile: v } : x)))}>
              <SelectTrigger className="w-48">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {profiles.map((p) => (
                  <SelectItem key={p} value={p}>
                    {p}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button size="icon" variant="ghost" onClick={() => save(rules.filter((_, j) => j !== i))}>
              <Trash2 />
            </Button>
          </div>
        ))}
      </div>

      <div className="flex gap-2">
        <Button onClick={async () => setRunning(await api.processes())}>
          <Plus /> Add from running apps
        </Button>
        <Button
          variant="outline"
          onClick={async () => {
            const exe = await api.pickExe()
            if (exe) add(exe)
          }}
        >
          <FolderOpen /> Browse for .exe
        </Button>
      </div>

      {running && (
        <div className="flex flex-wrap gap-2 rounded-xl border bg-card p-4">
          {running.map((p) => (
            <Button key={p} size="sm" variant="secondary" onClick={() => add(p)}>
              {p}
            </Button>
          ))}
        </div>
      )}
    </div>
  )
}
