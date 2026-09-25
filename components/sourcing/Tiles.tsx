'use client'
import Link from 'next/link'
import { Icon, type IconName } from '@/components/ui/icons'
import { Spark } from '@/components/sourcing/Spark'
import { useFlash } from '@/components/ui/motion'
import type { Metric, MetricKey, MetricTone } from '@/lib/workspace/metrics'

/**
 * A figure, as one tile.
 *
 * The shape is the one every reporting page settles on because it works: a
 * tinted disc holding an icon, the label, then the figure large enough to read
 * across a desk, then one quiet line saying what it is of. Nothing else — no
 * sparkline nobody can read at that size, no arrow against a period this build
 * does not hold.
 *
 * Two things are this build's rather than the genre's. The figure is a string
 * the metric formatted itself, so days, rupees and per cents each print the way
 * they should without the tile knowing which is which. And an unmeasured tile
 * says so in words and goes grey — a dashboard that prints 0% for a company
 * that has taken no deliveries teaches people to distrust the tiles that are
 * real.
 */
const ICON: Record<MetricKey, IconName> = {
  onTime: 'truck',
  lead: 'activity',
  defects: 'boxes',
  flip: 'scale',
  stale: 'doc',
  singleSource: 'truck',
  concentration: 'cash',
  priceMoves: 'cash',
  outstanding: 'cart',
  qcHeld: 'tray',
  inspectedOnTime: 'clock',
  atJobworkers: 'factory',
  unacked: 'cart',
  stockValue: 'boxes',
  unconfirmed: 'hash',
  heldStock: 'tray',
  accuracy: 'check',
  netLoss: 'cash',
  scrap: 'alert',
  dio: 'clock',
  remnants: 'scissors',
  lineRunsFor: 'clock',
  jobsStopping: 'alert',
  attainment: 'activity',
  firstPass: 'check',
  floorDays: 'clock',
  rmToFg: 'arrow-right',
  haltDays: 'alert',
  otif: 'check',
  orderToDock: 'clock',
  pastPromise: 'alert',
  fgValue: 'boxes',
  freightUnit: 'truck',
  carrierLate: 'truck',
  dispatchedMonth: 'arrow-right',
  returnRate: 'undo',
  orderBook: 'cash',
  dispatchedValue: 'truck',
  onOrder: 'cart',
}

/*
 * Every disc is navy: the disc says what the figure is about, and a row of
 * green, amber and red discs said "status" five times over figures that were
 * mostly fine. Status lives on the figure itself — red when it is critical,
 * the warn ink when it wants watching — and the sub-line says why in words.
 */
const DISC = 'bg-navy/10 text-navy'

const FIGURE: Record<MetricTone, string> = {
  good: 'text-ink',
  warn: 'text-warn',
  critical: 'text-critical',
  neutral: 'text-ink',
}

export function Tiles({ metrics, columns = 3 }: {
  metrics: Metric[]
  /** five across for a headline row — the fifth spans two on a tablet so no tile sits alone */
  columns?: 3 | 5 | 'row'
}) {
  if (metrics.length === 0) return null
  return (
    <div className={columns === 5
      ? 'grid gap-3 sm:grid-cols-2 sm:[&>:nth-child(5)]:col-span-2 lg:grid-cols-5 lg:[&>:nth-child(5)]:col-span-1'
      : columns === 'row'
        // a desk's own picks on one line: up to seven fit a laptop, more wrap
        ? 'grid grid-cols-2 gap-2.5 sm:grid-cols-[repeat(auto-fit,minmax(9.5rem,1fr))]'
        : 'grid gap-3 sm:grid-cols-2 lg:grid-cols-3'}>
      {metrics.map((m, i) => <Tile key={m.key} m={m} i={i} dense={columns === 'row'} />)}
    </div>
  )
}

function Tile({ m, i, dense = false }: { m: Metric; i: number; dense?: boolean }) {
  /*
   * A figure that has just moved is worth catching the eye. Only on a CHANGE —
   * `useFlash` does nothing on mount, so the screen does not light up all over
   * on every load, which is how people learn to ignore highlighting.
   */
  const flash = useFlash(m.value)

  /*
   * A desk's row carries up to seven figures, so there the disc shrinks to an
   * icon beside the label and the figure gets the width — "₹7,27,500" and
   * "On-time delivery" both fit in a seventh of a laptop.
   */
  const body = dense ? (
    <>
      <span className="flex items-center gap-1.5">
        <Icon name={ICON[m.key]} className={`size-3.5 shrink-0 ${m.measured ? 'text-navy' : 'text-ink-4'}`} />
        <span className="truncate text-[11.5px] font-medium text-ink-2">{m.label}</span>
      </span>
      <span className="flex items-center gap-2">
        <span className={`num mt-0.5 block min-w-0 flex-1 truncate ${
          m.measured
            ? `text-[20px] font-extrabold leading-tight tracking-[-0.02em] ${FIGURE[m.tone]}`
            : 'py-0.5 text-[13px] font-semibold leading-snug text-ink-3'}`}>
          {m.value}
        </span>
        <Spark chart={m.chart} tone={m.tone} place="aside" />
      </span>
      <p className="mt-0.5 truncate text-[11px] text-ink-3">{m.sub}</p>
      <Spark chart={m.chart} tone={m.tone} />
    </>
  ) : (
    <>
      <div className="flex items-start gap-3">
        <span aria-hidden
          className={`grid size-9 shrink-0 place-items-center rounded-lg ${
            m.measured ? DISC : 'bg-surface-3 text-ink-4'}`}>
          <Icon name={ICON[m.key]} className="size-4" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[12.5px] font-medium text-ink-2">{m.label}</span>
          <span className={`num mt-0.5 block truncate ${
            m.measured
              ? `${dense ? 'text-[21px]' : 'text-[26px]'} font-extrabold leading-tight tracking-[-0.02em] ${FIGURE[m.tone]}`
              : 'text-[14px] font-semibold leading-snug text-ink-3'}`}>
            {m.value}
          </span>
        </span>
        {/* a share is drawn beside its figure; everything else is drawn under */}
        <Spark chart={m.chart} tone={m.tone} place="aside" />
      </div>
      <p className={`truncate text-ink-3 ${dense ? 'mt-1 text-[11px]' : 'mt-1.5 text-[11.5px]'}`}>{m.sub}</p>
      <Spark chart={m.chart} tone={m.tone} />
    </>
  )

  const cls = `anim-fade-up block min-w-0 rounded-xl border border-line bg-surface ${dense ? 'px-3 py-2.5' : 'p-3.5'} text-left ${flash}`

  // the rows behind a figure are worth reaching; one with nothing behind it yet
  // is not a link to an empty screen
  return m.href && m.measured
    ? (
      <Link href={m.href} title={m.how} style={{ '--i': i } as React.CSSProperties}
        className={`press lift ${cls}`}>
        {body}
      </Link>
    )
    : (
      <div title={m.how} style={{ '--i': i } as React.CSSProperties} className={cls}>
        {body}
      </div>
    )
}
