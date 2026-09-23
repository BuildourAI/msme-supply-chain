'use client'
import { useEffect, useState } from 'react'
import { ListPage } from '@/components/ui/ListPage'
import { DataTable, StatePill, Tag } from '@/components/ui/DataTable'
import { Dialog } from '@/components/ui/Dialog'
import { Icon } from '@/components/ui/icons'
import { Tabs } from '@/components/ui/Tabs'
import { DeskTools } from '@/components/sheet/DeskTools'
import { buildColumns, type DrawnColumn } from '@/components/sheet/columns'
import { useWorkspace } from '@/components/workspace/store'
import { MOVEMENT_LABEL } from '@/lib/domain/inventory'
import { money, num, shortDate } from '@/lib/domain/format'
import { countRows, varianceNotedKey, type CountRow } from '@/lib/workspace/counting'
import { STATE_WORD, lotRows, type LotRow } from '@/lib/workspace/ledger'
import { rackRows } from '@/lib/workspace/racks'
import type { StockMove } from '@/lib/workspace/types'
import {
  AddLotDialog, CountDialog, CountSheetDialog, LotStateDialog, MoveRackDialog, TrailDialog,
} from './LedgerDialogs'

type View = 'lots' | 'counts' | 'moves'

/** What the page was opened for, from a dashboard card: one rack, one material, or lots on none. */
interface Focus { rack?: string; item?: string }

interface MoveRow { move: StockMove; item?: string; batch: string; uom: string }

function Count({ n }: { n: number }) {
  return n > 0 ? <span className="mono rounded-full bg-surface-3 px-1.5 text-[10.5px] leading-[17px] text-ink-3">{n}</span> : null
}

/**
 * The store's book: every lot, what the book says of it, and what was last
 * counted on the rack.
 *
 * The two numbers side by side are the point. The book is what the documents
 * add up to; the count is what somebody saw. A lot counted recently and
 * matching is one to believe, one not counted since its class's cadence is
 * not wrong but unverified, and the screen says which is which rather than
 * showing one confident number for both.
 *
 * One book read three ways: the lots as they stand, every count taken, and
 * every movement written. The search and the rack filter narrow all three.
 */
export function Ledger() {
  const { workspace, update, today } = useWorkspace()
  const [view, setView] = useState<View>('lots')
  const [trailOf, setTrailOf] = useState<string | null>(null)
  const [moving, setMoving] = useState<string | null>(null)
  const [counting, setCounting] = useState<string | null>(null)
  const [acting, setActing] = useState<LotRow | null>(null)
  const [stating, setStating] = useState<{ lotId: string; mode: 'hold' | 'release' | 'write-off' } | null>(null)
  const [walking, setWalking] = useState<{ rackId?: string; itemId?: string } | null>(null)
  const [picking, setPicking] = useState(false)
  const [adding, setAdding] = useState(false)
  const [focus, setFocus] = useState<Focus>({})

  useEffect(() => {
    // read once, on the way in — a card links here with ?rack= or ?item=
    const q = new URLSearchParams(window.location.search)
    setFocus({ rack: q.get('rack') ?? undefined, item: q.get('item') ?? undefined })
    const v = q.get('view')
    if (v === 'counts' || v === 'moves') setView(v)
  }, [])

  if (!workspace) return null
  const ws = workspace
  const all = lotRows(ws, today)
  const rows = all.filter((r) => (focus.rack === 'none' ? !r.lot.rack && !r.correction
    : focus.rack ? r.lot.rack === focus.rack : true)
    && (!focus.item || r.lot.itemId === focus.item))
  const focusName = focus.rack === 'none' ? 'lots on no rack'
    : focus.rack ? (ws.racks ?? []).find((r) => r.id === focus.rack)?.name
      : focus.item ? ws.items.find((i) => i.id === focus.item)?.name : undefined

  const hasRacks = (ws.racks ?? []).length > 0
  const due = all.filter((r) => r.due)

  /* ------------------------------------------------------------- lots -- */
  const drawn: Record<string, DrawnColumn<LotRow>> = {
    item: {
      cell: (r) => (
        <span className="min-w-0">
          <span className="block font-semibold text-ink">{r.item?.name ?? 'Unknown material'}</span>
          <span className="mono block text-[11px] text-ink-3">{r.item?.code}</span>
        </span>
      ),
      text: (r) => r.item?.name ?? '',
    },
    batch: {
      cell: (r) => (
        <span className="inline-flex flex-wrap items-center gap-1.5">
          <span className="mono text-[12px] text-ink-2">{r.lot.batchNo}</span>
          {r.lot.remnant && <Tag title="A remnant — on the book, never counted as cover">remnant{r.lot.pieces ? ` · ${r.lot.pieces} pc` : ''}</Tag>}
          {r.correction && <Tag title="A correction written before the ledger kept lot-by-lot lines. It keeps the material's total right; nobody can walk to it.">correction</Tag>}
        </span>
      ),
      text: (r) => r.lot.batchNo,
    },
    rack: {
      cell: (r) => (r.rack ? <span className="font-medium text-ink">{r.rack.name}</span>
        : r.correction ? <span className="text-ink-4">—</span>
          : hasRacks ? <StatePill label="On no rack" tone="warn" /> : <span className="text-ink-4">—</span>),
      text: (r) => r.rack?.name ?? '',
    },
    book: {
      align: 'right',
      cell: (r) => (
        <span className={r.lot.qty < 0 ? 'text-critical' : 'text-ink'}>
          {num(r.lot.qty, 3)} <span className="text-ink-3">{r.uom}</span>
        </span>
      ),
      text: (r) => String(r.lot.qty),
    },
    counted: {
      align: 'right',
      cell: (r) => (r.lastCount
        ? (
          <span title={`Counted by ${r.lastCount.counter || 'somebody'} on ${shortDate(r.lastCount.on)}`}>
            {num(r.lastCount.countedQty, 3)}
            <span className="block text-[11px] text-ink-3">{shortDate(r.lastCount.on)}</span>
          </span>
        )
        : <span className="text-ink-4">never</span>),
      text: (r) => (r.lastCount ? String(r.lastCount.countedQty) : ''),
    },
    difference: {
      align: 'right',
      cell: (r) => (r.difference === null ? <span className="text-ink-4">—</span>
        : r.difference === 0 ? <span className="text-good">agreed</span>
          : <span className={r.difference < 0 ? 'text-critical' : 'text-warn'}>
            {r.difference > 0 ? '+' : ''}{num(r.difference, 3)}
          </span>),
      text: (r) => (r.difference === null ? '' : String(r.difference)),
    },
    confirmed: {
      cell: (r) => (r.correction ? <span className="text-ink-4">—</span>
        : r.due
          ? <StatePill label={`${r.sinceConfirmed.value} days · count due`} tone="warn"
            title={`Class ${r.cls} is counted every ${ws.policy.countCadenceDays[r.cls]} days`} />
          : <span className="text-ink-2" title={`Last confirmed ${shortDate(r.confirmed.value)}`}>
            {r.sinceConfirmed.value === 0 ? 'today' : `${r.sinceConfirmed.value} days ago`}
          </span>),
      text: (r) => r.confirmed.value,
    },
    state: {
      cell: (r) => (
        <StatePill label={STATE_WORD[r.lot.usability]} title={r.lot.usabilityReason}
          tone={r.lot.usability === 'usable' ? 'good' : r.lot.usability === 'qc_hold' ? 'warn' : 'critical'} />
      ),
      text: (r) => STATE_WORD[r.lot.usability],
    },
    value: {
      align: 'right',
      cell: (r) => (r.value.value === 0 ? <span className="text-ink-4">—</span> : money(r.value.value)),
      text: (r) => String(r.value.value),
    },
    docs: {
      cell: (r) => (r.docs.length === 0
        ? <span className="text-ink-4">opening</span>
        : (
          <span className="inline-flex flex-wrap gap-1">
            {r.docs.slice(0, 3).map((d) => <Tag key={d}>{d}</Tag>)}
            {r.docs.length > 3 && <Tag>+{r.docs.length - 3}</Tag>}
          </span>
        )),
      text: (r) => r.docs.join(' '),
    },
  }
  const kit = buildColumns<LotRow>(ws, 'lot', (r) => r.lot.id, drawn)

  /* ----------------------------------------------------------- counts -- */
  const countDrawn: Record<string, DrawnColumn<CountRow>> = {
    on: { cell: (r) => shortDate(r.count.on), text: (r) => r.count.on },
    rack: { cell: (r) => r.rack?.name ?? <span className="text-ink-4">—</span>, text: (r) => r.rack?.name ?? '' },
    item: { cell: (r) => <span className="font-medium text-ink">{r.item?.name ?? 'Unknown material'}</span>, text: (r) => r.item?.name ?? '' },
    lot: { cell: (r) => <span className="mono text-[12px] text-ink-2">{r.batch}</span>, text: (r) => r.batch },
    book: { align: 'right', cell: (r) => num(r.count.bookQty, 3), text: (r) => String(r.count.bookQty) },
    counted: { align: 'right', cell: (r) => <strong>{num(r.count.countedQty, 3)}</strong>, text: (r) => String(r.count.countedQty) },
    variance: {
      align: 'right',
      cell: (r) => (r.variance.value === 0 ? <span className="text-good">agreed</span>
        : <span className={r.variance.value < 0 ? 'text-critical' : 'text-warn'}>
          {r.variance.value > 0 ? '+' : ''}{num(r.variance.value, 3)} {r.uom}
        </span>),
      text: (r) => String(r.variance.value),
    },
    tolerance: {
      cell: (r) => (r.count.bookQty === 0 ? <StatePill label="Found on the count" tone="info" />
        : r.variance.value === 0 ? <StatePill label="Agreed" tone="good" />
          : r.over
            ? <StatePill label={`Outside ${ws.policy.countTolerancePct[r.cls]}%${r.noted ? ' · looked at' : ''}`}
              tone={r.noted || r.superseded ? 'neutral' : 'critical'} />
            : <StatePill label={`Inside ${ws.policy.countTolerancePct[r.cls]}%`} tone="warn" />),
      text: (r) => (r.over ? 'outside tolerance' : 'inside tolerance'),
    },
    counter: { cell: (r) => r.count.counter || <span className="text-ink-4">—</span>, text: (r) => r.count.counter },
    note: { cell: (r) => <span className="text-ink-2">{r.count.note ?? ''}</span>, text: (r) => r.count.note ?? '' },
  }
  const countKit = buildColumns<CountRow>(ws, 'count', (r) => r.count.id, countDrawn)

  /* -------------------------------------------------------- movements -- */
  const moveDrawn: Record<string, DrawnColumn<MoveRow>> = {
    on: { cell: (r) => shortDate(r.move.on), text: (r) => r.move.on },
    what: {
      cell: (r) => (
        <span>
          <span className="text-ink">{MOVEMENT_LABEL[r.move.kind]}</span>
          {r.move.note && <span className="block max-w-[26rem] truncate text-[11.5px] text-ink-3" title={r.move.note}>{r.move.note}</span>}
        </span>
      ),
      text: (r) => MOVEMENT_LABEL[r.move.kind],
    },
    item: { cell: (r) => <span className="font-medium text-ink">{r.item ?? 'Unknown material'}</span>, text: (r) => r.item ?? '' },
    lot: { cell: (r) => <span className="mono text-[12px] text-ink-2">{r.batch}</span>, text: (r) => r.batch },
    qty: {
      align: 'right',
      cell: (r) => (
        <span className={r.move.qty < 0 ? 'text-critical' : 'text-good'}>
          {r.move.qty > 0 ? '+' : ''}{num(r.move.qty, 3)} <span className="text-ink-3">{r.uom}</span>
        </span>
      ),
      text: (r) => String(r.move.qty),
    },
    doc: { cell: (r) => <Tag>{r.move.sourceRef}</Tag>, text: (r) => r.move.sourceRef },
    actor: { cell: (r) => r.move.actor || <span className="text-ink-4">—</span>, text: (r) => r.move.actor },
  }
  const moveKit = buildColumns<MoveRow>(ws, 'move', (r) => r.move.id, moveDrawn)

  const rackOptions = [
    ...[...(ws.racks ?? [])].sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }))
      .map((r) => ({ value: r.id, label: r.name })),
    ...(hasRacks ? [{ value: 'none', label: 'On no rack' }] : []),
  ]

  const countsOf = (shown: LotRow[]) => {
    const ids = new Set(shown.map((r) => r.lot.id))
    return countRows(ws).filter((c) => ids.has(c.count.lotId))
  }
  const movesOf = (shown: LotRow[]): MoveRow[] => {
    const byId = new Map(shown.map((r) => [r.lot.id, r]))
    return [...(ws.moves ?? [])].filter((m) => byId.has(m.lotId))
      .sort((a, b) => b.on.localeCompare(a.on) || b.id.localeCompare(a.id))
      .map((move) => {
        const r = byId.get(move.lotId)!
        return { move, item: r.item?.name, batch: r.lot.batchNo, uom: r.uom }
      })
  }
  const exportRows = (): string[][] => (view === 'counts' ? countKit.toRows(countsOf(rows))
    : view === 'moves' ? moveKit.toRows(movesOf(rows)) : kit.toRows(rows))

  return (
    <>
      <ListPage
        title="Stock ledger" noun="lot" rows={rows}
        search={(r) => `${r.item?.name ?? ''} ${r.item?.code ?? ''} ${r.lot.batchNo} ${r.rack?.name ?? ''} ${kit.searchText(r)}`}
        filter={hasRacks ? { label: 'All racks', options: rackOptions, of: (r) => r.lot.rack ?? 'none' } : undefined}
        action={{ label: hasRacks ? 'Walk a rack' : 'Count a material', icon: 'hash', onClick: () => setPicking(true) }}
        tools={
          <>
            <button type="button" onClick={() => setAdding(true)}
              className="press inline-flex items-center gap-1.5 rounded-lg border border-line bg-surface px-3 py-2 text-[13px] font-medium hover:bg-surface-2">
              <Icon name="plus" className="size-3.5" /> Add a lot
            </button>
            <DeskTools entity={view === 'counts' ? 'count' : view === 'moves' ? 'move' : 'lot'}
              noun={view === 'counts' ? 'count' : view === 'moves' ? 'movement' : 'lot'}
              title={view === 'counts' ? 'Cycle counts' : view === 'moves' ? 'Stock movements' : 'Stock ledger'}
              rows={exportRows} />
          </>
        }
        empty={{
          line: ws.items.length === 0
            ? 'Add a material first — the ledger is a book of lots of the things you buy.'
            : 'Nothing is on the book yet. Count what is on the shelf from the set-up steps, or add a lot here, and each opens on its rack with its first line.',
          cta: undefined,
        }}>
        {(shown) => {
          const counts = countsOf(shown)
          const moves = movesOf(shown)
          const open = counts.filter((c) => c.over && !c.noted && !c.superseded).length
          const total = shown.reduce((a, r) => a + (r.lot.usability === 'usable' && !r.lot.remnant ? r.value.value : 0), 0)
          return (
            <div className="space-y-3">
              {focusName && (
                <div className="flex flex-wrap items-center gap-2 text-[12.5px] text-ink-2">
                  <span>Showing <strong className="text-ink">{focusName}</strong></span>
                  <button type="button" onClick={() => { setFocus({}); window.history.replaceState(null, '', window.location.pathname) }}
                    className="press rounded-md px-1.5 py-0.5 text-accent-ink hover:underline">Show every lot</button>
                </div>
              )}
              <Tabs<View> label="Lots, counts or movements" value={view} onChange={setView}
                items={[
                  { id: 'lots', label: 'Lots', badge: <Count n={shown.filter((r) => r.due).length} /> },
                  { id: 'counts', label: 'Counts', badge: <Count n={open} /> },
                  { id: 'moves', label: 'Movements' },
                ]} />

              {view === 'lots' && (
                <>
                  <p className="text-[12.5px] text-ink-3">
                    {total > 0
                      ? <><span className="num font-semibold text-ink">{money(total)}</span> usable on the book</>
                      : 'Not valued yet — no purchase price on record for what is here'}
                    {due.length > 0 && <> · <span className="text-warn">{due.length} lot{due.length === 1 ? '' : 's'} past {due.length === 1 ? 'its' : 'their'} counting date</span></>}
                  </p>
                  <DataTable
                    columns={kit.columns} rows={shown} keyOf={(r) => r.lot.id}
                    extra={{ icon: 'doc', label: (r) => `The trail of ${r.lot.batchNo}`, onClick: (r) => setTrailOf(r.lot.id) }}
                    extra2={{ icon: 'hash', label: (r) => `Count ${r.lot.batchNo}`, onClick: (r) => { if (!r.correction) setCounting(r.lot.id) } }}
                    onEdit={(r) => { if (!r.correction) setActing(r) }}
                    editLabel={(r) => `Move, hold or write off ${r.lot.batchNo}`}
                  />
                </>
              )}

              {view === 'counts' && (counts.length === 0
                ? <p className="rounded-xl border border-line bg-surface px-6 py-10 text-center text-[13px] text-ink-2">
                  Nothing counted against the book yet. Walk a rack — every lot on it, the book beside a box for what is there.
                </p>
                : <DataTable
                  columns={countKit.columns} rows={counts} keyOf={(r) => r.count.id}
                  extra={{
                    icon: 'check',
                    label: (r) => (r.over && !r.noted && !r.superseded ? `Looked at the count on ${r.batch}` : 'Nothing to look at'),
                    onClick: (r) => {
                      if (r.over && !r.noted && !r.superseded) {
                        update((w) => ({ ...w, drafts: { ...w.drafts, [varianceNotedKey(r.count.id)]: true } }))
                      }
                    },
                  }}
                />)}

              {view === 'moves' && (moves.length === 0
                ? <p className="rounded-xl border border-line bg-surface px-6 py-10 text-center text-[13px] text-ink-2">No movements yet.</p>
                : <DataTable columns={moveKit.columns} rows={moves} keyOf={(r) => r.move.id} />)}

              {!hasRacks && ws.drafts['inventory.oneRack'] !== true && (
                <p className="flex items-center gap-1.5 text-[12px] text-ink-3">
                  <Icon name="info" className="size-3.5" />
                  Name your racks and each lot can be placed — a count is then walked rack by rack.
                </p>
              )}
            </div>
          )
        }}
      </ListPage>

      <TrailDialog lotId={trailOf} onClose={() => setTrailOf(null)} />
      <MoveRackDialog lotId={moving} onClose={() => setMoving(null)} />
      <CountDialog lotId={counting} onClose={() => setCounting(null)} />
      <CountSheetDialog scope={walking} onClose={() => setWalking(null)} />
      <AddLotDialog open={adding} onClose={() => setAdding(false)} />
      <LotStateDialog lotId={stating?.lotId ?? null} mode={stating?.mode ?? 'hold'} onClose={() => setStating(null)} />
      <WalkPicker open={picking} onClose={() => setPicking(false)}
        onPick={(scope) => { setPicking(false); setWalking(scope) }} />
      {acting && (
        <Dialog open onClose={() => setActing(null)} title={acting.lot.batchNo}
          sub={`${acting.item?.name ?? 'Lot'} · ${num(acting.lot.qty, 3)} ${acting.uom} · ${STATE_WORD[acting.lot.usability]}`}>
          <div className="grid gap-2 px-4 py-4">
            {hasRacks && (
              <LotAct icon="columns" label={acting.lot.rack ? 'Move to another rack' : 'Put it on a rack'}
                onClick={() => { setMoving(acting.lot.id); setActing(null) }} />
            )}
            {acting.lot.usability === 'usable'
              ? <LotAct icon="alert" label="Put it on hold" sub="Damaged, to be checked, past its date — never cover while held"
                onClick={() => { setStating({ lotId: acting.lot.id, mode: 'hold' }); setActing(null) }} />
              : <LotAct icon="check" label="Release it" sub="Fine after all — usable, and cover again"
                onClick={() => { setStating({ lotId: acting.lot.id, mode: 'release' }); setActing(null) }} />}
            <LotAct icon="trash" label="Write it off" sub="Off the book for good, on the loss ledger with a reason"
              onClick={() => { setStating({ lotId: acting.lot.id, mode: 'write-off' }); setActing(null) }} />
          </div>
        </Dialog>
      )}
    </>
  )
}

function LotAct({ icon, label, sub, onClick }: {
  icon: 'columns' | 'alert' | 'check' | 'trash'; label: string; sub?: string; onClick: () => void
}) {
  return (
    <button type="button" onClick={onClick}
      className="press flex items-start gap-2.5 rounded-lg border border-line bg-surface px-3 py-2.5 text-left hover:bg-surface-2">
      <Icon name={icon} className="mt-0.5 size-4 shrink-0 text-ink-3" />
      <span>
        <span className="block text-[13px] font-semibold text-ink">{label}</span>
        {sub && <span className="block text-[11.5px] text-ink-3">{sub}</span>}
      </span>
    </button>
  )
}

/**
 * Which walk: a rack, most overdue first — or, in a store with no racks, a
 * material. What each holds and how much of it is due is on the button.
 */
function WalkPicker({ open, onClose, onPick }: {
  open: boolean
  onClose: () => void
  onPick: (scope: { rackId?: string; itemId?: string }) => void
}) {
  const { workspace, today } = useWorkspace()
  if (!open || !workspace) return null
  const ws = workspace
  const racks = rackRows(ws, today).sort((a, b) => b.due - a.due)
  const rows = lotRows(ws, today).filter((r) => !r.correction && r.lot.qty > 0)
  const items = ws.items
    .map((it) => ({ it, lots: rows.filter((r) => r.lot.itemId === it.id) }))
    .filter((x) => x.lots.length > 0)
    .sort((a, b) => b.lots.filter((r) => r.due).length - a.lots.filter((r) => r.due).length)
  const unplaced = rows.filter((r) => !r.lot.rack)
  const byRack = racks.length > 0

  return (
    <Dialog open onClose={onClose} title={byRack ? 'Which rack?' : 'Which material?'}
      sub={byRack ? 'Every lot on it, the book beside a box for what is there.' : 'Every lot of it, the book beside a box for what is there.'}>
      <ul className="grid gap-1.5 px-4 py-4">
        {byRack
          ? racks.map((r) => (
            <li key={r.rack.id}>
              <button type="button" onClick={() => onPick({ rackId: r.rack.id })} disabled={r.lots === 0}
                className="press flex w-full items-center gap-3 rounded-lg border border-line bg-surface px-3 py-2.5 text-left hover:bg-surface-2 disabled:opacity-50">
                <span className="min-w-0 flex-1">
                  <span className="block text-[13px] font-semibold text-ink">{r.rack.name}</span>
                  <span className="block text-[11.5px] text-ink-3">
                    {r.lots === 0 ? 'nothing on it' : `${r.lots} lot${r.lots === 1 ? '' : 's'}`}
                    {r.walked ? ` · last counted ${shortDate(r.walked)}` : r.lots ? ' · never counted' : ''}
                  </span>
                </span>
                {r.due > 0 && <StatePill label={`${r.due} due`} tone="warn" />}
              </button>
            </li>
          ))
          : items.map(({ it, lots }) => {
            const d = lots.filter((r) => r.due).length
            return (
              <li key={it.id}>
                <button type="button" onClick={() => onPick({ itemId: it.id })}
                  className="press flex w-full items-center gap-3 rounded-lg border border-line bg-surface px-3 py-2.5 text-left hover:bg-surface-2">
                  <span className="min-w-0 flex-1">
                    <span className="block text-[13px] font-semibold text-ink">{it.name}</span>
                    <span className="block text-[11.5px] text-ink-3">{lots.length} lot{lots.length === 1 ? '' : 's'}</span>
                  </span>
                  {d > 0 && <StatePill label={`${d} due`} tone="warn" />}
                </button>
              </li>
            )
          })}
        {byRack && unplaced.length > 0 && (
          <li className="pt-1 text-[12px] text-ink-3">
            {unplaced.length} lot{unplaced.length === 1 ? ' is' : 's are'} on no rack and on no walk — place {unplaced.length === 1 ? 'it' : 'them'} first.
          </li>
        )}
        {(byRack ? racks.length : items.length) === 0 && (
          <li className="text-[12.5px] text-ink-3">Nothing is on the book to count yet.</li>
        )}
      </ul>
    </Dialog>
  )
}
