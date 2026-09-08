'use client'
import { useApp } from '@/state/app-store'
import { lakh, money, num, type Tone } from '@/lib/domain/format'
import { longDate } from '@/lib/domain/format'
import { TONE_FG } from './bits'
import { useAnimatedNumber, useFlash } from './motion'
import type { Derived } from '@/lib/domain/types'

export type NumFormat = 'qty' | 'money' | 'lakh' | 'days' | 'months' | 'date' | 'int' | 'raw'

export function formatDerived(d: Derived<unknown>, format: NumFormat, dp?: number): string {
  const v = d.value
  if (typeof v === 'string') return format === 'date' ? longDate(v) : v
  if (typeof v === 'boolean') return v ? 'Yes' : 'No'
  const n = v as number
  if (!Number.isFinite(n)) return '—'
  switch (format) {
    case 'money': return money(n, dp ?? 0)
    case 'lakh': return lakh(n)
    case 'days': return `${num(n, dp ?? 1)}`
    case 'months': return `${num(n, dp ?? 2)}`
    case 'int': return num(n, 0)
    default: return num(n, dp ?? 2)
  }
}

/**
 * CONTEXT rule 1 — every number on screen must be derived and inspectable.
 * This is the only component that renders a figure, and it always opens the
 * formula that produced it. Nothing is a stored display value.
 */
export function Num({ d, format = 'qty', dp, tone, className = '', suffix, size = 'md' }: {
  d: Derived<unknown>
  format?: NumFormat
  dp?: number
  tone?: Tone
  className?: string
  suffix?: string
  size?: 'sm' | 'md' | 'lg' | 'display'
}) {
  const { openInspect } = useApp()
  // Big figures slide to a new value when it changes; every figure flashes.
  // Neither runs on first paint, so server and client always agree.
  const big = size === 'display' || size === 'lg'
  const numeric = typeof d.value === 'number' ? (d.value as number) : NaN
  const tweened = useAnimatedNumber(big ? numeric : NaN)
  const flash = useFlash(d.value)
  const shown: Derived<unknown> = big && Number.isFinite(tweened) ? { ...d, value: tweened } : d
  const sz = {
    sm: 'text-[12px]', md: 'text-[13px]',
    lg: 'figure text-[20px]', display: 'figure text-[30px] leading-none',
  }[size]
  return (
    <button
      type="button"
      onClick={() => openInspect(d)}
      title={`${d.label} — click to see how this is calculated`}
      className={`num inline-flex items-baseline gap-1 rounded-sm underline decoration-dotted decoration-ink-3/40 underline-offset-[3px] transition-colors hover:decoration-accent hover:text-accent ${sz} ${tone ? TONE_FG[tone] : ''} ${flash} ${className}`}
    >
      {formatDerived(shown, format, dp)}
      {suffix && <span className="text-[0.8em] font-normal text-ink-3">{suffix}</span>}
    </button>
  )
}
