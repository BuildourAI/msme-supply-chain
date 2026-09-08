'use client'
import { useId } from 'react'
import { money, num } from '@/lib/domain/format'

/**
 * The forms the executive KPIs actually need, hand-built in SVG on the §10
 * palette so a theme flip recolours them with no JS.
 *
 * Forms were picked by the data's job, not by what looks impressive:
 *
 *   a ratio against a limit          → meter, not a two-slice pie
 *   before → after per item          → dumbbell
 *   part-to-whole, three segments    → donut (the one case where it beats a bar)
 *   an additive/subtractive sum      → waterfall
 *   a handful of discrete outcomes   → cell strip, one cell per event
 *   magnitude, low → high            → bars on one sequential hue
 *
 * Two rules hold everywhere. The §10 palette drops below 3:1 against the light
 * surface on three of its five hues, so every chart here carries direct labels
 * and a legend — colour is never the only channel. And an ILLUSTRATIVE series is
 * hatched, which is secondary encoding doing real work: a made-up bar should not
 * be able to pass for a measured one at a glance.
 */

export const ILLUS_NOTE = 'Hatched fill means the figure is illustrative — nothing in this build measures it.'

/** Hatching marks an invented series, on top of the dashed card border. */
function Hatch({ id, color }: { id: string; color: string }) {
  return (
    <pattern id={id} width="4" height="4" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
      <rect width="4" height="4" fill={color} opacity="0.22" />
      <line x1="0" y1="0" x2="0" y2="4" stroke={color} strokeWidth="1.7" />
    </pattern>
  )
}

const TONE: Record<string, string> = {
  good: 'var(--good)', warn: 'var(--warn)', critical: 'var(--critical)', accent: 'var(--accent)',
  neutral: 'var(--ink-3)',
}

/* ------------------------------------------------------------------ meter */

/**
 * A single ratio against a limit. The target is a tick on the track, never a
 * second bar — the reader's question is "are we past the line", which a position
 * answers faster than a comparison.
 */
export function Meter({ value, max, target, targetLabel, tone = 'accent', hatched, unit = '%' }: {
  value: number; max: number
  target?: number; targetLabel?: string
  tone?: keyof typeof TONE; hatched?: boolean; unit?: string
}) {
  const uid = useId().replace(/[^a-zA-Z0-9]/g, '')
  const col = TONE[tone]
  const w = Math.max(0.5, Math.min(100, (value / max) * 100))
  const t = target != null ? Math.min(100, (target / max) * 100) : null
  return (
    <div>
      <svg viewBox="0 0 100 8" preserveAspectRatio="none" className="h-3.5 w-full" role="img"
           aria-label={`${num(value, 1)}${unit} of ${num(max, 0)}${unit}${target != null ? `, target ${num(target, 1)}${unit}` : ''}`}>
        <defs>{hatched && <Hatch id={`m-${uid}`} color={col} />}</defs>
        <rect x="0" y="0" width="100" height="8" rx="1.2" fill="var(--surface-3)" />
        <rect x="0" y="0" width={w} height="8" rx="1.2" fill={hatched ? `url(#m-${uid})` : col}
              className="anim-reveal">
          <title>{`${num(value, 2)}${unit}`}</title>
        </rect>
        {t != null && (
          <g>
            <rect x={Math.max(0, t - 0.35)} y="-1" width="0.7" height="10" fill="var(--ink)" />
            <title>{`Target ${num(target!, 1)}${unit}`}</title>
          </g>
        )}
      </svg>
      {/* the scale row IS the axis — without it a filled bar has no meaning */}
      <p className="mono mt-1 flex justify-between gap-2 text-[10px] text-ink-3">
        <span>0</span>
        {t != null && <span className="text-ink-2">{targetLabel ?? `target ${num(target!, 1)}${unit}`}</span>}
        <span>{num(max, 0)}{unit}</span>
      </p>
    </div>
  )
}

/* ------------------------------------------------------------- cell strip */

export interface Cell { label: string; tone: keyof typeof TONE; detail: string }

/**
 * One cell per event, when the population is small enough to show whole. Five
 * receipts or six jobs as a bar chart of two categories would hide the thing
 * that matters — that the sample is five.
 */
export function CellStrip({ cells, legend, note }: {
  cells: Cell[]; legend: { label: string; tone: keyof typeof TONE }[]
  /** what one cell IS — without it the labels under the strip are bare codes */
  note?: string
}) {
  // an outcome nobody had is not a series — a legend that lists it invites the
  // reader to hunt the strip for a colour that is not there
  const present = new Set(cells.map((c) => c.tone))
  const shown = legend.filter((l) => present.has(l.tone))
  return (
    <div>
      <ul className="flex gap-1">
        {cells.map((c, i) => (
          <li key={c.label} title={`${c.label} — ${c.detail}`}
              style={{ '--i': i } as React.CSSProperties}
              className="anim-fade-up min-w-0 flex-1">
            <span className="block h-7 rounded-[3px]" style={{ background: TONE[c.tone] }} />
            <span className="mono mt-1 block truncate text-center text-[9.5px] text-ink-3">{c.label}</span>
          </li>
        ))}
      </ul>
      {note && <p className="mt-1.5 text-[10.5px] text-ink-3">{note}</p>}
      <ul className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1">
        {shown.map((l) => (
          <li key={l.label} className="flex items-center gap-1.5 text-[10.5px] text-ink-2">
            <span aria-hidden className="size-2 rounded-[2px]" style={{ background: TONE[l.tone] }} />
            {l.label}
          </li>
        ))}
      </ul>
    </div>
  )
}

/* --------------------------------------------------------------- dumbbell */

/**
 * Before → after per item. Two dots joined by a rule: the gap IS the story, and
 * a paired bar chart makes you measure it by eye instead of seeing it.
 */
export function Dumbbell({ rows, unit = 'days', fromLabel, toLabel }: {
  rows: { label: string; from: number; to: number }[]
  unit?: string; fromLabel: string; toLabel: string
}) {
  const hi = Math.max(...rows.flatMap((r) => [r.from, r.to])) * 1.12
  const X = (v: number) => (v / hi) * 100
  return (
    <div>
      <ul className="space-y-1.5">
        {rows.map((r, i) => {
          const worse = r.to > r.from
          return (
            <li key={r.label} className="grid grid-cols-[minmax(5.5rem,auto)_1fr_auto] items-center gap-2.5">
              <span className="mono truncate text-[10.5px] text-ink-3" title={r.label}>{r.label}</span>
              <span className="relative block h-4">
                <svg viewBox="0 0 100 8" preserveAspectRatio="none" className="h-full w-full" role="img"
                     aria-label={`${r.label}: ${fromLabel} ${r.from}, ${toLabel} ${r.to} ${unit}`}>
                  <line x1="0" x2="100" y1="4" y2="4" stroke="var(--line-soft)" strokeWidth="0.6" />
                  <line x1={X(Math.min(r.from, r.to))} x2={X(Math.max(r.from, r.to))} y1="4" y2="4"
                        stroke={worse ? 'var(--warn)' : 'var(--good)'} strokeWidth="2.4"
                        className="anim-reveal" style={{ '--i': i } as React.CSSProperties} />
                </svg>
                {/* dots sit outside the non-uniform viewBox so they stay round */}
                <span aria-hidden className="absolute top-1/2 size-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-surface"
                      style={{ left: `${X(r.from)}%`, background: 'var(--ink-3)' }} title={`${fromLabel} ${r.from}`} />
                <span aria-hidden className="absolute top-1/2 size-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-surface"
                      style={{ left: `${X(r.to)}%`, background: worse ? 'var(--warn)' : 'var(--good)' }}
                      title={`${toLabel} ${r.to}`} />
              </span>
              <span className={`num w-16 text-right text-[11px] ${worse ? 'text-warn' : 'text-good'}`}>
                {worse ? '+' : ''}{num(r.to - r.from, 1)} {unit}
              </span>
            </li>
          )
        })}
      </ul>
      <ul className="mt-2 flex flex-wrap gap-x-3.5 gap-y-1">
        {[
          { l: fromLabel, c: 'var(--ink-3)' },
          { l: `${toLabel} — within it`, c: 'var(--good)' },
          { l: `${toLabel} — over it`, c: 'var(--warn)' },
        ].map((x) => (
          <li key={x.l} className="flex items-center gap-1.5 text-[10.5px] text-ink-2">
            <span aria-hidden className="size-2 rounded-full" style={{ background: x.c }} />{x.l}
          </li>
        ))}
      </ul>
    </div>
  )
}

/* ------------------------------------------------------------------ donut */

/**
 * Part-to-whole, and only where the segments are few and far enough apart to
 * read as angles. Every slice is direct-labelled, so the colour is never doing
 * the work on its own.
 */
export function Donut({ segments, centre, centreSub }: {
  segments: { label: string; value: number; color: string; hatched?: boolean }[]
  centre: string; centreSub?: string
}) {
  const uid = useId().replace(/[^a-zA-Z0-9]/g, '')
  const total = segments.reduce((a, s) => a + s.value, 0) || 1
  const R = 42, C = 2 * Math.PI * R
  let offset = 0
  return (
    <div className="flex flex-wrap items-center gap-4">
      <svg viewBox="0 0 100 100" className="h-28 w-28 shrink-0" role="img"
           aria-label={segments.map((s) => `${s.label} ${Math.round((s.value / total) * 100)}%`).join(', ')}>
        {/* keyed by the original index — filtering first would number the
            patterns 0..n while the arcs still reference their own index */}
        <defs>{segments.map((s, i) => s.hatched
          ? <Hatch key={i} id={`d-${uid}-${i}`} color={s.color} /> : null)}</defs>
        <g transform="rotate(-90 50 50)">
          {segments.map((s, i) => {
            const frac = s.value / total
            // a 2px surface gap between fills, as adjacent segments require
            const dash = `${Math.max(0, C * frac - 2)} ${C - Math.max(0, C * frac - 2)}`
            const el = (
              <circle key={s.label} cx="50" cy="50" r={R} fill="none"
                      stroke={s.hatched ? `url(#d-${uid}-${i})` : s.color} strokeWidth="14"
                      strokeDasharray={dash} strokeDashoffset={-offset}>
                <title>{`${s.label}: ${Math.round(frac * 100)}%`}</title>
              </circle>
            )
            offset += C * frac
            return el
          })}
        </g>
        <text x="50" y="49" textAnchor="middle" fontSize="15" fontWeight="600" fill="var(--ink)"
              fontFamily="var(--font-plex-sans)">{centre}</text>
        {centreSub && (
          <text x="50" y="61" textAnchor="middle" fontSize="8" fill="var(--ink-3)"
                fontFamily="var(--font-plex-mono)">{centreSub}</text>
        )}
      </svg>
      <ul className="min-w-0 flex-1 space-y-1">
        {segments.map((s) => (
          <li key={s.label} className="flex items-baseline gap-2 text-[11.5px]">
            <span aria-hidden className="size-2.5 shrink-0 translate-y-0.5 rounded-[2px]"
              style={s.hatched
                ? { background: `repeating-linear-gradient(45deg, ${s.color} 0 1.5px, transparent 1.5px 3px)`, border: `1px solid ${s.color}` }
                : { background: s.color }} />
            <span className="min-w-0 truncate text-ink-2">{s.label}</span>
            <span className="num ml-auto shrink-0 font-medium">
              {Math.round((s.value / total) * 100)}%
            </span>
          </li>
        ))}
      </ul>
    </div>
  )
}

/* -------------------------------------------------------------- waterfall */

/**
 * An additive and subtractive sum, drawn as one. Cash-to-cash is
 * DIO + DSO − DPO, and the point is that the third term is the only one you get
 * back — a stacked bar would hide the sign.
 */
export function Waterfall({ steps, unit = 'days', totalLabel }: {
  steps: { label: string; value: number; sign: 1 | -1; measured: boolean }[]
  unit?: string; totalLabel: string
}) {
  const uid = useId().replace(/[^a-zA-Z0-9]/g, '')
  let run = 0
  const bars = steps.map((s) => {
    const from = run
    run += s.sign * s.value
    return { ...s, from, to: run }
  })
  const total = run
  const hi = Math.max(...bars.flatMap((b) => [b.from, b.to]), total) * 1.08
  const X = (v: number) => (v / hi) * 100
  return (
    <div>
      <ul className="space-y-1.5">
        {bars.map((b, i) => (
          <li key={b.label} className="grid grid-cols-[minmax(7rem,auto)_1fr_auto] items-center gap-2.5">
            <span className="truncate text-[11px] text-ink-2" title={b.label}>{b.label}</span>
            <svg viewBox="0 0 100 8" preserveAspectRatio="none" className="h-3.5 w-full" role="img"
                 aria-label={`${b.label}: ${b.sign > 0 ? 'adds' : 'takes away'} ${b.value} ${unit}`}>
              <defs>{!b.measured && <Hatch id={`w-${uid}-${i}`} color={b.sign > 0 ? 'var(--critical)' : 'var(--good)'} />}</defs>
              <rect x={X(Math.min(b.from, b.to))} y="0" width={Math.max(0.6, X(b.value))} height="8" rx="1"
                    fill={!b.measured
                      ? `url(#w-${uid}-${i})`
                      : b.sign > 0 ? 'var(--critical)' : 'var(--good)'}
                    className="anim-reveal" style={{ '--i': i } as React.CSSProperties}>
                <title>{`${b.label}: ${b.sign > 0 ? '+' : '−'}${num(b.value, 1)} ${unit}`}</title>
              </rect>
            </svg>
            <span className={`num w-20 text-right text-[11px] ${b.sign > 0 ? 'text-critical' : 'text-good'}`}>
              {b.sign > 0 ? '+' : '−'}{num(b.value, 1)}
            </span>
          </li>
        ))}
        <li className="grid grid-cols-[minmax(7rem,auto)_1fr_auto] items-center gap-2.5 border-t border-line pt-1.5">
          <span className="text-[11px] font-medium">{totalLabel}</span>
          <svg viewBox="0 0 100 8" preserveAspectRatio="none" className="h-3.5 w-full" role="img"
               aria-label={`${totalLabel}: ${total} ${unit}`}>
            <rect x="0" y="0" width={Math.max(0.6, X(total))} height="8" rx="1" fill="var(--accent)" />
          </svg>
          <span className="num w-20 text-right text-[11px] font-medium">{num(total, 1)} {unit}</span>
        </li>
      </ul>
      <p className="mono mt-2 text-[10px] leading-relaxed text-ink-3">
        Solid fill is measured · hatched is assumed · red adds days, green gives them back
      </p>
    </div>
  )
}

/* ------------------------------------------------------ ranked bars, one hue */

/**
 * Magnitude, low → high, on ONE hue. A value ramp across nominal categories
 * would double-encode bar length as colour and spend the only free channel on
 * information the bar already shows.
 */
export function RankedBars({ rows, format = 'money', hatched, unit, target, targetLabel }: {
  rows: { label: string; value: number; sub?: string }[]
  format?: 'money' | 'int' | 'pct'; hatched?: boolean; unit?: string
  /** a limit drawn as a rule across the bars, scaled in with them */
  target?: number; targetLabel?: string
}) {
  const uid = useId().replace(/[^a-zA-Z0-9]/g, '')
  const top = Math.max(...rows.map((r) => r.value), target ?? 0, 1) * (target != null ? 1.06 : 1)
  const fmt = (n: number) =>
    format === 'money' ? money(n) : format === 'pct' ? `${num(n, 1)}%` : num(n, 0)
  return (
    <div>
      <ul className="space-y-2">
        {rows.map((r, i) => (
          <li key={r.label}>
            <p className="flex items-baseline gap-2">
              <span className="min-w-0 truncate text-[11.5px] text-ink-2" title={r.label}>{r.label}</span>
              <span className="num ml-auto shrink-0 text-[11.5px] font-medium">{fmt(r.value)}{unit ?? ''}</span>
            </p>
            {/* the sub line carries the evidence — it is never truncated away */}
            {r.sub && <p className="mono text-[10px] leading-snug text-ink-3">{r.sub}</p>}
            <svg viewBox="0 0 100 8" preserveAspectRatio="none" className="mt-1 h-2.5 w-full" role="img"
                 aria-label={`${r.label}: ${fmt(r.value)}`}>
              <defs>{hatched && <Hatch id={`r-${uid}-${i}`} color="var(--seq-4)" />}</defs>
              <rect x="0" y="0" width={Math.max(0.8, (r.value / top) * 100)} height="8" rx="1"
                    fill={hatched ? `url(#r-${uid}-${i})` : 'var(--seq-4)'}
                    className="anim-reveal" style={{ '--i': Math.min(i, 6) } as React.CSSProperties}>
                <title>{`${r.label}: ${fmt(r.value)}`}</title>
              </rect>
              {target != null && (
                <rect x={Math.max(0, (target / top) * 100 - 0.35)} y="-1" width="0.7" height="10" fill="var(--ink)" />
              )}
            </svg>
          </li>
        ))}
      </ul>
      {target != null && (
        <p className="mono mt-1.5 flex items-center gap-1.5 text-[10px] text-ink-3">
          <span aria-hidden className="inline-block h-2.5 w-px bg-ink" />
          {targetLabel ?? `target ${fmt(target)}`}
        </p>
      )}
    </div>
  )
}
