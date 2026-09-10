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

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    const t = window.setTimeout(() => {
      ref.current?.querySelector<HTMLElement>('[data-autofocus], button, input, textarea')?.focus()
    }, 20)
    return () => { document.removeEventListener('keydown', onKey); window.clearTimeout(t) }
  }, [open, onClose])

  if (!open || !mounted) return null
  return createPortal(
    <div className="anim-backdrop fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-ink/30 p-4 pt-[10vh]"
         onClick={onClose}>
      <div ref={ref} role="dialog" aria-modal="true" aria-label={title}
           onClick={(e) => e.stopPropagation()}
           className={`anim-pop glass w-full rounded-xl border shadow-xl ${wide ? 'max-w-3xl' : 'max-w-lg'}`}>
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
