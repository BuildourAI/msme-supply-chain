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
}

/*
 * Tone colours the disc and the figure, never the words underneath. A status
 * has always arrived with its word in this build, and the sub-line is that
 * word — so the colour is the fast read and the sentence is the meaning.
 */
const DISC: Record<MetricTone, string> = {
  good: 'bg-good-soft text-good',
  warn: 'bg-warn-soft text-warn',
  critical: 'bg-critical-soft text-critical',
  neutral: 'bg-accent-tint text-accent-ink',
}

const FIGURE: Record<MetricTone, string> = {
  good: 'text-ink',
  warn: 'text-ink',
  critical: 'text-critical',
  neutral: 'text-ink',
}

export function Tiles({ metrics }: { metrics: Metric[] }) {
  if (metrics.length === 0) return null
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {metrics.map((m, i) => <Tile key={m.key} m={m} i={i} />)}
    </div>
  )
}

function Tile({ m, i }: { m: Metric; i: number }) {
  /*
   * A figure that has just moved is worth catching the eye. Only on a CHANGE —
   * `useFlash` does nothing on mount, so the screen does not light up all over
   * on every load, which is how people learn to ignore highlighting.
   */
  const flash = useFlash(m.value)

  const body = (
    <>
      <div className="flex items-start gap-3">
        <span aria-hidden
          className={`grid size-9 shrink-0 place-items-center rounded-lg ${
            m.measured ? DISC[m.tone] : 'bg-surface-3 text-ink-4'}`}>
          <Icon name={ICON[m.key]} className="size-4" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[12.5px] font-medium text-ink-2">{m.label}</span>
          <span className={`num mt-0.5 block truncate ${
            m.measured
              ? `text-[26px] font-extrabold leading-tight tracking-[-0.02em] ${FIGURE[m.tone]}`
              : 'text-[14px] font-semibold leading-snug text-ink-3'}`}>
            {m.value}
          </span>
        </span>
        {/* a share is drawn beside its figure; everything else is drawn under */}
        <Spark chart={m.chart} tone={m.tone} place="aside" />
      </div>
      <p className="mt-1.5 truncate text-[11.5px] text-ink-3">{m.sub}</p>
      <Spark chart={m.chart} tone={m.tone} />
    </>
  )

  const cls = `anim-fade-up block rounded-xl border border-line bg-surface p-3.5 text-left ${flash}`

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
