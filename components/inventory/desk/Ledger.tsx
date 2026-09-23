'use client'
import { useEffect, useState } from 'react'
import { ListPage } from '@/components/ui/ListPage'
import { DataTable, StatePill, Tag } from '@/components/ui/DataTable'
import { Icon } from '@/components/ui/icons'
import { DeskTools } from '@/components/sheet/DeskTools'
import { buildColumns, type DrawnColumn } from '@/components/sheet/columns'
import { StockWizard } from '@/components/onboard/wizards/StockWizard'
import { useWorkspace } from '@/components/workspace/store'
import { money, num, shortDate } from '@/lib/domain/format'
import { lotRows, type LotRow } from '@/lib/workspace/ledger'
import { MoveRackDialog, TrailDialog } from './LedgerDialogs'

const STATE_WORD = { usable: 'Usable', qc_hold: 'On hold', damaged: 'Damaged', expired: 'Expired' } as const

/** What the page was opened for, from a dashboard card: one rack, one material, or lots on none. */
interface Focus { rack?: string; item?: string }

/**
 * The store's book: every lot, what the book says of it, and what was last
 * counted on the rack.
 *
 * The two numbers side by side are the point. The book is what the documents
 * add up to; the count is what somebody saw. A lot counted recently and
 * matching is one to believe, one not counted since its class's cadence is
 * not wrong but unverified, and the screen says which is which rather than
 * showing one confident number for both.
 */
export function Ledger() {
  const { workspace, today } = useWorkspace()
  const [trailOf, setTrailOf] = useState<string | null>(null)
  const [moving, setMoving] = useState<string | null>(null)
  const [counting, setCounting] = useState(false)
  const [focus, setFocus] = useState<Focus>({})

  useEffect(() => {
    // read once, on the way in — a card links here with ?rack= or ?item=
    const q = new URLSearchParams(window.location.search)
    setFocus({ rack: q.get('rack') ?? undefined, item: q.get('item') ?? undefined })
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

  const rackOptions = [
    ...[...(ws.racks ?? [])].sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }))
      .map((r) => ({ value: r.id, label: r.name })),
    ...(hasRacks ? [{ value: 'none', label: 'On no rack' }] : []),
  ]
  const total = rows.reduce((a, r) => a + (r.lot.usability === 'usable' && !r.lot.remnant ? r.value.value : 0), 0)

  return (
    <>
      <ListPage
        title="Stock ledger" noun="lot" rows={rows}
        search={(r) => `${r.item?.name ?? ''} ${r.item?.code ?? ''} ${r.lot.batchNo} ${r.rack?.name ?? ''} ${kit.searchText(r)}`}
        filter={hasRacks ? { label: 'All racks', options: rackOptions, of: (r) => r.lot.rack ?? 'none' } : undefined}
        action={{ label: 'Count stock', icon: 'hash', onClick: () => setCounting(true) }}
        tools={<DeskTools entity="lot" noun="lot" title="Stock ledger" rows={() => kit.toRows(rows)} />}
        empty={{
          line: ws.items.length === 0
            ? 'Add a material first — the ledger is a book of lots of the things you buy.'
            : 'Nothing is on the book yet. Count what is on the shelf and each material opens as a lot, on its rack, with its first line.',
          cta: ws.items.length === 0 ? undefined : 'Count your stock',
        }}>
        {(shown) => (
          <>
            {focusName && (
              <div className="mb-3 flex flex-wrap items-center gap-2 text-[12.5px] text-ink-2">
                <span>Showing <strong className="text-ink">{focusName}</strong></span>
                <button type="button" onClick={() => { setFocus({}); window.history.replaceState(null, '', window.location.pathname) }}
                  className="press rounded-md px-1.5 py-0.5 text-accent-ink hover:underline">Show every lot</button>
              </div>
            )}
            <p className="mb-3 text-[12.5px] text-ink-3">
              {total > 0
                ? <><span className="num font-semibold text-ink">{money(total)}</span> usable on the book</>
                : 'Not valued yet — no purchase price on record for what is here'}
              {due.length > 0 && <> · <span className="text-warn">{due.length} lot{due.length === 1 ? '' : 's'} past {due.length === 1 ? 'its' : 'their'} counting date</span></>}
            </p>
            <DataTable
              columns={kit.columns} rows={shown} keyOf={(r) => r.lot.id}
              extra={{ icon: 'doc', label: (r) => `The trail of ${r.lot.batchNo}`, onClick: (r) => setTrailOf(r.lot.id) }}
              extra2={hasRacks ? {
                icon: 'columns',
                label: (r) => (r.lot.rack ? `Move ${r.lot.batchNo} to another rack` : `Put ${r.lot.batchNo} on a rack`),
                onClick: (r) => { if (!r.correction) setMoving(r.lot.id) },
              } : undefined}
            />
            {!hasRacks && ws.drafts['inventory.oneRack'] !== true && (
              <p className="mt-3 flex items-center gap-1.5 text-[12px] text-ink-3">
                <Icon name="info" className="size-3.5" />
                Name your racks and each lot can be placed — a count is then walked rack by rack.
              </p>
            )}
          </>
        )}
      </ListPage>

      <TrailDialog lotId={trailOf} onClose={() => setTrailOf(null)} />
      <MoveRackDialog lotId={moving} onClose={() => setMoving(null)} />
      <StockWizard open={counting} onClose={() => setCounting(false)} />
    </>
  )
}
