'use client'
import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

export function Dialog({ open, onClose, title, sub, children, wide }: {
  open: boolean; onClose: () => void; title: string; sub?: string
  children: React.ReactNode; wide?: boolean
}) {
  const ref = useRef<HTMLDivElement>(null)
  // Rendered into the body, not where it is written. Every Dialog here is
  // written inside a card, and a card now carries a backdrop-filter — which
  // makes it the containing block for `position: fixed`, so the scrim would
  // cover the card instead of the viewport. Mounted state keeps the server
  // and the first client render identical.
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])

  /*
   * Held in a ref so that a caller passing a fresh arrow function on every
   * render — which is most of them — cannot retrigger the effects below.
   */
  const close = useRef(onClose)
  close.current = onClose

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') close.current() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open])

  /*
   * Focus the first field, once, when the dialog opens.
   *
   * `[open]` and nothing else, which is what this always meant. It used to
   * depend on `onClose` as well, and a dialog whose owner re-renders while you
   * type — the upload wizard, because its close handler lives inside itself —
   * re-ran this on every keystroke. Twenty milliseconds later focus jumped out
   * of whatever you were typing in, and since the first focusable thing was the
   * ✕ in the header, the first SPACE in a supplier's name pressed it and shut
   * the whole dialog mid-word.
   *
   * The order matters too: a field before the close button, or opening a dialog
   * parks the caret on "cancel". A hidden file input is skipped — it is the
   * drop zone's, and focusing it reaches nothing a person can see.
   */
  useEffect(() => {
    if (!open) return
    const t = window.setTimeout(() => {
      ref.current?.querySelector<HTMLElement>(
        '[data-autofocus], input:not([type="file"]), select, textarea, button',
      )?.focus()
    }, 20)
    return () => window.clearTimeout(t)
  }, [open])

  if (!open || !mounted) return null
  return createPortal(
    <div className="anim-backdrop fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-ink/30 p-4 pt-[10vh]"
         onClick={onClose}>
      <div ref={ref} role="dialog" aria-modal="true" aria-label={title}
           onClick={(e) => e.stopPropagation()}
           className={`anim-pop overlay w-full rounded-lg border ${wide ? 'max-w-3xl' : 'max-w-lg'}`}>
        <header className="flex items-start gap-3 border-b border-line-soft px-4 py-3">
          <div className="min-w-0">
            <h2 className="text-[15px]">{title}</h2>
            {sub && <p className="mt-0.5 text-[12px] text-ink-3">{sub}</p>}
          </div>
          <button type="button" onClick={onClose} aria-label="Close"
            className="press ml-auto rounded-full p-1 text-ink-3 hover:bg-surface-2 hover:text-ink">✕</button>
        </header>
        {children}
      </div>
    </div>,
    document.body,
  )
}
