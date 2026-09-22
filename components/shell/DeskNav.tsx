'use client'
import { useMemo } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Icon, Logo } from '@/components/ui/icons'
import { useWorkspace } from '@/components/workspace/store'
import { sourcingNav, stageOf, STAGE_TILES } from '@/lib/workspace/reveal'

/**
 * The owner's sidebar: flat, six rows, no expanding groups.
 *
 * The stage's own name sits at the top with a way back to the stage picker,
 * which is the only nesting there is — you are in Sourcing, and these are the
 * things Sourcing has. The old rail put five stages and thirty-four modules in
 * front of somebody on their first morning.
 */
export function DeskNav({ onNavigate }: { onNavigate?: () => void }) {
  const { workspace, today } = useWorkspace()
  const pathname = usePathname()
  /*
   * Above the early return, because a hook cannot be called conditionally.
   * The dashboard badge runs the reorder derivation, so this is not free — it
   * is recomputed when the workspace changes, not on every render of every
   * screen.
   */
  const rows = useMemo(
    () => (workspace ? sourcingNav(workspace, today) : []),
    [workspace, today],
  )
  if (!workspace) return null

  const stage = stageOf(pathname) ?? 'sourcing'
  const tile = STAGE_TILES.find((s) => s.id === stage)!

  return (
    <>
      <div className="flex items-center gap-2 px-3 py-3">
        <Logo className="size-7 shrink-0 text-accent" />
        <span className="min-w-0">
          <span className="block truncate text-[14px] font-bold leading-none tracking-tight">
            {tile.label}
          </span>
          <span className="mono block truncate text-[9.5px] uppercase tracking-wider text-ink-3">
            {workspace.company.name}
          </span>
        </span>
      </div>

      <nav aria-label="Main" className="min-h-0 flex-1 overflow-y-auto px-2 pb-2">
        <Link href="/" onClick={onNavigate}
          className="press mb-1.5 flex items-center gap-2 rounded-md px-2.5 py-[7px] text-[12.5px] text-ink-3 transition-colors hover:bg-surface-2 hover:text-ink">
          <Icon name="chevron" className="size-3.5 rotate-180" />
          All stages
        </Link>

        <ul className="space-y-0.5">
          {rows.map((r) => {
            const on = pathname === r.href
            return (
              <li key={r.href}>
                {r.later ? (
                  <span
                    title="Comes once the desk is in use — reorder suggestions, cost comparison, blocked capital"
                    className="flex cursor-default items-center gap-2.5 rounded-md px-2.5 py-[7px] text-[13px] font-medium text-ink-4">
                    <Icon name={r.icon} className="size-4 shrink-0" />
                    <span className="min-w-0 leading-tight">{r.label}</span>
                    <span className="mono ml-auto shrink-0 text-[9.5px] uppercase tracking-wider">
                      later
                    </span>
                  </span>
                ) : (
                  <Link href={r.href} onClick={onNavigate}
                    aria-current={on ? 'page' : undefined}
                    className={`flex items-center gap-2.5 rounded-md px-2.5 py-[7px] text-[13px] font-medium transition-colors ${
                      on ? 'bg-accent-tint text-accent-ink' : 'text-ink-2 hover:bg-surface-2 hover:text-ink'}`}>
                    <Icon name={r.icon} className={`size-4 shrink-0 ${on ? 'text-accent' : 'text-ink-3'}`} />
                    <span className="min-w-0 leading-tight">{r.label}</span>
                    {r.badge && (
                      <span className={`mono ml-auto shrink-0 rounded-full px-1.5 text-[10px] leading-[17px] ${
                        on ? 'bg-accent-ink text-on-accent' : 'bg-surface-3 text-ink-3'}`}>
                        {r.badge}
                      </span>
                    )}
                  </Link>
                )}
              </li>
            )
          })}
        </ul>
      </nav>
    </>
  )
}
