'use client'
import { useEffect, useRef } from 'react'

export function Dialog({ open, onClose, title, sub, children, wide }: {
  open: boolean; onClose: () => void; title: string; sub?: string
  children: React.ReactNode; wide?: boolean
}) {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    const t = window.setTimeout(() => {
      ref.current?.querySelector<HTMLElement>('[data-autofocus], button, input, textarea')?.focus()
    }, 20)
    return () => { document.removeEventListener('keydown', onKey); window.clearTimeout(t) }
  }, [open, onClose])

  if (!open) return null
  return (
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
    </div>
  )
}
