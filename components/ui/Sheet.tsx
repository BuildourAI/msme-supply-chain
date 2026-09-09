'use client'
import { useEffect } from 'react'

/**
 * A side sheet: the derivation inspector and the activity trail are the same
 * piece of furniture with different contents, and until now they were the same
 * forty lines of markup in two files. One place to style, one place to get the
 * backdrop, the escape key and the sticky header right.
 *
 * Structure is deliberately unchanged from the two originals — role="dialog",
 * aria-modal, aria-label — because the browser suites find these sheets by role
 * and name, not by class.
 */
export function Sheet({ open, onClose, label, eyebrow, title, children, z = 'z-[60]' }: {
  open: boolean; onClose: () => void
  /** the accessible name — what a screen reader announces */
  label: string
  eyebrow: string; title: string
  children: React.ReactNode
  /** the activity drawer sits under the inspector so a figure can be opened from it */
  z?: string
}) {
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open) return null
  return (
    <div className={`anim-backdrop fixed inset-0 ${z} flex justify-end bg-ink/20`} onClick={onClose}>
      <aside role="dialog" aria-modal="true" aria-label={label}
        onClick={(e) => e.stopPropagation()}
        className="anim-sheet glass flex h-full w-full max-w-md flex-col overflow-y-auto rounded-l-2xl border-l shadow-2xl">
        <header className="glass sticky top-0 z-10 flex items-start gap-3 border-b px-4 py-3">
          <div>
            <p className="mono text-[10px] uppercase tracking-wider text-ink-3">{eyebrow}</p>
            <h2 className="mt-0.5 text-[17px]">{title}</h2>
          </div>
          <button type="button" onClick={onClose} aria-label="Close"
            className="press ml-auto rounded-full p-1 text-ink-3 hover:bg-surface-2 hover:text-ink">✕</button>
        </header>
        {children}
      </aside>
    </div>
  )
}
