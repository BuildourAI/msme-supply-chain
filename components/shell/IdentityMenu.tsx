'use client'
import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Icon } from '@/components/ui/icons'
import { useWorkspace } from '@/components/workspace/store'
import { ROLE_LABEL } from '@/lib/workspace/types'

/**
 * Whose data am I looking at, and how do I get back?
 *
 * The chevron beside the avatar has been decorative since the shell was built.
 * It now opens the one control that matters once there are two companies: which
 * one is on screen. An owner who wanders into the sample company and cannot
 * find the way out of it has lost their own data as far as they can tell.
 *
 * Dismissal follows the supplier listbox and the heading filters: a click
 * anywhere else, or Escape.
 */
export function IdentityMenu() {
  const { mode, workspace, session, hasAccount, setMode, signOut } = useWorkspace()
  const [open, setOpen] = useState(false)
  const box = useRef<HTMLDivElement>(null)
  const router = useRouter()

  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      if (!box.current?.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  const [who, role] = session.actor.includes(' · ')
    ? session.actor.split(' · ')
    : [session.actor, ROLE_LABEL[session.role]]
  const initials = who.split(/[\s.]+/).filter(Boolean).map((w) => w[0]).join('').slice(0, 2).toUpperCase()
  const company = mode === 'mine' && workspace ? workspace.company.name : 'Sample company'

  return (
    <div ref={box} className="relative">
      <button type="button" onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu" aria-expanded={open} aria-label="Account and company"
        className="press flex items-center gap-2 rounded-md py-1 pl-1 pr-1.5 transition-colors hover:bg-surface-2">
        <span aria-hidden className="grid size-7 shrink-0 place-items-center rounded-full bg-accent-tint text-[11px] font-bold text-accent-ink">
          {initials}
        </span>
        <span className="hidden min-w-0 sm:block text-left">
          <span className="block truncate text-[12px] font-semibold leading-tight">{who}</span>
          <span className="block truncate text-[10.5px] leading-tight text-ink-3">{company}</span>
        </span>
        <Icon name="chevron" className={`hidden size-3 text-ink-4 transition-transform sm:block ${
          open ? '-rotate-90' : 'rotate-90'}`} />
      </button>

      {open && (
        <div role="menu"
          className="anim-drop absolute right-0 top-[calc(100%+6px)] z-50 w-64 rounded-lg border border-line bg-surface p-1 shadow-xl">
          <p className="px-2.5 pb-1 pt-1.5 text-[10.5px] uppercase tracking-wider text-ink-3 mono">
            Showing
          </p>

          {hasAccount && workspace && (
            <button type="button" role="menuitem"
              onClick={() => { setMode('mine'); setOpen(false) }}
              className={`flex w-full items-start gap-2 rounded-md px-2.5 py-1.5 text-left transition-colors hover:bg-surface-2 ${
                mode === 'mine' ? 'text-accent-ink' : 'text-ink-2'}`}>
              <Icon name="check" className={`mt-0.5 size-3.5 shrink-0 ${mode === 'mine' ? '' : 'opacity-0'}`} />
              <span className="min-w-0">
                <span className="block truncate text-[12.5px] font-medium">{workspace.company.name}</span>
                <span className="block text-[11px] leading-snug text-ink-3">your own data</span>
              </span>
            </button>
          )}

          <button type="button" role="menuitem"
            onClick={() => { setMode('sample'); setOpen(false) }}
            className={`flex w-full items-start gap-2 rounded-md px-2.5 py-1.5 text-left transition-colors hover:bg-surface-2 ${
              mode === 'sample' ? 'text-accent-ink' : 'text-ink-2'}`}>
            <Icon name="check" className={`mt-0.5 size-3.5 shrink-0 ${mode === 'sample' ? '' : 'opacity-0'}`} />
            <span className="min-w-0">
              <span className="block truncate text-[12.5px] font-medium">Sample company</span>
              <span className="block text-[11px] leading-snug text-ink-3">
                a worked example · nobody&rsquo;s real trading data
              </span>
            </span>
          </button>

          <div className="my-1 border-t border-line-soft" />

          {hasAccount ? (
            <button type="button" role="menuitem"
              onClick={() => { signOut(); setOpen(false); router.push('/') }}
              className="flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-[12.5px] text-ink-2 transition-colors hover:bg-surface-2">
              <Icon name="lock" className="size-3.5 shrink-0" />
              Sign out
            </button>
          ) : (
            <button type="button" role="menuitem"
              onClick={() => { setOpen(false); router.push('/') }}
              className="flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-[12.5px] text-accent-ink transition-colors hover:bg-surface-2">
              <Icon name="arrow-right" className="size-3.5 shrink-0" />
              Set up my company
            </button>
          )}

          <p className="px-2.5 pb-1.5 pt-1 text-[10.5px] leading-snug text-ink-3">
            {role}
          </p>
        </div>
      )}
    </div>
  )
}
