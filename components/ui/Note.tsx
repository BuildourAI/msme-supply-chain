'use client'
import { useId, useState } from 'react'
import { Icon } from '@/components/ui/icons'

/**
 * An explanation, folded away until it is asked for.
 *
 * This build explains itself a lot — why a receipt has to close before stock
 * exists, why a document pack stops short of allocating an invoice number, why
 * a remnant is offered rather than netted off silently. Every one of those
 * paragraphs is true and worth having, and every one of them is read once and
 * then skipped forever. Left open they were four lines of prose above every
 * table and four more under it, and the screen read as an essay with some data
 * in it.
 *
 * So they collapse to a single line with an ⓘ on it. The text is not deleted,
 * not moved somewhere it loses its subject, and not shortened into something
 * less true — it is one click away from where it belongs.
 *
 * `foot` is the card variant: it carries the card's own padding and the
 * hairline that separates it from the content above.
 */
export function Note({ label, children, foot = false, className = '' }: {
  /** what the reader gets if they open it — specific beats "Learn more" */
  label: string
  children: React.ReactNode
  /** sits at the bottom of a Card rather than loose on the page */
  foot?: boolean
  className?: string
}) {
  const [open, setOpen] = useState(false)
  const id = useId()
  return (
    <div className={`${foot ? 'border-t border-line-soft px-4 py-1.5' : ''} ${className}`}>
      <button type="button" onClick={() => setOpen((v) => !v)}
        aria-expanded={open} aria-controls={id}
        className="press inline-flex items-center gap-1.5 rounded text-[11.5px] text-ink-3 transition-colors hover:text-ink">
        <Icon name="info" className="size-3.5 shrink-0" />
        <span>{label}</span>
        <Icon name="chevron" className={`size-2.5 shrink-0 transition-transform duration-200 ${
          open ? 'rotate-90' : ''}`} />
      </button>
      {open && (
        <div id={id}
             className={`anim-drop max-w-4xl text-[12px] leading-relaxed text-ink-2 ${foot ? 'pb-2 pt-1.5' : 'pt-1.5'}`}>
          {children}
        </div>
      )}
    </div>
  )
}
