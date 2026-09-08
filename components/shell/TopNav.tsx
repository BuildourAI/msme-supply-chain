'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useCallback, useEffect, useRef, useState } from 'react'
import { STAGES, type ModuleEntry } from '@/lib/seed/stages'
import { Dialog } from '@/components/ui/Dialog'
import { Button } from '@/components/ui/bits'

const LockGlyph = () => (
  <svg viewBox="0 0 24 24" aria-hidden className="size-3 shrink-0" fill="none"
       stroke="currentColor" strokeWidth="2.4" strokeLinecap="round">
    <rect x="4" y="10.5" width="16" height="10" rx="2" />
    <path d="M8 10.5V7a4 4 0 0 1 8 0v3.5" />
  </svg>
)
const Caret = () => (
  <svg viewBox="0 0 24 24" aria-hidden className="size-2.5 shrink-0 opacity-50" fill="none"
       stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
    <path d="m6 9 6 6 6-6" />
  </svg>
)

interface NavGroup { label: string; href: string; children?: ModuleEntry[] }

const NAV: NavGroup[] = [
  { label: 'Overview', href: '/' },
  { label: 'Reports', href: '/reports' },
  ...STAGES.map((s) => ({ label: s.navLabel, href: s.href, children: s.modules })),
]

export function TopNav() {
  const pathname = usePathname()
  const [open, setOpen] = useState<string | null>(null)
  const [lock, setLock] = useState<{ label: string; lock: NonNullable<ModuleEntry['lock']> } | null>(null)
  const closeTimer = useRef<number | undefined>(undefined)
  const navRef = useRef<HTMLElement>(null)

  const cancelClose = () => window.clearTimeout(closeTimer.current)
  const scheduleClose = useCallback(() => {
    cancelClose()
    closeTimer.current = window.setTimeout(() => setOpen(null), 220)
  }, [])

  useEffect(() => { setOpen(null) }, [pathname])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(null) }
    const onClick = (e: MouseEvent) => {
      if (navRef.current && !navRef.current.contains(e.target as Node)) setOpen(null)
    }
    document.addEventListener('keydown', onKey)
    document.addEventListener('mousedown', onClick)
    return () => { document.removeEventListener('keydown', onKey); document.removeEventListener('mousedown', onClick) }
  }, [])

  const isActive = (href: string) =>
    href === '/' ? pathname === '/' : pathname.startsWith(href)

  return (
    <>
      <nav ref={navRef} aria-label="Main" className="relative border-b border-line bg-surface">
        <ul className="scroll-x flex items-stretch overflow-x-auto px-2">
          {NAV.map((item) => {
            const active = isActive(item.href)
            const expanded = open === item.label
            return (
              <li key={item.label} className="relative shrink-0"
                  onMouseEnter={() => { if (item.children) { cancelClose(); setOpen(item.label) } }}
                  onMouseLeave={() => { if (item.children) scheduleClose() }}>
                <div className="flex items-stretch">
                  <Link href={item.href}
                    aria-current={active ? 'page' : undefined}
                    className={`flex items-center gap-1.5 whitespace-nowrap border-b-2 px-3 py-2.5 text-[13px] font-medium transition-colors ${
                      active
                        ? 'border-accent text-ink'
                        : 'border-transparent text-ink-2 hover:text-ink'}`}>
                    {item.label}
                  </Link>
                  {item.children && (
                    <button type="button"
                      aria-label={`${item.label} menu`}
                      aria-haspopup="menu" aria-expanded={expanded}
                      onClick={() => setOpen(expanded ? null : item.label)}
                      onKeyDown={(e) => {
                        if (e.key === 'ArrowDown') { e.preventDefault(); setOpen(item.label) }
                      }}
                      className={`-ml-2 border-b-2 pr-2 pl-0.5 transition-colors ${
                        active ? 'border-accent text-ink' : 'border-transparent text-ink-3 hover:text-ink'}`}>
                      <Caret />
                    </button>
                  )}
                </div>

                {item.children && expanded && (
                  <div role="menu" aria-label={item.label}
                    onMouseEnter={cancelClose} onMouseLeave={scheduleClose}
                    className="anim-drop absolute left-1 top-full z-40 w-[19rem] rounded-b-lg border border-t-0 border-line bg-surface py-1.5 shadow-xl">
                    {item.children.map((m) =>
                      m.href ? (
                        <Link key={m.label} href={m.href} role="menuitem"
                          onClick={() => setOpen(null)}
                          className="block px-3.5 py-2 hover:bg-surface-2">
                          <span className="text-[13px] font-medium text-ink">{m.label}</span>
                          {m.note && <span className="mt-0.5 block text-[11px] text-ink-3">{m.note}</span>}
                        </Link>
                      ) : (
                        // Not `disabled`, and deliberately not aria-disabled either: this
                        // entry IS interactive — it opens an explanation of why the module
                        // is not built and what it needs first. Saying otherwise to a screen
                        // reader would be a lie, and a dead-click is what we are avoiding.
                        <button key={m.label} type="button" role="menuitem"
                          aria-label={`${m.label} — not available yet, opens an explanation`}
                          onClick={() => { setOpen(null); setLock({ label: m.label, lock: m.lock! }) }}
                          className="flex w-full items-center gap-2 px-3.5 py-2 text-left hover:bg-surface-2">
                          <span className="text-[13px] text-ink-3">{m.label}</span>
                          <span className="ml-auto flex items-center gap-1.5 text-ink-3">
                            <span className="mono text-[10px] uppercase tracking-wide">
                              {m.lock!.excludedReason ? 'excluded' : m.lock!.phase}
                            </span>
                            <LockGlyph />
                          </span>
                        </button>
                      ),
                    )}
                  </div>
                )}
              </li>
            )
          })}
        </ul>
      </nav>

      <Dialog open={!!lock} onClose={() => setLock(null)}
        title={lock?.label ?? ''}
        sub={lock?.lock.excludedReason ? 'Deliberately excluded' : `Planned — ${lock?.lock.phase}`}>
        <div className="space-y-3 px-4 py-4 text-[13px] leading-relaxed text-ink-2">
          {lock?.lock.excludedReason ? (
            <>
              <p>{lock.lock.excludedReason}</p>
              <p className="text-ink-3">
                This is an exclusion with a reason, not an oversight. Building it would add
                precision nobody asked for.
              </p>
            </>
          ) : (
            <>
              <p>
                Not built yet. It lands in <strong className="text-ink">{lock?.lock.phase}</strong> of
                the build sequence.
              </p>
              <div className="rounded-md border border-line bg-surface-2 p-3">
                <p className="mono text-[10px] uppercase tracking-wider text-ink-3">What it needs first</p>
                <p className="mt-1 text-ink">{lock?.lock.needs}</p>
              </div>
              <p className="text-ink-3">
                A demand-driven reorder point on a broken item master will confidently and
                repeatedly order the wrong thing — so the data foundation comes first.
              </p>
            </>
          )}
          <div className="flex justify-end pt-1">
            <Button onClick={() => setLock(null)} variant="primary">Understood</Button>
          </div>
        </div>
      </Dialog>
    </>
  )
}
