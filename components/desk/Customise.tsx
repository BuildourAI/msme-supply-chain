'use client'
import { useEffect, useState } from 'react'
import { Dialog } from '@/components/ui/Dialog'
import { useWorkspace } from '@/components/workspace/store'
import { PICTURES, SECTIONS, hiddenOn, setHiddenOn, type Board, type BoardPart } from '@/lib/workspace/boards'
import {
  DEFAULTS_FOR, METRIC_LABEL, METRIC_WHY, picksOf, stageMetrics, type Metric, type MetricKey, type MetricStage,
} from '@/lib/workspace/metrics'
import type { Workspace } from '@/lib/workspace/types'

/**
 * What a dashboard shows, in one place: its figures, its pictures and the
 * other parts it can do without.
 *
 * A figure is ticked to be shown, as before. A picture or a part is ticked
 * to be shown too, though it is stored as what is switched off — so that
 * everything is on until the owner says otherwise, including a picture a
 * later release adds. Every one is listed whether or not it has anything to
 * draw yet, with a line on what fills it: a picture you cannot switch on
 * until it has data is one you never find.
 *
 * Nothing is saved until Save. Showing none of something is allowed and is
 * remembered as a choice. What is waiting on you is not on the list — it is
 * the work, not a view of it.
 */
export function Customise({ open, onClose, board, headlines }: {
  open: boolean
  onClose: () => void
  board: Board
  /** the Welcome page's money tiles, as worked out; a desk's figures are its own */
  headlines?: Metric[]
}) {
  const { workspace, update, today } = useWorkspace()
  const [picks, setPicks] = useState<Set<MetricKey>>(new Set())
  const [hidden, setHidden] = useState<Set<string>>(new Set())

  useEffect(() => {
    if (!open || !workspace) return
    setHidden(new Set(hiddenOn(workspace, board)))
    if (board !== 'welcome') setPicks(new Set(picksOf(workspace, board)))
  }, [open, workspace, board])

  if (!open || !workspace) return null
  const welcome = board === 'welcome'
  const figures: Metric[] = welcome ? (headlines ?? []) : stageMetrics(workspace, today, board as MetricStage)
  const isShown = (m: Metric) => (welcome ? !hidden.has(m.key) : picks.has(m.key))

  const flip = <T,>(set: Set<T>, key: T) => {
    const next = new Set(set)
    if (next.has(key)) next.delete(key)
    else next.add(key)
    return next
  }
  const toggleFigure = (key: MetricKey) => (welcome ? setHidden((s) => flip(s, key)) : setPicks((s) => flip(s, key)))
  const usual = () => {
    setHidden(new Set())
    if (!welcome) setPicks(new Set(DEFAULTS_FOR[board as MetricStage]))
  }

  const save = () => {
    update((w) => {
      const kept = setHiddenOn(w, board, hidden)
      return welcome ? kept : writePicks(kept, board as MetricStage, [...picks])
    })
    onClose()
  }

  return (
    <Dialog open onClose={onClose} wide title="Customise this dashboard"
      sub="Tick what to show. Everything is still worked out either way — this only decides what the screen shows.">
      <div className="grid gap-x-5 gap-y-4 px-4 py-4 md:grid-cols-2">
        <section data-customise-figures className="min-w-0">
          <Heading count={figures.filter(isShown).length} of={figures.length}>
            {welcome ? 'Money tiles' : 'Figures'}
          </Heading>
          <ul className="mt-2 space-y-1.5">
            {figures.map((m) => (
              <li key={m.key}>
                <Row checked={isShown(m)} onChange={() => toggleFigure(m.key)}
                  label={welcome ? m.label : METRIC_LABEL[m.key]}
                  value={m.measured ? m.value : 'nothing to measure yet'} measured={m.measured}
                  what={m.measured ? (welcome ? m.how : METRIC_WHY[m.key]) : m.how} />
              </li>
            ))}
          </ul>
        </section>

        <div className="min-w-0 space-y-4">
          <section data-customise-pictures>
            <Heading count={PICTURES[board].filter((p) => !hidden.has(p.key)).length} of={PICTURES[board].length}>
              Pictures
            </Heading>
            <Parts parts={PICTURES[board]} hidden={hidden} onToggle={(k) => setHidden((s) => flip(s, k))} />
          </section>
          <section data-customise-sections>
            <Heading>Also on this page</Heading>
            <Parts parts={SECTIONS[board]} hidden={hidden} onToggle={(k) => setHidden((s) => flip(s, k))} />
            <p className="mt-2 text-[11.5px] leading-snug text-ink-3">
              {welcome
                ? 'Always shown: the work queues across every desk, and the five stage cards.'
                : 'Always shown: what is waiting on you — it is the work itself.'}
            </p>
          </section>
        </div>
      </div>

      <footer className="flex items-center gap-2 border-t border-line-soft px-4 py-3">
        <button type="button" onClick={usual} data-customise-usual
          className="press rounded-lg px-2.5 py-2 text-[12.5px] text-ink-3 hover:text-ink">
          Back to the usual
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

/** A desk's figure picks, under the key each desk has always kept them. */
function writePicks(w: Workspace, stage: MetricStage, picks: MetricKey[]): Workspace {
  return stage === 'inbound' ? { ...w, inboundMetricPicks: picks }
    : stage === 'inventory' ? { ...w, inventoryMetricPicks: picks }
      : stage === 'production' ? { ...w, productionMetricPicks: picks }
        : stage === 'dispatch' ? { ...w, dispatchMetricPicks: picks }
          : { ...w, metricPicks: picks }
}

function Heading({ count, of, children }: { count?: number; of?: number; children: React.ReactNode }) {
  return (
    <h3 className="flex items-baseline gap-2 text-[11px] font-semibold uppercase tracking-[0.07em] text-ink-3">
      {children}
      {count !== undefined && <span className="mono font-normal normal-case tracking-normal">{count} of {of} shown</span>}
    </h3>
  )
}

function Parts({ parts, hidden, onToggle }: { parts: BoardPart[]; hidden: Set<string>; onToggle: (key: string) => void }) {
  return (
    <ul className="mt-2 space-y-1.5">
      {parts.map((p) => (
        <li key={p.key} data-part={p.key}>
          <Row checked={!hidden.has(p.key)} onChange={() => onToggle(p.key)} label={p.label} what={p.what} />
        </li>
      ))}
    </ul>
  )
}

function Row({ checked, onChange, label, value, measured = true, what }: {
  checked: boolean; onChange: () => void; label: string; value?: string; measured?: boolean; what: string
}) {
  return (
    <label className="flex cursor-pointer items-start gap-2.5 rounded-lg border border-line bg-surface-2/40 px-3 py-2 hover:bg-surface-2">
      <input type="checkbox" checked={checked} onChange={onChange}
        className="mt-0.5 size-3.5 shrink-0 accent-[var(--accent-ink)]" />
      <span className="min-w-0 flex-1">
        <span className="flex flex-wrap items-baseline gap-x-2">
          <span className="text-[13px] font-semibold">{label}</span>
          {value !== undefined && <span className={`num text-[12px] ${measured ? 'text-ink-2' : 'text-ink-4'}`}>{value}</span>}
        </span>
        <span className="mt-0.5 block text-[11.5px] leading-relaxed text-ink-3">{what}</span>
      </span>
    </label>
  )
}

