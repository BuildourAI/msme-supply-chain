'use client'
import { Num, type NumFormat } from '@/components/ui/Num'
import { Sparkbars } from '@/components/ui/Sparkbars'
import { Icon, type IconName } from '@/components/ui/icons'
import { ICON_BG, TONE_WORD } from '@/components/exec/Section'
import type { Tone } from '@/lib/domain/format'
import type { Derived } from '@/lib/domain/types'

/**
 * The reference's KPI tile: a tinted icon square, a label, a big number, a
 * caption, and a small chart of the figure's own inputs in the corner.
 *
 * The tile is a plain container, never a button — the figure inside is already
 * a button (it opens the derivation), and nesting one inside another is invalid
 * HTML. It also muddled two different meanings of a click. Where a tile can
 * filter the table, that gets its own explicit control.
 *
 * The tone lives in the icon square rather than in the figure: a 30px number
 * in status red reads as an alarm even when the status is "on target", and the
 * square carries the same information at the size a status deserves.
 */
export function KpiTile({ label, d, format, caption, tone = 'neutral', onClick, actionLabel, active, suffix, icon, index = 0 }: {
  label: string; d: Derived<unknown>; format?: NumFormat; caption: string
  tone?: Tone; onClick?: () => void; actionLabel?: string; active?: boolean; suffix?: string
  icon?: IconName
  /** stagger position — tiles enter left to right */
  index?: number
}) {
  return (
    <div style={{ '--i': index } as React.CSSProperties}
         className={`anim-fade-up lift kpi relative flex flex-col rounded-lg border p-3 ${active ? '!border-accent' : ''}`}>
      {/* absolutely positioned, so it goes first: as the last child it
          leaves the tile's last laid-out box at the top and the tile reads
          as mostly empty to a density probe */}
      <Sparkbars d={d} className="absolute right-3 top-3 w-12 opacity-90" />
      <span aria-hidden className={`grid size-7 shrink-0 place-items-center rounded-md ${ICON_BG[tone]}`}>
        <Icon name={icon ?? 'activity'} className="size-4" />
      </span>
      <span className="mono mt-2 flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-ink-3">
        <span className="truncate">{label}</span>
        {/* §10 — a status colour always arrives with the word that explains it */}
        {TONE_WORD[tone] && (
          <span className={`shrink-0 rounded-full px-1.5 text-[9px] font-semibold leading-[15px] ${ICON_BG[tone]}`}>
            {TONE_WORD[tone]}
          </span>
        )}
      </span>
      <span className="mt-0.5 block">
        <Num d={d} format={format} size="display" suffix={suffix} />
      </span>
      <span className="mt-1 block text-[11.5px] leading-snug text-ink-2">{caption}</span>
      {onClick && (
        <button type="button" onClick={onClick} aria-pressed={active}
          className={`press mt-1.5 self-start rounded-md border px-1.5 py-0.5 text-[11px] font-medium ${
            active ? 'border-accent bg-accent-tint text-accent-ink' : 'border-line text-ink-2 hover:bg-surface-2'}`}>
          {active ? 'Showing only these' : (actionLabel ?? 'Show only these')}
        </button>
      )}
    </div>
  )
}
