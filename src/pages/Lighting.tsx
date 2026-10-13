import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Slider } from '@/components/ui/slider'
import { Switch } from '@/components/ui/switch'
import { EFFECTS, decodeLed, encodeLed, fromHex, toHex, type Led } from '@/model/lighting'
import { useStore, writeBlocks } from '@/store'
import { cn } from '@/lib/utils'

const SWATCHES = ['#ff0000', '#ff8000', '#ffff00', '#00ff00', '#00ffff', '#0000ff', '#8000ff', '#ff00ff', '#ffffff']

export default function Lighting() {
  const block = useStore((s) => s.snapshot?.led)
  const busy = useStore((s) => !!s.busy)
  const [led, setLed] = useState<Led | null>(null)
  useEffect(() => setLed(block ? decodeLed(block) : null), [block])
  if (!block || !led) return null

  const on = led.effect !== 0
  const fx = EFFECTS.find((e) => e.id === led.effect)
  const dirty = encodeLed(block, led).some((v, i) => v !== block[i])
  const upd = (p: Partial<Led>) => setLed({ ...led, ...p })

  return (
    <div className="flex max-w-4xl flex-col gap-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold">Lighting</h1>
          <p className="text-sm text-muted-foreground">Pick an effect and colour, then apply.</p>
        </div>
        <div className="flex items-center gap-3">
          <Label htmlFor="led-on">Backlight</Label>
          <Switch id="led-on" checked={on} onCheckedChange={(v) => upd({ effect: v ? 0x01 : 0 })} />
        </div>
      </div>

      <div className={cn('grid grid-cols-4 gap-2', !on && 'pointer-events-none opacity-40')}>
        {EFFECTS.filter((e) => e.id !== 0x80).map((e) => (
          <button
            key={e.id}
            onClick={() => upd({ effect: e.id })}
            className={cn('rounded-lg border bg-card px-3 py-3 text-left text-sm hover:border-primary/60', led.effect === e.id && 'border-primary bg-primary/15')}
          >
            {e.name}
          </button>
        ))}
      </div>
      {led.effect === 0x80 && <p className="text-sm text-muted-foreground">Custom per-key lighting is active; edit it in the original configurator.</p>}

      <div className={cn('grid grid-cols-2 gap-8 rounded-xl border bg-card p-5', !on && 'pointer-events-none opacity-40')}>
        <div className="flex flex-col gap-3">
          <Label>Colour</Label>
          <div className={cn('flex flex-wrap items-center gap-2', fx && !fx.color && 'pointer-events-none opacity-40')}>
            {SWATCHES.map((c) => (
              <button key={c} onClick={() => upd(fromHex(c))} className={cn('size-8 rounded-md border', toHex(led) === c ? 'ring-2 ring-primary ring-offset-2 ring-offset-card' : '')} style={{ background: c }} />
            ))}
            <input type="color" value={toHex(led)} onChange={(e) => upd(fromHex(e.target.value))} className="h-8 w-12 cursor-pointer rounded-md border bg-transparent" />
          </div>
          {fx && !fx.color && <p className="text-xs text-muted-foreground">This effect uses its own colours.</p>}
        </div>
        <div className="flex flex-col gap-5">
          <div className="flex flex-col gap-2">
            <Label>Brightness: {led.brightness}</Label>
            <Slider min={0} max={5} step={1} value={[led.brightness]} onValueChange={([v]) => upd({ brightness: v })} />
          </div>
          <div className={cn('flex flex-col gap-2', fx && !fx.speed && 'pointer-events-none opacity-40')}>
            <Label>Speed: {led.speed}</Label>
            <Slider min={0} max={5} step={1} value={[led.speed]} onValueChange={([v]) => upd({ speed: v })} />
          </div>
          {fx?.direction && (
            <div className="flex items-center gap-3">
              <Label htmlFor="dir">Reverse direction</Label>
              <Switch id="dir" checked={led.direction !== 0} onCheckedChange={(v) => upd({ direction: v ? 1 : 0 })} />
            </div>
          )}
        </div>
      </div>

      <div className="flex gap-2">
        <Button disabled={!dirty || busy} onClick={() => writeBlocks({ led: encodeLed(block, led) }, 'Lighting saved')}>
          Apply
        </Button>
        <Button variant="outline" disabled={!dirty || busy} onClick={() => setLed(decodeLed(block))}>
          Revert
        </Button>
      </div>
    </div>
  )
}
