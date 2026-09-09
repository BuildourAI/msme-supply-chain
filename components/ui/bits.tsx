'use client'
import type { Tone } from '@/lib/domain/format'
import { useSlidingIndicator } from './Tabs'

export const TONE_BG: Record<Tone, string> = {
  critical: 'bg-critical-soft text-critical border-critical/25',
  warn: 'bg-warn-soft text-warn border-warn/25',
  good: 'bg-good-soft text-good border-good/25',
  accent: 'bg-accent-soft text-accent border-accent/25',
  neutral: 'bg-surface-3 text-ink-2 border-line',
}
export const TONE_FG: Record<Tone, string> = {
  critical: 'text-critical', warn: 'text-warn', good: 'text-good',
  accent: 'text-accent', neutral: 'text-ink-2',
}
export const TONE_BAR: Record<Tone, string> = {
  critical: 'bg-critical', warn: 'bg-warn', good: 'bg-good',
  accent: 'bg-accent', neutral: 'bg-ink-3',
}

export function Pill({ children, tone = 'neutral', mono = false, title }: {
  children: React.ReactNode; tone?: Tone; mono?: boolean; title?: string
}) {
  return (
    <span title={title}
      className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11px] leading-[18px] ${TONE_BG[tone]} ${mono ? 'mono' : ''}`}>
      {children}
    </span>
  )
}

/**
 * §10 — status colours are reserved and always ship with a text label,
 * never colour alone. There is no prop here that can suppress the label.
 */
export function StatusPill({ label, tone, explain }: { label: string; tone: Tone; explain?: string }) {
  return (
    <span title={explain}
      className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11px] font-medium leading-[18px] ${TONE_BG[tone]} ${explain ? 'cursor-help' : ''}`}>
      <span aria-hidden className={`size-1.5 rounded-full ${TONE_BAR[tone]}`} />
      {label}
    </span>
  )
}

/**
 * The section container. `rounded-lg` is a selector the browser suites walk
 * to measure empty space — its radius is set by the token, never by swapping
 * the class. The hairline shadow is what lifts a card off the ground; the
 * border alone read as a wireframe once the ground and surface drew closer.
 *
 * `min-w-0` is load-bearing on a phone: a card in a grid inherits min-width
 * auto, and one seven-column value table inside it was enough to push the
 * whole page 40px wider than the screen. A card never gets to do that — what
 * is wider than the card scrolls inside it.
 */
export function Card({ title, sub, live, annotation, actions, children, id, className = '', index = 0 }: {
  title?: string; sub?: string; live?: boolean; annotation?: string
  actions?: React.ReactNode; children: React.ReactNode; id?: string; className?: string
  /** stagger position on entrance */
  index?: number
}) {
  return (
    <section id={id} style={{ '--i': index } as React.CSSProperties}
             className={`anim-fade-up glass-card min-w-0 rounded-lg border border-line shadow-sm ${className}`}>
      {(title || actions) && (
        <header className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-line-soft px-4 py-3">
          <div className="min-w-0">
            <h2 className="text-[15px] leading-tight">{title}</h2>
            {sub && <p className="mt-0.5 text-[12px] text-ink-3">{sub}</p>}
          </div>
          {live && (
            <span className="mono rounded border border-accent/30 bg-accent-soft px-1.5 py-px text-[10px] font-medium uppercase tracking-wide text-accent">
              live
            </span>
          )}
          {annotation && (
            <span className="rounded border border-warn/25 bg-warn-soft px-2 py-0.5 text-[11px] text-warn">
              {annotation}
            </span>
          )}
          {actions && <div className="ml-auto flex items-center gap-2">{actions}</div>}
        </header>
      )}
      {children}
    </section>
  )
}

/**
 * A segmented control with a thumb that slides to the option you chose,
 * rather than one button lighting up as another goes out. The thumb is a
 * separate element under the buttons; the buttons themselves only change
 * colour, so role, label and aria-pressed are exactly as before.
 */
export function Segmented<T extends string>({ options, value, onChange, label }: {
  options: { id: T; label: string }[]; value: T; onChange: (v: T) => void; label: string
}) {
  const { track, register, pos, settled } = useSlidingIndicator(value)
  return (
    <div ref={track} role="group" aria-label={label}
         className="relative inline-flex rounded-md border border-line bg-surface-2 p-0.5">
      {pos && (
        <span aria-hidden className={`seg-thumb ${settled ? '' : 'tab-ink-still'}`}
              style={{ transform: `translateX(${pos.left}px)`, width: pos.width }} />
      )}
      {options.map((o) => (
        <button key={o.id} type="button" aria-pressed={value === o.id} onClick={() => onChange(o.id)}
          ref={register(o.id)}
          className={`press relative z-10 rounded px-2.5 py-1 text-[12px] font-medium ${
            value === o.id ? 'text-accent' : 'text-ink-3 hover:text-ink-2'}`}>
          {o.label}
        </button>
      ))}
    </div>
  )
}

export function Button({ children, onClick, variant = 'default', size = 'md', disabled, title, type = 'button' }: {
  children: React.ReactNode; onClick?: () => void
  variant?: 'default' | 'primary' | 'ghost' | 'danger'; size?: 'sm' | 'md'
  disabled?: boolean; title?: string; type?: 'button' | 'submit'
}) {
  const v = {
    default: 'border-line bg-surface hover:bg-surface-2 text-ink shadow-sm',
    primary: 'border-accent bg-accent text-on-accent hover:bg-[color-mix(in_srgb,var(--accent)_88%,var(--ink))] shadow-sm',
    ghost: 'border-transparent hover:bg-surface-2 text-ink-2',
    danger: 'border-critical/30 bg-critical-soft text-critical hover:bg-critical-soft/70',
  }[variant]
  return (
    <button type={type} onClick={onClick} disabled={disabled} title={title}
      className={`press inline-flex items-center gap-1.5 rounded-md border font-medium disabled:cursor-not-allowed disabled:opacity-40 ${v} ${
        size === 'sm' ? 'px-2 py-1 text-[12px]' : 'px-3 py-1.5 text-[13px]'}`}>
      {children}
    </button>
  )
}

export function Bar({ value, max, tone = 'accent', className = '' }: {
  value: number; max: number; tone?: Tone; className?: string
}) {
  const w = max > 0 ? Math.min(100, (value / max) * 100) : 0
  return (
    <div className={`h-1.5 w-full overflow-hidden rounded-full bg-surface-3 ${className}`}>
      <div className={`h-full rounded-full ${TONE_BAR[tone]}`} style={{ width: `${w}%` }} />
    </div>
  )
}
