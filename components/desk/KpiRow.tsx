'use client'
import { Num, type NumFormat } from '@/components/ui/Num'
import { TONE_BAR } from '@/components/ui/bits'
import type { Tone } from '@/lib/domain/format'
import type { Derived } from '@/lib/domain/types'

/**
 * The reference's KPI tile: a coloured left border, a big number, a caption.
 *
 * The tile is a plain container, never a button — the figure inside is already
 * a button (it opens the derivation), and nesting one inside another is invalid
 * HTML. It also muddled two different meanings of a click. Where a tile can
 * filter the table, that gets its own explicit control.
 */
export function KpiTile({ label, d, format, caption, tone = 'neutral', onClick, actionLabel, active, suffix, index = 0 }: {
  label: string; d: Derived<unknown>; format?: NumFormat; caption: string
  tone?: Tone; onClick?: () => void; actionLabel?: string; active?: boolean; suffix?: string
  /** stagger position — tiles enter left to right */
  index?: number
}) {
  return (
    <div style={{ '--i': index } as React.CSSProperties}
         className={`anim-fade-up lift glass-tile flex items-stretch gap-3 rounded-lg border shadow-sm ${active ? '!border-accent' : ''}`}>
      <span aria-hidden className={`w-[3px] shrink-0 rounded-l-[calc(var(--r-lg)-1px)] ${TONE_BAR[tone]}`} />
      <div className="min-w-0 flex-1 py-3 pr-3">
        <span className="mono block text-[10px] uppercase tracking-wider text-ink-3">{label}</span>
        <span className="mt-1 block">
          <Num d={d} format={format} size="display" suffix={suffix}
               tone={tone === 'neutral' ? undefined : tone} />
        </span>
        <span className="mt-1.5 block text-[11.5px] leading-snug text-ink-3">{caption}</span>
        {onClick && (
          <button type="button" onClick={onClick} aria-pressed={active}
            className={`press mt-1.5 rounded border px-1.5 py-0.5 text-[11px] font-medium ${
              active ? 'border-accent bg-accent-soft text-accent' : 'border-line text-ink-2 hover:bg-surface-2'}`}>
            {active ? 'Showing only these' : (actionLabel ?? 'Show only these')}
          </button>
        )}
      </div>
    </div>
  )
}
