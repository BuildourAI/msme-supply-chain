'use client'
import { useEffect, useState } from 'react'
import { Dialog } from '@/components/ui/Dialog'
import { useWorkspace } from '@/components/workspace/store'
import {
  DEFAULT_PICKS, METRIC_LABEL, METRIC_WHY, metricsFor, type MetricKey,
} from '@/lib/workspace/metrics'

/**
 * Which figures the owner keeps.
 *
 * Every metric is listed, including the ones that have nothing behind them
 * yet — a figure you cannot switch on until it has data is one you never
 * discover. Those say what they are waiting for instead of pretending to a
 * value, which is the same rule the tiles follow.
 *
 * Nothing is saved until Save is pressed: ticking six boxes and changing your
 * mind should cost nothing. Showing none is allowed and is remembered as a
 * choice — somebody who wants the work queue and nothing else is not somebody
 * who has failed to decide.
 */
export function MetricPicker({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { workspace, update, today } = useWorkspace()
  const [picks, setPicks] = useState<Set<MetricKey>>(new Set())

  useEffect(() => {
    if (!open || !workspace) return
    setPicks(new Set((workspace.metricPicks ?? DEFAULT_PICKS) as MetricKey[]))
  }, [open, workspace])

  if (!open || !workspace) return null
  const all = metricsFor(workspace, today)

  const toggle = (key: MetricKey) => setPicks((s) => {
    const next = new Set(s)
    if (next.has(key)) next.delete(key)
    else next.add(key)
    return next
  })

  const save = () => {
    update((w) => ({ ...w, metricPicks: [...picks] }))
    onClose()
  }

  return (
    <Dialog open onClose={onClose} title="What to keep an eye on">
      <div className="space-y-2 px-4 py-4">
        <p className="text-[12.5px] leading-relaxed text-ink-2">
          Tick the figures worth your attention. Everything is still worked out
          either way — this only decides what the screen shows.
        </p>
        <ul className="space-y-1.5">
          {all.map((m) => (
            <li key={m.key}>
              <label className="flex cursor-pointer items-start gap-2.5 rounded-lg border border-line bg-surface-2/40 px-3 py-2 hover:bg-surface-2">
                <input type="checkbox" checked={picks.has(m.key)}
                  onChange={() => toggle(m.key)}
                  className="mt-0.5 size-3.5 shrink-0 accent-[var(--accent-ink)]" />
                <span className="min-w-0 flex-1">
                  <span className="flex flex-wrap items-baseline gap-x-2">
                    <span className="text-[13px] font-semibold">{METRIC_LABEL[m.key]}</span>
                    <span className={`num text-[12px] ${m.measured ? 'text-ink-2' : 'text-ink-4'}`}>
                      {m.measured ? m.value : 'nothing to measure yet'}
                    </span>
                  </span>
                  <span className="mt-0.5 block text-[11.5px] leading-relaxed text-ink-3">
                    {m.measured ? METRIC_WHY[m.key] : m.how}
                  </span>
                </span>
              </label>
            </li>
          ))}
        </ul>
      </div>

      <footer className="flex items-center gap-2 border-t border-line-soft px-4 py-3">
        <button type="button" onClick={() => setPicks(new Set(DEFAULT_PICKS))}
          className="press rounded-lg px-2.5 py-2 text-[12.5px] text-ink-3 hover:text-ink">
          Back to the usual six
        </button>
        <span className="ml-auto" />
        <button type="button" onClick={onClose}
          className="press rounded-lg px-2.5 py-2 text-[13px] text-ink-2 hover:text-ink">Cancel</button>
        <button type="button" onClick={save}
          className="press rounded-lg border border-accent-ink bg-accent-ink px-3.5 py-2 text-[13px] font-semibold text-on-accent hover:bg-accent">
          Save
        </button>
      </footer>
    </Dialog>
  )
}
