'use client'
import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Icon } from './icons'

/**
 * A filter that lives in the column heading it filters.
 *
 * A row of chips above a table tells you what someone thought you would want to
 * narrow by. A control on the heading tells you that the column itself is
 * filterable, and puts the choice where the eye already is. The options carry
 * their own counts, so the menu says what it will show before you pick it.
 *
 * The panel is portalled to the body and positioned from the trigger's rect.
 * Wide tables live inside a horizontal scroll container, and `overflow-x: auto`
 * clips on both axes — a panel rendered inside the cell would be cut off at the
 * table's edge or, worse, grow the scroll area. `position: fixed` alone is not
 * enough either: a transformed ancestor becomes the containing block for fixed
 * children, and the cards on these pages animate on transform. The Dialog in
 * this build portals for exactly the same reason.
 *
 * Dismissal follows the supplier listbox on the Sourcing Desk: a click
 * anywhere else, or Escape. It also closes on scroll and resize, because a
 * panel pinned to coordinates the trigger has moved away from is worse than no
 * panel at all.
 */
export interface HeadOption {
  value: string
  label: string
  /** what picking it will show — a count, a total, anything short */
  meta?: string
}

export function HeadFilter({ label, options, value, onPick, allLabel = 'All', allMeta, className = '' }: {
  label: string
  options: HeadOption[]
  value?: string
  onPick: (v?: string) => void
  allLabel?: string
  allMeta?: string
  className?: string
}) {
  const [open, setOpen] = useState(false)
  const [at, setAt] = useState<{ left: number; top: number } | null>(null)
  const trigger = useRef<HTMLButtonElement>(null)
  const panel = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node
      if (!trigger.current?.contains(t) && !panel.current?.contains(t)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    const onMove = () => setOpen(false)
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    window.addEventListener('scroll', onMove, true)
    window.addEventListener('resize', onMove)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
      window.removeEventListener('scroll', onMove, true)
      window.removeEventListener('resize', onMove)
    }
  }, [open])

  const toggle = () => {
    const r = trigger.current?.getBoundingClientRect()
    if (r) setAt({ left: Math.max(8, Math.min(r.left, window.innerWidth - 248)), top: r.bottom + 4 })
    setOpen((v) => !v)
  }

  const chosen = value ? (options.find((o) => o.value === value)?.label ?? value) : null

  return (
    <>
      <button ref={trigger} type="button" onClick={toggle}
        aria-haspopup="listbox" aria-expanded={open}
        title={chosen ? `${label}: showing only ${chosen} — click to change` : `Filter by ${label.toLowerCase()}`}
        className={`press inline-flex max-w-[12rem] items-center gap-1 rounded transition-colors hover:text-ink ${
          chosen ? 'font-semibold text-accent-ink' : 'text-ink-3'} ${className}`}>
        {chosen && <Icon name="filter" className="size-3 shrink-0" />}
        <span className="truncate">{chosen ?? label}</span>
        <Icon name="chevron" className={`size-2.5 shrink-0 rotate-90 transition-transform ${open ? '-rotate-90' : ''}`} />
      </button>

      {open && at && createPortal(
        <div ref={panel} role="listbox" aria-label={label}
          style={{ left: at.left, top: at.top }}
          className="anim-drop fixed z-50 max-h-[18rem] min-w-[14rem] overflow-y-auto rounded-md border border-line bg-surface p-1 shadow-xl">
          <button type="button" role="option" aria-selected={!value}
            onClick={() => { onPick(undefined); setOpen(false) }}
            className={`flex w-full items-baseline gap-2 rounded-md px-2 py-1 text-left text-[11.5px] transition-colors hover:bg-surface-2 ${
              !value ? 'font-medium text-accent-ink' : 'text-ink-2'}`}>
            {allLabel}
            {allMeta && <span className="num ml-auto shrink-0 text-[10.5px] text-ink-3">{allMeta}</span>}
          </button>
          {options.map((o) => (
            <button key={o.value} type="button" role="option" aria-selected={value === o.value}
              onClick={() => { onPick(value === o.value ? undefined : o.value); setOpen(false) }}
              className={`flex w-full items-baseline gap-2 rounded-md px-2 py-1 text-left text-[11.5px] transition-colors hover:bg-surface-2 ${
                value === o.value ? 'font-medium text-accent-ink' : 'text-ink-2'}`}>
              <span className="truncate">{o.label}</span>
              {o.meta && <span className="num ml-auto shrink-0 text-[10.5px] text-ink-3">{o.meta}</span>}
            </button>
          ))}
        </div>,
        document.body,
      )}
    </>
  )
}

/**
 * The same heading, for a column that is ordered rather than picked from.
 * One click sorts, a second reverses, and the arrow says which way.
 */
export function HeadSort({ label, active, dir, onSort, title, className = '' }: {
  label: string
  active: boolean
  dir: 'asc' | 'desc'
  onSort: () => void
  title?: string
  className?: string
}) {
  return (
    <button type="button" onClick={onSort}
      title={title ?? `Sort by ${label.toLowerCase()}`}
      className={`press inline-flex items-center gap-1 rounded transition-colors hover:text-ink ${
        active ? 'font-semibold text-accent-ink' : 'text-ink-3'} ${className}`}>
      <span>{label}</span>
      <span aria-hidden className="text-[9px]">{active ? (dir === 'asc' ? '▲' : '▼') : '↕'}</span>
      {active && <span className="sr-only">sorted {dir === 'asc' ? 'ascending' : 'descending'}</span>}
    </button>
  )
}
