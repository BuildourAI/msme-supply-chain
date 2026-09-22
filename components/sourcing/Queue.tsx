'use client'
import Link from 'next/link'
import { Icon, type IconName } from '@/components/ui/icons'
import {
  BAND_LABEL, byBand, type Act, type Band, type Decision, type DecisionKind,
} from '@/lib/workspace/decisions'

/**
 * What needs you, as rows you can clear.
 *
 * Three bands, headed by why something is in the list rather than which record
 * it came from — grouping by type would just rebuild the tabs inside one page.
 * Within a band, the worst first.
 *
 * The rule on the buttons is that navigating is a last resort: eight of the
 * eleven decisions carry everything the decision needs on the row, so they are
 * taken on the row. `open` is for the three that genuinely need a screen — a
 * document to read line by line, a comparison across five cost components, a
 * material with no supplier at all.
 *
 * Every row carries the icon of the thing it is about, which is what lets a
 * long band be read by shape rather than by reading every line: four lorries
 * in a row is four late deliveries, whatever the suppliers are called. The
 * icon is never the only signal — the sentence beside it says the same thing,
 * so nothing is lost in monochrome or to a screen reader.
 *
 * A band shows the worst few and offers the rest. A queue you page through is
 * not a queue, and if a band is long enough to need paging the bands are wrong.
 */
const SHOW = 5

/** The band's colour, on its rule and its count. */
const BAND: Record<Band, { dot: string; rule: string; pill: string }> = {
  stops: {
    dot: 'bg-critical',
    rule: 'before:bg-critical',
    pill: 'bg-critical-soft text-critical',
  },
  costs: {
    dot: 'bg-warn',
    rule: 'before:bg-warn',
    pill: 'bg-warn-soft text-warn',
  },
  unfinished: {
    dot: 'bg-ink-4',
    rule: 'before:bg-line',
    pill: 'bg-surface-3 text-ink-2',
  },
}

/**
 * What each row is about, as a picture.
 *
 * Chosen for the noun rather than the verb — a late order and an order to send
 * are both a cart, because both are that order. Reading a band by shape only
 * works if the shapes mean the thing rather than the action.
 */
const KIND: Record<DecisionKind, IconName> = {
  'at-risk': 'boxes',
  late: 'truck',
  unsourced: 'boxes',
  flip: 'scale',
  stale: 'scale',
  unfiled: 'doc',
  undecided: 'scale',
  unordered: 'cart',
  'no-qty': 'cart',
  unsent: 'cart',
  'to-receive': 'tray',
  'no-reply': 'doc',
}

export function Queue({ rows, onAct, showAll, onShowAll }: {
  rows: Decision[]
  onAct: (d: Decision, act: Act) => void
  /** bands the owner has opened up */
  showAll: Set<Band>
  onShowAll: (b: Band) => void
}) {
  if (rows.length === 0) return <Clear />

  return (
    <div className="space-y-4">
      {byBand(rows).map((g, gi) => {
        const open = showAll.has(g.band)
        const shown = open ? g.rows : g.rows.slice(0, SHOW)
        const rest = g.rows.length - shown.length
        const skin = BAND[g.band]
        return (
          <section key={g.band} className="anim-fade-up"
            style={{ '--i': gi } as React.CSSProperties}>
            <h3 className="mb-1.5 flex items-center gap-2">
              <span aria-hidden className={`size-1.5 rounded-full ${skin.dot}`} />
              <span className="text-[11px] font-semibold uppercase tracking-[0.07em] text-ink-3">
                {BAND_LABEL[g.band]}
              </span>
              <span className={`mono rounded-full px-1.5 py-px text-[10.5px] font-semibold ${skin.pill}`}>
                {g.rows.length}
              </span>
            </h3>
            {/*
              * The band's colour as a rule down its left edge, so a long screen
              * can be scanned for the red one without reading a word.
              */}
            <ul className={`relative overflow-hidden rounded-xl border border-line bg-surface
              before:absolute before:inset-y-0 before:left-0 before:w-[3px] ${skin.rule}`}>
              {shown.map((d, i) => (
                <Row key={d.id} d={d} i={i} band={g.band} onAct={onAct} />
              ))}
              {rest > 0 && (
                <li className="border-t border-line-soft">
                  <button type="button" onClick={() => onShowAll(g.band)}
                    className="press w-full px-4 py-2 pl-5 text-left text-[12px] text-ink-3 hover:bg-surface-2">
                    and {rest} more
                  </button>
                </li>
              )}
            </ul>
          </section>
        )
      })}
    </div>
  )
}

function Row({ d, i, band, onAct }: {
  d: Decision; i: number; band: Band; onAct: (d: Decision, act: Act) => void
}) {
  return (
    <li style={{ '--i': i + 1 } as React.CSSProperties}
      className="anim-fade-up flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-line-soft
        py-2.5 pl-5 pr-4 transition-colors last:border-0 hover:bg-surface-2">
      <span aria-hidden className={`grid size-7 shrink-0 place-items-center rounded-md ${
        BAND[band].pill}`}>
        <Icon name={KIND[d.kind]} className="size-3.5" />
      </span>
      <span className="min-w-0 flex-1 basis-48">
        <span className="block truncate text-[13px] font-semibold">{d.title}</span>
        <span className="block truncate text-[11.5px] text-ink-3">{d.detail}</span>
      </span>
      <span className="ml-auto flex shrink-0 items-center gap-1">
        {d.alt && (
          <button type="button" onClick={() => onAct(d, d.alt!.act)}
            className="press rounded-md px-2 py-1 text-[12px] text-ink-3 hover:text-ink">
            {d.alt.label}
          </button>
        )}
        {/*
          * Navigating is a link, so it behaves like one — middle-click, open in
          * a tab, the browser's own back. Deciding is a button, because it
          * changes something.
          */}
        {d.act === 'open' ? (
          <Link href={d.href}
            className="press rounded-md border border-line bg-surface px-2.5 py-1 text-[12px] font-medium hover:bg-surface-2">
            {d.actLabel}
          </Link>
        ) : (
          <button type="button" onClick={() => onAct(d, d.act)}
            className="press rounded-md border border-line bg-surface px-2.5 py-1 text-[12px] font-medium hover:bg-surface-2">
            {d.actLabel}
          </button>
        )}
      </span>
    </li>
  )
}

/**
 * The goal state, said plainly.
 *
 * Worth a moment of pleasure rather than a blank panel: this is the thing the
 * screen is FOR, and somebody who has just cleared five decisions should be
 * told they are done rather than shown an absence.
 */
function Clear() {
  return (
    <div className="anim-pop rounded-xl border border-good/30 bg-good-soft/40 px-4 py-7 text-center">
      <span aria-hidden className="relative mx-auto mb-2.5 grid size-11 place-items-center">
        <svg viewBox="0 0 44 44" className="absolute inset-0 -rotate-90 size-11">
          <circle cx="22" cy="22" r="19" fill="none" stroke="var(--good)" strokeOpacity=".25"
            strokeWidth="2.5" />
          <circle cx="22" cy="22" r="19" fill="none" stroke="var(--good)" strokeWidth="2.5"
            strokeLinecap="round" className="anim-arc" strokeDasharray="119 119" />
        </svg>
        <Icon name="check" className="relative size-5 text-good" />
      </span>
      <p className="text-[14.5px] font-bold">Nothing needs you</p>
      <p className="mx-auto mt-1 max-w-[30rem] text-[12.5px] leading-relaxed text-ink-2">
        Every price is decided, every order is out, and nothing is late.
      </p>
    </div>
  )
}
