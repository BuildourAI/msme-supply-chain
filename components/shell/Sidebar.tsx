'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useCallback, useEffect, useState } from 'react'
import { STAGES, type ModuleEntry } from '@/lib/seed/stages'
import { Icon, Logo, STAGE_ICON, type IconName } from '@/components/ui/icons'
import { LockDialog, type Locked } from './LockDialog'
import { Checklist } from '@/components/onboard/Checklist'
import { DeskNav } from './DeskNav'
import { stageOf } from '@/lib/workspace/reveal'
import { useWorkspace } from '@/components/workspace/store'

const PAINKILLERS = 'Painkillers solved'

/** modules you can open first, then the painkiller brief, then everything not built */
const rank = (m: ModuleEntry) => (m.href ? (m.label === PAINKILLERS ? 1 : 0) : 2)

interface NavItem { label: string; href: string; icon: IconName; children?: ModuleEntry[] }

const NAV: NavItem[] = [
  { label: 'Overview', href: '/', icon: 'home' },
  { label: 'Reports', href: '/reports', icon: 'report' },
  ...STAGES.map((s) => ({
    label: s.navLabel, href: s.href, icon: STAGE_ICON[s.id] ?? 'boxes', children: s.modules,
  })),
]

/**
 * The seam above the locked group. It is not description, it is the reason
 * those entries look different from the ones above them.
 */
const MenuRule = ({ label }: { label: string }) => (
  <p className="mono mt-1 border-t border-line-soft px-3 pb-0.5 pt-1.5 text-[9px] uppercase tracking-wider text-ink-3">
    {label}
  </p>
)

/**
 * The left rail.
 *
 * A stage row is two controls in one line: the label navigates to the stage,
 * the caret opens the stage's modules underneath it. That split is deliberate
 * — a single control cannot both take you somewhere and show you what is
 * there, and the old top nav had the same pair for the same reason.
 *
 * The group opens on CLICK and never on hover, and the stage you are standing
 * in does not start open: a rail that pre-expands has nothing left for the
 * caret to do, and the browser suites click "Sourcing menu" while already on
 * a sourcing page and expect it to open.
 *
 * One `<aside>` serves both layouts — a drawer under 1024px, a fixed rail
 * above it — because two copies would put two "Sourcing menu" buttons in the
 * document and make every by-name lookup ambiguous.
 */
export function Sidebar({ drawer, onClose }: { drawer: boolean; onClose: () => void }) {
  const { mode } = useWorkspace()
  const pathname = usePathname()
  const desk = mode === 'mine' && stageOf(pathname) !== null
  const [open, setOpen] = useState<string | null>(null)
  const [lock, setLock] = useState<Locked | null>(null)

  // moving to another page closes whatever was open — the rail should never
  // still be showing the menu you just chose from
  useEffect(() => { setOpen(null); onClose() }, [pathname]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { setOpen(null); onClose() } }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  const isOn = useCallback((href: string) =>
    href === '/' ? pathname === '/' : pathname === href || pathname.startsWith(href + '/'), [pathname])

  return (
    <>
      {drawer && (
        <div aria-hidden onClick={onClose}
             className="anim-backdrop fixed inset-0 z-40 bg-ink/30 lg:hidden" />
      )}

      <aside className={`${drawer ? 'fixed inset-y-0 left-0 z-50 flex w-[272px] max-w-[85vw] shadow-xl' : 'hidden'} shrink-0 flex-col border-r border-line bg-surface lg:sticky lg:top-0 lg:z-30 lg:flex lg:h-screen lg:w-[228px] lg:shadow-none`}>
        {/* Inside a stage, in the owner's own company, the rail is the stage's
            own six rows and nothing else. Everywhere else — the sample company,
            and the stage picker — it is the full map. */}
        {desk ? <DeskNav onNavigate={onClose} /> : <>
        <div className="flex items-center gap-2 px-3 py-3">
          <Logo className="size-7 shrink-0 text-accent" />
          <span className="min-w-0">
            <span className="block truncate text-[14px] font-bold leading-none tracking-tight">BuildOur</span>
            <span className="mono block truncate text-[9.5px] uppercase tracking-wider text-ink-3">Material Flow</span>
          </span>
          <button type="button" onClick={onClose} aria-label="Close navigation"
            className="press ml-auto rounded-md p-1 text-ink-3 hover:bg-surface-2 hover:text-ink lg:hidden">
            <Icon name="close" />
          </button>
        </div>

        <nav aria-label="Main" className="min-h-0 flex-1 overflow-y-auto px-2 pb-2">
          <ul className="space-y-0.5">
            {NAV.map((item) => {
              const on = isOn(item.href)
              const entries = [...(item.children ?? [])].sort((a, b) => rank(a) - rank(b))
              const expanded = open === item.label
              return (
                <li key={item.label}>
                  <div className={`flex items-stretch rounded-md transition-colors ${
                    on ? 'bg-accent-tint' : 'hover:bg-surface-2'}`}>
                    <Link href={item.href} aria-current={on ? 'page' : undefined}
                      className={`flex min-w-0 flex-1 items-center gap-2.5 px-2.5 py-[7px] text-[13px] font-medium transition-colors ${
                        on ? 'text-accent-ink' : 'text-ink-2 hover:text-ink'}`}>
                      <Icon name={item.icon} className={`size-4 shrink-0 ${on ? 'text-accent' : 'text-ink-3'}`} />
                      {/* wraps rather than truncates: one stage is called
                          "Production Material Flow", and a rail that clips it
                          to "Production Material …" is a rail that hides which
                          stage you are about to open */}
                      <span className="min-w-0 leading-tight">{item.label}</span>
                    </Link>
                    {entries.length > 0 && (
                      <button type="button" aria-label={`${item.label} menu`} aria-haspopup="menu"
                        aria-expanded={expanded}
                        onClick={() => setOpen(expanded ? null : item.label)}
                        className={`press shrink-0 px-2 transition-colors ${
                          on ? 'text-accent' : 'text-ink-4 hover:text-ink'}`}>
                        <Icon name="chevron" className={`size-3 transition-transform ${expanded ? 'rotate-90' : ''}`} />
                      </button>
                    )}
                  </div>

                  {expanded && entries.length > 0 && (
                    <div role="menu" aria-label={item.label} className="anim-drop mt-0.5 pb-1 pl-3">
                      {entries.map((m, i, all) =>
                        m.href ? (
                          <div key={m.label}>
                            <Link href={m.href} role="menuitem"
                              className={`press block truncate rounded-md px-3 py-1 text-[12.5px] transition-colors hover:bg-surface-2 ${
                                m.label === PAINKILLERS ? 'text-accent-ink' : 'text-ink-2 hover:text-ink'} ${
                                pathname === m.href ? 'font-semibold text-accent-ink' : ''}`}>
                              {m.label}
                            </Link>
                            {all[i + 1] && !all[i + 1].href && <MenuRule label="not built yet" />}
                          </div>
                        ) : (
                          // Not `disabled`, and deliberately not aria-disabled either:
                          // this entry IS interactive — it opens an explanation of why
                          // the module is not built and what it needs first. Saying
                          // otherwise to a screen reader would be a lie, and a
                          // dead-click is exactly what we are avoiding.
                          <div key={m.label}>
                            {i === 0 && <MenuRule label="not built yet" />}
                            <button type="button" role="menuitem"
                              aria-label={`${m.label} — not available yet, opens an explanation`}
                              onClick={() => { setOpen(null); setLock({ label: m.label, lock: m.lock! }) }}
                              className="press flex w-full items-center gap-1.5 rounded-md px-3 py-1 text-left transition-colors hover:bg-surface-2">
                              <span className="min-w-0 truncate text-[12.5px] text-ink-3">{m.label}</span>
                              <Icon name="lock" className="ml-auto size-3 shrink-0 text-ink-4" />
                            </button>
                          </div>
                        ),
                      )}
                    </div>
                  )}
                </li>
              )
            })}
          </ul>
        </nav>

        {/* The promise, where the reference puts its upgrade card. It used to
            be a footer nobody scrolled to; here it is on every screen. */}
        </>}

        <div className="shrink-0 border-t border-line p-2">
          {/* In the owner's own company this slot carries how far through the
              set-up they are, which is the thing worth a permanent place on
              every screen until it is finished. */}
          {mode === 'mine' ? <Checklist compact /> : (
            <div className="rounded-lg bg-accent-tint p-2.5">
              <p className="text-[12px] font-bold leading-tight">Suggests, never sends</p>
              <p className="mt-1 text-[10.5px] leading-snug text-ink-2">
                It drafts an order, holds a line and recommends. It never places an order, contacts a
                supplier or edits a customer record. All figures are sample data.
              </p>
              <Link href="/reports"
                className="press mt-1.5 inline-flex items-center gap-1 text-[11px] font-semibold text-accent-ink hover:underline">
                See it reconcile <Icon name="arrow-right" className="size-3" />
              </Link>
            </div>
          )}
          <Link href="/reports"
            className="press mt-1 flex items-center gap-2 rounded-md px-2.5 py-1.5 text-[12px] text-ink-2 transition-colors hover:bg-surface-2 hover:text-ink">
            <Icon name="help" className="size-4 text-ink-3" /> Help &amp; Support
          </Link>
        </div>
      </aside>

      <LockDialog lock={lock} onClose={() => setLock(null)} />
    </>
  )
}
