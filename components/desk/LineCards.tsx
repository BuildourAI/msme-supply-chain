'use client'
import type { DerivedRow } from '@/lib/domain/derive'
import { Num } from '@/components/ui/Num'
import { StatusPill } from '@/components/ui/bits'
import { Icon, type IconName } from '@/components/ui/icons'
import { qtyText, shortDate, STATUS_LABEL, STATUS_TONE } from '@/lib/domain/format'
import { VendorSelect } from './VendorSelect'
import { RowActions, RowFlags } from './RowActions'
import { useDesk } from './store'

/**
 * SRC-01 as decision cards.
 *
 * The summary table asked a buyer to read seven cells left to right — a bare
 * code, a red number, another number, a dropdown, a rupee figure, a pill, a
 * button — and assemble the sentence in their head: "340 metres, that's under
 * the reorder point, so buy a thousand from Nirmal for ₹2.24 L." The sentence
 * is the thing they actually want, so the card writes it out.
 *
 * Nothing is lost in the translation. Every figure in the sentence is still a
 * <Num>: dotted underline, click for the formula that produced it. The supplier
 * is still the listbox that re-prices the line. The actions are the same
 * buttons, from the same component, with the same verbs.
 *
 * They sit in a grid rather than a stack, because a card of this shape leaves
 * half a screen unused when it is full width. The column count follows how many
 * lines are showing, so the four that need a decision make a 2 × 2 and all nine
 * make a 3 × 3, with no orphan sitting alone on a last row.
 */

const STATUS_ICON: Record<string, IconName> = {
  at_risk: 'alert', at_risk_late: 'clock', open_po_covers: 'truck', covered: 'check',
}

const TONE_RAIL: Record<string, string> = {
  critical: 'bg-critical', warn: 'bg-warn', accent: 'bg-accent', good: 'bg-good', neutral: 'bg-line',
}
const TONE_TEXT: Record<string, string> = {
  critical: 'text-critical', warn: 'text-warn', accent: 'text-accent-ink', good: 'text-good', neutral: 'text-ink-3',
}

/**
 * Days of cover against the lead time it has to beat.
 *
 * Two numbers a buyer has to compare are a comparison the screen can just make:
 * the fill is the cover, the notch is the lead time, and a fill short of the
 * notch is §8.1's case where ordering today is already too late.
 */
function CoverBar({ row }: { row: DerivedRow }) {
  const cover = row.coverDays.value
  const lead = row.leadTime.value
  const short = cover < lead
  const scale = Math.max(cover, lead) * 1.25 || 1
  return (
    <div className="mt-1.5">
      <div className="relative h-1.5 w-full overflow-hidden rounded-full bg-surface-3">
        <div className={`anim-reveal h-full rounded-full ${short ? 'bg-critical' : 'bg-good'}`}
             style={{ width: `${Math.min(100, (cover / scale) * 100)}%` }} />
        <div aria-hidden className="absolute top-0 h-full w-[2px] bg-ink"
             style={{ left: `${Math.min(99, (lead / scale) * 100)}%` }} />
      </div>
      <p className="mt-1 flex items-baseline gap-1.5 text-[10.5px] text-ink-3">
        <Num d={row.coverDays} format="days" suffix="d" size="sm"
             tone={short ? 'critical' : undefined} className="text-[10.5px]" />
        <span>of cover</span>
        <span aria-hidden className="ml-auto inline-block h-2 w-[2px] translate-y-[1px] bg-ink" />
        <span>lead {lead}d</span>
      </p>
    </div>
  )
}

/** Where the line stands, in a sentence, with every figure still inspectable. */
function Position({ row }: { row: DerivedRow }) {
  const uom = row.item.uom === 'm2' ? 'm²' : row.item.uom
  const s = row.status.value
  const spare = <> <Num d={row.usable} suffix={` ${uom}`} size="sm" /> usable</>

  return (
    <p className="text-[12.5px] leading-relaxed text-ink-2">
      {s === 'at_risk' && (
        <>
          {spare}, below the <Num d={row.reorderPoint} suffix={` ${uom}`} size="sm" /> reorder
          point — runs out <Num d={row.stockoutDate} format="shortdate" size="sm" tone="critical" />.
        </>
      )}
      {s === 'at_risk_late' && (
        <>
          {spare} plus <Num d={row.openPoQty} suffix={` ${uom}`} size="sm" /> on{' '}
          <span className="mono text-[11.5px]">{row.inboundRefs[0] ?? 'an open order'}</span>
          {row.earliestInboundEta && <> due {shortDate(row.earliestInboundEta)}</>} — but stock runs
          out <Num d={row.stockoutDate} format="shortdate" size="sm" tone="critical" />, before it lands.
        </>
      )}
      {s === 'open_po_covers' && (
        <>
          {spare} plus <Num d={row.openPoQty} suffix={` ${uom}`} size="sm" /> on order
          {row.earliestInboundEta && <>, landing {shortDate(row.earliestInboundEta)}</>} — ahead of
          the <Num d={row.stockoutDate} format="shortdate" size="sm" /> stockout.
        </>
      )}
      {s === 'covered' && (
        <>
          {spare} — <Num d={row.coverDays} format="days" suffix="d" size="sm" /> of cover against
          a {row.leadTime.value}-day lead.
        </>
      )}
      {row.nonUsable.value > 0 && (
        <span className="text-ink-3">
          {' '}(<Num d={row.nonUsable} suffix={` ${uom}`} size="sm" className="text-ink-3" /> more on
          hand cannot be issued.)
        </span>
      )}
    </p>
  )
}

/** What to do about it — the half of the card that costs money. */
function Proposal({ row }: { row: DerivedRow }) {
  const { state } = useDesk()
  const uom = row.item.uom === 'm2' ? 'm²' : row.item.uom
  const late = row.estimatedArrival.value > row.stockoutDate.value

  if (row.held.value) {
    return (
      <div className="mt-2.5 rounded-md border border-warn/30 bg-warn-soft/50 p-2">
        <p className="text-[12px] leading-relaxed text-ink-2">
          The {qtyText(row.item.moq, uom)} MOQ takes cover to{' '}
          <Num d={row.coverageAfterMonths} format="months" size="sm" tone="warn" suffix=" months" />,
          past the {state.policy.coverageCeiling[row.item.itemClass]}-month ceiling for class{' '}
          {row.item.itemClass} — <strong className="text-ink">held</strong>.
        </p>
      </div>
    )
  }

  if (row.reorderQty.value === 0) {
    return (
      <p className="mt-2.5 text-[12px] leading-relaxed text-ink-2">
        {row.status.value === 'at_risk_late'
          ? <><strong className="text-ink">Nothing to buy.</strong> Chase the order, not the quantity.</>
          : <><strong className="text-ink">Nothing to buy.</strong> This line is covered.</>}
      </p>
    )
  }

  return (
    <div className="mt-2.5">
      <p className="flex flex-wrap items-center gap-x-1.5 gap-y-1 text-[12.5px] text-ink-2">
        <span>Buy</span>
        <Num d={row.reorderQty} suffix={` ${uom}`} />
        <span>from</span>
      </p>
      <div className="mt-1" onClick={(e) => e.stopPropagation()}>
        <VendorSelect row={row} />
      </div>
      <p className="mt-1 text-[12px] text-ink-2">
        <Num d={row.landedTotal} format="money" className="font-medium" /> landed · arrives{' '}
        <Num d={row.estimatedArrival} format="shortdate" size="sm"
             tone={late ? 'critical' : undefined} />
        {late && <span className="text-critical">, after the stockout</span>}
      </p>
    </div>
  )
}

export function LineCards() {
  const { visible, state, select } = useDesk()
  const n = visible.length

  /* The grid is sized to the count, so a filter never leaves one card stranded
     on a row of its own with two empty columns beside it. Tailwind needs the
     class to exist as a literal, hence the lookup rather than a template. */
  const cols = n <= 1 ? ''
    : n === 2 || n === 4 ? 'md:grid-cols-2'
    : 'md:grid-cols-2 xl:grid-cols-3'

  if (n === 0) {
    return (
      <p className="px-4 py-6 text-center text-[12.5px] text-ink-2">
        No lines match that filter.
      </p>
    )
  }

  return (
    <ul className={`grid auto-rows-min items-start gap-2.5 p-3 ${cols}`}>
      {visible.map((r, i) => {
        const sel = r.item.id === state.selectedId
        const tone = STATUS_TONE[r.status.value] ?? 'neutral'
        return (
          <li key={r.item.id} data-line={r.item.code}
            onClick={() => select(r.item.id)}
            style={{ '--i': Math.min(i, 8) } as React.CSSProperties}
            className={`anim-fade-up relative flex cursor-pointer flex-col overflow-hidden rounded-md border pl-2.5 transition-colors ${
              sel ? 'border-accent bg-accent-soft/40' : 'border-line bg-surface hover:bg-surface-2'}`}>
            {/* the rail carries the status, never the selection — two meanings
                on one mark is how a colour stops meaning anything */}
            <span aria-hidden className={`absolute inset-y-0 left-0 w-1 ${TONE_RAIL[tone]}`} />

            <button type="button" onClick={() => select(r.item.id)} aria-pressed={sel}
              title={`Show ${r.item.code} in the two panels below`}
              className="cursor-pointer px-2.5 pb-1 pt-2.5 text-left">
              <span className="flex items-start justify-between gap-2">
                <span className="mono text-[11.5px] font-medium text-ink-2">{r.item.code}</span>
                <span className="inline-flex shrink-0 items-center gap-1.5">
                  <Icon name={STATUS_ICON[r.status.value] ?? 'activity'}
                        className={`size-3.5 shrink-0 ${TONE_TEXT[tone]}`} />
                  <StatusPill label={STATUS_LABEL[r.status.value]} tone={STATUS_TONE[r.status.value]}
                              explain={r.status.note} />
                </span>
              </span>
              <span className="mt-0.5 block truncate text-[13px] font-medium" title={r.item.name}>
                {r.item.name}
              </span>
            </button>

            <div className="px-2.5 pb-2.5">
              <Position row={r} />
              <CoverBar row={r} />
              <Proposal row={r} />
            </div>

            {/* the actions close the card. Cards hug their content rather than
                stretching to the tallest in the row: a short card stretched to
                match a tall one is a bordered box with a hole in it. */}
            <div className="mt-2 border-t border-line-soft px-2.5 py-2"
                 onClick={(e) => e.stopPropagation()}>
              <RowFlags row={r} />
              <RowActions row={r} flags={false} />
            </div>
          </li>
        )
      })}
    </ul>
  )
}
