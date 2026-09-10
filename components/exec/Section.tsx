'use client'
import { useEffect, useState } from 'react'
import { Card, TONE_BAR } from '@/components/ui/bits'
import { Num, type NumFormat } from '@/components/ui/Num'
import type { Derived } from '@/lib/domain/types'
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
  illustrative: 'border-line bg-surface-3 text-ink-2',
}

export function ProvenanceChip({ p, title }: { p: Provenance; title?: string }) {
  return (
    <span title={title ?? PROVENANCE_TITLE[p]}
      className={`mono inline-flex shrink-0 cursor-help items-center rounded-full border px-2 py-0.5 text-[9px] uppercase tracking-wide ${PROV_STYLE[p]}`}>
      {PROVENANCE_LABEL[p]}
    </span>
  )
}

const PROVENANCE_TITLE: Record<Provenance, string> = {
  derived: 'Computed from this build’s own data — the sourcing, inbound and inventory modules. Click the figure to see the arithmetic.',
  part: 'A measured base figure multiplied by a stated assumption. The assumption is named on the tile and listed in full at the foot of the page.',
  illustrative: 'Nothing in this build measures this. The figure is made up; the tile says what would have to be captured to make it real.',
}

/**
 * The five headline figures, as a strip rather than five cards.
 *
 * They were KpiTiles — a display-size number, a two-line caption and a lot of
 * air each, taking a fifth of the first screen to say five things. The figure
 * is what an owner comes for; the caption is a footnote, so it gets footnote
 * size and one line, and the whole strip now costs about what one of the old
 * tiles did.
 */
export function HeadlineStrip({ cells }: {
  cells: { label: string; d: Derived<unknown>; format?: NumFormat; tone: Tone; caption: string }[]
}) {
  // five cells in a 2- or 3-column grid leaves an orphan slot for 640px of
  // width; let the fifth span the row until there is room for all five
  const cols = cells.length === 5
    ? 'sm:grid-cols-2 sm:[&>:nth-child(5)]:col-span-2 lg:grid-cols-5 lg:[&>:nth-child(5)]:col-span-1'
    : 'sm:grid-cols-2 lg:grid-cols-4'
  return (
    <div className={`mb-3 grid gap-2 ${cols}`}>
      {cells.map((c, i) => (
        <div key={c.label} style={{ '--i': i, '--tile-c': `var(--tile-${(i % 6) + 1})` } as React.CSSProperties}
             className="anim-fade-up lift glass-tile flex items-stretch gap-2.5 rounded-lg border py-2 pr-2.5 shadow-sm">
          <span aria-hidden className={`w-[3px] shrink-0 rounded-r ${TONE_BAR[c.tone]}`} />
          <div className="min-w-0 flex-1">
            <span className="mono block truncate text-[9.5px] uppercase tracking-wider text-ink-2">{c.label}</span>
            <Num d={c.d} format={c.format} size="lg" tone={c.tone === 'neutral' ? undefined : c.tone} />
            <span className="block truncate text-[10.5px] leading-tight text-ink-2" title={c.caption}>{c.caption}</span>
          </div>
        </div>
      ))}
    </div>
  )
}

/**
 * The tile is the headline, the target and the picture — nothing else. The
 * explanation and the data-capture note are real content, but they are read
 * once and then never again, and leaving them open cost the page four lines of
 * prose per tile and left every short chart floating in white space.
 *
 * So they live behind a toggle, per tile, with a page-level switch that opens
 * or closes all of them at once.
 */
function ExecTile({ k, index, chart, notes }: {
  k: Kpi; index: number; chart?: React.ReactNode; notes: boolean
}) {
  const [open, setOpen] = useState(notes)
  useEffect(() => setOpen(notes), [notes])
  const tone: Tone | undefined =
    k.provenance === 'illustrative' ? undefined
      : k.meetsTarget === true ? 'good'
      : k.meetsTarget === false ? 'critical'
      : undefined
  return (
    <div style={{ '--i': index, '--tile-c': `var(--tile-${(index % 6) + 1})` } as React.CSSProperties}
         className={`anim-fade-up lift glass-tile flex flex-col rounded-lg border p-3.5 shadow-sm ${
           k.provenance === 'illustrative' ? 'border-dashed !border-ink-3' : ''}`}>
      <h3 className="text-[17px] font-bold leading-tight tracking-tight">{k.label}</h3>

      <p className="mt-1.5 flex flex-wrap items-baseline gap-x-2">
        <Num d={k.d} format={k.format} dp={k.dp} suffix={k.suffix} size="lg" tone={tone} />
        {k.target && (
          <span className={`text-[10.5px] ${
            k.meetsTarget === true ? 'text-good' : k.meetsTarget === false ? 'text-critical' : 'text-ink-3'}`}>
            {k.meetsTarget === true ? '✓ ' : k.meetsTarget === false ? '✗ ' : ''}target {k.target}
          </span>
        )}
      </p>

      <p className="mt-0.5 text-[11px] leading-snug text-ink-2">{k.caption}</p>

      {chart && <div className="mt-2.5">{chart}</div>}

      {/* the foot of the tile: the note toggle on the left, the provenance
          chip as a pill on the right — where the reference puts its badge */}
      <div className="mt-auto flex items-center gap-2 border-t border-line-soft pt-1.5">
        <button type="button" onClick={() => setOpen((v) => !v)} aria-expanded={open}
          className="flex min-w-0 flex-1 items-center gap-1 text-left text-[10.5px] text-ink-2 transition-colors hover:text-accent">
          <span aria-hidden className={`inline-block transition-transform ${open ? 'rotate-90' : ''}`}>›</span>
          {open ? 'Hide the note' : 'What this means'}
        </button>
        <ProvenanceChip p={k.provenance} />
      </div>
      {open && (
        <div className="anim-fade-up">
          <p className="mt-1 text-[11px] leading-relaxed text-ink-2">{k.meaning}</p>
          {k.needs && (
            <p className="mt-1 text-[10.5px] leading-relaxed text-warn">
              <span className="font-medium">Needs:</span> {k.needs}
            </p>
          )}
        </div>
      )}
    </div>
  )
}

export function ExecSection({ no, title, blurb, kpis, charts, notes, index = 0, children }: {
  no: number; title: string; blurb: string; kpis: Kpi[]; index?: number
  /** one chart per KPI id — a KPI with no entry keeps its bare headline figure */
  charts?: Record<string, React.ReactNode>
  /** the page-level switch: open every tile's note, and the section footer */
  notes: boolean
  children?: React.ReactNode
}) {
  const counts = kpis.reduce<Record<string, number>>((a, k) => {
    a[k.provenance] = (a[k.provenance] ?? 0) + 1
    return a
  }, {})
  return (
    <Card flat index={index} title={`${no}. ${title}`} sub={blurb}
      actions={<div className="flex flex-wrap items-center gap-1.5">
        {(['derived', 'part', 'illustrative'] as Provenance[]).map((p) =>
          counts[p] ? (
            <span key={p} className="flex items-center gap-1">
              <span className="mono text-[10px] text-ink-3">{counts[p]}</span>
              <ProvenanceChip p={p} />
            </span>
          ) : null)}
      </div>}>
      <div className="grid gap-3 p-3 md:grid-cols-2 xl:grid-cols-4">
        {kpis.map((k, i) => (
          <ExecTile key={k.id} k={k} index={i} chart={charts?.[k.id]} notes={notes} />
        ))}
      </div>
      {notes && children}
    </Card>
  )
}

/** The full list of assumptions, so a client can argue with every one of them. */
export function AssumptionLedger({ assumptions }: {
  assumptions: { id: string; label: string; value: number; unit: string; basis: string }[]
}) {
  const [open, setOpen] = useState(false)
  return (
    <Card index={9} className="mt-3" title="Every assumption on this page"
      sub={`The ${assumptions.length} figures the build does not measure, what was assumed, and why`}
      actions={
        <button type="button" onClick={() => setOpen((v) => !v)} aria-expanded={open}
          className="rounded border border-line px-2 py-0.5 text-[11px] font-medium text-ink-2 transition-colors hover:bg-surface-2">
          {open ? 'Hide the list' : 'Show the list'}
        </button>}>
      {open ? (
        <>
          <ul className="divide-y divide-line-soft">
            {assumptions.map((a) => (
              <li key={a.id} className="flex flex-wrap gap-x-4 gap-y-1 px-4 py-2">
                <span className="w-52 shrink-0">
                  <span className="block text-[12px] font-medium">{a.label}</span>
                  <span className="num block text-[12px] text-accent">
                    {a.value.toLocaleString('en-IN')} <span className="text-[10.5px] text-ink-3">{a.unit}</span>
                  </span>
                </span>
                <span className="min-w-0 flex-1 text-[11.5px] leading-relaxed text-ink-2">{a.basis}</span>
              </li>
            ))}
          </ul>
          <p className="border-t border-line-soft px-4 py-2.5 text-[11px] leading-relaxed text-ink-3">
            Ten assumptions carry four of the sixteen figures on this page outright and colour three more.
            Every one of them is a line in the data-capture plan: the “what this means” note on each tile
            says what would have to start being recorded for the number to become measured. Nothing here
            is hidden inside a formula.
          </p>
        </>
      ) : (
        <p className="px-4 py-2.5 text-[11.5px] leading-relaxed text-ink-3">
          Ten assumptions carry four of the sixteen figures outright and colour three more — the holding
          rate, the collection period, the admin cost per order, the outbound freight and the
          finished-goods leg among them. Open the list to argue with every one.
        </p>
      )}
    </Card>
  )
}
