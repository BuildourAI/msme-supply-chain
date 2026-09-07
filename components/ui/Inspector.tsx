'use client'
import { useEffect } from 'react'
import { useApp } from '@/state/app-store'
import { num } from '@/lib/domain/format'

/**
 * The answer to "where does 620 come from", rendered generically from the
 * Derived object rather than hand-written per number (CONTEXT rule 1).
 */
export function Inspector() {
  const { inspect: d, closeInspect } = useApp()

  useEffect(() => {
    if (!d) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') closeInspect() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [d, closeInspect])

  if (!d) return null
  const shown = typeof d.value === 'number'
    ? (Number.isFinite(d.value) ? num(d.value as number, 2) : '—')
    : String(d.value)

  return (
    <div className="fixed inset-0 z-[60] flex justify-end bg-ink/20" onClick={closeInspect}>
      <aside role="dialog" aria-modal="true" aria-label={`How ${d.label} is calculated`}
        onClick={(e) => e.stopPropagation()}
        className="flex h-full w-full max-w-md flex-col overflow-y-auto border-l border-line bg-surface shadow-2xl">
        <header className="sticky top-0 flex items-start gap-3 border-b border-line bg-surface px-4 py-3">
          <div>
            <p className="mono text-[10px] uppercase tracking-wider text-ink-3">How this is calculated</p>
            <h2 className="mt-0.5 text-[17px]">{d.label}</h2>
          </div>
          <button type="button" onClick={closeInspect} aria-label="Close"
            className="ml-auto rounded p-1 text-ink-3 hover:bg-surface-2 hover:text-ink">✕</button>
        </header>

        <div className="space-y-4 p-4">
          <div className="rounded-md border border-line bg-surface-2 p-3">
            <p className="mono text-[10px] uppercase tracking-wider text-ink-3">Formula</p>
            <p className="mono mt-1 text-[12.5px] leading-relaxed text-ink">{d.formula}</p>
          </div>

          <div>
            <p className="mono text-[10px] uppercase tracking-wider text-ink-3">Substituted</p>
            <table className="mt-1.5 w-full border-collapse text-[12.5px]">
              <tbody>
                {d.inputs.map((i, k) => (
                  <tr key={k} className="border-b border-line-soft last:border-0">
                    <td className="py-1.5 pr-3 align-top">
                      <span className="mono text-ink-2">{i.name}</span>
                      {i.source && <span className="block text-[11px] leading-snug text-ink-3">{i.source}</span>}
                    </td>
                    <td className="num whitespace-nowrap py-1.5 text-right align-top font-medium">
                      {typeof i.value === 'number' ? num(i.value, 2) : i.value}
                      {i.unit && <span className="ml-1 text-[11px] font-normal text-ink-3">{i.unit}</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="flex items-baseline justify-between rounded-md border border-accent/30 bg-accent-soft px-3 py-2.5">
            <span className="text-[12px] font-medium text-accent">Result</span>
            <span className="figure text-[22px] text-accent">
              {shown}{d.unit && <span className="ml-1 text-[12px] font-normal">{d.unit}</span>}
            </span>
          </div>

          {d.crossCheck && (
            <div className="rounded-md border border-warn/30 bg-warn-soft p-3">
              <p className="text-[12px] font-medium text-warn">{d.crossCheck.label}</p>
              <dl className="mt-1.5 space-y-0.5 text-[12px] text-ink-2">
                <div className="flex justify-between gap-3"><dt>By the rule</dt><dd className="mono">{d.crossCheck.expected}</dd></div>
                <div className="flex justify-between gap-3"><dt>As stored</dt><dd className="mono">{d.crossCheck.actual}</dd></div>
                {d.crossCheck.drift && (
                  <div className="flex justify-between gap-3 font-medium text-warn"><dt>Drift</dt><dd className="mono">{d.crossCheck.drift}</dd></div>
                )}
              </dl>
              <p className="mt-2 text-[11px] leading-snug text-ink-3">
                Shown rather than silently resolved — errors surface, they never quietly disappear (§11).
              </p>
            </div>
          )}

          {d.note && (
            <p className="border-l-2 border-line pl-3 text-[12px] leading-relaxed text-ink-2">{d.note}</p>
          )}

          <p className="text-[11px] leading-snug text-ink-3">
            No figure on this screen is stored as a display value. Every one is computed from the
            seed data at render, which is why this panel can exist for all of them.
          </p>
        </div>
      </aside>
    </div>
  )
}
