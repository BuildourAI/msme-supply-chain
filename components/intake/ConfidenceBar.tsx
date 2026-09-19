'use client'
import { AUTO, FLOOR, SUGGEST } from '@/lib/intake/match'

/**
 * How sure the system is, as a bar and as a word.
 *
 * Both, always. A bar alone is colour-coding, which is unreadable to some
 * people and ambiguous to everybody — and a status that does not carry its word
 * is the one thing this portal's shape does not allow.
 *
 * It says one thing only: how sure the MATCHER is that this wording is this
 * material. It is deliberately not blended with how legible the photograph was,
 * because a single number meaning two things would quietly defeat the floor.
 */
export function ConfidenceBar({ value, via }: { value: number; via: string }) {
  const pct = Math.round(value * 100)
  const tone = via === 'alias' ? 'good'
    : value >= AUTO ? 'good'
      : value >= SUGGEST ? 'warn'
        : value >= FLOOR ? 'warn' : 'critical'

  const word = via === 'alias' ? 'Known wording'
    : via === 'unmapped' ? 'Not recognised'
      : value >= AUTO ? 'Matched'
        : value >= SUGGEST ? 'Needs a look'
          : 'Closest guess'

  return (
    <span className="flex items-center gap-1.5" title={explain(via, value)}>
      <span className="h-1.5 w-10 shrink-0 overflow-hidden rounded-full bg-surface-3">
        <span className="block h-full rounded-full"
          style={{ width: `${Math.max(pct, 4)}%`, background: `var(--${tone})` }} />
      </span>
      <span className="mono shrink-0 text-[10.5px] text-ink-3">
        {via === 'unmapped' ? '—' : `${pct}%`}
      </span>
      <span className="truncate text-[11px] text-ink-2">{word}</span>
    </span>
  )
}

const explain = (via: string, value: number) => {
  if (via === 'alias') return 'You have mapped this supplier’s wording before, so it resolves on its own.'
  if (via === 'unmapped') return `Nothing scored above ${Math.round(FLOOR * 100)}%, so nothing is suggested. Pick a material, or add it.`
  if (value >= AUTO) return 'Above the floor on its own — you can leave it as it is.'
  return 'Below the floor for filing without a person. Check it before approving.'
}
