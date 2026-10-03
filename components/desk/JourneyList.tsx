'use client'
import { useState } from 'react'
import { Icon } from '@/components/ui/icons'
import { JourneyDots, JourneyStrip } from '@/components/charts/journey'
import type { Journey, JourneyDoc } from '@/lib/workspace/journeys'

/**
 * A list of records read as journeys: a row each, its strip under it, and its
 * details only when the row is opened. Sales orders, purchase orders, job
 * cards and material out for jobwork all read this way, so they share it.
 *
 * The row says what it is in one line — its number, who, what, by when, how
 * late — and carries the one thing to do next as its only filled button. On
 * a phone the strip folds to five dots and a word until the row is opened,
 * when it stands up.
 *
 * `kind` names the record for the page's own data attributes: a row is
 * `[data-<kind>="<no>"]`, its chevron `[data-open-<kind>]` and its details
 * `[data-<kind>-open]`.
 */

export const Count = ({ n }: { n: number }) => (
  <span className="mono rounded-full bg-surface-3 px-1.5 text-[10.5px] font-normal text-ink-3">{n}</span>
)

/** A quieter action, for the opened row. */
export function Quiet({ onClick, danger = false, children }: { onClick: () => void; danger?: boolean; children: React.ReactNode }) {
  return (
    <button type="button" onClick={onClick}
      className={`press rounded-lg border border-line bg-surface px-2.5 py-1.5 text-[12.5px] font-medium hover:bg-surface-2 ${
        danger ? 'text-critical hover:bg-critical-soft' : 'text-ink'}`}>
      {children}
    </button>
  )
}

/** A small heading inside an opened row — "What they ordered", "Papers". */
export const Sub = ({ children }: { children: React.ReactNode }) => (
  <h4 className="mb-1.5 text-[10.5px] font-bold uppercase tracking-[0.07em] text-ink-3">{children}</h4>
)

export function JourneyRow({
  kind, no, who, what, value, when, journey, doneText, note, open, onToggle, onAct, onDoc, children, detailsClass = 'space-y-3',
}: {
  kind: string
  no: string
  who: string
  what: string
  /** money, said on a laptop only — a phone row has room for what and when */
  value?: string
  when: string
  journey: Journey<{ kind: string; label: string }>
  /** the green word once it is over — "Delivered 21 Sep" */
  doneText?: string
  /** anything else the header must say — a promise at risk */
  note?: React.ReactNode
  open: boolean
  onToggle: () => void
  onAct?: () => void
  onDoc?: (d: JourneyDoc) => void
  /** the details, drawn only while open */
  children?: React.ReactNode
  detailsClass?: string
}) {
  const j = journey
  const flag = j.cancelled ? { tone: 'neutral', text: 'Cancelled' }
    : j.late > 0 ? { tone: 'late', text: j.lateText ?? `${j.late} days late` }
      : j.done && doneText ? { tone: 'good', text: doneText } : null
  const stop = (e: React.MouseEvent) => e.stopPropagation()
  const attrs = { [`data-${kind}`]: no, 'data-where': j.where }

  return (
    <li {...attrs}
      className={`rounded-[14px] border bg-surface ${open ? 'border-accent/40 shadow-[inset_0_0_0_1px_var(--accent-soft)]' : 'border-line'}`}>
      {/* the whole top of the row opens it; the chevron is the same, for a keyboard */}
      <div className="cursor-pointer px-3.5 pb-2 pt-3 sm:px-4" onClick={onToggle}>
        <div className="flex items-center gap-3">
          <div className="min-w-0 flex-1 sm:flex sm:flex-wrap sm:items-center sm:gap-x-3 sm:gap-y-1">
            <div className="flex min-w-0 items-baseline gap-2">
              <span className="mono whitespace-nowrap text-[13.5px] font-bold text-ink">{no}</span>
              <span className="truncate text-[13.5px] font-semibold text-ink">{who}</span>
            </div>
            <div className="truncate text-[12px] text-ink-3 sm:text-[12.5px]">
              <span className="sm:text-ink-2">{what}</span>
              {value && <span className="hidden sm:inline"> · <span className="num">{value}</span></span>}
              <span> · {when}</span>
            </div>
            {flag && (
              <span data-flag={flag.tone} className={`hidden items-center gap-1 rounded-full px-2.5 py-0.5 text-[11.5px] font-bold sm:inline-flex ${
                flag.tone === 'late' ? 'bg-critical-soft text-critical' : flag.tone === 'good' ? 'bg-good-soft text-good' : 'bg-surface-2 text-ink-3'}`}>
                <Icon name={flag.tone === 'late' ? 'alert' : flag.tone === 'good' ? 'check' : 'close'} className="size-3" />
                {flag.text}
              </span>
            )}
            {note && <span className="hidden sm:inline">{note}</span>}
          </div>
          <span className="sm:hidden"><JourneyDots journey={j} /></span>
          {j.act && onAct && (
            <button type="button" data-act={j.act.kind} onClick={(e) => { stop(e); onAct() }}
              className="press hidden shrink-0 items-center gap-1.5 rounded-lg bg-accent-ink px-3 py-1.5 text-[12.5px] font-semibold text-on-accent hover:bg-accent sm:inline-flex">
              {j.act.label}<Icon name="arrow-right" className="size-3.5" />
            </button>
          )}
          <button type="button" onClick={(e) => { stop(e); onToggle() }} aria-expanded={open} {...{ [`data-open-${kind}`]: no }}
            title={open ? `Close ${no}` : `Open ${no}`}
            className="press -mr-1.5 shrink-0 rounded-md p-0.5 text-ink-3 hover:bg-surface-2 hover:text-ink sm:mr-0 sm:p-1">
            <Icon name="chevron" className={`size-4 transition-transform ${open ? 'rotate-90' : ''}`} />
            <span className="sr-only">{open ? 'Close' : 'Open'} {no}</span>
          </button>
        </div>
        {/* on a phone the dots stand in for the strip until the row is opened */}
        <JourneyStrip journey={j} label={no} small hideLate onDoc={onDoc}
          className={`mt-2.5 ${open ? '' : 'hidden sm:block'}`} />
      </div>

      {open && (
        <div {...{ [`data-${kind}-open`]: no }}
          className={`rounded-b-[14px] border-t border-line-soft bg-surface-2/60 px-3.5 py-3 sm:px-4 ${detailsClass}`}>
          {/* the one thing to do sits in the header on a laptop; on a phone it leads the details */}
          {j.act && onAct && (
            <div className="sm:hidden">
              <button type="button" onClick={onAct}
                className="press inline-flex items-center gap-1.5 rounded-lg bg-accent-ink px-3 py-1.5 text-[12.5px] font-semibold text-on-accent hover:bg-accent">
                {j.act.label}<Icon name="arrow-right" className="size-3.5" />
              </button>
            </div>
          )}
          {note && <div className="sm:hidden">{note}</div>}
          {children}
        </div>
      )}
    </li>
  )
}

export interface JourneyGroup<T> { key: string; title: string; rows: T[] }

/**
 * The groups, each under its heading, and what is over folded under one
 * line. When nothing open is left in view — a search for an old record, or a
 * filter for the finished ones — the finished ones are simply shown.
 */
export function JourneyGroups<T>({ name, groups, over = [], overWords, overTitle, row, empty = 'Nothing matches.' }: {
  name: string
  groups: JourneyGroup<T>[]
  over?: T[]
  /** the fold's words — "5 delivered · 1 cancelled" */
  overWords?: string
  /** the heading when the finished ones are all there is */
  overTitle?: string
  row: (r: T) => React.ReactNode
  empty?: string
}) {
  const [showOver, setShowOver] = useState(false)
  const open = groups.reduce((a, g) => a + g.rows.length, 0)
  if (open === 0 && over.length === 0) {
    return <p className="rounded-xl border border-line bg-surface px-6 py-10 text-center text-[13px] text-ink-3">{empty}</p>
  }
  const group = (g: JourneyGroup<T>) => g.rows.length > 0 && (
    <section key={g.key} data-group={g.key} className="space-y-2">
      <h3 className="flex items-center gap-2 px-1 pt-1 text-[11px] font-bold uppercase tracking-[0.07em] text-ink-3">
        {g.title}<Count n={g.rows.length} />
      </h3>
      <ul className="space-y-2">{g.rows.map(row)}</ul>
    </section>
  )
  return (
    <div className="space-y-3" data-board={name}>
      {groups.map(group)}
      {over.length > 0 && (open === 0
        ? group({ key: 'over', title: overTitle ?? 'Over', rows: over })
        : (
          <>
            <button type="button" onClick={() => setShowOver((s) => !s)} data-fold aria-expanded={showOver}
              className="flex w-full items-center gap-3 px-1 pt-2 text-[12.5px] text-ink-3">
              <i className="flex-1 border-t border-line" />
              <span>{overWords} · <span className="font-semibold text-accent-ink underline underline-offset-2">{showOver ? 'hide them' : 'show them'}</span></span>
              <i className="flex-1 border-t border-line" />
            </button>
            {showOver && group({ key: 'over', title: overTitle ?? 'Over', rows: over })}
          </>
        ))}
    </div>
  )
}
