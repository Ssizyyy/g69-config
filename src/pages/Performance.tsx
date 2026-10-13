import { useState } from 'react'
import { KeyboardView } from '@/components/KeyboardView'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Slider } from '@/components/ui/slider'
import { Switch } from '@/components/ui/switch'
import { PRESETS } from '@/model/layout'
import { DEFAULT_ACTUATION, DEFAULT_SENSITIVITY, MIN_ACTUATION, MIN_SENSITIVITY, SWITCHES, decodeRT, withRT, type KeyRT } from '@/model/performance'
import { useStore, writeBlocks } from '@/store'
import { cn } from '@/lib/utils'

const fmt = (v: number) => v.toFixed(2)

export default function Performance() {
  const block = useStore((s) => s.snapshot?.rt)
  const busy = useStore((s) => !!s.busy)
  const [sel, setSel] = useState<Set<number>>(new Set())
  const [draft, setDraft] = useState<KeyRT | null>(null)
  if (!block) return null

  const select = (next: Set<number>) => {
    setSel(next)
    const first = [...next][0]
    if (first == null) return setDraft(null)
    const rt = decodeRT(block, first)
    setDraft({
      ...rt,
      switchType: rt.switchType || 3,
      actuation: rt.actuation || DEFAULT_ACTUATION,
      press: rt.press || DEFAULT_SENSITIVITY,
      release: rt.release || DEFAULT_SENSITIVITY,
    })
  }
  const toggle = (pos: number) => {
    const n = new Set(sel)
    n.has(pos) ? n.delete(pos) : n.add(pos)
    select(n)
  }
  const sw = SWITCHES.find((s) => s.id === draft?.switchType) ?? SWITCHES[2]
  const upd = (p: Partial<KeyRT>) => draft && setDraft({ ...draft, ...p })

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-semibold">Performance</h1>
        <p className="text-sm text-muted-foreground">Select keys, set actuation and rapid trigger, then apply. Calibration lives in Settings → Original configurator.</p>
      </div>

      <div className="flex flex-col gap-3">
        <div className="flex gap-2">
          {Object.entries(PRESETS).map(([name, keys]) => (
            <Button key={name} size="sm" variant="secondary" onClick={() => select(new Set(keys))}>
              {name}
            </Button>
          ))}
          <Button size="sm" variant="outline" onClick={() => select(new Set())}>
            Clear
          </Button>
        </div>
        <KeyboardView
          selected={sel}
          onKey={(k) => toggle(k.pos)}
          disabled={(k) => k.label === 'Fn'}
          sub={(k) => {
            const r = decodeRT(block, k.pos)
            return r.actuation ? fmt(r.actuation) + (r.rapidTrigger ? ' RT' : '') : null
          }}
        />
      </div>

      {draft ? (
        <div className="grid max-w-5xl grid-cols-2 gap-8 rounded-xl border bg-card p-5">
          <div className="flex flex-col gap-5">
            <div className="flex flex-col gap-2">
              <Label>Switch type</Label>
              <div className="flex gap-2">
                {SWITCHES.map((s) => (
                  <button
                    key={s.id}
                    onClick={() => upd({ switchType: s.id, actuation: Math.min(draft.actuation, s.trip) })}
                    className={cn('rounded-md border px-3 py-1.5 text-sm hover:border-primary/60', draft.switchType === s.id && 'border-primary bg-primary/15')}
                  >
                    {s.name}
                  </button>
                ))}
              </div>
            </div>
            <div className="flex flex-col gap-2">
              <Label>Actuation point: {fmt(draft.actuation)} mm</Label>
              <Slider min={MIN_ACTUATION} max={sw.trip} step={0.05} value={[draft.actuation]} onValueChange={([v]) => upd({ actuation: v })} />
              <p className="text-xs text-muted-foreground">How far you press before the key registers.</p>
            </div>
          </div>
          <div className="flex flex-col gap-5">
            <div className="flex items-center justify-between">
              <div>
                <Label htmlFor="rt">Rapid trigger</Label>
                <p className="text-xs text-muted-foreground">Release as soon as the key starts rising, re-press as soon as it moves down.</p>
              </div>
              <Switch id="rt" checked={draft.rapidTrigger} onCheckedChange={(v) => upd({ rapidTrigger: v })} />
            </div>
            <div className={cn('flex flex-col gap-5', !draft.rapidTrigger && 'pointer-events-none opacity-40')}>
              <div className="flex flex-col gap-2">
                <Label>Press sensitivity: {fmt(draft.press)} mm</Label>
                <Slider min={MIN_SENSITIVITY} max={2} step={0.01} value={[draft.press]} onValueChange={([v]) => upd({ press: v })} />
              </div>
              <div className="flex flex-col gap-2">
                <Label>Release sensitivity: {fmt(draft.release)} mm</Label>
                <Slider min={MIN_SENSITIVITY} max={2} step={0.01} value={[draft.release]} onValueChange={([v]) => upd({ release: v })} />
              </div>
              <div className="flex items-center justify-between">
                <Label htmlFor="full">Full-distance rapid trigger</Label>
                <Switch id="full" checked={draft.fullDistance} onCheckedChange={(v) => upd({ fullDistance: v })} />
              </div>
              <div className="flex items-center justify-between">
                <Label htmlFor="bottom">Bottom-out tolerance</Label>
                <Switch id="bottom" checked={draft.bottomOut} onCheckedChange={(v) => upd({ bottomOut: v })} />
              </div>
            </div>
          </div>
          <div className="col-span-2 flex gap-2">
            <Button disabled={busy} onClick={() => writeBlocks({ rt: withRT(block, [...sel], draft) }, `Performance saved for ${sel.size} key${sel.size > 1 ? 's' : ''}`)}>
              Apply to {sel.size} key{sel.size > 1 ? 's' : ''}
            </Button>
          </div>
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">Select one or more keys to edit.</p>
      )}
    </div>
  )
}
