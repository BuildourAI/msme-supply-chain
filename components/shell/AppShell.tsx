'use client'
import { useState } from 'react'
import { AppProvider, useApp } from '@/state/app-store'
import { useTheme } from '@/state/theme-provider'
import { Inspector } from '@/components/ui/Inspector'
import { Sheet } from '@/components/ui/Sheet'
import { TopNav } from './TopNav'
import { Segmented } from '@/components/ui/bits'
import { crossfadeTheme } from '@/components/ui/motion'
import { DeskProvider } from '@/components/desk/store'
import { InboundProvider } from '@/components/inbound/store'
import { InventoryProvider } from '@/components/inventory/store'

function ActivityDrawer({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { audit } = useApp()
  return (
    <Sheet open={open} onClose={onClose} z="z-[55]"
      label="Activity" eyebrow="Audit trail · §11" title="Activity">
      <div className="p-4">
        {audit.length === 0 ? (
          <p className="text-[13px] leading-relaxed text-ink-3">
            Nothing yet. Every choice you make — a supplier changed, a line approved, a guardrail
            overridden — is recorded here with who did it, when, and on what data.
          </p>
        ) : (
          <ol className="space-y-2.5">
            {audit.map((e, i) => (
              <li key={e.id} style={{ '--i': Math.min(i, 6) } as React.CSSProperties}
                  className="anim-fade-up rounded-md border border-line bg-surface-2 p-2.5">
                <div className="flex items-baseline gap-2">
                  <span className="text-[12px] font-medium text-ink">{e.action}</span>
                  <span className="mono ml-auto text-[10px] text-ink-3">{e.at}</span>
                </div>
                <p className="mt-0.5 text-[12px] leading-snug text-ink-2">{e.detail}</p>
                {(e.before || e.after) && (
                  <p className="mono mt-1 text-[10.5px] text-ink-3">
                    {e.before ?? '—'} <span aria-hidden>→</span> {e.after ?? '—'}
                  </p>
                )}
                {e.reason && (
                  <p className="mt-1 border-l-2 border-warn/40 pl-2 text-[11.5px] italic leading-snug text-ink-2">
                    “{e.reason}”
                  </p>
                )}
                <p className="mono mt-1 text-[10px] text-ink-3">
                  {e.actor} · {e.entity}/{e.entityId}
                </p>
              </li>
            ))}
          </ol>
        )}
      </div>
    </Sheet>
  )
}

function Toast() {
  const { toast } = useApp()
  if (!toast) return null
  return (
    <div role="status" aria-live="polite"
      className="anim-toast glass fixed bottom-5 left-1/2 z-[70] w-[min(30rem,calc(100vw-2rem))] rounded-xl border px-4 py-2.5 text-[13px] leading-snug shadow-xl">
      {toast}
    </div>
  )
}

function TopBar({ onActivity }: { onActivity: () => void }) {
  const { theme, setTheme } = useTheme()
  const { audit } = useApp()
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-line-soft/60 px-4 py-2">
      <div className="flex items-center gap-2">
        <span aria-hidden className="grid size-6 place-items-center rounded-md bg-accent text-[11px] font-bold text-on-accent shadow-sm">B</span>
        <span className="text-[13px] font-semibold tracking-tight">BuildOur</span>
        <span className="text-ink-3">·</span>
        <span className="text-[13px] text-ink-2">Material Flow</span>
      </div>

      <span className="mono hidden rounded border border-line bg-surface px-2 py-0.5 text-[10.5px] text-ink-3 sm:inline">
        sample data · not any client’s real trading data
      </span>

      <div className="ml-auto flex items-center gap-2">
        <button type="button" onClick={onActivity}
          className="press inline-flex items-center gap-1.5 rounded-md border border-line bg-surface px-2.5 py-1 text-[12px] font-medium shadow-sm hover:bg-surface-2">
          Activity
          <span className={`mono rounded-full px-1.5 text-[10px] ${audit.length ? 'bg-accent text-on-accent' : 'bg-surface-3 text-ink-3'}`}>
            {audit.length}
          </span>
        </button>
        <Segmented label="Theme" value={theme} onChange={(t) => crossfadeTheme(() => setTheme(t))}
          options={[{ id: 'system', label: 'Auto' }, { id: 'light', label: 'Light' }, { id: 'dark', label: 'Dark' }]} />
      </div>
    </div>
  )
}

function Chrome({ children }: { children: React.ReactNode }) {
  const [activity, setActivity] = useState(false)
  return (
    <div className="min-h-screen">
      {/* One sticky glass header for both bars. No overflow on it, ever — the
          nav dropdown hangs off this element and must escape downward. */}
      <header className="glass sticky top-0 z-40 border-b">
        <TopBar onActivity={() => setActivity(true)} />
        <TopNav />
      </header>
      <main className="mx-auto max-w-[1600px] px-4 py-5">{children}</main>
      <footer className="mx-auto max-w-[1600px] px-4 pb-8 pt-2 text-[11px] leading-relaxed text-ink-3">
        The system suggests, holds and recommends. It never places an order, never contacts a
        supplier, never edits a customer record. All figures are illustrative sample data prepared
        for demonstration — none of it is any client’s real trading data.
      </footer>
      <ActivityDrawer open={activity} onClose={() => setActivity(false)} />
      <Inspector />
      <Toast />
    </div>
  )
}

export function AppShell({ children }: { children: React.ReactNode }) {
  // Every store lives at the shell so a decision, a supplier choice, a confirmed
  // alias, a closed GRN or a posted cycle count survives moving between pages —
  // "from then on" has to mean from then on, not until the next click on the nav.
  return (
    <AppProvider>
      <DeskProvider>
        <InboundProvider>
          <InventoryProvider>
            <Chrome>{children}</Chrome>
          </InventoryProvider>
        </InboundProvider>
      </DeskProvider>
    </AppProvider>
  )
}
