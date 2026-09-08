'use client'
import { Card, Pill } from '@/components/ui/bits'
import { Num } from '@/components/ui/Num'
import type { Kpi, Provenance } from '@/lib/domain/exec'
import { PROVENANCE_LABEL } from '@/lib/domain/exec'
import type { Tone } from '@/lib/domain/format'

/**
 * The provenance chip. It is the reason this dashboard is worth trusting: a
 * screen with sixteen figures where some are measured and some are assumed, and
 * nothing tells them apart, is worse than eight measured ones — an owner who
 * finds out one number was invented stops believing all sixteen.
 *
 * Never colour alone (§10): each chip carries its word.
 */
const PROV_STYLE: Record<Provenance, string> = {
  derived: 'border-good/30 bg-good-soft text-good',
  part: 'border-warn/30 bg-warn-soft text-warn',
  illustrative: 'border-line bg-surface-3 text-ink-3',
}

export function ProvenanceChip({ p, title }: { p: Provenance; title?: string }) {
  return (
    <span title={title ?? PROVENANCE_TITLE[p]}
      className={`mono inline-flex shrink-0 cursor-help items-center rounded border px-1.5 py-px text-[9.5px] uppercase tracking-wide ${PROV_STYLE[p]}`}>
      {PROVENANCE_LABEL[p]}
    </span>
  )
}

const PROVENANCE_TITLE: Record<Provenance, string> = {
  derived: 'Computed from this build’s own data — the sourcing, inbound and inventory modules. Click the figure to see the arithmetic.',
  part: 'A measured base figure multiplied by a stated assumption. The assumption is named on the tile and listed in full at the foot of the page.',
  illustrative: 'Nothing in this build measures this. The figure is made up; the tile says what would have to be captured to make it real.',
}

function ExecTile({ k, index, chart }: { k: Kpi; index: number; chart?: React.ReactNode }) {
  const tone: Tone | undefined =
    k.provenance === 'illustrative' ? undefined
      : k.meetsTarget === true ? 'good'
      : k.meetsTarget === false ? 'critical'
      : undefined
  return (
    <div style={{ '--i': index } as React.CSSProperties}
         className={`anim-fade-up lift flex flex-col rounded-lg border bg-surface p-3.5 ${
           k.provenance === 'illustrative' ? 'border-dashed border-line' : 'border-line'}`}>
      <div className="flex items-start gap-2">
        <h3 className="text-[13px] font-medium leading-snug">{k.label}</h3>
        <span className="ml-auto"><ProvenanceChip p={k.provenance} /></span>
      </div>

      <p className="mt-2 flex flex-wrap items-baseline gap-x-2">
        <Num d={k.d} format={k.format} dp={k.dp} suffix={k.suffix} size="lg" tone={tone} />
        {k.target && (
          <span className={`text-[11px] ${
            k.meetsTarget === true ? 'text-good' : k.meetsTarget === false ? 'text-critical' : 'text-ink-3'}`}>
            {k.meetsTarget === true ? '✓ ' : k.meetsTarget === false ? '✗ ' : ''}target {k.target}
          </span>
        )}
      </p>

      <p className="mt-1 text-[11.5px] leading-snug text-ink-3">{k.caption}</p>

      {chart && <div className="mt-3 mb-3">{chart}</div>}

      {/* mt-auto keeps the explanation on the tile's floor, so a row of tiles
          with charts of different heights still lines its footers up */}
      <p className="mt-auto border-t border-line-soft pt-2.5 text-[11.5px] leading-relaxed text-ink-2">{k.meaning}</p>
      {k.needs && (
        <p className="mt-1.5 text-[11px] leading-relaxed text-warn">
          <span className="font-medium">Needs:</span> {k.needs}
        </p>
      )}
    </div>
  )
}

export function ExecSection({ no, title, blurb, kpis, charts, index = 0, children }: {
  no: number; title: string; blurb: string; kpis: Kpi[]; index?: number
  /** one chart per KPI id — a KPI with no entry keeps its bare headline figure */
  charts?: Record<string, React.ReactNode>
  children?: React.ReactNode
}) {
  const counts = kpis.reduce<Record<string, number>>((a, k) => {
    a[k.provenance] = (a[k.provenance] ?? 0) + 1
    return a
  }, {})
  return (
    <Card index={index} title={`${no}. ${title}`} sub={blurb}
      actions={<div className="flex flex-wrap items-center gap-1.5">
        {(['derived', 'part', 'illustrative'] as Provenance[]).map((p) =>
          counts[p] ? (
            <span key={p} className="flex items-center gap-1">
              <span className="mono text-[10px] text-ink-3">{counts[p]}</span>
              <ProvenanceChip p={p} />
            </span>
          ) : null)}
      </div>}>
      <div className="grid gap-3 p-4 md:grid-cols-2 xl:grid-cols-4">
        {kpis.map((k, i) => <ExecTile key={k.id} k={k} index={i} chart={charts?.[k.id]} />)}
      </div>
      {children}
    </Card>
  )
}

/** The full list of assumptions, so a client can argue with every one of them. */
export function AssumptionLedger({ assumptions }: {
  assumptions: { id: string; label: string; value: number; unit: string; basis: string }[]
}) {
  return (
    <Card index={9} className="mt-3" title="Every assumption on this page"
      sub="The figures the build does not measure, what was assumed, and why — in one place, so they can be argued with">
      <ul className="divide-y divide-line-soft">
        {assumptions.map((a) => (
          <li key={a.id} className="flex flex-wrap gap-x-4 gap-y-1 px-4 py-2.5">
            <span className="w-52 shrink-0">
              <span className="block text-[12.5px] font-medium">{a.label}</span>
              <span className="num block text-[12.5px] text-accent">
                {a.value.toLocaleString('en-IN')} <span className="text-[11px] text-ink-3">{a.unit}</span>
              </span>
            </span>
            <span className="min-w-0 flex-1 text-[12px] leading-relaxed text-ink-2">{a.basis}</span>
          </li>
        ))}
      </ul>
      <p className="border-t border-line-soft px-4 py-3 text-[11.5px] leading-relaxed text-ink-3">
        Ten assumptions carry four of the sixteen figures on this page outright and colour three more.
        Every one of them is a line in the data-capture plan: the “needs” note on each tile says what
        would have to start being recorded for the number to become measured. Nothing here is hidden
        inside a formula.
      </p>
    </Card>
  )
}
