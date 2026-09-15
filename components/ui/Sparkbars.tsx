'use client'
import { Hatch } from '@/components/charts/kit'
import type { Derived } from '@/lib/domain/types'

/**
 * The little bar cluster in the corner of a KPI tile.
 *
 * The reference draws one on every tile, and the temptation is to draw noise
 * that looks like data. This draws the figure's OWN arithmetic: the numeric
 * inputs of the derivation, in the order the formula uses them, at the same
 * scale. Open the figure and the inspector lists exactly these numbers.
 *
 * A figure whose inputs are words rather than numbers — "not sold yet", a
 * date, a vendor name — gets no chart at all rather than a decorative one.
 * Fewer than two numbers is not a shape.
 *
 * `hatched` is passed only for an illustrative figure, so a made-up number
 * never draws a solid mark (§10).
 */
export function Sparkbars({ d, n = 7, hatched = false, className = '' }: {
  d: Derived<unknown>
  /** how many inputs to draw before the tile would be crowded */
  n?: number
  hatched?: boolean
  className?: string
}) {
  const nums = d.inputs
    .filter((i) => typeof i.value === 'number' && Number.isFinite(i.value) && i.value !== 0)
    .slice(0, n)
  if (nums.length < 2) return null

  const vals = nums.map((i) => Math.abs(i.value as number))
  const max = Math.max(...vals)
  if (max <= 0) return null

  const W = 56, H = 18, gap = 2
  const bw = (W - gap * (vals.length - 1)) / vals.length
  const id = `sb-${d.label.replace(/[^a-z0-9]/gi, '')}`
  // darkest bar is the largest, as the reference ranks its own
  const step = (v: number) => {
    const r = v / max
    return r > 0.75 ? 'var(--seq-5)' : r > 0.5 ? 'var(--seq-4)' : r > 0.25 ? 'var(--seq-3)' : 'var(--seq-2)'
  }
  const biggest = nums[vals.indexOf(max)]

  return (
    <svg viewBox={`0 0 ${W} ${H}`} role="img" className={className}
         aria-label={`${d.label}: ${nums.length} inputs, largest ${biggest.name}`}>
      <title>{`${nums.length} of this figure's inputs · largest ${biggest.name} ${biggest.value}${biggest.unit ? ' ' + biggest.unit : ''}`}</title>
      {hatched && <Hatch id={id} color="var(--seq-4)" />}
      {vals.map((v, i) => {
        const h = Math.max(2, (v / max) * H)
        return (
          <rect key={i} x={i * (bw + gap)} y={H - h} width={bw} height={h} rx={1.5}
                fill={hatched ? `url(#${id})` : step(v)} />
        )
      })}
    </svg>
  )
}
