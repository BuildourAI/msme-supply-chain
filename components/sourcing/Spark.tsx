'use client'
import type { Chart, MetricTone } from '@/lib/workspace/metrics'

/**
 * The little picture under a figure.
 *
 * Seven shapes, one per kind of thing a sourcing figure can be, and every one
 * of them drawn from that figure's own arithmetic. `Sparkbars` set this rule
 * for the sample company's tiles and it holds here: a chart is the number
 * shown a second way, never decoration that resembles data. A figure with
 * nothing behind it gets no picture — `metrics.ts` simply leaves `chart` off.
 *
 * All of it is SVG and CSS. The animations are the build's own keyframes,
 * which means they are gated by `prefers-reduced-motion` in one place rather
 * than each having to remember, and they run on paint with no client state
 * that could disagree with the server.
 *
 * Nothing here is interactive and nothing here is the only way to read the
 * figure — the number and its sentence are above, so a screen reader, a
 * printout and a colour-blind reader all lose nothing by skipping it.
 */
const STROKE: Record<MetricTone, string> = {
  good: 'var(--good)',
  warn: 'var(--warn)',
  critical: 'var(--critical)',
  neutral: 'var(--accent)',
}

/**
 * Where a picture sits on its tile.
 *
 * Six of the seven are wide and short, so they go under the figure on the
 * tile's own rhythm and every tile in a row ends up the same height. The ring
 * is the exception: it is as tall as it is wide, and putting it below would
 * make its tile half as tall again as the two beside it for one small circle
 * in a field of white. So it goes opposite the disc, on the line it belongs
 * to — 100% beside a closed circle, which is the pairing that makes it read
 * at a glance.
 */
export type SparkPlace = 'below' | 'aside'

const PLACE_OF: Record<Chart['kind'], SparkPlace> = {
  dots: 'below', range: 'below', split: 'below',
  pips: 'below', moves: 'below', stack: 'below',
  ring: 'aside',
}

export function Spark({ chart, tone, place = 'below' }: {
  chart?: Chart; tone: MetricTone; place?: SparkPlace
}) {
  if (!chart || PLACE_OF[chart.kind] !== place) return null
  const colour = STROKE[tone]

  if (chart.kind === 'dots') return <Dots dots={chart.dots} />
  if (chart.kind === 'range') return <Range {...chart} colour={colour} />
  if (chart.kind === 'split') return <Split good={chart.good} bad={chart.bad} />
  if (chart.kind === 'pips') return <Pips on={chart.on} of={chart.of} colour={colour} />
  if (chart.kind === 'ring') return <Ring pct={chart.pct} colour={colour} />
  if (chart.kind === 'moves') return <Moves values={chart.values} />
  return <Stack parts={chart.parts} />
}

/* ------------------------------------------------------------------ dots -- */

/**
 * One mark per delivery, oldest on the left.
 *
 * The percentage says how often they are late; this says WHEN — three reds in
 * a row at the right-hand end is a supplier going off, and no single figure
 * can carry that.
 */
function Dots({ dots }: { dots: boolean[] }) {
  return (
    <span className="mt-2.5 flex flex-wrap items-center gap-1" aria-hidden>
      {dots.map((kept, i) => (
        <span key={i} style={{ '--i': i } as React.CSSProperties}
          className={`anim-dot size-2 rounded-full ${kept ? 'bg-good' : 'bg-critical'}`} />
      ))}
    </span>
  )
}

/* ----------------------------------------------------------------- range -- */

/**
 * The fastest, the usual and the slowest.
 *
 * The whole argument of the metric in one mark: a wide bar is a supplier you
 * cannot plan around, however good the tick in the middle looks.
 */
function Range({ low, mean, high, colour }: {
  low: number; mean: number; high: number; colour: string
}) {
  const span = Math.max(high, 1)
  const x = (v: number) => (v / span) * 100
  return (
    <span className="mt-2.5 block" aria-hidden>
      <span className="relative block h-1.5 rounded-full bg-surface-3">
        <span className="anim-reveal absolute inset-y-0 rounded-full"
          style={{ left: `${x(low)}%`, width: `${Math.max(x(high - low), 3)}%`, background: colour }} />
        {/* the usual, which is the figure everything else is planned on */}
        <span className="anim-tick absolute -top-0.5 h-2.5 w-0.5 rounded-full bg-ink"
          style={{ left: `${x(mean)}%` }} />
      </span>
      <span className="mono mt-1 flex justify-between text-[9.5px] text-ink-4">
        <span>{low}d</span><span>{high}d</span>
      </span>
    </span>
  )
}

/* ----------------------------------------------------------------- split -- */

/** What arrived, against what could not be used. */
function Split({ good, bad }: { good: number; bad: number }) {
  const total = good + bad || 1
  return (
    <span className="mt-2.5 flex h-1.5 gap-0.5 overflow-hidden rounded-full" aria-hidden>
      <span className="anim-reveal bg-good" style={{ width: `${(good / total) * 100}%` }} />
      <span className="anim-reveal bg-critical"
        style={{ width: `${Math.max((bad / total) * 100, bad > 0 ? 2 : 0)}%`, '--i': 1 } as React.CSSProperties} />
    </span>
  )
}

/* ------------------------------------------------------------------ pips -- */

/**
 * n of a countable whole.
 *
 * A count on its own says "4" and leaves you to wonder four out of what. Ten
 * pips with four lit answers it without a second number to read.
 *
 * They span the tile rather than sitting in a clump at the left, because a
 * whole of three drawn as three small marks is dust and a whole of three drawn
 * as three wide segments is a figure. It also puts every picture in this file
 * on the same 6px rule — split, stack, range and pips all read as one bar
 * across a row of tiles, so the eye compares them instead of parsing each.
 *
 * Above the cap the segments stop being one-per-thing and become proportional,
 * which is the only honest way to draw "5 of 40" in eighteen marks.
 */
const PIP_CAP = 18

function Pips({ on, of, colour }: { on: number; of: number; colour: string }) {
  const whole = Math.max(of, 1)
  const total = Math.min(whole, PIP_CAP)
  // exact below the cap — (on / of) * of is on — and proportional above it
  const lit = Math.min(
    total,
    on > 0 ? Math.max(Math.round((on / whole) * total), 1) : 0,
  )
  return (
    <span className="mt-2.5 flex h-1.5 items-stretch gap-0.5" aria-hidden>
      {Array.from({ length: total }, (_, i) => (
        <span key={i} style={{
          '--i': i,
          background: i < lit ? colour : 'var(--surface-3)',
        } as React.CSSProperties}
          className="anim-dot flex-1 rounded-full" />
      ))}
    </span>
  )
}

/* ------------------------------------------------------------------ ring -- */

/**
 * One share of a total, closed.
 *
 * Drawn at the size of the tile's disc so the two read as a pair across the
 * head of the tile rather than as a chart that wandered in.
 */
function Ring({ pct, colour }: { pct: number; colour: string }) {
  const r = 13
  const c = 2 * Math.PI * r
  return (
    <span className="mt-0.5 block shrink-0" aria-hidden>
      <svg viewBox="0 0 32 32" className="size-9 -rotate-90">
        <circle cx="16" cy="16" r={r} fill="none" stroke="var(--surface-3)" strokeWidth="4.5" />
        <circle cx="16" cy="16" r={r} fill="none" stroke={colour} strokeWidth="4.5"
          strokeLinecap="round" className="anim-arc"
          strokeDasharray={`${(Math.min(pct, 100) / 100) * c} ${c}`} />
      </svg>
    </span>
  )
}

/* ----------------------------------------------------------------- moves -- */

/**
 * Rates that moved, biggest first, up from the line and down below it.
 *
 * Signed, because the direction is the point — a column of green going down
 * is a month somebody negotiated well.
 */
function Moves({ values }: { values: number[] }) {
  const max = Math.max(...values.map((v) => Math.abs(v)), 1)
  return (
    <span className="mt-2 flex h-6 items-center gap-1" aria-hidden>
      {values.map((v, i) => {
        const h = Math.max((Math.abs(v) / max) * 10, 1.5)
        return (
          <span key={i} className="relative flex h-6 w-1.5 flex-col justify-center">
            <span className="absolute inset-x-0 top-1/2 h-px bg-line" />
            <span style={{ '--i': i, height: `${h}px` } as React.CSSProperties}
              className={`anim-dot absolute inset-x-0 rounded-sm ${
                v > 0 ? 'bottom-1/2 bg-critical' : 'top-1/2 bg-good'}`} />
          </span>
        )
      })}
    </span>
  )
}

/* ----------------------------------------------------------------- stack -- */

/** How one total divides between suppliers, largest first. */
function Stack({ parts }: { parts: number[] }) {
  return (
    <span className="mt-2.5 flex h-1.5 gap-0.5 overflow-hidden rounded-full" aria-hidden>
      {parts.map((p, i) => (
        <span key={i} style={{
          '--i': i,
          width: `${p}%`,
          // one hue, stepped — a share is a magnitude, not a category
          background: `color-mix(in oklab, var(--accent) ${Math.max(100 - i * 18, 28)}%, var(--surface-3))`,
        } as React.CSSProperties}
          className="anim-reveal" />
      ))}
    </span>
  )
}
