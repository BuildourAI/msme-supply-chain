'use client'
import Link from 'next/link'
import { Icon } from '@/components/ui/icons'
import { BAND_LABEL, byBand, type Act, type Band, type Decision } from '@/lib/workspace/decisions'

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
 * A band shows the worst few and offers the rest. A queue you page through is
 * not a queue, and if a band is long enough to need paging the bands are wrong.
 */
const SHOW = 5

const DOT: Record<Band, string> = {
  stops: 'bg-critical',
  costs: 'bg-warn',
  unfinished: 'bg-ink-4',
}

export function Queue({ rows, onAct, showAll, onShowAll }: {
  rows: Decision[]
  onAct: (d: Decision, act: Act) => void
  /** bands the owner has opened up */
  showAll: Set<Band>
  onShowAll: (b: Band) => void
}) {
  if (rows.length === 0) {
    return (
      <div className="rounded-xl border border-good/30 bg-good-soft/40 px-4 py-6 text-center">
        <span aria-hidden className="mx-auto mb-2 grid size-9 place-items-center rounded-lg bg-good-soft text-good">
          <Icon name="check" className="size-5" />
        </span>
        <p className="text-[14px] font-semibold">Nothing needs you</p>
        <p className="mt-1 text-[12.5px] text-ink-2">
          Every price is decided, every order is out, and nothing is late.
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {byBand(rows).map((g) => {
        const open = showAll.has(g.band)
        const shown = open ? g.rows : g.rows.slice(0, SHOW)
        const rest = g.rows.length - shown.length
        return (
          <section key={g.band}>
            <h3 className="mb-1.5 flex items-center gap-2">
              <span aria-hidden className={`size-1.5 rounded-full ${DOT[g.band]}`} />
              <span className="text-[11px] font-semibold uppercase tracking-[0.07em] text-ink-3">
                {BAND_LABEL[g.band]}
              </span>
              <span className="mono text-[11px] text-ink-4">{g.rows.length}</span>
            </h3>
            <ul className="overflow-hidden rounded-xl border border-line bg-surface">
              {shown.map((d) => <Row key={d.id} d={d} onAct={onAct} />)}
              {rest > 0 && (
                <li className="border-t border-line-soft">
                  <button type="button" onClick={() => onShowAll(g.band)}
                    className="press w-full px-4 py-2 text-left text-[12px] text-ink-3 hover:bg-surface-2">
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

function Row({ d, onAct }: { d: Decision; onAct: (d: Decision, act: Act) => void }) {
  return (
    <li className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-line-soft px-4 py-2.5 last:border-0">
      <span className="min-w-0 flex-1 basis-56">
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
