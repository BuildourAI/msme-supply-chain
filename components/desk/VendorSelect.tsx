'use client'
import { useEffect, useRef, useState } from 'react'
import type { DerivedRow } from '@/lib/domain/derive'
import { money } from '@/lib/domain/format'
import { useDesk } from './store'

/**
 * §8.1 — options list every quoted vendor ranked by landed cost, the
 * recommendation marked "· recommended" and pre-selected. Changing it re-prices
 * the row, turns the control amber, shows the per-unit premium, updates the KPI
 * tiles and logs the choice against the buyer. Override, never block.
 *
 * A real listbox rather than a native <select> so the detail view can carry the
 * score / on-time / lead sub-line the summary view deliberately omits.
 */
export function VendorSelect({ row, detail = false }: { row: DerivedRow; detail?: boolean }) {
  const { chooseVendor } = useDesk()
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const overridden = row.chosenVendorId !== row.recommendedVendorId

  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => { document.removeEventListener('mousedown', onDown); document.removeEventListener('keydown', onKey) }
  }, [open])

  return (
    <div ref={ref} className="relative">
      <button type="button" aria-haspopup="listbox" aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className={`flex w-full min-w-[10rem] items-center gap-1.5 rounded-md border px-2 py-1 text-left text-[12px] transition-colors ${
          overridden
            ? 'border-warn/45 bg-warn-soft text-ink hover:bg-warn-soft/70'
            : 'border-line bg-surface hover:bg-surface-2'}`}>
        <span className="min-w-0 flex-1">
          <span className="block truncate font-medium">{row.chosen.vendor.name}</span>
          {detail && (
            <span className="mono block truncate text-[10px] text-ink-3">
              score {row.chosen.vendorItem.score} · {row.chosen.vendorItem.onTimePct}% on time · {row.chosen.leadTime.value}d lead
            </span>
          )}
        </span>
        <svg viewBox="0 0 24 24" aria-hidden className="size-3 shrink-0 opacity-50" fill="none"
             stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
          <path d="m6 9 6 6 6-6" />
        </svg>
      </button>

      {overridden && row.premiumPerUnit && (
        <p className="mt-0.5 text-[10.5px] leading-tight text-warn">
          +{money(row.premiumPerUnit.value, 2)}/unit over the recommendation
        </p>
      )}

      {open && (
        <ul role="listbox" aria-label="Supplier"
          className="absolute left-0 top-full z-30 mt-1 w-[19rem] overflow-hidden rounded-md border border-line bg-surface py-1 shadow-xl">
          {row.quotes.map((q) => {
            const sel = q.vendor.id === row.chosenVendorId
            const rec = q.vendor.id === row.recommendedVendorId
            const delta = q.landedPerUnit.value - row.quotes[0].landedPerUnit.value
            return (
              <li key={q.vendor.id} role="option" aria-selected={sel}>
                <button type="button"
                  onClick={() => { chooseVendor(row, q.vendor.id); setOpen(false) }}
                  className={`flex w-full items-start gap-2 px-3 py-1.5 text-left hover:bg-surface-2 ${sel ? 'bg-accent-soft' : ''}`}>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[12.5px] font-medium">
                      {q.vendor.name}
                      {rec && <span className="font-normal text-accent"> · recommended</span>}
                    </span>
                    <span className="mono block text-[10px] text-ink-3">
                      score {q.vendorItem.score} · {q.vendorItem.onTimePct}% on time
                      · {q.leadTime.value}d lead · {q.vendorItem.trailingRejectionRate}% reject
                    </span>
                  </span>
                  <span className="shrink-0 text-right">
                    <span className="num block text-[12px] font-semibold">
                      {money(q.landedPerUnit.value, 2)}
                    </span>
                    <span className={`num block text-[10px] ${delta > 0 ? 'text-warn' : 'text-good'}`}>
                      {delta > 0 ? `+${money(delta, 2)}` : 'lowest landed'}
                    </span>
                  </span>
                </button>
              </li>
            )
          })}
          <li className="border-t border-line-soft px-3 pb-1 pt-1.5 text-[10.5px] leading-snug text-ink-3">
            Ranked by landed cost, not by quoted rate. Choosing another supplier is always allowed —
            it is recorded against you, never blocked.
          </li>
        </ul>
      )}
    </div>
  )
}
