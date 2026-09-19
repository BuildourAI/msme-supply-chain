'use client'
import { useState } from 'react'
import { usePathname } from 'next/navigation'
import { AppProvider, useApp } from '@/state/app-store'
import { WorkspaceProvider, useWorkspace, useWorkspaceKey } from '@/components/workspace/store'
import { AuthProvider } from '@/components/workspace/auth'
import { IdentityMenu } from './IdentityMenu'
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
  const { mode } = useWorkspace()
  return (
    <header className="sticky top-0 z-20 flex items-center gap-2 border-b border-line bg-surface px-3 py-2">
      <button type="button" onClick={onMenu} aria-label="Open navigation"
        className="press rounded-md p-1.5 text-ink-3 hover:bg-surface-2 hover:text-ink lg:hidden">
        <Icon name="menu" />
      </button>

      <CommandSearch />

      {mode === 'sample' && (
        <span className="mono hidden shrink-0 rounded-full border border-line bg-ground px-2.5 py-0.5 text-[10.5px] text-ink-3 xl:inline">
          sample data · not any client’s real trading data
        </span>
      )}

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

        <IdentityMenu />
      </div>
    </header>
  )
}

function Chrome({ children }: { children: React.ReactNode }) {
  const [activity, setActivity] = useState(false)
  const [drawer, setDrawer] = useState(false)
  const { ready, hasAccount, insideApp, mode } = useWorkspace()
  const pathname = usePathname()

  /**
   * The sign-in stands on its own. Wrapping it in the nav, a command palette
   * and somebody else's name in the corner offers a stranger five stages of a
   * system they have not set up yet, and answers "whose data is this?" with the
   * wrong name. Until there is a company, there is nothing to navigate.
   */
  // The server cannot see browser storage, so on the root it does not yet know
  // whether this is a first visit. Rendering the full chrome and then replacing
  // it with a bare sign-in flashes the whole app at somebody who has not signed
  // up — so the root waits the one frame instead. Every other route is the app
  // either way, and renders immediately.
  if (!ready && pathname === '/') return <div className="min-h-screen" aria-hidden />

  const signingIn = ready && !hasAccount && !insideApp && pathname === '/'
  if (signingIn) {
    return (
      <>
        <main className="min-h-screen">{children}</main>
        <Toast />
      </>
    )
  }

  /**
   * The stage picker is the navigation. Putting a rail of five stages and
   * thirty-four modules beside a screen whose whole job is "pick a stage"
   * offers the choice twice, and the rail offers it worse. The top bar stays,
   * because whose company this is remains worth knowing.
   */
  const picking = ready && mode === 'mine' && pathname === '/'
  if (picking) {
    return (
      <>
        <div className="flex min-h-screen flex-col">
          <TopBar onMenu={() => setDrawer(true)} onActivity={() => setActivity(true)} />
          <main className="min-w-0 flex-1 px-3 py-6 lg:px-4">{children}</main>
        </div>
        <ActivityDrawer open={activity} onClose={() => setActivity(false)} />
        <Inspector />
        <Toast />
      </>
    )
  }

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

/**
 * The stores are keyed by which company is open. Switching between the sample
 * and the owner's own data remounts all four, so a supplier chosen against one
 * company's line cannot survive into the other's — cheaper and far safer than
 * teaching five reducers to reset themselves.
 */
function Stores({ children }: { children: React.ReactNode }) {
  const key = useWorkspaceKey()
  return (
    <DeskProvider key={key}>
      <InboundProvider>
        <InventoryProvider>
          <DispatchProvider>
            <Chrome>{children}</Chrome>
          </DispatchProvider>
        </InventoryProvider>
      </InboundProvider>
    </DeskProvider>
  )
}

export function AppShell({ children }: { children: React.ReactNode }) {
  // Every store lives at the shell so a decision, a supplier choice, a confirmed
  // alias, a closed GRN or a posted cycle count survives moving between pages —
  // "from then on" has to mean from then on, not until the next click on the nav.
  // The workspace sits outside them all, because which company is open decides
  // what they read and whose name the audit trail records.
  // Auth sits outside the workspace because the workspace reads it: signing in
  // is what decides whether there is a database copy to reconcile against.
  return (
    <AuthProvider>
      <WorkspaceProvider>
        <AppProvider>
          <Stores>{children}</Stores>
        </AppProvider>
      </WorkspaceProvider>
    </AuthProvider>
  )
}
