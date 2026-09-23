'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { ListPage } from '@/components/ui/ListPage'
import { DataTable, StatePill, Tag } from '@/components/ui/DataTable'
import { Icon } from '@/components/ui/icons'
import { Tabs } from '@/components/ui/Tabs'
import { DeskTools } from '@/components/sheet/DeskTools'
import { buildColumns, type DrawnColumn } from '@/components/sheet/columns'
import { ConfirmDelete } from '@/components/sourcing/ConfirmDelete'
import { useWorkspace } from '@/components/workspace/store'
import { money, num, shortDate } from '@/lib/domain/format'
import {
  cutNotedKey, cutRows, offcutRows, remnantEffects, remnantNotedKey, removeCut, removeCutProblem,
  type CutRow, type OffcutRow, type RemnantEffect,
} from '@/lib/workspace/cutting'
import { CutForm, ScrapRemnantDialog, UseRemnantDialog } from './CuttingDialogs'
import { MoveRackDialog, TrailDialog } from './LedgerDialogs'

type View = 'offcuts' | 'cuts'

/** One list, two kinds of row, so the search and the material filter narrow both tabs at once. */
type Row = { kind: 'offcut'; o: OffcutRow } | { kind: 'cut'; c: CutRow }

const itemOf = (r: Row) => (r.kind === 'offcut' ? r.o.lot.itemId : r.c.cut.itemId)
const nameOf = (r: Row) => (r.kind === 'offcut' ? r.o.item?.name : r.c.item?.name) ?? 'Unknown material'

function Count({ n }: { n: number }) {
  return n > 0 ? <span className="mono rounded-full bg-surface-3 px-1.5 text-[10.5px] leading-[17px] text-ink-3">{n}</span> : null
}

/**
 * The cutting table and what it leaves behind.
 *
 * Only in a store that cuts. The register is every remnant on the book —
 * made by a cut, or returned short from a job — with its rack, its pieces and
 * how long it has sat; each can go into a job or be scrapped by decision.
 * The cuts are every lay recorded, balanced before it was saved, with its
 * yield against the plan. And when an order is about to be drafted for a
 * material whose remnants could have covered part of it, that is said.
 */
export function Cutting() {
  const { workspace, update, today } = useWorkspace()
  const [view, setView] = useState<View>('offcuts')
  const [cutting, setCutting] = useState(false)
  const [using, setUsing] = useState<string | null>(null)
  const [scrapping, setScrapping] = useState<string | null>(null)
  const [moving, setMoving] = useState<string | null>(null)
  const [trailOf, setTrailOf] = useState<string | null>(null)
  const [deleting, setDeleting] = useState<CutRow | null>(null)

  useEffect(() => {
    // a card about a cut links here with ?view=cuts
    const v = new URLSearchParams(window.location.search).get('view')
    if (v === 'cuts') setView('cuts')
  }, [])

  if (!workspace) return null
  const ws = workspace
  const offcuts = [...offcutRows(ws, today)]
    .sort((a, b) => (a.item?.name ?? '').localeCompare(b.item?.name ?? '') || (a.lot.on ?? '').localeCompare(b.lot.on ?? ''))
  const cuts = cutRows(ws)
  const effects = remnantEffects(ws, today)
  const rows: Row[] = [
    ...offcuts.map((o) => ({ kind: 'offcut' as const, o })),
    ...cuts.map((c) => ({ kind: 'cut' as const, c })),
  ]

  /* ------------------------------------------------------------ offcuts -- */
  const offDrawn: Record<string, DrawnColumn<OffcutRow>> = {
    item: { cell: (r) => <span className="font-semibold text-ink">{r.item?.name ?? 'Unknown material'}</span>, text: (r) => r.item?.name ?? '' },
    lot: {
      cell: (r) => (
        <span className="min-w-0">
          <span className="mono block text-[12px] text-ink-2">{r.lot.batchNo}</span>
          {r.lot.spec && !r.lot.batchNo.includes(r.lot.spec) && <span className="block text-[11.5px] text-ink-3">{r.lot.spec}</span>}
        </span>
      ),
      text: (r) => r.lot.batchNo,
    },
    rack: {
      cell: (r) => (r.rack ? <span className="font-medium text-ink">{r.rack.name}</span>
        : (ws.racks ?? []).length > 0 ? <StatePill label="On no rack" tone="warn" /> : <span className="text-ink-4">—</span>),
      text: (r) => r.rack?.name ?? '',
    },
    pieces: {
      align: 'right',
      cell: (r) => (r.pieces !== undefined
        ? <span>{r.pieces}{r.lot.size ? <span className="block text-[11px] text-ink-3">of {num(r.lot.size, 3)} {r.uom}</span> : null}</span>
        : <span className="text-ink-4">—</span>),
      text: (r) => (r.pieces !== undefined ? String(r.pieces) : ''),
    },
    qty: { align: 'right', cell: (r) => <>{num(r.lot.qty, 3)} <span className="text-ink-3">{r.uom}</span></>, text: (r) => String(r.lot.qty) },
    age: {
      cell: (r) => (r.aged
        ? <StatePill label={`${r.age.value} days · aged`} tone="warn" title={`Past the ${ws.policy.remnantAgeDays} days in your store rules`} />
        : <span className="text-ink-2">{r.age.value} day{r.age.value === 1 ? '' : 's'}</span>),
      text: (r) => String(r.age.value),
    },
    value: {
      align: 'right',
      cell: (r) => (r.value > 0 ? money(r.value) : <span className="text-ink-4" title="No purchase price on record">—</span>),
      text: (r) => String(r.value),
    },
    from: {
      cell: (r) => (r.from || r.job
        ? <span className="inline-flex flex-wrap gap-1">{r.from && <Tag>{r.from}</Tag>}{r.job && <Tag>{r.job}</Tag>}</span>
        : <span className="text-ink-4">—</span>),
      text: (r) => [r.from, r.job].filter(Boolean).join(' '),
    },
  }
  const offKit = buildColumns<OffcutRow>(ws, 'offcut', (r) => r.lot.id, offDrawn)

  /* --------------------------------------------------------------- cuts -- */
  const cutDrawn: Record<string, DrawnColumn<CutRow>> = {
    no: { cell: (r) => <span className="mono font-semibold text-ink">{r.cut.cutNo}</span>, text: (r) => r.cut.cutNo },
    on: { cell: (r) => shortDate(r.cut.on), text: (r) => r.cut.on },
    job: { cell: (r) => <span className="mono text-[12px]">{r.job?.no ?? 'floor'}</span>, text: (r) => r.job?.no ?? 'floor' },
    item: { cell: (r) => <span className="font-medium text-ink">{r.item?.name ?? 'Unknown material'}</span>, text: (r) => r.item?.name ?? '' },
    lot: { cell: (r) => <span className="mono text-[12px] text-ink-2">{r.batch}</span>, text: (r) => r.batch },
    input: { align: 'right', cell: (r) => `${num(r.cut.inputQty, 3)} ${r.item?.uom ?? ''}`, text: (r) => String(r.cut.inputQty) },
    parts: {
      align: 'right',
      cell: (r) => (
        <span>
          {num(r.cut.partsQty, 3)} {r.item?.uom ?? ''}
          <span className="block text-[11px] text-ink-3">{r.cut.partsCount} part{r.cut.partsCount === 1 ? '' : 's'}</span>
        </span>
      ),
      text: (r) => `${r.cut.partsQty} (${r.cut.partsCount})`,
    },
    kerf: { align: 'right', cell: (r) => (r.cut.kerfQty > 0 ? num(r.cut.kerfQty, 3) : <span className="text-ink-4">—</span>), text: (r) => String(r.cut.kerfQty) },
    remnants: {
      cell: (r) => (r.usable + r.scrap === 0 ? <span className="text-ink-4">none</span> : (
        <span className="block text-[12.5px] leading-snug">
          {r.usable > 0 && <span className="block text-ink">{num(r.usable, 3)} kept</span>}
          {r.scrap > 0 && <span className="block text-warn">{num(r.scrap, 3)} scrap</span>}
        </span>
      )),
      text: (r) => `${r.usable} kept; ${r.scrap} scrap`,
    },
    yield: {
      cell: (r) => (
        <span className="inline-flex flex-wrap items-center gap-1.5">
          <span className="num font-semibold text-ink">{num(r.yielded.value, 1)}%</span>
          <span className="text-[11.5px] text-ink-3">plan {num(r.planned.value, 1)}%</span>
          {r.belowPlan && <StatePill label={`${num(r.shortfall.value, 1)} pts below${r.noted ? ' · noted' : ''}`} tone={r.noted ? 'neutral' : 'critical'} />}
        </span>
      ),
      text: (r) => `${r.yielded.value} / ${r.planned.value}`,
    },
    operator: { cell: (r) => r.cut.operator || <span className="text-ink-4">—</span>, text: (r) => r.cut.operator },
  }
  const cutKit = buildColumns<CutRow>(ws, 'cut', (r) => r.cut.id, cutDrawn)

  const materials = [...new Set(rows.map(itemOf))]

  return (
    <>
      <ListPage
        title="Cutting & offcuts" noun={view === 'offcuts' ? 'remnant' : 'cut'} rows={rows}
        countOf={(xs) => xs.filter((r) => (view === 'offcuts' ? r.kind === 'offcut' : r.kind === 'cut')).length}
        search={(r) => (r.kind === 'offcut'
          ? `${nameOf(r)} ${r.o.lot.batchNo} ${r.o.rack?.name ?? ''} ${r.o.from ?? ''} ${r.o.job ?? ''} ${offKit.searchText(r.o)}`
          : `${nameOf(r)} ${r.c.cut.cutNo} ${r.c.batch} ${r.c.job?.no ?? ''} ${r.c.cut.operator} ${cutKit.searchText(r.c)}`)}
        filter={materials.length > 1 ? {
          label: 'Every material',
          options: materials.map((id) => ({ value: id, label: ws.items.find((i) => i.id === id)?.name ?? id })),
          of: itemOf,
        } : undefined}
        action={{ label: 'Record a cut', icon: 'scissors', onClick: () => setCutting(true) }}
        tools={
          <DeskTools entity={view === 'offcuts' ? 'offcut' : 'cut'} noun={view === 'offcuts' ? 'remnant' : 'cut'}
            title={view === 'offcuts' ? 'Offcut register' : 'Cut records'}
            rows={() => (view === 'offcuts' ? offKit.toRows(offcuts) : cutKit.toRows(cuts))} />
        }
        empty={{
          line: 'Nothing cut yet. Record a cut and what it leaves over goes onto a rack as a remnant — anything under the smallest usable piece is scrap at the cut. A short piece returned from a job as a remnant shows here too.',
          cta: 'Record a cut',
        }}>
        {(shown) => {
          const shownOff = shown.flatMap((r) => (r.kind === 'offcut' ? [r.o] : []))
          const shownCuts = shown.flatMap((r) => (r.kind === 'cut' ? [r.c] : []))
          const worth = shownOff.reduce((a, r) => a + r.value, 0)
          const aged = shownOff.filter((r) => r.aged)
          return (
            <div className="space-y-3">
              <p className="text-[12.5px] text-ink-3">
                {worth > 0 || shownOff.length === 0
                  ? <><span className="num font-semibold text-ink">{money(worth)}</span> in remnants on the racks</>
                  : <><span className="num font-semibold text-ink">{shownOff.length}</span> remnant{shownOff.length === 1 ? '' : 's'} on the racks, not valued yet — no purchase price on record</>}
                {aged.length > 0 && <> · <span className="text-warn">{aged.length} past {ws.policy.remnantAgeDays} days</span></>}
                {' · '}on the book, never counted as cover
              </p>

              {effects.length > 0 && (
                <BuyingTwice effects={effects}
                  onKeep={(e) => update((w) => ({ ...w, drafts: { ...w.drafts, [remnantNotedKey(e.order.no, e.item.id)]: true } }))} />
              )}

              <Tabs<View> label="Remnants or cuts" value={view} onChange={setView}
                items={[
                  { id: 'offcuts', label: 'Offcuts', badge: <Count n={aged.length} /> },
                  { id: 'cuts', label: 'Cuts', badge: <Count n={shownCuts.filter((r) => r.belowPlan && !r.noted).length} /> },
                ]} />

              {view === 'offcuts' && (shownOff.length === 0
                ? <p className="rounded-xl border border-line bg-surface px-6 py-10 text-center text-[13px] text-ink-2">
                  No remnants on the racks. A cut that leaves usable pieces puts them here, each with its rack, its pieces and its age.
                </p>
                : <DataTable columns={offKit.columns} rows={shownOff} keyOf={(r) => r.lot.id}
                  extra={{ icon: 'arrow-right', label: (r) => `Use ${r.lot.batchNo} in a job`, onClick: (r) => setUsing(r.lot.id) }}
                  extra2={{ icon: 'trash', label: (r) => `Scrap ${r.lot.batchNo}`, onClick: (r) => setScrapping(r.lot.id) }}
                  onEdit={(r) => setMoving(r.lot.id)}
                  editLabel={(r) => `Move ${r.lot.batchNo} to another rack`} />)}

              {view === 'cuts' && (shownCuts.length === 0
                ? <p className="rounded-xl border border-line bg-surface px-6 py-10 text-center text-[13px] text-ink-2">
                  No cuts recorded. Each cut is checked before it saves: what went on the table is the parts, the kerf and the remnants.
                </p>
                : <DataTable columns={cutKit.columns} rows={shownCuts} keyOf={(r) => r.cut.id}
                  extra={{
                    icon: 'check',
                    label: (r) => (r.belowPlan && !r.noted ? `Noted — ${r.cut.cutNo} below plan` : `Trail of the lot ${r.cut.cutNo} came off`),
                    onClick: (r) => {
                      if (r.belowPlan && !r.noted) update((w) => ({ ...w, drafts: { ...w.drafts, [cutNotedKey(r.cut.id)]: true } }))
                      else setTrailOf(r.cut.lotId)
                    },
                  }}
                  onDelete={(r) => setDeleting(r)}
                  deleteLabel={(r) => `Take back ${r.cut.cutNo}`} />)}
            </div>
          )
        }}
      </ListPage>

      <CutForm open={cutting} onClose={() => setCutting(false)} />
      <UseRemnantDialog lotId={using} onClose={() => setUsing(null)} />
      <ScrapRemnantDialog lotId={scrapping} onClose={() => setScrapping(null)} />
      <MoveRackDialog lotId={moving} onClose={() => setMoving(null)} />
      <TrailDialog lotId={trailOf} onClose={() => setTrailOf(null)} />
      <ConfirmDelete
        open={deleting !== null}
        what={deleting?.cut.cutNo ?? ''}
        impact={{
          clean: false,
          losses: deleting ? [
            `${num(deleting.cut.inputQty, 3)} ${deleting.item?.uom ?? ''} goes back onto ${deleting.batch}`,
            ...(deleting.usable > 0 ? [`its remnants come off the racks`] : []),
            ...(deleting.cut.kerfQty > 0 || deleting.scrap > 0 ? ['its kerf and scrap come off the loss ledger'] : []),
          ] : [],
        }}
        blocked={deleting ? removeCutProblem(ws, deleting.cut.id) : null}
        onClose={() => setDeleting(null)}
        onConfirm={() => { if (deleting) update((w) => removeCut(w, deleting.cut.id)) }}
      />
    </>
  )
}

/**
 * Draft orders for a material with remnants on the racks — what the remnants
 * would do to the order, with the smallest order applied again. Very often
 * the answer is nothing, and that is said rather than a saving that is not real.
 */
function BuyingTwice({ effects, onKeep }: { effects: RemnantEffect[]; onKeep: (e: RemnantEffect) => void }) {
  const open = effects.filter((e) => !e.noted)
  if (open.length === 0) return null
  return (
    <section className="rounded-xl border border-warn/30 bg-warn-soft px-4 py-3">
      <h2 className="flex items-center gap-2 text-[13px] font-semibold text-ink">
        <Icon name="cart" className="size-4 text-warn" /> Buying it twice
      </h2>
      <ul className="mt-2 space-y-2">
        {open.map((e) => (
          <li key={`${e.order.no}:${e.item.id}`} className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-[12.5px] text-ink-2">
            <span className="min-w-0 flex-1">
              Draft <strong className="mono text-ink">{e.order.no}</strong> buys {num(e.order.qty, 3)} {e.item.uom} of{' '}
              <strong className="text-ink">{e.item.name}</strong>; {num(e.remnant, 3)} {e.item.uom} of remnants are on the racks.{' '}
              {e.moves
                ? <>Netted off the need, it could be <strong className="text-ink">{num(e.effect.revisedQty.value, 3)} {e.item.uom}</strong> rather than {num(e.without.revisedQty.value, 3)} — use them first.</>
                : e.effect.revisedQty.value === e.without.revisedQty.value && e.without.revisedQty.value > 0
                  ? <>The smallest order swallows them — the order stays as it is; use them first and the next one comes later.</>
                  : <>Even without them the need is below this order, so they do not change it.</>}
            </span>
            <span className="flex shrink-0 gap-1.5">
              <Link href="/sourcing/orders"
                className="press rounded-lg border border-line bg-surface px-2.5 py-1.5 text-[12.5px] font-medium hover:bg-surface-2">
                Open the order
              </Link>
              <button type="button" onClick={() => onKeep(e)}
                className="press rounded-lg px-2.5 py-1.5 text-[12.5px] text-ink-2 hover:text-ink">
                Keep it
              </button>
            </span>
          </li>
        ))}
      </ul>
    </section>
  )
}
