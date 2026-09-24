/**
 * Material out at jobworkers — and where every unit of it is.
 *
 * The sample company's INB-03 rules, over an owner's own challans: material
 * leaving comes off the usable shelf at once, is never counted as cover while
 * it is away, comes back through the same gate as any delivery, and is always
 * exactly one of five things — back in stock, back at the gate, with the
 * jobworker, allowed process loss, or unaccounted. The ledger names every
 * movement's document and can never disagree with that split.
 */
import { describe, expect, it } from 'vitest'
import { buildRows } from '@/lib/domain/derive'
import { bundleFor } from '@/lib/workspace/bundle'
import { emptyWorkspace } from '@/lib/workspace/defaults'
import { challanRow, challanRows, jobworkerHoldings } from '@/lib/workspace/inbound'
import { inboundDecisionsFor } from '@/lib/workspace/inbound-decisions'
import {
  bookReturn, challanLedger, closeChallan, closeChallanProblem, extendDue, JOBWORKER,
  registerLedger, removeChallan, sendOut, sendOutProblem, usableOnHand, type SendOut,
} from '@/lib/workspace/jobwork'
import { closeReceipt, receiptsFor } from '@/lib/workspace/receipts'
import { dueBackRows, dueInCount } from '@/lib/workspace/due'
import { trail } from '@/lib/workspace/ledger'
import { removeVendor, vendorImpact } from '@/lib/workspace/sourcing'
import type { Item, VendorItem } from '@/lib/domain/types'
import type { Workspace } from '@/lib/workspace/types'

const TODAY = '2026-09-20'

/** 120 kg on the shelf, 2 kg a day. */
const material = (over: Partial<Item> = {}): Item => ({
  id: 'IT-001', code: 'CU', name: 'Copper strip 25 mm', uom: 'kg', itemClass: 'B',
  coverageCeilingMonths: 2, moq: 1, safetyStock: 0, avgDailyConsumption: 2,
  floorConsumptionPerDay: 2, lastPurchaseRate: 800, feeds: [], ...over,
})

const quote: VendorItem = {
  vendorId: 'VN-001', itemId: 'IT-001', rate: 800, freightPerUnit: 0, nonCreditableGst: 0,
  paymentTermCost: 0, rejectionAllowance: 0, quotedLeadTimeDays: 7, trailingLeadTimeDays: 7,
  trailingRejectionRate: 0, onTimePct: 100, score: 0, quoteValidUntil: '2027-01-01',
}

const base = (): Workspace => {
  const ws = emptyWorkspace({
    id: 'WS-1', createdAt: TODAY, ownerName: 'R. Mehta', contact: '',
    companyName: 'Patel Heaters', makes: 'heaters',
  })
  return {
    ...ws,
    items: [material()],
    vendors: [
      { id: 'VN-001', name: 'Shah Metals', paymentTermsDays: 30 },
      { id: 'VN-002', name: 'Shree Laser', paymentTermsDays: 0 },
    ],
    vendorType: { 'VN-002': JOBWORKER },
    vendorItems: [quote],
    stockLots: [{ id: 'LOT-001', itemId: 'IT-001', batchNo: 'OPENING', qty: 120, usability: 'usable', on: '2026-09-01' }],
    // the opening line every lot has, which `migrate` writes on load
    moves: [{
      id: 'MV-OPEN-LOT-001', lotId: 'LOT-001', itemId: 'IT-001', on: '2026-09-01', kind: 'opening',
      qty: 120, source: 'opening', sourceRef: 'before the ledger', actor: 'R. Mehta',
    }],
    nextIds: { ...ws.nextIds, IT: 1, VN: 2 },
  }
}

const out = (over: Partial<SendOut> = {}): SendOut => ({
  vendorId: 'VN-002', itemId: 'IT-001', qty: 50, sentOn: '2026-09-10', dueBack: '2026-09-24',
  expectedYield: 0.95, process: 'Laser cutting', ...over,
})

const sent = (over: Partial<SendOut> = {}) => sendOut(base(), out(over))

/** send 50, 45 back and inspected clean */
const backClean = (over: Partial<SendOut> = {}) => {
  const [ws, jw] = sent(over)
  const [w2, gr] = bookReturn(ws, jw, { qty: 45, receivedOn: '2026-09-18' })
  return { ws: closeReceipt(w2, gr, { rejected: 0, inspector: 'R. Mehta', closedAt: '2026-09-18' }), jw, gr }
}

const parts = (ws: Workspace, id: string, today = TODAY) => {
  const r = challanRow(ws, (ws.challans ?? []).find((c) => c.id === id)!, today)
  const a = r.acct
  return {
    returned: a.returned.value, inQc: a.inQc.value, atVendor: a.atVendor.value,
    loss: a.processLoss.value, unaccounted: a.unaccounted.value,
    sum: Math.round((a.returned.value + a.inQc.value + a.atVendor.value + a.processLoss.value + a.unaccounted.value) * 1000) / 1000,
  }
}

/* ============================================================ sending out */

describe('material leaving for a jobworker', () => {
  it('writes the challan, valued at what was last paid, and takes it off the usable shelf', () => {
    const [ws, id] = sent()
    expect(id).toBe('JW-001')
    expect(ws.challans[0]).toMatchObject({
      no: 'JW-1', vendorId: 'VN-002', qtySent: 50, rate: 800, status: 'out', process: 'Laser cutting',
    })
    // off the lot it actually left, as a line in the journal named for the challan
    expect(ws.stockLots.find((l) => l.id === 'LOT-JW-001')).toBeUndefined()
    expect(ws.stockLots.find((l) => l.id === 'LOT-001')!.qty).toBe(70)
    expect(ws.moves.slice(1)).toEqual([expect.objectContaining({
      lotId: 'LOT-001', kind: 'jobwork_out', qty: -50, source: 'challan', sourceRef: 'JW-1',
      note: 'to Shree Laser',
    })])
    expect(usableOnHand(ws, 'IT-001')).toBe(70)
  })

  it('the desk counts only what is on the shelf — material at a jobworker is never cover', () => {
    const [ws] = sent()
    const row = buildRows(bundleFor(ws, TODAY), ws.policy)[0]
    expect(row.usable.value).toBe(70)
    expect(row.truePosition.value).toBe(70)
    expect(row.nonUsable.value).toBe(0)
    expect(row.coverDays.value).toBe(35)
    // and the lot it came off says why it is lighter
    expect(trail(ws, 'LOT-001').map((t) => [t.what, t.doc, t.balance]))
      .toContainEqual(['Out to jobwork', 'JW-1', 70])
  })

  it('refuses more than is usable on the shelf', () => {
    expect(sendOutProblem(base(), out({ qty: 121 }))).toMatch(/Only 120/)
    const [ws, id] = sendOut(base(), out({ qty: 121 }))
    expect(id).toBe('')
    expect(ws.challans).toEqual([])
  })

  it('refuses a return date before it left, and a yield that is not one', () => {
    expect(sendOutProblem(base(), out({ dueBack: '2026-09-01' }))).toMatch(/promised it back/)
    expect(sendOutProblem(base(), out({ expectedYield: 0 }))).toMatch(/percentage/)
  })
})

/* ============================================================== coming back */

describe('material coming back', () => {
  it('arrives at the gate against the challan — not on the shelf', () => {
    const [ws, jw] = sent()
    const [w2, gr] = bookReturn(ws, jw, { qty: 45, receivedOn: '2026-09-18' })
    const r = w2.receipts.find((x) => x.id === gr)!
    expect(r).toMatchObject({ challanId: 'JW-001', status: 'open', accepted: 0, orderedOn: '2026-09-10' })
    expect(r.orderId).toBeUndefined()
    expect(r.expectedOn).toBeUndefined()
    expect(usableOnHand(w2, 'IT-001')).toBe(70)
    // a jobworker's turnaround is not a supplier's lead time
    expect(bundleFor(w2, TODAY).receipts).toEqual([])
    expect(receiptsFor(w2, 'VN-002', 'IT-001')).toEqual([])
  })

  it('inspected, it is stock again', () => {
    const { ws } = backClean()
    expect(usableOnHand(ws, 'IT-001')).toBe(115)
    expect(ws.stockLots.find((l) => l.id === 'LOT-GR-001')?.batchNo).toMatch(/^JW-1\//)
  })

  it('refuses a return dated before the material left, or of nothing', () => {
    const [ws, jw] = sent()
    expect(bookReturn(ws, jw, { qty: 45, receivedOn: '2026-09-01' })[1]).toBe('')
    expect(bookReturn(ws, jw, { qty: 0, receivedOn: TODAY })[1]).toBe('')
  })
})

/* ============================================================ the split */

describe('every unit that left is one of five things', () => {
  it('sums to what was sent at every stage', () => {
    const [a, jw] = sent()
    expect(parts(a, jw)).toMatchObject({ atVendor: 50, sum: 50 })
    const [b, gr] = bookReturn(a, jw, { qty: 45, receivedOn: '2026-09-18' })
    expect(parts(b, jw)).toMatchObject({ inQc: 45, atVendor: 5, sum: 50 })
    const c = closeReceipt(b, gr, { rejected: 0, inspector: 'R. Mehta', closedAt: '2026-09-18' })
    expect(parts(c, jw)).toMatchObject({ returned: 45, atVendor: 5, sum: 50 })
  })

  it('inside its date, nothing is unaccounted — it is at the jobworker', () => {
    const { ws, jw } = backClean()
    expect(parts(ws, jw)).toMatchObject({ atVendor: 5, loss: 0, unaccounted: 0 })
  })

  it('overdue with something back, it settles: the allowed loss, then the unexplained', () => {
    const { ws, jw } = backClean({ dueBack: '2026-09-15', expectedYield: 0.98 })
    // 50 sent, 45 back: 1 kg is the 2% the cut allows, 4 kg nobody can explain
    expect(parts(ws, jw)).toMatchObject({ returned: 45, atVendor: 0, loss: 1, unaccounted: 4, sum: 50 })
  })
})

/* ======================================================== dates and closing */

describe('a new date, and settling up', () => {
  it('a re-agreed date is a line of its own — every one of them kept', () => {
    const [ws, jw] = sent()
    const once = extendDue(ws, jw, { to: '2026-09-28', reason: 'Plating line down', on: '2026-09-22' })
    const twice = extendDue(once, jw, { to: '2026-10-02', reason: 'Power cut all week', on: '2026-09-27' })
    const c = twice.challans[0]
    expect(c.dueBack).toBe('2026-10-02')
    expect(c.extensions).toEqual([
      { from: '2026-09-24', to: '2026-09-28', on: '2026-09-22', reason: 'Plating line down' },
      { from: '2026-09-28', to: '2026-10-02', on: '2026-09-27', reason: 'Power cut all week' },
    ])
    // an earlier date, or no reason, changes nothing
    expect(extendDue(ws, jw, { to: '2026-09-20', reason: 'sooner', on: TODAY })).toBe(ws)
    expect(extendDue(ws, jw, { to: '2026-09-30', reason: '', on: TODAY })).toBe(ws)
  })

  it('closes against a written reason, recording what it writes off', () => {
    const { ws, jw } = backClean({ dueBack: '2026-09-15', expectedYield: 0.98 })
    expect(closeChallanProblem(ws, jw, '')).toMatch(/written reason/)
    const closed = closeChallan(ws, jw, { reason: 'Agreed as scrap', on: TODAY, unaccounted: 4 })
    expect(closed.challans[0]).toMatchObject({ status: 'closed', closedOn: TODAY, closeReason: 'Agreed as scrap', writtenOff: 4 })
    // nothing moves on the shelf — the material left the day it went out
    expect(usableOnHand(closed, 'IT-001')).toBe(usableOnHand(ws, 'IT-001'))
    expect(parts(closed, jw)).toMatchObject({ atVendor: 0, unaccounted: 4, sum: 50 })
  })

  it('will not close over a return still at the gate', () => {
    const [ws, jw] = sent()
    const [w2] = bookReturn(ws, jw, { qty: 45, receivedOn: '2026-09-18' })
    expect(closeChallanProblem(w2, jw, 'All back')).toMatch(/still at the gate/)
    expect(closeChallan(w2, jw, { reason: 'All back', on: TODAY, unaccounted: 0 })).toBe(w2)
  })

  it('can be taken back while nothing has returned — and not after', () => {
    const [ws, jw] = sent()
    const gone = removeChallan(ws, jw)
    expect(gone.challans).toEqual([])
    expect(usableOnHand(gone, 'IT-001')).toBe(120)
    const { ws: back } = backClean()
    expect(removeChallan(back, 'JW-001')).toBe(back)
  })
})

/* ============================================================== the ledger */

describe('the ledger', () => {
  it('names every movement and its document, with what was still out after each', () => {
    const { ws, jw, gr } = backClean({ dueBack: '2026-09-15', expectedYield: 0.98 })
    const extended = extendDue(ws, jw, { to: '2026-09-19', reason: 'Last 5 kg on Friday', on: '2026-09-19' })
    // before it closes, the ledger's balance is the split's outstanding
    const open = challanLedger(extended, jw)
    const p = parts(extended, jw, TODAY)
    expect(open[open.length - 1].stillOut).toBe(Math.round((p.atVendor + p.loss + p.unaccounted) * 1000) / 1000)

    const closed = closeChallan(extended, jw, { reason: 'Agreed as scrap', on: TODAY, unaccounted: 4 })
    const book = challanLedger(closed, jw)
    expect(book.map((e) => e.kind)).toEqual(['sent', 'returned', 'extended', 'closed'])
    expect(book.map((e) => e.doc)).toEqual(['JW-1', gr, 'JW-1', 'JW-1'])
    expect(book.map((e) => e.stillOut)).toEqual([50, 5, 5, 0])
    expect(book[1].note).toMatch(/accepted 45/)
    expect(book[2].note).toMatch(/2026-09-15 → 2026-09-19/)
    expect(book[3]).toMatchObject({ qty: 4 })
    expect(book[3].note).toMatch(/4 kg written off/)
  })

  it('a return at the gate is off the jobworker’s hands; one rejected is still owed', () => {
    const [ws, jw] = sent()
    const [w2, gr] = bookReturn(ws, jw, { qty: 45, receivedOn: '2026-09-18' })
    expect(challanLedger(w2, jw)[1]).toMatchObject({ stillOut: 5 })
    expect(challanLedger(w2, jw)[1].note).toMatch(/at the gate/)
    const w3 = closeReceipt(w2, gr, { rejected: 5, reason: 'Burrs on the edge', inspector: 'R. Mehta', closedAt: '2026-09-18' })
    expect(challanLedger(w3, jw)[1].stillOut).toBe(10)
    expect(parts(w3, jw)).toMatchObject({ returned: 40, atVendor: 10, sum: 50 })
  })

  it('the book is every challan, newest first', () => {
    const [a] = sent()
    const [b] = sendOut(a, out({ qty: 20, sentOn: '2026-09-15', dueBack: '2026-09-30' }))
    const book = registerLedger(b)
    expect(book.map((e) => [e.challanNo, e.on])).toEqual([['JW-2', '2026-09-15'], ['JW-1', '2026-09-10']])
    expect(book[0]).toMatchObject({ jobworker: 'Shree Laser', item: 'Copper strip 25 mm' })
  })
})

/* ========================================================== the decisions */

describe('what the gate is asked about jobwork', () => {
  const kinds = (ws: Workspace, today = TODAY) => inboundDecisionsFor(ws, today).map((d) => d.kind)

  it('nothing, while it is inside its date', () => {
    expect(kinds(sent()[0])).toEqual([])
  })

  it('past its date, a chase — in the worst band', () => {
    const [ws] = sent({ dueBack: '2026-09-15' })
    const d = inboundDecisionsFor(ws, TODAY).find((x) => x.kind === 'challan-overdue')!
    expect(d).toMatchObject({ band: 'stops', act: 'chase', alt: { act: 'return' }, refs: { challanId: 'JW-001' } })
    expect(d.detail).toMatch(/50 kg .* 5 days past/)
    expect(challanRows(ws, TODAY)[0].chase).toMatch(/Still with you: 50 kg/)
  })

  it('settling with material unexplained, a close', () => {
    const { ws } = backClean({ dueBack: '2026-09-15', expectedYield: 0.98 })
    const d = inboundDecisionsFor(ws, TODAY).find((x) => x.kind === 'challan-unaccounted')!
    expect(d).toMatchObject({ band: 'costs', act: 'close-challan' })
    expect(d.detail).toMatch(/4 kg/)
    const closed = closeChallan(ws, 'JW-001', { reason: 'Agreed as scrap', on: TODAY, unaccounted: 4 })
    expect(kinds(closed)).not.toContain('challan-unaccounted')
    expect(kinds(closed)).not.toContain('challan-overdue')
  })

  it('a jobworker holding more than the ceiling', () => {
    const [ws] = sent()
    expect(jobworkerHoldings(ws, TODAY)[0].held.value).toBe(40000)
    expect(kinds(ws)).not.toContain('over-ceiling')
    const tight = { ...ws, policy: { ...ws.policy, jobworkerExposureCeiling: 30000 } }
    expect(kinds(tight)).toContain('over-ceiling')
  })
})

describe('what the gate expects back', () => {
  it('lists what should still come back, at the yield agreed', () => {
    const [ws] = sent()
    const [d] = dueBackRows(ws, TODAY)
    // 50 kg sent at 95 in 100
    expect(d).toMatchObject({ left: 47.5, overdue: false })
    expect(d.row.challan.no).toBe('JW-1')
  })

  it('counts it on the gate\'s badge once its day has come', () => {
    expect(dueInCount(sent()[0], TODAY)).toBe(0)
    expect(dueInCount(sent({ dueBack: TODAY })[0], TODAY)).toBe(1)
    const [late] = sent({ dueBack: '2026-09-15' })
    expect(dueBackRows(late, TODAY)[0].overdue).toBe(true)
    expect(dueInCount(late, TODAY)).toBe(1)
  })

  it('stops expecting what is back at the gate or on the shelf', () => {
    const [ws, jw] = sent({ dueBack: '2026-09-15' })
    const [atGate] = bookReturn(ws, jw, { qty: 47.5, receivedOn: '2026-09-18' })
    expect(dueBackRows(atGate, TODAY)).toEqual([])
    expect(dueInCount(atGate, TODAY)).toBe(0)
    expect(dueBackRows(backClean().ws, TODAY).map((d) => d.left)).toEqual([2.5])
  })
})

describe('deleting a jobworker', () => {
  it('says what goes with them, and leaves the material off the shelf', () => {
    const [ws] = sent()
    expect(vendorImpact(ws, 'VN-002').losses.join(' | ')).toMatch(/1 jobwork challan/)
    const gone = removeVendor(ws, 'VN-002')
    expect(gone.challans).toEqual([])
    expect(usableOnHand(gone, 'IT-001')).toBe(70)
  })
})
