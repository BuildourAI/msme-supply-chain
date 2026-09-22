'use client'
import Link from 'next/link'
import { Icon, type IconName } from '@/components/ui/icons'
import { money } from '@/lib/domain/format'
import { arrivesIn, type Berth } from '@/lib/workspace/flight'
import {
  BAND_LABEL, byBand, type Act, type Band, type Decision, type DecisionKind,
} from '@/lib/workspace/decisions'

/**
 * The morning, as two columns.
 *
 * Left is everything waiting on a person; right is everything already out with
 * a supplier. That split is the whole design: a list of jobs beside a list of
 * what is on its way answers both of the questions an owner opens this screen
 * with — what do I have to do, and what is coming — without either one being a
 * screen you have to remember to visit.
 *
 * The two sides cannot say the same thing twice. `flight.ts` sets out the
 * partition they rest on: an open order is late, due, or still coming, and
 * exactly one of those is true of it. Late and due are decisions and live on
 * the left; still coming needs nobody and lives on the right.
 *
 * Within the left column the three bands are sub-headed rather than separated,
 * because grouping by which record something came from would just rebuild the
 * tabs inside one page; the heading says WHY it is in the list. Within the
 * right column the heading is the supplier, which is how the orders themselves
 * are grouped — one document per supplier is the rule this build already
 * holds.
 *
 * Every card is the same three things in the same order: a picture of what it
 * is about, the sentence, and the one thing you do about it. A long band can
 * then be read by shape rather than by reading every line — four lorries in a
 * row is four late deliveries, whatever the suppliers are called. The icon is
 * never the only signal; the sentence beside it says the same thing, so
 * nothing is lost in monochrome or to a screen reader.
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

/** A band's colour, on its card, its disc and its count. */
interface Skin { card: string; disc: string; dot: string; pill: string }

const BAND: Record<Band, Skin> = {
  stops: {
    card: 'bg-critical-soft',
    disc: 'bg-surface text-critical',
    dot: 'bg-critical',
    pill: 'bg-critical-soft text-critical',
  },
  costs: {
    card: 'bg-warn-soft',
    disc: 'bg-surface text-warn',
    dot: 'bg-warn',
    pill: 'bg-warn-soft text-warn',
  },
  unfinished: {
    card: 'bg-surface-2',
    disc: 'bg-surface text-ink-2',
    dot: 'bg-ink-4',
    pill: 'bg-surface-3 text-ink-2',
  },
}

/**
 * An order on its way is not a status, so it wears none.
 *
 * The three status washes are reserved for the three things that are actually
 * wrong, and the pale ones are close enough to each other that a fourth would
 * have read as a mild version of "will stop the line". A white card carrying
 * the brand on its disc says the true thing instead: nothing here is a
 * problem, it is simply out.
 */
const FLIGHT: Skin = {
  card: 'bg-surface border border-line',
  disc: 'bg-accent-tint text-accent-ink',
  dot: 'bg-accent',
  pill: 'bg-accent-tint text-accent-ink',
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

export function Queue({ rows, berths, onAct, showAll, onShowAll }: {
  rows: Decision[]
  /** orders out with a supplier and not yet due, under their supplier */
  berths: Berth[]
  onAct: (d: Decision, act: Act) => void
  /** bands the owner has opened up */
  showAll: Set<Band>
  onShowAll: (b: Band) => void
}) {
  const coming = berths.reduce((a, b) => a + b.orders.length, 0)

  return (
    <div className="grid items-start gap-x-6 gap-y-7 lg:grid-cols-2">
      {/*
        * The count wears green only when it is nought — the one state worth
        * colouring. Red on the heading would say "all of this is urgent" over
        * a column whose bands already say which of it is.
        */}
      <Column icon="clock" title="Waiting on you" count={rows.length}
        pill={rows.length > 0 ? 'bg-surface-2 text-ink-2' : 'bg-good-soft text-good'}>
        {rows.length === 0 ? <Clear /> : (
          <div className="space-y-4">
            {byBand(rows).map((g, gi) => {
              const open = showAll.has(g.band)
              const shown = open ? g.rows : g.rows.slice(0, SHOW)
              const rest = g.rows.length - shown.length
              const skin = BAND[g.band]
              return (
                <section key={g.band}>
                  <Sub dot={skin.dot} pill={skin.pill} label={BAND_LABEL[g.band]}
                    count={g.rows.length} />
                  {/*
                    * The cascade counts within the band and adds two per band
                    * rather than running straight through the column: a long
                    * first band would otherwise hold the second one back by
                    * half a second, which reads as the screen being slow
                    * rather than as one thing arriving after another.
                    */}
                  <ul className="space-y-2">
                    {shown.map((d, i) => (
                      <Card key={d.id} i={gi * 2 + i} skin={skin} icon={KIND[d.kind]}
                        title={d.title} detail={d.detail}>
                        <Acts d={d} onAct={onAct} />
                      </Card>
                    ))}
                  </ul>
                  {rest > 0 && (
                    <button type="button" onClick={() => onShowAll(g.band)}
                      className="press mt-1.5 rounded-md px-1 py-1 text-[12px] text-ink-3 hover:text-ink">
                      and {rest} more
                    </button>
                  )}
                </section>
              )
            })}
          </div>
        )}
      </Column>

      <Column icon="truck" title="Out with suppliers" count={coming}
        pill="bg-accent-tint text-accent-ink">
        {coming === 0 ? <Quiet /> : (
          <div className="space-y-4">
            {berths.map((b, bi) => (
              <section key={b.vendorId || bi}>
                <Sub dot={FLIGHT.dot} pill={FLIGHT.pill} count={b.orders.length}
                  label={b.vendor?.name ?? 'Unknown supplier'} />
                <ul className="space-y-2">
                  {b.orders.map((f, i) => (
                    <Card key={f.no} i={bi * 2 + i} skin={FLIGHT} icon="cart"
                      title={f.no} detail={f.what} progress={f.progress}
                      foot={`${f.lines} line${f.lines === 1 ? '' : 's'} · ${money(f.total)}`}>
                      {/*
                        * The one figure every card on this side carries, which
                        * is what makes the column scannable: not how big the
                        * order is, but when it lands.
                        */}
                      <span className="shrink-0 text-right">
                        <span className="num block text-[13px] font-bold leading-none">
                          {arrivesIn(f.daysAway)}
                        </span>
                        <span className="mono mt-1 block text-[10.5px] text-ink-3">
                          {f.expectedOn}
                        </span>
                      </span>
                    </Card>
                  ))}
                </ul>
              </section>
            ))}
          </div>
        )}
      </Column>
    </div>
  )
}

/* ---------------------------------------------------------------- the frame */

/**
 * A column, headed by what it holds and how much of it.
 *
 * The count is on the heading rather than on every band, so the two columns
 * can be compared at a glance: nine waiting against two coming is a different
 * morning from two against nine.
 */
function Column({ icon, title, count, pill, children }: {
  icon: IconName; title: string; count: number; pill: string; children: React.ReactNode
}) {
  return (
    <div className="anim-fade-up min-w-0">
      <div className="mb-3 flex items-center gap-2 border-b border-line pb-2">
        <span aria-hidden className={`grid size-6 place-items-center rounded-md ${pill}`}>
          <Icon name={icon} className="size-3.5" />
        </span>
        <h2 className="text-[13.5px] font-bold tracking-[-0.01em]">{title}</h2>
        <span className={`mono rounded-full px-1.5 py-px text-[10.5px] font-semibold ${pill}`}>
          {count}
        </span>
      </div>
      {children}
    </div>
  )
}

/** The little heading over a cluster of cards — the band, or the supplier. */
function Sub({ dot, pill, label, count }: {
  dot: string; pill: string; label: string; count: number
}) {
  return (
    <h3 className="mb-1.5 flex items-center gap-2">
      <span aria-hidden className={`size-1.5 shrink-0 rounded-full ${dot}`} />
      <span className="truncate text-[11px] font-semibold uppercase tracking-[0.07em] text-ink-3">
        {label}
      </span>
      <span className={`mono shrink-0 rounded-full px-1.5 py-px text-[10.5px] font-semibold ${pill}`}>
        {count}
      </span>
    </h3>
  )
}

/**
 * One thing, as a card.
 *
 * A filled card rather than a row in a bordered list: the fill is what makes a
 * cluster read as a cluster from across the desk, and it carries the band's
 * colour without needing a rule or a badge to say it again.
 */
function Card({ i, skin, icon, title, detail, foot, progress, children }: {
  i: number
  skin: Skin
  icon: IconName
  title: string
  detail: string
  /** a quieter third line, where there is a figure worth carrying */
  foot?: string
  /** 0–100 of the promised wait, drawn as a rule along the bottom */
  progress?: number
  children: React.ReactNode
}) {
  return (
    <li style={{ '--i': i } as React.CSSProperties}
      className={`anim-fade-up lift relative overflow-hidden rounded-xl px-3 py-2.5 ${skin.card}`}>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <span aria-hidden className={`grid size-9 shrink-0 place-items-center rounded-full ${skin.disc}`}>
          <Icon name={icon} className="size-4" />
        </span>
        <span className="min-w-0 flex-1 basis-40">
          <span className="block truncate text-[13.5px] font-bold tracking-[-0.01em]">{title}</span>
          <span className="block truncate text-[11.5px] text-ink-2">{detail}</span>
          {foot && <span className="mono mt-0.5 block truncate text-[10.5px] text-ink-3">{foot}</span>}
        </span>
        {children}
      </div>
      {progress !== undefined && (
        <span aria-hidden className="absolute inset-x-0 bottom-0 block h-1 bg-surface-3">
          <span className="anim-reveal block h-full bg-accent" style={{ width: `${progress}%` }} />
        </span>
      )}
    </li>
  )
}

/** The buttons on a decision: the thing to do, and the real alternative. */
function Acts({ d, onAct }: { d: Decision; onAct: (d: Decision, act: Act) => void }) {
  const button = 'press rounded-lg border border-line bg-surface px-2.5 py-1.5 text-[12px] font-semibold hover:bg-surface-2'
  return (
    <span className="ml-auto flex shrink-0 items-center gap-1">
      {d.alt && (
        <button type="button" onClick={() => onAct(d, d.alt!.act)}
          className="press rounded-lg px-2 py-1.5 text-[12px] text-ink-3 hover:text-ink">
          {d.alt.label}
        </button>
      )}
      {/*
        * Navigating is a link, so it behaves like one — middle-click, open in
        * a tab, the browser's own back. Deciding is a button, because it
        * changes something.
        */}
      {d.act === 'open'
        ? <Link href={d.href} className={button}>{d.actLabel}</Link>
        : (
          <button type="button" onClick={() => onAct(d, d.act)} className={button}>
            {d.actLabel}
          </button>
        )}
    </span>
  )
}

/* --------------------------------------------------------------- the ends -- */

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

/**
 * Nothing out with anybody.
 *
 * Quiet rather than celebratory: an empty right column is not an achievement,
 * it is simply a day with nothing on its way, and it says how something gets
 * here so the column is not a mystery on the first morning.
 */
function Quiet() {
  return (
    <div className="rounded-xl border border-dashed border-line px-4 py-7 text-center">
      <span aria-hidden className="mx-auto mb-2 grid size-9 place-items-center rounded-full bg-surface-2 text-ink-4">
        <Icon name="truck" className="size-4" />
      </span>
      <p className="text-[13px] font-semibold text-ink-2">Nothing on its way</p>
      <p className="mx-auto mt-1 max-w-[26rem] text-[12px] leading-relaxed text-ink-3">
        An order shows up here once you have handed it over, and stays until the
        day the supplier promised.
      </p>
    </div>
  )
}
