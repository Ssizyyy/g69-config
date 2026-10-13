import { useEffect, useState } from 'react'
import { Gauge, Keyboard, Lightbulb, Layers, ListChecks, Settings as SettingsIcon, Usb, Loader2 } from 'lucide-react'
import { Toaster } from '@/components/ui/sonner'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import { connect, init, useStore } from '@/store'
import CustomKeys from '@/pages/CustomKeys'
import Lighting from '@/pages/Lighting'
import Performance from '@/pages/Performance'
import Profiles from '@/pages/Profiles'
import Rules from '@/pages/Rules'
import Settings from '@/pages/Settings'

const PAGES = [
  { id: 'keys', label: 'Custom Keys', icon: Keyboard, el: CustomKeys, needsDevice: true },
  { id: 'light', label: 'Lighting', icon: Lightbulb, el: Lighting, needsDevice: true },
  { id: 'perf', label: 'Performance', icon: Gauge, el: Performance, needsDevice: true },
  { id: 'profiles', label: 'Profiles', icon: Layers, el: Profiles, needsDevice: false },
  { id: 'rules', label: 'App Rules', icon: ListChecks, el: Rules, needsDevice: false },
  { id: 'settings', label: 'Settings', icon: SettingsIcon, el: Settings, needsDevice: false },
]

export default function App() {
  const [page, setPage] = useState('keys')
  const connected = useStore((s) => s.connected)
  const hasData = useStore((s) => !!s.snapshot)
  const busy = useStore((s) => s.busy)
  const originalOpen = useStore((s) => s.originalOpen)
  const active = useStore((s) => s.config.activeProfile)
  const dryRun = useStore((s) => s.config.dryRun)

  useEffect(() => void init(), [])

  const current = PAGES.find((p) => p.id === page)!
  const Page = current.el

  return (
    <div className="flex h-screen">
      <aside className="flex w-60 shrink-0 flex-col gap-4 border-r bg-card/40 p-4">
        <div className="rounded-lg border bg-card p-3">
          <div className="font-semibold">Onikuma G69</div>
          <div className={cn('mt-1 flex items-center gap-1.5 text-xs', connected ? 'text-emerald-400' : 'text-muted-foreground')}>
            <span className={cn('size-2 rounded-full', connected ? 'bg-emerald-400' : 'bg-muted-foreground')} />
            {originalOpen ? 'In use by original configurator' : connected ? 'Connected' : 'Not connected'}
          </div>
          {active && <div className="mt-1 truncate text-xs text-muted-foreground">Profile: {active}</div>}
        </div>
        <nav className="flex flex-col gap-1">
          {PAGES.map((p) => (
            <button
              key={p.id}
              onClick={() => setPage(p.id)}
              className={cn(
                'flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors hover:bg-accent',
                page === p.id && 'bg-accent font-medium text-primary',
              )}
            >
              <p.icon className="size-4" />
              {p.label}
            </button>
          ))}
        </nav>
        <div className="mt-auto flex flex-col gap-2 text-xs text-muted-foreground">
          {dryRun && <Badge variant="outline" className="border-amber-500 text-amber-400">Dry run — writes not sent</Badge>}
          {busy && (
            <div className="flex items-center gap-2">
              <Loader2 className="size-3 animate-spin" />
              {busy}…
            </div>
          )}
        </div>
      </aside>
      <main className="flex-1 overflow-auto p-6">
        {current.needsDevice && !hasData ? (
          <div className="flex h-full flex-col items-center justify-center gap-4 text-muted-foreground">
            <Usb className="size-10" />
            <p>{originalOpen ? 'Close the original configurator window to continue.' : 'Plug in the G69 with the USB cable.'}</p>
            {!originalOpen && (
              <Button onClick={() => connect(true)} disabled={!!busy}>
                Connect
              </Button>
            )}
          </div>
        ) : (
          <Page />
        )}
      </main>
      <Toaster position="bottom-right" richColors />
    </div>
  )
}
