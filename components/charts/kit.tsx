'use client'
import { useId, useState } from 'react'
import { lakh, money, num } from '@/lib/domain/format'

/**
 * Hand-built SVG. §10 prescribes the categorical palette and forbids inventing
 * hues, status colours must always ship with a text label, and §8.5 needs hatched
 * segments — so owning the markup is simpler than bending a library to it. Fills
 * are var(--cat-n), which means a theme flip recolours every chart with no JS.
 *
 * The §10 palette passes the CVD validator in both modes. In light mode three of
 * the five hues fall below 3:1 against the surface, so every chart here ships
 * direct labels and a value table — the required relief, and what §8.3 asks for
 * anyway.
 */

export const CAT = ['var(--cat-1)', 'var(--cat-2)', 'var(--cat-3)', 'var(--cat-4)', 'var(--cat-5)']
export const SEQ = ['var(--seq-2)', 'var(--seq-3)', 'var(--seq-4)', 'var(--seq-5)']

export function ChartFrame({ title, desc, children, className = '', viewBox }: {
  title: string; desc?: string; children: React.ReactNode; className?: string; viewBox: string
}) {
  return (
    <svg viewBox={viewBox} role="img" aria-label={title} preserveAspectRatio="xMinYMin meet"
         className={`h-auto w-full ${className}`}>
      <title>{title}</title>
      {desc && <desc>{desc}</desc>}
      {children}
    </svg>
  )
}

export function Legend({ items }: { items: { label: string; color: string }[] }) {
  return (
    <ul className="flex flex-wrap gap-x-3.5 gap-y-1.5">
      {items.map((i) => (
        <li key={i.label} className="flex items-center gap-1.5 text-[11px] text-ink-2">
          <span aria-hidden className="size-2.5 shrink-0 rounded-[3px]" style={{ background: i.color }} />
          {i.label}
        </li>
      ))}
    </ul>
  )
}

/* -------------------------------------------------- stacked horizontal bars */

export interface StackRow {
  label: string
  sub?: string
  segments: { key: string; value: number }[]
  total: number
  badges?: { text: string; tone: 'good' | 'accent' | 'warn' }[]
}

const BADGE_CLS = {
  good: 'border-good/30 bg-good-soft text-good',
  accent: 'border-accent/30 bg-accent-soft text-accent',
  warn: 'border-warn/30 bg-warn-soft text-warn',
}

/**
 * §8.3 — three vendors, five cost components, landed total direct-labelled,
 * value table beneath. 2px surface gaps between segments keep adjacent fills
 * from reading as one block.
 */
export function StackedBars({ rows, keys, format = 'money', max }: {
  rows: StackRow[]; keys: string[]; format?: 'money' | 'lakh'; max?: number
}) {
  const [hover, setHover] = useState<string | null>(null)
  const top = max ?? Math.max(...rows.map((r) => r.total), 1)
  const fmt = (n: number) => (format === 'lakh' ? lakh(n) : money(n, n < 1000 ? 2 : 0))

  return (
    <div className="space-y-3">
      {rows.map((r) => {
        let x = 0
        return (
          <div key={r.label}>
            <div className="mb-1 flex flex-wrap items-baseline gap-x-2 gap-y-1">
              <span className="text-[12.5px] font-medium text-ink">{r.label}</span>
              {r.badges?.map((b) => (
                <span key={b.text}
                  className={`rounded-full border px-1.5 py-px text-[10px] font-medium ${BADGE_CLS[b.tone]}`}>
                  {b.text}
                </span>
              ))}
              {r.sub && <span className="mono text-[10.5px] text-ink-3">{r.sub}</span>}
              <span className="num ml-auto text-[13px] font-semibold text-ink">{fmt(r.total)}</span>
            </div>
            <div className="flex h-4 w-full overflow-hidden rounded-[4px] bg-surface-2"
                 style={{ width: `${Math.max(4, (r.total / top) * 100)}%` }}>
              {r.segments.map((s, i) => {
                const w = r.total > 0 ? (s.value / r.total) * 100 : 0
                x += w
                if (s.value === 0) return null
                const id = `${r.label}|${s.key}`
                return (
                  <div key={s.key}
                    onMouseEnter={() => setHover(id)} onMouseLeave={() => setHover(null)}
                    title={`${s.key}: ${fmt(s.value)}`}
                    style={{ width: `${w}%`, background: CAT[i % CAT.length],
                             boxShadow: i > 0 ? '-2px 0 0 0 var(--surface)' : undefined,
                             opacity: hover && hover !== id ? 0.55 : 1 }}
                    className="h-full transition-opacity" />
                )
              })}
            </div>
          </div>
        )
      })}

      <table className="mt-3 w-full border-collapse text-[12px]">
        <thead>
          <tr className="border-b border-line text-ink-3">
            <th className="py-1.5 pr-2 text-left font-medium">Supplier</th>
            {keys.map((k, i) => (
              <th key={k} className="py-1.5 pl-2 text-right font-medium">
                <span aria-hidden className="mr-1 inline-block size-2 rounded-[2px] align-middle"
                      style={{ background: CAT[i % CAT.length] }} />
                {k}
              </th>
            ))}
            <th className="py-1.5 pl-2 text-right font-medium">Landed</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.label} className="border-b border-line-soft last:border-0">
              <td className="py-1.5 pr-2 text-ink-2">{r.label}</td>
              {r.segments.map((s) => (
                <td key={s.key} className="num py-1.5 pl-2 text-right">{fmt(s.value)}</td>
              ))}
              <td className="num py-1.5 pl-2 text-right font-semibold">{fmt(r.total)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

/* ------------------------------------------------------------- simple bars */

export function BarRows({ rows, format = 'lakh', colorMode = 'sequential' }: {
  rows: { label: string; value: number; note?: string }[]
  format?: 'lakh' | 'money' | 'int'
  colorMode?: 'sequential' | 'categorical'
}) {
  const top = Math.max(...rows.map((r) => r.value), 1)
  const fmt = (n: number) => (format === 'lakh' ? lakh(n) : format === 'int' ? num(n, 0) : money(n))
  return (
    <ul className="space-y-2">
      {rows.map((r, i) => (
        <li key={r.label} className="grid grid-cols-[minmax(6.5rem,1fr)_2.2fr_auto] items-center gap-2.5">
          <span className="truncate text-[12px] text-ink-2" title={r.label}>{r.label}</span>
          <span className="h-3.5 w-full rounded-[4px] bg-surface-2">
            <span className="block h-full rounded-[4px]"
              style={{
                width: `${Math.max(2, (r.value / top) * 100)}%`,
                background: colorMode === 'categorical' ? CAT[i % CAT.length] : SEQ[Math.min(i, SEQ.length - 1)],
              }} />
          </span>
          <span className="num text-right text-[12.5px] font-medium">{fmt(r.value)}</span>
        </li>
      ))}
    </ul>
  )
}

/* ------------------------------------------------------------- line chart */

export function LineChart({ series, yLabel, reference, xLabels }: {
  series: { label: string; points: number[]; color: string }[]
  yLabel: string
  reference?: { value: number; label: string }
  xLabels: string[]
}) {
  const W = 720, H = 220, PL = 40, PR = 16, PT = 14, PB = 30
  const all = series.flatMap((s) => s.points)
  const lo = Math.min(...all, reference?.value ?? Infinity)
  const hi = Math.max(...all, reference?.value ?? -Infinity)
  const pad = Math.max(1, (hi - lo) * 0.2)
  const y0 = Math.floor(lo - pad), y1 = Math.ceil(hi + pad)
  const n = xLabels.length
  const X = (i: number) => PL + (i * (W - PL - PR)) / Math.max(1, n - 1)
  const Y = (v: number) => PT + ((y1 - v) / (y1 - y0)) * (H - PT - PB)
  const ticks = [y0, Math.round((y0 + y1) / 2), y1]

  return (
    <ChartFrame viewBox={`0 0 ${W} ${H}`} title={yLabel}
      desc={series.map((s) => `${s.label}: ${s.points.join(', ')}`).join('. ')}>
      {ticks.map((t) => (
        <g key={t}>
          <line x1={PL} x2={W - PR} y1={Y(t)} y2={Y(t)} stroke="var(--line-soft)" strokeWidth="1" />
          <text x={PL - 8} y={Y(t) + 4} textAnchor="end" fill="var(--ink-3)"
                fontSize="11" fontFamily="var(--font-plex-mono)">{t}</text>
        </g>
      ))}
      {reference && (
        <g>
          <line x1={PL} x2={W - PR} y1={Y(reference.value)} y2={Y(reference.value)}
                stroke="var(--ink-3)" strokeWidth="1.5" strokeDasharray="5 4" />
          <rect x={PL + 2} y={Y(reference.value) - 15} rx="3"
                width={reference.label.length * 5.6 + 10} height="14" fill="var(--surface)" />
          <text x={PL + 7} y={Y(reference.value) - 5} fill="var(--ink-3)"
                fontSize="11" fontFamily="var(--font-plex-sans)">{reference.label}</text>
        </g>
      )}
      {xLabels.map((l, i) => (
        <text key={l + i} x={X(i)} y={H - 10} textAnchor="middle" fill="var(--ink-3)"
              fontSize="11" fontFamily="var(--font-plex-mono)">{l}</text>
      ))}
      {series.map((s) => (
        <g key={s.label}>
          <polyline fill="none" stroke={s.color} strokeWidth="2" strokeLinecap="round"
                    strokeLinejoin="round" points={s.points.map((p, i) => `${X(i)},${Y(p)}`).join(' ')} />
          {s.points.map((p, i) => (
            <circle key={i} cx={X(i)} cy={Y(p)} r="4" fill={s.color}
                    stroke="var(--surface)" strokeWidth="2">
              <title>{`${s.label} · ${xLabels[i]}: ${p}`}</title>
            </circle>
          ))}
        </g>
      ))}
    </ChartFrame>
  )
}

/* ------------------------------------------- stock composition (§8.5) ----- */

export interface StockSeg {
  key: string; label: string; value: number; color: string; hatched?: boolean
}

/**
 * §8.5 — the stock bar split by what stock actually IS. Jobwork and on-order
 * segments are hatched, because they are neither available nor gone.
 */
export function StockBar({ segments, uom }: { segments: StockSeg[]; uom: string }) {
  const uid = useId().replace(/:/g, '')
  const total = segments.reduce((a, s) => a + s.value, 0)
  const shown = segments.filter((s) => s.value > 0)
  return (
    <div>
      <svg viewBox="0 0 100 6" preserveAspectRatio="none" className="h-4 w-full" role="img"
           aria-label={shown.map((s) => `${s.label} ${s.value} ${uom}`).join(', ')}>
        <defs>
          {shown.filter((s) => s.hatched).map((s) => (
            <pattern key={s.key} id={`h-${uid}-${s.key}`} width="3" height="3"
                     patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
              <rect width="3" height="3" fill={s.color} opacity="0.28" />
              <line x1="0" y1="0" x2="0" y2="3" stroke={s.color} strokeWidth="1.6" />
            </pattern>
          ))}
        </defs>
        {(() => {
          let x = 0
          return shown.map((s) => {
            const w = total > 0 ? (s.value / total) * 100 : 0
            const el = (
              <rect key={s.key} x={x} y="0" width={Math.max(0, w - 0.4)} height="6" rx="0.8"
                    fill={s.hatched ? `url(#h-${uid}-${s.key})` : s.color}>
                <title>{`${s.label}: ${num(s.value, 2)} ${uom}`}</title>
              </rect>
            )
            x += w
            return el
          })
        })()}
      </svg>
      <ul className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1">
        {shown.map((s) => (
          <li key={s.key} className="flex items-center gap-1.5 text-[11px] text-ink-2">
            <span aria-hidden className="size-2.5 shrink-0 rounded-[2px]"
              style={s.hatched
                ? { background: `repeating-linear-gradient(45deg, ${s.color} 0 1.5px, transparent 1.5px 3px)`, border: `1px solid ${s.color}` }
                : { background: s.color }} />
            {s.label} <span className="num font-medium text-ink">{num(s.value, s.value < 10 ? 2 : 0)}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}

/**
 * §8.5 — production cover as a bar with the lead time as a tick.
 * Fill left of the tick means ordering today is already too late.
 */
export function CoverBar({ coverDays, leadDays, tone }: {
  coverDays: number; leadDays: number; tone: 'critical' | 'warn' | 'good'
}) {
  const scale = Math.max(coverDays, leadDays) * 1.25
  const cover = Math.min(100, (coverDays / scale) * 100)
  const tick = Math.min(100, (leadDays / scale) * 100)
  const bg = { critical: 'var(--critical)', warn: 'var(--warn)', good: 'var(--good)' }[tone]
  return (
    <div>
      <div className="relative h-2.5 w-full overflow-hidden rounded-full bg-surface-3">
        <div className="h-full rounded-full" style={{ width: `${cover}%`, background: bg }} />
        <div aria-hidden className="absolute top-0 h-full w-[2px] bg-ink"
             style={{ left: `${tick}%` }} />
      </div>
      <p className="mt-1 text-[11px] text-ink-3">
        <span aria-hidden className="mr-1 inline-block h-2.5 w-[2px] translate-y-[2px] bg-ink" />
        lead time {leadDays} days
        {coverDays < leadDays && (
          <span className="ml-1.5 font-medium text-critical">— ordering today is already too late</span>
        )}
      </p>
    </div>
  )
}
