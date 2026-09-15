'use client'
import { useState } from 'react'
import { ACTOR, AppProvider, useApp } from '@/state/app-store'
import { Inspector } from '@/components/ui/Inspector'
import { Sheet } from '@/components/ui/Sheet'
import { Sidebar } from './Sidebar'
import { CommandSearch } from './CommandSearch'
import { Icon } from '@/components/ui/icons'
import { DeskProvider } from '@/components/desk/store'
import { InboundProvider } from '@/components/inbound/store'
import { InventoryProvider } from '@/components/inventory/store'
import { DispatchProvider } from '@/components/dispatch/store'

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
      className="anim-toast overlay fixed bottom-5 left-1/2 z-[70] w-[min(30rem,calc(100vw-2rem))] rounded-lg border px-4 py-2.5 text-[13px] leading-snug">
      {toast}
    </div>
  )
}

function TopBar({ onMenu, onActivity }: { onMenu: () => void; onActivity: () => void }) {
  const { audit } = useApp()
  const [who, role] = ACTOR.split(' · ')
  const initials = who.split(/[\s.]+/).filter(Boolean).map((w) => w[0]).join('').slice(0, 2).toUpperCase()
  return (
    <header className="sticky top-0 z-20 flex items-center gap-2 border-b border-line bg-surface px-3 py-2">
      <button type="button" onClick={onMenu} aria-label="Open navigation"
        className="press rounded-md p-1.5 text-ink-3 hover:bg-surface-2 hover:text-ink lg:hidden">
        <Icon name="menu" />
      </button>

      <CommandSearch />

      <span className="mono hidden shrink-0 rounded-full border border-line bg-ground px-2.5 py-0.5 text-[10.5px] text-ink-3 xl:inline">
        sample data · not any client’s real trading data
      </span>

      <div className="ml-auto flex shrink-0 items-center gap-1">
        {/* The name is sr-only text rather than an aria-label, so that the
            activity SHEET keeps sole ownership of [aria-label=Activity] — the
            drawer is what a reader wants when they ask for the trail, not the
            button that opens it. */}
        <button type="button" onClick={onActivity}
          className="press relative flex items-center gap-1.5 rounded-md px-2 py-1.5 text-ink-3 transition-colors hover:bg-surface-2 hover:text-ink">
          <Icon name="bell" />
          <span className="sr-only">Activity</span>
          <span className={`mono rounded-full px-1.5 text-[10px] leading-[18px] ${
            audit.length ? 'bg-accent-ink text-on-accent' : 'bg-surface-2 text-ink-3'}`}>
            {audit.length}
          </span>
          {audit.length > 0 && (
            <span aria-hidden className="absolute right-1.5 top-1 size-1.5 rounded-full bg-accent" />
          )}
        </button>

        <span className="flex items-center gap-2 rounded-md py-1 pl-1 pr-1.5">
          <span aria-hidden className="grid size-7 shrink-0 place-items-center rounded-full bg-accent-tint text-[11px] font-bold text-accent-ink">
            {initials}
          </span>
          <span className="hidden min-w-0 sm:block">
            <span className="block truncate text-[12px] font-semibold leading-tight">{who}</span>
            <span className="block truncate text-[10.5px] leading-tight text-ink-3">{role}</span>
          </span>
          <Icon name="chevron" className="hidden size-3 rotate-90 text-ink-4 sm:block" />
        </span>
      </div>
    </header>
  )
}

function Chrome({ children }: { children: React.ReactNode }) {
  const [activity, setActivity] = useState(false)
  const [drawer, setDrawer] = useState(false)
  return (
    <>
      {/* Rail beside content, and nothing between the content and the edge of
          the screen. The app used to float in a rounded pane with a margin on
          every side; on a dashboard that margin is width a table could have
          been using. */}
      <div className="flex min-h-screen">
        <Sidebar drawer={drawer} onClose={() => setDrawer(false)} />
        <div className="flex min-w-0 flex-1 flex-col">
          <TopBar onMenu={() => setDrawer(true)} onActivity={() => setActivity(true)} />
          <main className="min-w-0 flex-1 px-3 py-3 lg:px-4">{children}</main>
        </div>
      </div>
      <ActivityDrawer open={activity} onClose={() => setActivity(false)} />
      <Inspector />
      <Toast />
    </>
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
            <DispatchProvider>
              <Chrome>{children}</Chrome>
            </DispatchProvider>
          </InventoryProvider>
        </InboundProvider>
      </DeskProvider>
    </AppProvider>
  )
}
