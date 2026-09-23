'use client'
import { useEffect, useState } from 'react'
import { ListPage } from '@/components/ui/ListPage'
import { DataTable, StatePill, type PillTone } from '@/components/ui/DataTable'
import { Tabs } from '@/components/ui/Tabs'
import { DeskTools } from '@/components/sheet/DeskTools'
import { buildColumns, type DrawnColumn } from '@/components/sheet/columns'
import { useWorkspace } from '@/components/workspace/store'
import { daysBetween } from '@/lib/domain/calc'
import { money, num, shortDate } from '@/lib/domain/format'
import {
  VERDICT_WORD, carrierRows, consignmentRows, freightUnitOf, orderToDock, otifOf, type CRow, type Verdict,
} from '@/lib/workspace/consignments'
import { CARRIER_MODE, dispatchRulesOf } from '@/lib/workspace/customers'
import { BookCarrierDialog } from './NoteDialogs'
import { ChaseDialog, DeliveredDialog } from './ConsignmentDialogs'

type View = 'list' | 'carriers'

const VERDICT_TONE: Record<Verdict, PillTone> = {
  otif: 'good', late: 'critical', short: 'warn', overdue: 'critical', transit: 'info',
}

function Count({ n }: { n: number }) {
  return n > 0 ? <span className="mono rounded-full bg-surface-3 px-1.5 text-[10.5px] leading-[17px] text-ink-3">{n}</span> : null
}

function Figure({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <div className="min-w-0 rounded-xl border border-line bg-surface px-3.5 py-2.5">
      <p className="text-[11.5px] font-medium text-ink-3">{label}</p>
      <p className="num mt-0.5 text-[19px] font-bold leading-tight text-ink">{value}</p>
      <p className="mt-0.5 truncate text-[11.5px] text-ink-3">{sub}</p>
    </div>
  )
}

/**
 * Every dispatch note on its way, and whether it got there.
 *
 * One row a consignment: who has it, the docket their system knows it by,
 * the day the customer was told, and — once somebody confirms it — the day it
 * landed and who said so. The verdict is on time and in full, judged per
 * order. By carrier, the same facts added up, so a carrier who is always a
 * day late is a number rather than a feeling.
 */
export function Consignments() {
  const { workspace, today } = useWorkspace()
  const [view, setView] = useState<View>('list')
  const [delivering, setDelivering] = useState<string | null>(null)
  const [chasing, setChasing] = useState<string | null>(null)
  const [editing, setEditing] = useState<string | null>(null)

  // the late-deliveries figure links here with ?view=carriers
  useEffect(() => {
    if (new URLSearchParams(window.location.search).get('view') === 'carriers') setView('carriers')
  }, [])

  if (!workspace) return null
  const ws = workspace
  const rows = consignmentRows(ws, today)
  const landed = rows.filter((r) => r.delivered)
  const otif = otifOf(rows)
  const dock = orderToDock(ws)
  const billed = rows.filter((r) => r.consignment.freight !== undefined)
  const freight = freightUnitOf(billed)
  const out = rows.filter((r) => !r.delivered)
  const overdue = out.filter((r) => r.late).length
  const carriers = carrierRows(ws, today, rows)

  const drawn: Record<string, DrawnColumn<CRow>> = {
    note: {
      cell: (r) => (
        <span>
          <span className="mono block whitespace-nowrap font-semibold text-ink">{r.note.no}</span>
          <span className="mono block whitespace-nowrap text-[11px] text-ink-3">{r.order?.no ?? ''}</span>
        </span>
      ),
      text: (r) => r.note.no,
    },
    customer: { cell: (r) => <span className="font-medium text-ink">{r.customer?.name ?? '—'}</span>, text: (r) => r.customer?.name ?? '' },
    carrier: { cell: (r) => r.carrier?.name ?? '—', text: (r) => r.carrier?.name ?? '' },
    lr: { cell: (r) => <span className="mono whitespace-nowrap text-[12px] text-ink-2">{r.consignment.lrNo ?? '—'}</span>, text: (r) => r.consignment.lrNo ?? '' },
    left: { cell: (r) => <span className="num whitespace-nowrap text-ink-2">{shortDate(r.note.on)}</span>, text: (r) => r.note.on },
    promised: { cell: (r) => <span className="num whitespace-nowrap text-ink-2">{shortDate(r.consignment.promisedDate)}</span>, text: (r) => r.consignment.promisedDate },
    delivered: {
      cell: (r) => (r.delivered ? (
        <span className="whitespace-nowrap">
          <span className="num text-ink">{shortDate(r.consignment.deliveredOn!)}</span>
          <span className="block max-w-[12rem] truncate text-[11px] text-ink-3" title={r.consignment.confirmedBy}>{r.consignment.confirmedBy}</span>
        </span>
      ) : <span className="whitespace-nowrap text-[12px] text-ink-3">in transit {Math.max(0, daysBetween(r.note.on, today))} d</span>),
      text: (r) => r.consignment.deliveredOn ?? '',
    },
    verdict: {
      cell: (r) => <StatePill tone={VERDICT_TONE[r.verdict]}
        label={r.verdict === 'late' ? `Late by ${r.drift} d` : r.verdict === 'overdue' ? `Overdue ${daysBetween(r.consignment.promisedDate, today)} d` : VERDICT_WORD[r.verdict]} />,
      text: (r) => VERDICT_WORD[r.verdict],
    },
    freight: {
      align: 'right',
      cell: (r) => (r.consignment.freight !== undefined ? money(r.consignment.freight) : <span className="text-ink-4">—</span>),
      text: (r) => String(r.consignment.freight ?? ''),
    },
  }
  const kit = buildColumns<CRow>(ws, 'consignment', (r) => r.consignment.id, drawn)

  return (
    <>
      <ListPage
        title="Consignments" noun="consignment" rows={rows}
        search={(r) => `${r.note.no} ${r.order?.no ?? ''} ${r.customer?.name ?? ''} ${r.carrier?.name ?? ''} ${r.consignment.lrNo ?? ''} ${kit.searchText(r)}`}
        filter={{
          label: 'Every verdict',
          options: (Object.keys(VERDICT_WORD) as Verdict[]).filter((v) => rows.some((r) => r.verdict === v)).map((v) => ({ value: v, label: VERDICT_WORD[v] })),
          of: (r) => r.verdict,
        }}
        tools={<DeskTools entity="consignment" noun="consignment" title="Consignments" rows={() => kit.toRows(rows)} />}
        empty={{ line: 'Nothing booked with a carrier yet. Book a dispatch note with a carrier and it shows here until somebody confirms it arrived.' }}>
        {(shown) => (
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
              <Figure label="On time, in full" value={landed.length ? `${otif.value}%` : '—'}
                sub={landed.length ? `of ${landed.length} delivered · target ${dispatchRulesOf(ws).otifTargetPct}%` : 'nothing delivered yet'} />
              <Figure label="Order to dock" value={ws.dispatchNotes.length ? `${dock.value} days` : '—'} sub="order taken to note raised" />
              <Figure label="Freight per unit" value={billed.length ? `₹${freight.value}` : '—'} sub={billed.length ? `over ${billed.length} with a bill` : 'no freight recorded'} />
              <Figure label="On the road" value={String(out.length)} sub={overdue ? `${overdue} past the promise` : 'none past the promise'} />
            </div>
            <Tabs<View> label="Consignments or by carrier" value={view} onChange={setView}
              items={[
                { id: 'list', label: 'Consignments', badge: <Count n={overdue} /> },
                { id: 'carriers', label: 'By carrier', badge: <Count n={carriers.filter((c) => c.shipped > 0).length} /> },
              ]} />
            {view === 'list' && (
              <DataTable columns={kit.columns} rows={shown} keyOf={(r) => r.consignment.id}
                extra={{
                  icon: 'check',
                  label: (r) => (r.delivered ? `${r.note.no} was delivered` : `Mark ${r.note.no} delivered`),
                  onClick: (r) => { if (!r.delivered) setDelivering(r.consignment.id) },
                }}
                extra2={{
                  icon: 'bell',
                  label: (r) => (r.delivered ? 'Nothing to chase' : `Chase ${r.carrier?.name ?? 'the carrier'} about ${r.note.no}`),
                  onClick: (r) => { if (!r.delivered) setChasing(r.consignment.id) },
                }}
                onEdit={(r) => { if (!r.delivered) setEditing(r.note.id) }}
                editLabel={(r) => (r.delivered ? 'Delivered — kept as it was' : `Change the booking on ${r.note.no}`)} />
            )}
            {view === 'carriers' && (
              <DataTable rows={carriers} keyOf={(c) => c.carrier.id}
                columns={[
                  { key: 'name', head: 'Carrier', cell: (c) => <span className="font-semibold text-ink">{c.carrier.name}</span> },
                  { key: 'mode', head: 'How', cell: (c) => <span className="text-ink-2">{CARRIER_MODE[c.carrier.mode]}</span> },
                  { key: 'shipped', head: 'Shipped', align: 'right', cell: (c) => (c.shipped ? num(c.shipped, 0) : <span className="text-ink-4">—</span>) },
                  { key: 'delivered', head: 'Delivered', align: 'right', cell: (c) => (c.delivered ? num(c.delivered, 0) : <span className="text-ink-4">—</span>) },
                  {
                    key: 'late', head: 'Late', align: 'right',
                    cell: (c) => (c.delivered === 0 ? <span className="text-ink-4">—</span>
                      : c.late ? <span className="text-critical">{c.late} of {c.delivered}</span> : <span className="text-good">none</span>),
                  },
                  {
                    key: 'drift', head: 'Against the promise', align: 'right',
                    cell: (c) => {
                      const v = c.drift.value as number
                      return c.delivered === 0 ? <span className="text-ink-4">—</span>
                        : <span className={v > 0 ? 'text-critical' : 'text-ink-2'}>{v > 0 ? `${v} d behind` : v < 0 ? `${-v} d early` : 'on the day'}</span>
                    },
                  },
                  { key: 'freight', head: 'Freight', align: 'right', cell: (c) => (c.freight ? money(c.freight) : <span className="text-ink-4">—</span>) },
                  {
                    key: 'perkg', head: 'Per kg', align: 'right',
                    cell: (c) => (c.freight && c.weightKg ? `₹${num(c.freight / c.weightKg, 2)}` : <span className="text-ink-4">—</span>),
                  },
                ]} />
            )}
          </div>
        )}
      </ListPage>
      <DeliveredDialog consignmentId={delivering} onClose={() => setDelivering(null)} />
      <ChaseDialog consignmentId={chasing} onClose={() => setChasing(null)} />
      <BookCarrierDialog noteId={editing} onClose={() => setEditing(null)} />
    </>
  )
}
