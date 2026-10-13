import { useState } from 'react'
import { KeyboardView } from '@/components/KeyboardView'
import { Button } from '@/components/ui/button'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { keyByPos } from '@/model/layout'
import { PICKER, actionLabel, decodeKey, sameAction, withKey, type KeyAction } from '@/model/keys'
import { useStore, writeBlocks } from '@/store'
import { cn } from '@/lib/utils'

export default function CustomKeys() {
  const [layer, setLayer] = useState<'keys' | 'fn'>('keys')
  const [sel, setSel] = useState<number | null>(null)
  const [group, setGroup] = useState(0)
  const block = useStore((s) => s.snapshot?.[layer])
  const busy = useStore((s) => !!s.busy)
  if (!block) return null

  // A record equal to the key's stock code counts as unchanged.
  const label = (pos: number) => {
    const a = decodeKey(block, pos)
    if (a.type === 'key' && !a.mods && a.hid === keyByPos.get(pos)?.hid && layer === 'keys') return null
    return actionLabel(a)
  }
  const current = sel != null ? decodeKey(block, sel) : null

  const assign = (a: KeyAction) => {
    if (sel == null) return
    const k = keyByPos.get(sel)!
    writeBlocks({ [layer]: withKey(block, sel, a) }, `${k.label} → ${actionLabel(a) ?? 'default'}`)
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold">Custom Keys</h1>
          <p className="text-sm text-muted-foreground">Click a key, then choose what it should do.</p>
        </div>
        <Tabs value={layer} onValueChange={(v) => (setLayer(v as 'keys' | 'fn'), setSel(null))}>
          <TabsList>
            <TabsTrigger value="keys">Base layer</TabsTrigger>
            <TabsTrigger value="fn">Fn layer</TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      <KeyboardView
        selected={new Set(sel != null ? [sel] : [])}
        onKey={(k) => setSel(k.pos === sel ? null : k.pos)}
        sub={(k) => label(k.pos)}
        marked={(k) => !!label(k.pos)}
        disabled={(k) => k.label === 'Fn'}
      />

      {sel != null && current && (
        <div className="flex flex-col gap-4 rounded-xl border bg-card p-4">
          <div className="flex items-center justify-between">
            <div className="text-sm">
              <span className="font-semibold">{keyByPos.get(sel)!.label}</span>
              <span className="text-muted-foreground"> {layer === 'fn' ? '(Fn layer)' : ''} — currently </span>
              <span className="font-medium text-primary">{label(sel) ?? 'default'}</span>
            </div>
            <Button variant="outline" size="sm" disabled={busy || current.type === 'default'} onClick={() => assign({ type: 'default' })}>
              Reset to default
            </Button>
          </div>
          <div className="flex gap-2 border-b">
            {PICKER.map((g, i) => (
              <button
                key={g.group}
                onClick={() => setGroup(i)}
                className={cn('-mb-px border-b-2 border-transparent px-3 pb-2 text-sm text-muted-foreground', group === i && 'border-primary text-foreground')}
              >
                {g.group}
              </button>
            ))}
          </div>
          <div className="flex flex-wrap gap-2">
            {PICKER[group].items.map((it) => (
              <Button
                key={it.label}
                variant={sameAction(it.action, current) ? 'default' : 'secondary'}
                size="sm"
                className="min-w-12"
                disabled={busy}
                onClick={() => assign(it.action)}
              >
                {it.label}
              </Button>
            ))}
          </div>
          {current.type === 'other' && (
            <p className="text-xs text-muted-foreground">
              This key holds an advanced function ({label(sel)}). Assigning a new action replaces it; edit advanced keys in the original configurator.
            </p>
          )}
        </div>
      )}
    </div>
  )
}
