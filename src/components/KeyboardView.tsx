import { LAYOUT, type LayoutKey } from '@/model/layout'
import { cn } from '@/lib/utils'

const U = 54 // px per key unit
const GAP = 4

type Props = {
  selected?: Set<number>
  onKey?: (k: LayoutKey) => void
  /** Secondary text under the key label (e.g. remap or actuation). */
  sub?: (k: LayoutKey) => string | null | undefined
  /** Accent the key (e.g. remapped / customised). */
  marked?: (k: LayoutKey) => boolean
  disabled?: (k: LayoutKey) => boolean
}

export function KeyboardView({ selected, onKey, sub, marked, disabled }: Props) {
  return (
    <div className="inline-flex flex-col rounded-xl border bg-card p-3 shadow-inner" style={{ gap: GAP }}>
      {LAYOUT.map((row, i) => (
        <div key={i} className="flex" style={{ gap: GAP }}>
          {row.map((k) => {
            const w = (k.w ?? 1) * U + ((k.w ?? 1) - 1) * GAP
            const s = sub?.(k)
            const isSel = selected?.has(k.pos)
            const isOff = disabled?.(k)
            return (
              <button
                key={k.pos}
                type="button"
                disabled={isOff}
                onClick={() => onKey?.(k)}
                style={{ width: w, height: U }}
                className={cn(
                  'relative flex flex-col items-center justify-center rounded-md border border-b-4 bg-secondary text-xs font-medium transition-colors',
                  'hover:border-primary/60 disabled:opacity-35 disabled:hover:border-border',
                  marked?.(k) && 'border-primary/50 bg-primary/10',
                  isSel && 'border-primary bg-primary/25 text-foreground',
                )}
              >
                <span className={cn(s && 'text-[10px] text-muted-foreground')}>{k.label}</span>
                {s && <span className="max-w-full truncate px-1 text-[11px] font-semibold text-primary">{s}</span>}
              </button>
            )
          })}
        </div>
      ))}
    </div>
  )
}
