/**
 * Purchase orders once handed over: what a supplier has been told, and
 * whether it lands in time.
 *
 * The rule the sample company's INB-02 exists for, and the one this file
 * proves over an owner's own records: cover is computed on the quantity the
 * supplier has CONFIRMED — never a change they have not seen. So a change
 * moves our figure at once and theirs not at all, until somebody records that
 * they agreed; and the order that was always there finally counts, where
 * before an owner's desk read "out of cover — order now" with the order for it
 * confirmed and due next week.
 */
import { describe, expect, it } from 'vitest'
import { buildRows } from '@/lib/domain/derive'
import { buildPo, poMessageFor, poSubjectFor } from '@/lib/paper/po'
import { boardLines, verdictText } from '@/lib/workspace/board'
import { bundleFor } from '@/lib/workspace/bundle'
import { decisionsFor } from '@/lib/workspace/decisions'
import { emptyWorkspace } from '@/lib/workspace/defaults'
import { inFlight } from '@/lib/workspace/flight'
import { inboundDecisionsFor } from '@/lib/workspace/inbound-decisions'
import {
  ackImageIds, ackedDate, ackedQty, awaitingAckNos, churnNotedKey, markHandedOver, recordAck, reviseOrder,
  reviseProblem, revisionsOf, syncOf, syncOrders,
} from '@/lib/workspace/orders'
import { arrive, closeReceipt } from '@/lib/workspace/receipts'
import type { Item, StockLot, VendorItem } from '@/lib/domain/types'
import type { PurchaseOrder, Workspace } from '@/lib/workspace/types'

const TODAY = '2026-09-18'

/** 10 kg a day, 50 kg of safety stock, 12 days quoted — a reorder point of 170. */
const material = (over: Partial<Item> = {}): Item => ({
  id: 'IT-001', code: 'COPPER', name: 'Copper strip 25 mm', uom: 'kg', itemClass: 'B',
  coverageCeilingMonths: 2, moq: 100, safetyStock: 50,
  avgDailyConsumption: 10, floorConsumptionPerDay: 10,
  lastPurchaseRate: 800, feeds: [], ...over,
})

const quote = (over: Partial<VendorItem> = {}): VendorItem => ({
  vendorId: 'VN-001', itemId: 'IT-001',
  rate: 800, freightPerUnit: 0, nonCreditableGst: 0,
  paymentTermCost: 0, rejectionAllowance: 0,
  quotedLeadTimeDays: 12, trailingLeadTimeDays: 12, trailingRejectionRate: 0,
  onTimePct: 100, score: 0, quoteValidUntil: '2027-01-01', ...over,
})

const lot = (over: Partial<StockLot> = {}): StockLot => ({
  id: 'LOT-001', itemId: 'IT-001', batchNo: 'OPENING', qty: 120, usability: 'usable', ...over,
})

const order = (over: Partial<PurchaseOrder> = {}): PurchaseOrder => ({
  id: 'PO-001', no: 'PO-1', vendorId: 'VN-001', itemId: 'IT-001',
  qty: 100, unitPrice: 800, orderedOn: '2026-09-15', expectedOn: '2026-09-25',
  state: 'draft', ...over,
})

/** 120 kg on the shelf, running out on 30 September; one order, still a draft. */
const base = (orders: PurchaseOrder[] = [order()]): Workspace => {
  const ws = emptyWorkspace({
    id: 'WS-1', createdAt: TODAY, ownerName: 'R. Mehta', contact: '',
    companyName: 'Patel Heaters', makes: 'heaters',
  })
  return {
    ...ws,
    items: [material()],
    vendors: [{ id: 'VN-001', name: 'Shah Metals', paymentTermsDays: 30 }],
    vendorItems: [quote()],
    stockLots: [lot()],
    orders,
    nextIds: { ...ws.nextIds, IT: 1, VN: 1, PO: orders.length },
  }
}

const handed = (ws = base()) => markHandedOver(ws, 'PO-1', '2026-09-15', 'R. Mehta')
const change = (qty: number, expectedOn = '2026-09-25', reason = 'A customer order grew') =>
  ({ qty, expectedOn, reason, changedBy: 'R. Mehta', on: '2026-09-16' })
const po = (ws: Workspace, id = 'PO-001') => ws.orders.find((o) => o.id === id)!

/* ============================================================ the versions */

describe('handing an order over', () => {
  it('writes version 1, taken as confirmed — the supplier is holding the page', () => {
    const o = po(handed())
    expect(o.state).toBe('confirmed')
    expect(o.revisions).toHaveLength(1)
    expect(o.revisions![0]).toMatchObject({ version: 1, qty: 100, promisedDate: '2026-09-25', kind: 'created' })
    expect(o.notifiedVersion).toBe(1)
    expect(o.ackedVersion).toBe(1)
    expect(syncOf(handed(), o)).toBe('acknowledged')
  })

  it('sending it again unchanged moves nothing', () => {
    const twice = markHandedOver(handed(), 'PO-1', '2026-09-16', 'R. Mehta')
    expect(po(twice).revisions).toHaveLength(1)
    expect(syncOf(twice, po(twice))).toBe('acknowledged')
  })
})

describe('changing an order the supplier holds', () => {
  it('is a new version: our figure moves at once, theirs does not', () => {
    const ws = reviseOrder(handed(), 'PO-001', change(150))
    const o = po(ws)
    expect(o.qty).toBe(150)
    expect(o.revisions!.map((r) => r.version)).toEqual([1, 2])
    expect(o.revisions![1]).toMatchObject({ kind: 'qty', reason: 'A customer order grew' })
    expect(syncOf(ws, o)).toBe('not_told')
    // what will actually arrive is still what they confirmed
    expect(ackedQty(o)).toBe(100)
  })

  it('a date alone is a date change', () => {
    const o = po(reviseOrder(handed(), 'PO-001', change(100, '2026-09-22')))
    expect(o.revisions![1].kind).toBe('date')
    expect(ackedDate(o)).toBe('2026-09-25')
  })

  it('refuses a change that changes nothing, or gives no reason', () => {
    const o = po(handed())
    expect(reviseProblem(o, change(100))).toMatch(/Nothing has changed/)
    expect(reviseProblem(o, change(150, '2026-09-25', ''))).toMatch(/why/)
    expect(reviseProblem(o, change(0))).toMatch(/quantity/)
    // a draft is still ours to edit freely
    expect(reviseProblem(order(), change(150))).toMatch(/not been handed over/)
  })

  it('sending the revised order is the notice: told, and awaiting their confirmation', () => {
    const ws = markHandedOver(reviseOrder(handed(), 'PO-001', change(150)), 'PO-1', '2026-09-17', 'R. Mehta')
    const o = po(ws)
    expect(o.notifiedVersion).toBe(2)
    expect(o.ackedVersion).toBe(1)
    expect(o.notifiedOn).toBe('2026-09-17')
    expect(syncOf(ws, o)).toBe('awaiting_ack')
    expect(ackedQty(o)).toBe(100)
  })

  it('the revised document says what changed since they confirmed, and why', () => {
    const ws = reviseOrder(handed(), 'PO-001', change(150))
    const doc = buildPo(ws, 'PO-1')!
    expect(doc.revision).toMatchObject({ version: 2, reason: 'A customer order grew' })
    expect(doc.revision!.changes[0]).toMatch(/100 kg -> 150 kg/)
    expect(poMessageFor(doc)).toMatch(/REVISED purchase order PO-1 \(rev\. 2\)/)
    expect(poMessageFor(doc)).toMatch(/100 kg → 150 kg/)
    expect(poSubjectFor(doc)).toMatch(/^Revised purchase order PO-1/)
    // an order never changed is an ordinary order
    expect(buildPo(handed(), 'PO-1')!.revision).toBeUndefined()
  })

  it('an order recorded as placed by hand is version 1 already, and its first change is version 2', () => {
    const ws = base([order({ state: 'confirmed' })])
    expect(revisionsOf(po(ws))).toHaveLength(1)
    expect(syncOrders(ws, TODAY)[0].state).toBe('acknowledged')
    const moved = reviseOrder(ws, 'PO-001', change(150))
    const o = po(moved)
    expect(o.revisions!.map((r) => r.version)).toEqual([1, 2])
    expect(o.revisions![0]).toMatchObject({ qty: 100, reason: 'Recorded as placed' })
    expect(o.ackedVersion).toBe(1)
    expect(syncOf(moved, o)).toBe('not_told')
    expect(ackedQty(o)).toBe(100)
  })
})

describe('their confirmation', () => {
  const told = () => markHandedOver(reviseOrder(handed(), 'PO-001', change(150)), 'PO-1', '2026-09-17', 'R. Mehta')

  it('puts the order in sync, against the reference given', () => {
    const ws = recordAck(told(), 'PO-1', { ref: 'WhatsApp from Rakesh, 14:10', on: TODAY })
    const o = po(ws)
    expect(o.ackedVersion).toBe(2)
    expect(o.ackedOn).toBe(TODAY)
    expect(o.ackRef).toBe('WhatsApp from Rakesh, 14:10')
    expect(o.ackImageId).toBeUndefined()
    expect(syncOf(ws, o)).toBe('acknowledged')
    // and now what will arrive is what we asked for
    expect(ackedQty(o)).toBe(150)
  })

  it('keeps a picture of it by id — never the bytes', () => {
    const ws = recordAck(told(), 'PO-1', { ref: '', on: TODAY, imageId: 'ACK-PO-1-x1' })
    expect(po(ws).ackImageId).toBe('ACK-PO-1-x1')
    expect(po(ws).ackRef).toBe('Order handed over')
    expect(ackImageIds(ws)).toEqual(['ACK-PO-1-x1'])
  })

  it('a later confirmation without a picture does not borrow the earlier one', () => {
    const first = recordAck(told(), 'PO-1', { ref: 'photo', on: TODAY, imageId: 'ACK-PO-1-x1' })
    const again = recordAck(
      markHandedOver(reviseOrder(first, 'PO-001', change(180)), 'PO-1', TODAY, 'R. Mehta'),
      'PO-1', { ref: 'phone call with Rakesh', on: TODAY })
    expect(po(again).ackedVersion).toBe(3)
    expect(po(again).ackImageId).toBeUndefined()
    expect(ackImageIds(again)).toEqual([])
  })

  it('confirms the document, so every line on it', () => {
    const two = base([order(), order({ id: 'PO-002', itemId: 'IT-002' })])
    two.items = [material(), material({ id: 'IT-002', code: 'MICA', name: 'Mica sheet' })]
    let ws = markHandedOver(two, 'PO-1', '2026-09-15', 'R. Mehta')
    ws = reviseOrder(ws, 'PO-001', change(150))
    ws = reviseOrder(ws, 'PO-002', change(80))
    // counted as one order waiting, not two lines
    expect(awaitingAckNos(ws)).toEqual(['PO-1'])
    expect(decisionsFor(ws, TODAY).filter((d) => d.kind === 'not-told').map((d) => d.refs.orderNo)).toEqual(['PO-1'])
    ws = recordAck(ws, 'PO-1', { ref: 'email', on: TODAY })
    expect(awaitingAckNos(ws)).toEqual([])
    expect(ws.orders.map((o) => o.ackedVersion)).toEqual([2, 2])
  })
})

/* ================================================= what the desk now counts */

describe('open orders reach the derivation, at what the supplier confirmed', () => {
  it('a draft is not coming — nobody has it', () => {
    expect(bundleFor(base(), TODAY).poLines).toEqual([])
  })

  it('a handed-over order is, at the confirmed quantity and date', () => {
    expect(bundleFor(handed(), TODAY).poLines).toEqual([{
      id: 'PO-001', poNo: 'PO-1', itemId: 'IT-001', qty: 100, promisedDate: '2026-09-25', status: 'open',
    }])
  })

  it('a change the supplier has not confirmed moves nothing', () => {
    const ws = markHandedOver(reviseOrder(handed(), 'PO-001', change(200, '2026-09-22')), 'PO-1', TODAY, 'R. Mehta')
    expect(bundleFor(ws, TODAY).poLines[0]).toMatchObject({ qty: 100, promisedDate: '2026-09-25' })
    const acked = recordAck(ws, 'PO-1', { ref: 'ok', on: TODAY })
    expect(bundleFor(acked, TODAY).poLines[0]).toMatchObject({ qty: 200, promisedDate: '2026-09-22' })
  })

  it('less what has arrived — at the gate is neither stock nor still coming', () => {
    const [ws] = arrive(handed(), { order: po(handed()), qty: 40, receivedOn: '2026-09-17' })
    expect(bundleFor(ws, TODAY).poLines[0].qty).toBe(60)
  })

  it('in transit once shipped, and gone once it has all come', () => {
    const shipped = { ...handed(), orders: handed().orders.map((o) => ({ ...o, state: 'shipped' as const })) }
    expect(bundleFor(shipped, TODAY).poLines[0].status).toBe('in_transit')
    const [open, id] = arrive(handed(), { order: po(handed()), qty: 100, receivedOn: '2026-09-17' })
    const closed = closeReceipt(open, id, { rejected: 0, inspector: 'R. Mehta', closedAt: TODAY })
    expect(bundleFor(closed, TODAY).poLines).toEqual([])
  })

  it('THE POINT: out of cover with no order, covered by the order already placed', () => {
    const none = buildRows(bundleFor(base([]), TODAY), base([]).policy)[0]
    expect(none.status.value).toBe('at_risk')
    expect(none.reorderQty.value).toBeGreaterThan(0)

    const row = buildRows(bundleFor(handed(), TODAY), handed().policy)[0]
    expect(row.openPoQty.value).toBe(100)
    expect(row.truePosition.value).toBe(220)
    expect(row.status.value).toBe('open_po_covers')
    expect(row.reorderQty.value).toBe(0)
  })
})

/* ============================================================== the board */

describe('the inbound board', () => {
  // stock 120 at 10 a day: the line stops on the 30th; two days of inspection
  it('in time: issuable on or before the line stops', () => {
    const [l] = boardLines(handed(), TODAY)
    expect(l).toMatchObject({ arrives: '2026-09-25', issuable: '2026-09-27', stops: '2026-09-30' })
    expect(l.verdict.value).toBe('in_time')
    expect(verdictText(l)).toBe('in time')
    expect(l.verdict.inputs.map((i) => i.name)).toEqual(['arrives', 'issuable', 'line stops'])
  })

  it('tight: it lands before the line stops, but cannot be issued in time', () => {
    const [l] = boardLines(handed(base([order({ expectedOn: '2026-09-29' })])), TODAY)
    expect(l.verdict.value).toBe('tight')
    expect(l.lateBy).toBe(0)
  })

  it('late: it lands after the line has stopped, by so many days', () => {
    const [l] = boardLines(handed(base([order({ expectedOn: '2026-10-04' })])), TODAY)
    expect(l.verdict.value).toBe('late')
    expect(l.lateBy).toBe(4)
    expect(verdictText(l)).toBe('4 days late')
  })

  it('a material nobody uses has no line to stop', () => {
    const ws = handed()
    ws.items = [material({ avgDailyConsumption: 0 })]
    const [l] = boardLines(ws, TODAY)
    expect(l.stops).toBeNull()
    expect(l.verdict.value).toBe('no_line')
    expect(verdictText(l)).toBe('no line to stop')
  })

  it('an order past its date arrives today at the earliest, not in the past', () => {
    const [l] = boardLines(handed(base([order({ expectedOn: '2026-09-10' })])), TODAY)
    expect(l.overdue).toBe(true)
    expect(l.arrives).toBe(TODAY)
  })

  it('the second of two orders counts the first as landing before it', () => {
    const ws = handed(base([
      order(),
      order({ id: 'PO-002', no: 'PO-1', qty: 100, expectedOn: '2026-10-08' }),
    ]))
    const [first, second] = boardLines(ws, TODAY)
    expect(first.stops).toBe('2026-09-30')
    // 120 on the shelf + 100 landing first = 22 days → 10 October
    expect(second.stops).toBe('2026-10-10')
    expect(second.verdict.value).toBe('in_time')
  })

  it('reads the date they confirmed, not a change they have not seen', () => {
    const ws = reviseOrder(handed(), 'PO-001', change(100, '2026-10-05'))
    expect(boardLines(ws, TODAY)[0].arrives).toBe('2026-09-25')
    expect(boardLines(ws, TODAY)[0].inSync).toBe(false)
  })
})

/* ========================================================== the decisions */

describe('what sourcing is asked to do about orders', () => {
  const kinds = (ws: Workspace) => decisionsFor(ws, TODAY).map((d) => d.kind)

  it('nothing, when every order is in sync and in time', () => {
    expect(kinds(handed()).filter((k) => ['not-told', 'awaiting-ack', 'churn', 'lands-late'].includes(k)))
      .toEqual([])
  })

  it('a change nobody sent costs money until it is sent', () => {
    const d = decisionsFor(reviseOrder(handed(), 'PO-001', change(150)), TODAY)
      .find((x) => x.kind === 'not-told')!
    expect(d).toMatchObject({ band: 'costs', act: 'notice', refs: { orderNo: 'PO-1' } })
    // 50 kg the supplier is not making, at ₹800
    expect(d.detail).toMatch(/40,000/)
  })

  it('a notice unanswered is half-finished, then costs once past the days allowed', () => {
    const sent = markHandedOver(reviseOrder(handed(), 'PO-001', change(150)), 'PO-1', '2026-09-17', 'R. Mehta')
    const soon = decisionsFor(sent, TODAY).find((x) => x.kind === 'awaiting-ack')!
    expect(soon).toMatchObject({ band: 'unfinished', act: 'ack', alt: { act: 'notice' } })
    const later = decisionsFor(sent, '2026-09-21').find((x) => x.kind === 'awaiting-ack')!
    expect(later.band).toBe('costs')
    expect(kinds(recordAck(sent, 'PO-1', { ref: 'ok', on: TODAY }))).not.toContain('awaiting-ack')
  })

  it('a line that keeps moving is named, and "noted" holds until it moves again', () => {
    let ws = handed()
    ws = reviseOrder(ws, 'PO-001', change(150))
    ws = reviseOrder(ws, 'PO-001', change(170))
    expect(kinds(ws)).not.toContain('churn')
    ws = reviseOrder(ws, 'PO-001', change(190))
    expect(kinds(ws)).toContain('churn')
    const noted = { ...ws, drafts: { ...ws.drafts, [churnNotedKey('PO-001', 4)]: true } }
    expect(kinds(noted)).not.toContain('churn')
    expect(kinds(reviseOrder(noted, 'PO-001', change(200)))).toContain('churn')
  })

  it('what will not be here in time stops the line — and only that', () => {
    expect(kinds(handed())).not.toContain('lands-late')
    const late = decisionsFor(handed(base([order({ expectedOn: '2026-10-04' })])), TODAY)
      .find((x) => x.kind === 'lands-late')!
    expect(late).toMatchObject({ band: 'stops', act: 'open', alt: { act: 'chase' }, href: '/sourcing/orders' })
    expect(late.detail).toMatch(/4 days late/)
    expect(kinds(handed(base([order({ expectedOn: '2026-10-04' })])))).toContain('lands-late')
    expect(kinds(handed(base([order({ expectedOn: '2026-09-29' })])))).toContain('lands-late')
  })

  it('and none of it is asked of the gate — the answer is a word with the supplier', () => {
    const late = reviseOrder(handed(base([order({ expectedOn: '2026-10-04' })])), 'PO-001', change(150))
    const buyer = ['not-told', 'awaiting-ack', 'churn', 'lands-late']
    expect(decisionsFor(late, TODAY).filter((d) => buyer.includes(d.kind)).length).toBeGreaterThan(1)
    expect(inboundDecisionsFor(late, TODAY).filter((d) => buyer.includes(d.kind))).toEqual([])
  })

  it('keeps a "noted" stored before the card moved', () => {
    expect(churnNotedKey('PO-001', 4)).toBe('inbound.churnNoted.PO-001.4')
  })

  it('and the dashboard card that is not in time says so', () => {
    const [b] = inFlight(handed(base([order({ expectedOn: '2026-10-04' })])), TODAY)
    expect(b.orders[0].verdict).toEqual({ text: 'lands 4 days late', tone: 'critical' })
    expect(inFlight(handed(), TODAY)[0].orders[0].verdict).toBeUndefined()
  })
})

describe('the sync, one card per order', () => {
  it('orders the ones nobody told first, and prices the gap', () => {
    const two = base([order(), order({ id: 'PO-002', no: 'PO-2' })])
    let ws = markHandedOver(markHandedOver(two, 'PO-1', '2026-09-15', 'R. Mehta'), 'PO-2', '2026-09-15', 'R. Mehta')
    ws = reviseOrder(ws, 'PO-002', change(130))
    const cards = syncOrders(ws, TODAY)
    expect(cards.map((c) => [c.no, c.state])).toEqual([['PO-2', 'not_told'], ['PO-1', 'acknowledged']])
    expect(cards[0].exposure).toBe(24000)
    expect(cards[0].lines[0].need.value).toBe(130)
    expect(cards[0].lines[0].making.value).toBe(100)
  })

  it('drafts and finished orders are not on it', () => {
    expect(syncOrders(base(), TODAY)).toEqual([])
    const done = { ...handed(), orders: handed().orders.map((o) => ({ ...o, state: 'delivered' as const })) }
    expect(syncOrders(done, TODAY)).toEqual([])
  })
})
