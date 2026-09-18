'use client'
import { useRouter } from 'next/navigation'
import { useEffect, useMemo, useRef, useState } from 'react'
import { STAGES } from '@/lib/seed/stages'
import { Dialog } from '@/components/ui/Dialog'
import { Icon } from '@/components/ui/icons'
import { useWorkspace } from '@/components/workspace/store'
import { sourcingNav } from '@/lib/workspace/reveal'

interface Dest { label: string; href: string; group: string; note?: string }

/** Every screen in the app, grouped the way the rail groups them. */
const DESTS: Dest[] = [
  { label: 'Executive dashboard', href: '/', group: 'Overview' },
  { label: 'Reconciliation report', href: '/reports', group: 'Overview' },
  ...STAGES.flatMap((s) => [
    { label: s.label, href: s.href, group: s.navLabel, note: `Stage ${s.no}` },
    ...s.modules.filter((m) => m.href).map((m) => ({
      label: m.label, href: m.href!, group: s.navLabel, note: m.note,
    })),
  ]),
]

/**
 * The reference's search box, wired to the only thing worth searching in a
 * demo with no free-text data: the screens themselves. It is a jump list, and
 * it says so — a box that looks like it searches your stock and does not is
 * worse than no box.
 */
export function CommandSearch() {
  const router = useRouter()
  const { mode, workspace } = useWorkspace()
  const [open, setOpen] = useState(false)
  const [q, setQ] = useState('')
  const [i, setI] = useState(0)
  const listRef = useRef<HTMLDivElement>(null)

  /**
   * The jump list is whatever the rail beside it is. Offering an owner
   * thirty-four screens that belong to the sample company would put back, one
   * keystroke away, exactly the menu the desk exists to remove.
   */
  const dests = useMemo(() => {
    if (mode !== 'mine' || !workspace) return DESTS
    return [
      { label: 'All stages', href: '/', group: 'Overview' },
      ...sourcingNav(workspace)
        .filter((r) => !r.later)
        .map((r) => ({ label: r.label, href: r.href, group: 'Sourcing' })),
    ]
  }, [mode, workspace])

  const hits = useMemo(() => {
    const needle = q.trim().toLowerCase()
    if (!needle) return dests
    return dests.filter((d) =>
      d.label.toLowerCase().includes(needle) ||
      d.group.toLowerCase().includes(needle) ||
      (d.note ?? '').toLowerCase().includes(needle))
  }, [q, dests])

  useEffect(() => { setI(0) }, [q])

  // ⌘K / Ctrl+K from anywhere
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault(); setOpen((v) => !v); setQ('')
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [])

  const go = (href: string) => { setOpen(false); setQ(''); router.push(href) }

  return (
    <>
      <button type="button" onClick={() => { setOpen(true); setQ('') }}
        className="press hidden min-w-0 flex-1 items-center gap-2 rounded-lg border border-line bg-ground px-3 py-1.5 text-left text-[12.5px] text-ink-3 transition-colors hover:border-ink-4 sm:flex sm:max-w-md">
        <Icon name="search" className="size-4 shrink-0 text-ink-4" />
        <span className="truncate">Jump to a screen…</span>
        <kbd className="mono ml-auto hidden shrink-0 rounded border border-line bg-surface px-1.5 py-0.5 text-[10px] text-ink-3 lg:block">⌘K</kbd>
      </button>
      <button type="button" onClick={() => { setOpen(true); setQ('') }} aria-label="Jump to a screen"
        className="press rounded-md p-1.5 text-ink-3 hover:bg-surface-2 hover:text-ink sm:hidden">
        <Icon name="search" />
      </button>

      <Dialog open={open} onClose={() => setOpen(false)} title="Jump to a screen"
        sub={`${hits.length} of ${DESTS.length} screens`}>
        <div className="border-b border-line-soft px-4 py-3">
          <label className="flex items-center gap-2 rounded-lg border border-line bg-ground px-3 py-2">
            <Icon name="search" className="size-4 shrink-0 text-ink-4" />
            <span className="sr-only">Filter screens</span>
            <input value={q} onChange={(e) => setQ(e.target.value)} data-autofocus
              placeholder="Type a screen, a stage or a module code…"
              onKeyDown={(e) => {
                if (e.key === 'ArrowDown') { e.preventDefault(); setI((n) => Math.min(n + 1, hits.length - 1)) }
                if (e.key === 'ArrowUp') { e.preventDefault(); setI((n) => Math.max(n - 1, 0)) }
                if (e.key === 'Enter' && hits[i]) { e.preventDefault(); go(hits[i].href) }
              }}
              className="min-w-0 flex-1 bg-transparent text-[13px] outline-none placeholder:text-ink-4" />
          </label>
        </div>
        <div ref={listRef} role="listbox" aria-label="Screens" className="max-h-[50vh] overflow-y-auto p-1.5">
          {hits.length === 0 && (
            <p className="px-3 py-6 text-center text-[12.5px] text-ink-3">
              Nothing matches “{q}”. This searches screens, not stock.
            </p>
          )}
          {hits.map((d, n) => (
            <button key={d.href + d.label} type="button" role="option" aria-selected={n === i}
              onMouseEnter={() => setI(n)} onClick={() => go(d.href)}
              className={`press flex w-full items-center gap-2.5 rounded-md px-2.5 py-1.5 text-left transition-colors ${
                n === i ? 'bg-accent-tint' : 'hover:bg-surface-2'}`}>
              <span className="min-w-0 flex-1">
                <span className={`block truncate text-[12.5px] font-medium ${n === i ? 'text-accent-ink' : 'text-ink'}`}>
                  {d.label}
                </span>
                {d.note && <span className="block truncate text-[10.5px] text-ink-3">{d.note}</span>}
              </span>
              <span className="mono shrink-0 text-[9.5px] uppercase tracking-wider text-ink-3">{d.group}</span>
            </button>
          ))}
        </div>
      </Dialog>
    </>
  )
}
