/**
 * The desks' pictures, read off the records: orders as spans, suppliers as a
 * dot per delivery, what lands on which day, the gate, the store's lots, the
 * floor's week, the bay's road. Each is the same records the desk's queue
 * reads, shown a second way.
 */
import { describe, expect, it } from 'vitest'
import { bookConsignment, markDelivered } from '@/lib/workspace/consignments'
import {
  acceptance, countState, customerScores, firstPassByJob, gateWaits, jobCardsPic, jobSpans, landing, lastReceipts,
  madeByWeek, materialCards, orderCards, orderSpans, punctuality, recentFor, roadRows, shelfByMaterial, shelfVsPromised,
  stockCards, supplierScores,
} from '@/lib/workspace/desk-pictures'
import { raiseNote } from '@/lib/workspace/dispatch-notes'
import { arrive, recordReceipt } from '@/lib/workspace/receipts'
import type { PurchaseOrder, Workspace } from '@/lib/workspace/types'
import { TODAY, booked, made } from './dispatch-fixture'

const po = (over: Partial<PurchaseOrder> = {}): PurchaseOrder => ({
  id: 'PO-001', no: 'PO-1', vendorId: 'VN-001', itemId: 'IT-001', qty: 200, unitPrice: 240,
  orderedOn: '2026-09-01', expectedOn: '2026-09-10', state: 'confirmed', ...over,
})

/**
 * Two suppliers: PO-1 came in on the day with 5 rejected, PO-2 came in two
 * days late, PO-3 is due in four days, PO-4 was due yesterday and has not come.
 */
function buying(): Workspace {
  let ws: Workspace = {
    ...booked(),
    vendors: [{ id: 'VN-001', name: 'Arvind Mills', paymentTermsDays: 30 }, { id: 'VN-002', name: 'YKK India', paymentTermsDays: 30 }],
    orders: [
      po(),
      po({ id: 'PO-002', no: 'PO-2', vendorId: 'VN-002', orderedOn: '2026-09-05', expectedOn: '2026-09-12', qty: 100 }),
      po({ id: 'PO-003', no: 'PO-3', orderedOn: '2026-09-15', expectedOn: '2026-09-27', qty: 300 }),
      po({ id: 'PO-004', no: 'PO-4', vendorId: 'VN-002', orderedOn: '2026-09-10', expectedOn: '2026-09-22', qty: 50 }),
    ],
  }
  const o = (id: string) => ws.orders.find((x) => x.id === id)!
  ws = recordReceipt(ws, { order: o('PO-001'), qty: 200, accepted: 195, rejected: 5, receivedOn: '2026-09-10', inspector: 'Ravi' })
  ws = recordReceipt(ws, { order: o('PO-002'), qty: 100, accepted: 100, rejected: 0, receivedOn: '2026-09-14', inspector: 'Ravi' })
  return ws
}

describe('sourcing', () => {
  it('draws orders as spans: on time green, late red with how late, open ones in navy', () => {
    const spans = orderSpans(buying(), TODAY)
    expect(spans.map((s) => [s.no, s.status, s.lateDays, s.open])).toEqual([
      ['PO-1', 'good', 0, false], ['PO-2', 'critical', 2, false], ['PO-4', 'critical', 1, true], ['PO-3', 'none', 0, true],
    ])
    expect(spans.find((s) => s.no === 'PO-3')).toMatchObject({ value: 72_000, from: '2026-09-15', to: '2026-09-27' })
  })

  it('scores each supplier by its deliveries, rejections and real lead time', () => {
    const s = supplierScores(buying())
    expect(s.find((x) => x.name === 'Arvind Mills')).toMatchObject({ deliveries: [true], onTimePct: 100, rejectedPct: 2.5, lead: 9 })
    expect(s.find((x) => x.name === 'YKK India')).toMatchObject({ deliveries: [false], onTimePct: 0, rejectedPct: 0 })
  })

  it('puts what lands on its day, and what is late on today', () => {
    const days = landing(buying(), TODAY)
    expect(days).toHaveLength(10)
    expect(days[0].items.map((i) => [i.key, i.status, i.note])).toEqual([['po:PO-004', 'critical', '1d late']])
    expect(days.find((d) => d.date === '2026-09-27')!.items.map((i) => i.key)).toEqual(['po:PO-003'])
  })

  it('cards each material by how long its shelf lasts and what is coming', () => {
    const m = materialCards(buying(), TODAY)
    expect(m[0]).toMatchObject({ id: 'IT-001', incoming: { kind: 'order', on: '2026-09-22', qty: 50 } })
  })
})

describe('the gate', () => {
  const atGate = () => arrive(buying(), { order: buying().orders.find((o) => o.id === 'PO-003')!, qty: 300, receivedOn: '2026-09-20' })[0]

  it('shows what waits at the gate against the inspection window', () => {
    const g = gateWaits(atGate(), TODAY)
    expect(g.waiting).toEqual([expect.objectContaining({ what: 'Denim 14 oz', days: 3, status: 'warn' })])
    expect([g.within, g.overdue]).toEqual([2, 3])
    expect(landing(atGate(), TODAY)[0].items.some((i) => i.kind === 'gate')).toBe(true)
  })

  it('reads each delivery against its promised day, and what was accepted', () => {
    expect(punctuality(buying()).map((p) => [p.no, p.lateDays])).toEqual([['PO-1', 0], ['PO-2', 2]])
    expect(acceptance(buying(), TODAY)).toEqual([expect.objectContaining({ id: 'IT-001', accepted: 295, rejected: 5, waiting: 0 })])
    const last = lastReceipts(atGate(), TODAY)
    expect(last[0]).toMatchObject({ open: true, acceptedPct: null, days: 3 })
    expect(last[1]).toMatchObject({ open: false, late: true, acceptedPct: 1 })
  })
})

describe('the store', () => {
  it('values the shelf, and says which lots are due a count', () => {
    const ws = buying()
    expect(shelfByMaterial(ws)[0]).toMatchObject({ id: 'IT-001' })
    const c = countState(ws, TODAY)
    expect(c[0].id).toBe('IT-001')
    expect(c[0].lots.length).toBeGreaterThan(0)
    const card = stockCards(ws, TODAY)[0]
    expect(card).toMatchObject({ id: 'IT-001', uom: 'm' })
    expect(card.value).toBeGreaterThan(0)
  })
})

describe('the floor', () => {
  it('draws each planned card from start to finish with what is made', () => {
    expect(jobSpans(made(60), TODAY)).toEqual([expect.objectContaining({ no: 'ST-1', made: 60, qty: 300, state: 'behind', halts: [] })])
    expect(jobCardsPic(made(60), TODAY)[0]).toMatchObject({ no: 'ST-1', gap: 60, state: 'behind' })
  })

  it('adds up each week against the plan, and first-pass per card', () => {
    const w = madeByWeek(made(120), TODAY)
    expect(w).toHaveLength(4)
    expect(w[3]).toMatchObject({ good: 120, rejected: 0 })
    expect(w[3].target).toBeGreaterThan(0)
    expect(firstPassByJob(made(120), TODAY)).toEqual([{ no: 'ST-1', good: 120, rejected: 0 }])
  })
})

describe('the bay', () => {
  const shipped = () => {
    let ws = booked()
    let id: string, c: string
    ;[ws, id] = raiseNote(ws, { orderId: 'SO-001', on: '2026-09-18', lines: [{ productId: 'PR-001', qty: 100 }], weightKg: 100, authorisedBy: 'R. Mehta', actor: 'K. Rao' }, TODAY)
    ;[ws, c] = bookConsignment(ws, id, { carrierId: 'CR-001', lrNo: 'LR-1', promisedDate: '2026-09-20' })
    ws = markDelivered(ws, c, { on: '2026-09-21', by: 'stores' }, TODAY)
    ;[ws] = raiseNote(ws, { orderId: 'SO-002', on: TODAY, lines: [{ productId: 'PR-001', qty: 10 }], weightKg: 10, authorisedBy: 'R. Mehta', actor: 'K. Rao' }, TODAY)
    return ws
  }

  it('puts the road in order: moving, not booked, then the last delivered', () => {
    const r = roadRows(shipped(), TODAY)
    expect(r.map((x) => [x.no, x.status])).toEqual([['DC-2', 'warn'], ['DC-1', 'critical']])
    expect(r[1]).toMatchObject({ delivered: '2026-09-21', word: 'delivered 2026-09-21' })
  })

  it('scores customers on time and in full, and sets the shelf against the promises', () => {
    expect(customerScores(shipped(), TODAY)).toEqual([expect.objectContaining({ name: 'Bharat Panels', dots: [false], pct: 0 })])
    expect(shelfVsPromised(booked())).toEqual([{ id: 'PR-001', name: 'Slim-fit jeans', onShelf: 120, promised: 300 }])
    expect(orderCards(booked(), TODAY).map((o) => [o.no, o.zone, o.sent])).toEqual([['SO-1', 'past', 0], ['SO-2', 'soon', 0]])
  })

  it('lists each desk’s own recent work', () => {
    const ws = shipped()
    expect(recentFor(ws, 'dispatch').every((a) => ['cash', 'doc', 'truck'].includes(a.kind))).toBe(true)
    expect(recentFor(ws, 'dispatch')[0].what).toBe('DC-2 to Deccan Retail')
    expect(recentFor(ws, 'production').every((a) => ['factory', 'alert', 'boxes'].includes(a.kind))).toBe(true)
  })
})
