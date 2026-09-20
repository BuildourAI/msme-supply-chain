/**
 * The sourcing desk's records, proved before a screen exists.
 *
 * The claim under test is that three loosely joined records behave when a real
 * owner uses them out of order — a quote with no request behind it, an order
 * with no quote, a supplier deleted halfway through. The screens are then free
 * to be what the reference portal is: a table and nothing else.
 */
import { describe, expect, it } from 'vitest'
import { emptyWorkspace } from '@/lib/workspace/defaults'
import { parseStored } from '@/lib/workspace/storage'
import { sourcingNav } from '@/lib/workspace/reveal'
import { quoteState } from '@/lib/workspace/types'
import type { PurchaseOrder, Quote, QuoteLine, Rfq, Workspace } from '@/lib/workspace/types'
import type { Item, Vendor, VendorItem } from '@/lib/domain/types'
import {
  acceptAll, acceptLine, addDays, draftOrderFrom, itemImpact, materialRows, nextNo,
  orderFromQuote, orderRows, quoteGroups, rejectLine, removeItem, removeQuote, removeRfq,
  removeVendor, rfqRows, rfqStateFrom, supplierRows, syncRfqStates, unorderedLines,
  vendorImpact,
} from '@/lib/workspace/sourcing'

const TODAY = '2026-09-18'

const fresh = (): Workspace => emptyWorkspace({
  id: 'WS-1', createdAt: TODAY,
  ownerName: 'R. Mehta', contact: '', companyName: 'Patel Heaters', makes: '',
})

const item = (over: Partial<Item> = {}): Item => ({
  id: 'IT-001', code: 'COPPER', name: 'Copper strip 25 mm', uom: 'kg', itemClass: 'B',
  coverageCeilingMonths: 2, moq: 100, safetyStock: 50,
  avgDailyConsumption: 10, floorConsumptionPerDay: 10,
  lastPurchaseRate: 800, feeds: [], ...over,
})

const vendor = (over: Partial<Vendor> = {}): Vendor => ({
  id: 'VN-001', name: 'Shah Metals', paymentTermsDays: 30, ...over,
})

const rate = (over: Partial<VendorItem> = {}): VendorItem => ({
  vendorId: 'VN-001', itemId: 'IT-001', rate: 800,
  freightPerUnit: 0, nonCreditableGst: 0, paymentTermCost: 0, rejectionAllowance: 0,
  quotedLeadTimeDays: 12, trailingLeadTimeDays: 12, trailingRejectionRate: 0,
  onTimePct: 0, score: 0, quoteValidUntil: '', ...over,
})

const rfq = (over: Partial<Rfq> = {}): Rfq => ({
  id: 'RF-001', no: 'RFQ-1', itemId: 'IT-001', qty: 500, neededBy: '2026-10-01',
  vendorIds: ['VN-001'], state: 'sent', raisedOn: TODAY, ...over,
})

/**
 * One price on a quotation. Its id is quotation-scoped the way a document's
 * lines are — `QT-001/1` — so a screen can hang a column off a line.
 */
const line = (over: Partial<QuoteLine> = {}): QuoteLine => ({
  id: 'QT-001/1', itemId: 'IT-001', unitPrice: 780, moq: 200, leadDays: 10,
  state: 'received', ...over,
})

/** A quotation: one supplier, one date, and the prices they wrote on it. */
const quote = (over: Partial<Quote> = {}): Quote => ({
  id: 'QT-001', rfqId: 'RF-001', vendorId: 'VN-001', on: TODAY,
  lines: [line()], ...over,
})

const order = (over: Partial<PurchaseOrder> = {}): PurchaseOrder => ({
  id: 'PO-001', no: 'PO-1', vendorId: 'VN-001', itemId: 'IT-001',
  qty: 500, unitPrice: 800, orderedOn: TODAY, expectedOn: '2026-09-30',
  state: 'confirmed', ...over,
})

/** A company with one of everything, joined up. */
function setUp(): Workspace {
  const ws = fresh()
  ws.items = [item()]
  ws.vendors = [vendor()]
  ws.vendorItems = [rate()]
  ws.itemGroup = { 'IT-001': 'Raw material' }
  ws.vendorType = { 'VN-001': 'Raw material' }
  return ws
}

describe('document numbering', () => {
  it('counts up from nothing', () => {
    expect(nextNo('RFQ', [])).toBe('RFQ-1')
    expect(nextNo('PO', [{ no: 'PO-1' }])).toBe('PO-2')
  })

  it('never reissues a deleted number', () => {
    // RFQ-2 was raised and deleted. Reissuing it would attach last month's
    // quotes to a different request.
    expect(nextNo('RFQ', [{ no: 'RFQ-1' }, { no: 'RFQ-3' }])).toBe('RFQ-4')
  })

  it('ignores numbers belonging to another kind of document', () => {
    expect(nextNo('PO', [{ no: 'RFQ-9' }, { no: 'PO-2' }])).toBe('PO-3')
  })
})

describe('what each screen shows', () => {
  it('a supplier row counts what they supply and what is outstanding', () => {
    const ws = setUp()
    ws.orders = [order(), order({ id: 'PO-002', no: 'PO-2', state: 'delivered' })]
    const [row] = supplierRows(ws)
    expect(row.vendor.name).toBe('Shah Metals')
    expect(row.type).toBe('Raw material')
    expect(row.supplies).toBe(1)
    expect(row.leadDays).toBe(12)
    // delivered is not outstanding
    expect(row.openOrders).toBe(1)
  })

  it('a supplier with no rates yet shows no lead time rather than zero', () => {
    const ws = setUp()
    ws.vendorItems = []
    expect(supplierRows(ws)[0].leadDays).toBeNull()
  })

  it('a material row shows what is usable, never what is on hold', () => {
    const ws = setUp()
    ws.stockLots = [
      { id: 'L1', itemId: 'IT-001', batchNo: 'OPENING', qty: 120, usability: 'usable' },
      { id: 'L2', itemId: 'IT-001', batchNo: 'HOLD', qty: 40, usability: 'qc_hold' },
    ]
    const [row] = materialRows(ws)
    expect(row.onHand).toBe(120)
    expect(row.suppliers).toBe(1)
    expect(row.group).toBe('Raw material')
  })

  it('an order row carries its own total', () => {
    const ws = setUp()
    ws.orders = [order({ qty: 500, unitPrice: 780 })]
    expect(orderRows(ws)[0].total).toBe(390000)
  })

  it('newest first on every transaction screen', () => {
    const ws = setUp()
    ws.rfqs = [rfq({ id: 'a', no: 'RFQ-1', raisedOn: '2026-09-01' }),
      rfq({ id: 'b', no: 'RFQ-2', raisedOn: '2026-09-10' })]
    ws.orders = [order({ id: 'a', no: 'PO-1', orderedOn: '2026-09-01' }),
      order({ id: 'b', no: 'PO-2', orderedOn: '2026-09-10' })]
    expect(rfqRows(ws).map((r) => r.rfq.no)).toEqual(['RFQ-2', 'RFQ-1'])
    expect(orderRows(ws).map((r) => r.order.no)).toEqual(['PO-2', 'PO-1'])
  })
})

describe('records that arrive out of order', () => {
  it('a quote with no request behind it is kept, and grouped on its own', () => {
    const ws = setUp()
    ws.quotes = [quote({ rfqId: undefined })]
    const groups = quoteGroups(ws)
    expect(groups).toHaveLength(1)
    expect(groups[0].rfq).toBeNull()
    expect(groups[0].rows[0].lines[0].line.unitPrice).toBe(780)
  })

  it('an order with no quote behind it is a normal order', () => {
    const ws = setUp()
    ws.orders = [order({ quoteId: undefined })]
    expect(orderRows(ws)).toHaveLength(1)
    expect(orderRows(ws)[0].vendor?.name).toBe('Shah Metals')
  })

  it('groups quotes under the request they answer', () => {
    const ws = setUp()
    ws.rfqs = [rfq()]
    ws.quotes = [quote(), quote({ id: 'QT-002', rfqId: undefined })]
    const groups = quoteGroups(ws)
    expect(groups.map((g) => g.rfq?.no ?? null)).toEqual(['RFQ-1', null])
  })
})

describe('a request moves on by itself', () => {
  it('is sent until a quote arrives, then quoted, then awarded', () => {
    expect(rfqStateFrom(rfq(), [])).toBe('sent')
    expect(rfqStateFrom(rfq(), [quote()])).toBe('quoted')
    expect(rfqStateFrom(rfq(), [quote({ lines: [line({ state: 'accepted' })] })])).toBe('awarded')
  })

  it('leaves alone the two states a person decides', () => {
    // a request deliberately closed does not reopen because a late quote landed
    expect(rfqStateFrom(rfq({ state: 'closed' }), [quote()])).toBe('closed')
    expect(rfqStateFrom(rfq({ state: 'draft' }), [quote()])).toBe('draft')
  })

  it('syncing is a no-op when nothing moved', () => {
    const ws = setUp()
    ws.rfqs = [rfq()]
    expect(syncRfqStates(ws)).toBe(ws)
  })
})

describe('accepting a quote', () => {
  const base = () => {
    const ws = setUp()
    ws.vendors = [vendor(), vendor({ id: 'VN-002', name: 'Bombay Metals' })]
    ws.rfqs = [rfq({ vendorIds: ['VN-001', 'VN-002'] })]
    ws.quotes = [quote(), quote({
      id: 'QT-002', vendorId: 'VN-002', lines: [line({ id: 'QT-002/1', unitPrice: 810 })],
    })]
    return ws
  }

  const stateOf = (ws: Workspace, id: string) =>
    ws.quotes.find((q) => q.id === id)?.lines[0].state

  it('rejects the others on the same request — a request has one winner', () => {
    const ws = acceptLine(base(), 'QT-001', 'QT-001/1')
    expect(stateOf(ws, 'QT-001')).toBe('accepted')
    // the loser is left as received rather than silently rejected...
    expect(stateOf(ws, 'QT-002')).toBe('received')
    // ...and accepting the second one demotes the first
    const again = acceptLine(ws, 'QT-002', 'QT-002/1')
    expect(stateOf(again, 'QT-001')).toBe('rejected')
    expect(stateOf(again, 'QT-002')).toBe('accepted')
  })

  it('moves the request to awarded', () => {
    expect(acceptLine(base(), 'QT-001', 'QT-001/1').rfqs[0].state).toBe('awarded')
  })

  /*
   * What accepting actually does, and did not until quotations started
   * arriving as quotes. Flipping a pill was the whole of it: a price somebody
   * had agreed to never reached the supplier's rate, so it never reached the
   * landed-cost comparison or the figure the order form suggests. The quote
   * was a note in a different notebook.
   */
  it('writes the price as that supplier\'s rate', () => {
    const ws = acceptLine(base(), 'QT-001', 'QT-001/1')
    const vi = ws.vendorItems.find((x) => x.vendorId === 'VN-001' && x.itemId === 'IT-001')
    expect(vi?.rate).toBe(780)
    expect(vi?.quotedLeadTimeDays).toBe(10)
  })

  it('and keeps everything that pairing had already measured', () => {
    const ws = base()
    ws.vendorItems = [rate({ rate: 800, trailingLeadTimeDays: 14, freightPerUnit: 55, onTimePct: 91 })]
    const after = acceptLine(ws, 'QT-001', 'QT-001/1')
    const vi = after.vendorItems[0]

    expect(vi.rate).toBe(780)
    expect(vi.trailingLeadTimeDays).toBe(14)
    expect(vi.freightPerUnit).toBe(55)
    expect(vi.onTimePct).toBe(91)
  })

  it('fills the valuation basis for a material nobody had bought', () => {
    // §13-1 — a material left at zero values the stock, and every screen
    // that sums it, at nothing
    const ws = base()
    ws.items = [item({ lastPurchaseRate: 0 })]
    expect(acceptLine(ws, 'QT-001', 'QT-001/1').items[0].lastPurchaseRate).toBe(780)
  })

  it('and never overwrites one that has been bought for real', () => {
    const ws = base()
    ws.items = [item({ lastPurchaseRate: 800 })]
    expect(acceptLine(ws, 'QT-001', 'QT-001/1').items[0].lastPurchaseRate).toBe(800)
  })

  it('does not put the supplier\'s minimum onto the material', () => {
    /*
     * `Quote.moq` is the floor they will sell at; `Item.moq` is how this
     * factory orders. Reading one as the other would quietly change a
     * reorder quantity on the strength of somebody else's sales policy.
     */
    const ws = base()
    const before = ws.items[0].moq
    expect(acceptLine(ws, 'QT-001', 'QT-001/1').items[0].moq).toBe(before)
  })

  it('and reprices the rivals on that material', () => {
    // a rate arriving changes what every competitor's payment terms cost
    const ws = base()
    ws.policy = { ...ws.policy, costOfMoneyPct: 12 }
    ws.vendors = [vendor(), vendor({ id: 'VN-002', name: 'Cash only', paymentTermsDays: 0 })]
    ws.vendorItems = [rate({ vendorId: 'VN-002', rate: 800 })]

    const after = acceptLine(ws, 'QT-001', 'QT-001/1')
    // VN-001 gives 30 days, VN-002 none — so VN-002's credit now costs something
    expect(after.vendorItems.find((v) => v.vendorId === 'VN-002')!.paymentTermCost).toBeGreaterThan(0)
    expect(after.vendorItems.find((v) => v.vendorId === 'VN-001')!.paymentTermCost).toBe(0)
  })

  it('orders what was asked for, not the supplier’s minimum', () => {
    const ws = base()                       // the request asks for 500
    expect(orderFromQuote(ws, ws.quotes[0], ws.quotes[0].lines[0], TODAY).qty).toBe(500)
  })

  it('takes the minimum when it is larger than what was asked', () => {
    const ws = base()
    ws.quotes = [quote({ lines: [line({ moq: 900 })] })]
    expect(orderFromQuote(ws, ws.quotes[0], ws.quotes[0].lines[0], TODAY).qty).toBe(900)
  })

  it('falls back to the minimum when no request is behind it', () => {
    const ws = base()
    ws.quotes = [quote({ rfqId: undefined, lines: [line({ moq: 200 })] })]
    expect(orderFromQuote(ws, ws.quotes[0], ws.quotes[0].lines[0], TODAY).qty).toBe(200)
  })

  it('does not invent a quantity when there is nothing to take one from', () => {
    // a quote with no request and no minimum used to draft an order for 0,
    // which prices at nothing and reads as a bug
    const ws = base()
    ws.rfqs = []
    ws.quotes = [quote({ rfqId: undefined, lines: [line({ moq: 0 })] })]
    const draft = orderFromQuote(ws, ws.quotes[0], ws.quotes[0].lines[0], TODAY)
    expect(draft.qty).toBe(0)
    expect(draft.unitPrice).toBe(780)
  })

  it('fills an order with the quote’s own figures, as a draft', () => {
    const ws = base()
    const draft = orderFromQuote(ws, ws.quotes[0], ws.quotes[0].lines[0], TODAY)
    expect(draft.no).toBe('PO-1')
    expect(draft.unitPrice).toBe(780)
    expect(draft.expectedOn).toBe(addDays(TODAY, 10))
    // §11 — the system drafts, a person places it
    expect(draft.state).toBe('draft')
    expect(draft.quoteId).toBe('QT-001')
  })

  it('does not place the order itself', () => {
    const ws = acceptLine(base(), 'QT-001', 'QT-001/1')
    expect(ws.orders).toEqual([])
  })

  it('and does not un-mark the supplier somebody called their usual one', () => {
    /*
     * Accepting rebuilds the rate, and the rebuild used to drop `isPreferred`
     * because this route never passes it. That flag is what `derive.ts` reads
     * to decide which supplier a material is currently ON — the baseline the
     * landed-cost flip is measured against — so taking a price from your usual
     * supplier moved the comparison as a side effect.
     */
    const ws = base()
    ws.vendorItems = [rate({ isPreferred: true })]
    expect(acceptLine(ws, 'QT-001', 'QT-001/1').vendorItems[0].isPreferred).toBe(true)
  })
})

/* ================================ three prices agreed is one order, not three */

/**
 * What the supplier receives.
 *
 * Taking three prices off a five-line quotation used to make three purchase
 * orders, which meant three numbers, three documents and three messages to the
 * same person about the same quotation. Nothing else in the build worked that
 * way: `OrderForm` issues one number and gives it to every line, `buildPo`
 * renders by number, and handing it over confirms by number.
 */
describe('drafting an order off a quotation', () => {
  const fiveLines = () => {
    const ws = setUp()
    ws.items = [
      item(),
      item({ id: 'IT-002', code: 'GLAND', name: 'Brass gland' }),
      item({ id: 'IT-003', code: 'ROCK', name: 'Rockwool' }),
    ]
    ws.rfqs = []
    ws.quotes = [quote({
      rfqId: undefined,
      lines: [
        line({ id: 'QT-001/1', itemId: 'IT-001', unitPrice: 780, moq: 200, leadDays: 7 }),
        line({ id: 'QT-001/2', itemId: 'IT-002', unitPrice: 46, moq: 100, leadDays: 21 }),
        line({ id: 'QT-001/3', itemId: 'IT-003', unitPrice: 164, moq: 50, leadDays: 10 }),
      ],
    })]
    return ws
  }

  /** take the first and the third, leave the second */
  const twoTaken = () => {
    let ws = acceptLine(fiveLines(), 'QT-001', 'QT-001/1')
    ws = acceptLine(ws, 'QT-001', 'QT-001/3')
    return ws
  }

  it('puts every price you took on one order', () => {
    const ws = draftOrderFrom(twoTaken(), 'QT-001', TODAY)
    expect(ws.orders).toHaveLength(2)
    expect(new Set(ws.orders.map((o) => o.no)).size).toBe(1)
    expect(ws.orders.map((o) => o.itemId)).toEqual(['IT-001', 'IT-003'])
  })

  it('and leaves out the price you did not take', () => {
    const ws = draftOrderFrom(twoTaken(), 'QT-001', TODAY)
    expect(ws.orders.some((o) => o.itemId === 'IT-002')).toBe(false)
  })

  it('every line a draft, because §11 says a person places it', () => {
    const ws = draftOrderFrom(twoTaken(), 'QT-001', TODAY)
    expect(ws.orders.every((o) => o.state === 'draft')).toBe(true)
  })

  it('each keeping its own quantity, rate and delivery date', () => {
    // the lead times differ — 7 days against 10 — and each line keeps its own.
    // `buildPo` heads the page with the latest, which is its business.
    const ws = draftOrderFrom(twoTaken(), 'QT-001', TODAY)
    expect(ws.orders.map((o) => o.unitPrice)).toEqual([780, 164])
    expect(ws.orders.map((o) => o.qty)).toEqual([200, 50])
    expect(ws.orders.map((o) => o.expectedOn)).toEqual([addDays(TODAY, 7), addDays(TODAY, 10)])
  })

  it('remembers which price each line came from', () => {
    const ws = draftOrderFrom(twoTaken(), 'QT-001', TODAY)
    expect(ws.orders.map((o) => o.quoteLineId)).toEqual(['QT-001/1', 'QT-001/3'])
    expect(ws.orders.every((o) => o.quoteId === 'QT-001')).toBe(true)
  })

  it('does not order the same price twice', () => {
    // the button is still there while other prices are unordered, and pressing
    // it again must not re-order what is already on the page
    const once = draftOrderFrom(twoTaken(), 'QT-001', TODAY)
    const twice = draftOrderFrom(once, 'QT-001', TODAY)
    expect(twice.orders).toHaveLength(2)
  })

  it('and has nothing to draft when nothing was accepted', () => {
    const ws = fiveLines()
    expect(draftOrderFrom(ws, 'QT-001', TODAY).orders).toEqual([])
  })

  it('accepting more afterwards joins the order still sitting in draft', () => {
    let ws = draftOrderFrom(twoTaken(), 'QT-001', TODAY)
    ws = acceptLine(ws, 'QT-001', 'QT-001/2')
    ws = draftOrderFrom(ws, 'QT-001', TODAY)

    expect(ws.orders).toHaveLength(3)
    expect(new Set(ws.orders.map((o) => o.no)).size).toBe(1)
  })

  it('but starts a new one once the first has been handed over', () => {
    /*
     * A confirmed order is one the supplier is holding. Appending to it
     * silently would leave them with a page that no longer says what you
     * think it says.
     */
    let ws = draftOrderFrom(twoTaken(), 'QT-001', TODAY)
    ws = { ...ws, orders: ws.orders.map((o) => ({ ...o, state: 'confirmed' as const })) }
    ws = acceptLine(ws, 'QT-001', 'QT-001/2')
    ws = draftOrderFrom(ws, 'QT-001', TODAY)

    expect(ws.orders).toHaveLength(3)
    expect(new Set(ws.orders.map((o) => o.no)).size).toBe(2)
  })

  it('a cancelled line is not an ordered one', () => {
    // calling an order off is how you undo it; the price is still agreed
    let ws = draftOrderFrom(twoTaken(), 'QT-001', TODAY)
    ws = { ...ws, orders: ws.orders.map((o) => ({ ...o, state: 'cancelled' as const })) }
    expect(unorderedLines(ws.orders, ws.quotes[0]).map((l) => l.id))
      .toEqual(['QT-001/1', 'QT-001/3'])
  })

  it('counts as ONE open order in the rail, not one per line', () => {
    /*
     * The badge and the screen's count line both say "orders". A row is a
     * line, so counting rows made a three-line order to one supplier read as
     * three orders in the rail — which is the same mistake the Quotes screen
     * was making about quotations.
     */
    const ws = draftOrderFrom(twoTaken(), 'QT-001', TODAY)
    expect(ws.orders).toHaveLength(2)
    expect(sourcingNav(ws, TODAY).find((r) => r.label === 'Purchase orders')?.badge).toBe('1')
  })

  it('and the numbering still counts up from the highest ever issued', () => {
    const ws = draftOrderFrom(twoTaken(), 'QT-001', TODAY)
    expect(ws.orders[0].no).toBe('PO-1')
    expect(nextNo('PO', ws.orders)).toBe('PO-2')
  })
})

/* ================================= a quotation is one record, with lines on it */

/**
 * What changed when six quotes became one quotation.
 *
 * The record is the piece of paper — one supplier, one date, one reference.
 * The prices on it are still six separate decisions, because a quotation
 * pricing six materials is rarely six things you want from them: you take the
 * two they are best on and leave the rest.
 */
describe('a quotation with several prices on it', () => {
  const sixLines = () => {
    const ws = setUp()
    ws.items = [item(), item({ id: 'IT-002', code: 'GLAND', name: 'Brass gland' })]
    ws.quotes = [quote({
      rfqId: undefined,
      lines: [
        line({ id: 'QT-001/1', itemId: 'IT-001', unitPrice: 780 }),
        line({ id: 'QT-001/2', itemId: 'IT-002', unitPrice: 46, leadDays: 4 }),
      ],
    })]
    return ws
  }

  it('is one record however many prices are on it', () => {
    const groups = quoteGroups(sixLines())
    expect(groups[0].rows).toHaveLength(1)
    expect(groups[0].rows[0].lines).toHaveLength(2)
  })

  it('takes one price without taking the others', () => {
    const ws = acceptLine(sixLines(), 'QT-001', 'QT-001/1')
    expect(ws.quotes[0].lines.map((l) => l.state)).toEqual(['accepted', 'received'])
    // and only the one taken became a rate
    expect(ws.vendorItems.filter((vi) => vi.itemId === 'IT-002')).toEqual([])
    expect(ws.vendorItems.find((vi) => vi.itemId === 'IT-001')?.rate).toBe(780)
  })

  it('and takes the whole page when that is what was meant', () => {
    const ws = acceptAll(sixLines(), 'QT-001')
    expect(ws.quotes[0].lines.every((l) => l.state === 'accepted')).toBe(true)
    expect(ws.vendorItems.find((vi) => vi.itemId === 'IT-002')?.rate).toBe(46)
    expect(ws.vendorItems.find((vi) => vi.itemId === 'IT-002')?.quotedLeadTimeDays).toBe(4)
  })

  it('turning one down leaves the rest alone, and writes no rate', () => {
    const ws = rejectLine(sixLines(), 'QT-001', 'QT-001/2')
    expect(ws.quotes[0].lines.map((l) => l.state)).toEqual(['received', 'rejected'])
    expect(ws.vendorItems.filter((vi) => vi.itemId === 'IT-002')).toEqual([])
  })

  it('reads as accepted once any line is, and turned down only when all are', () => {
    /*
     * What the pill on the card says. A quotation half of which you took is
     * not "not taken", and calling it that is how somebody stops trusting the
     * screen.
     */
    const ws = sixLines()
    expect(quoteState(ws.quotes[0])).toBe('received')
    expect(quoteState(acceptLine(ws, 'QT-001', 'QT-001/1').quotes[0])).toBe('accepted')

    const one = rejectLine(ws, 'QT-001', 'QT-001/1')
    expect(quoteState(one.quotes[0])).toBe('received')
    expect(quoteState(rejectLine(one, 'QT-001', 'QT-001/2').quotes[0])).toBe('rejected')
  })

  it('deleting a material takes its line, not the quotation', () => {
    const ws = removeItem(sixLines(), 'IT-002')
    expect(ws.quotes).toHaveLength(1)
    expect(ws.quotes[0].lines.map((l) => l.itemId)).toEqual(['IT-001'])
  })

  it('and takes the quotation when it priced nothing else', () => {
    const ws = removeItem(sixLines(), 'IT-001')
    expect(ws.quotes[0].lines.map((l) => l.itemId)).toEqual(['IT-002'])
    expect(removeItem(removeItem(sixLines(), 'IT-001'), 'IT-002').quotes).toEqual([])
  })

  it('counts a material\'s quoted prices as prices, not as pages', () => {
    expect(itemImpact(sixLines(), 'IT-002').losses.join(' | ')).toMatch(/1 quoted price/)
  })
})

describe('deleting says what it takes with it', () => {
  const loaded = () => {
    const ws = setUp()
    ws.stockLots = [{ id: 'L1', itemId: 'IT-001', batchNo: 'OPENING', qty: 120, usability: 'usable' }]
    ws.rfqs = [rfq()]
    ws.quotes = [quote()]
    ws.orders = [order()]
    return ws
  }

  it('names every attachment on a supplier', () => {
    const impact = vendorImpact(loaded(), 'VN-001')
    expect(impact.clean).toBe(false)
    expect(impact.losses.join(' | ')).toMatch(/1 rate they quoted/)
    expect(impact.losses.join(' | ')).toMatch(/1 quote/)
    expect(impact.losses.join(' | ')).toMatch(/1 purchase order/)
    expect(impact.losses.join(' | ')).toMatch(/1 request/)
  })

  it('says nothing is attached when nothing is', () => {
    const ws = setUp()
    ws.vendorItems = []
    expect(vendorImpact(ws, 'VN-001')).toEqual({ losses: [], clean: true })
  })

  it('removes a supplier and everything that only existed through them', () => {
    const ws = removeVendor(loaded(), 'VN-001')
    expect(ws.vendors).toEqual([])
    expect(ws.vendorItems).toEqual([])
    expect(ws.quotes).toEqual([])
    expect(ws.orders).toEqual([])
    expect(ws.vendorType['VN-001']).toBeUndefined()
    // the request survives, with nobody on it, and falls back to sent
    expect(ws.rfqs).toHaveLength(1)
    expect(ws.rfqs[0].vendorIds).toEqual([])
    expect(ws.rfqs[0].state).toBe('sent')
    // the material is untouched
    expect(ws.items).toHaveLength(1)
  })

  it('removes a material and every record about it', () => {
    const impact = itemImpact(loaded(), 'IT-001')
    expect(impact.losses.join(' | ')).toMatch(/1 stock count/)
    const ws = removeItem(loaded(), 'IT-001')
    expect(ws.items).toEqual([])
    expect(ws.stockLots).toEqual([])
    expect(ws.vendorItems).toEqual([])
    expect(ws.rfqs).toEqual([])
    expect(ws.quotes).toEqual([])
    expect(ws.orders).toEqual([])
    // the supplier stays: they exist independently of any one material
    expect(ws.vendors).toHaveLength(1)
  })

  it('keeps a quote when its request is deleted — a price was still given', () => {
    const ws = removeRfq(loaded(), 'RF-001')
    expect(ws.rfqs).toEqual([])
    expect(ws.quotes).toHaveLength(1)
    expect(ws.quotes[0].rfqId).toBeUndefined()
  })

  it('keeps an order when its quote is deleted', () => {
    const ws0 = loaded()
    ws0.orders = [order({ quoteId: 'QT-001' })]
    const ws = removeQuote(ws0, 'QT-001')
    expect(ws.quotes).toEqual([])
    expect(ws.orders).toHaveLength(1)
    expect(ws.orders[0].quoteId).toBeUndefined()
    // and the request drops back from awarded now its quote has gone
    expect(ws.rfqs[0].state).toBe('sent')
  })
})

describe('a workspace saved before these records existed', () => {
  it('loads, with the new lists empty rather than undefined', () => {
    const old = fresh() as unknown as Record<string, unknown>
    delete old.rfqs
    delete old.quotes
    delete old.orders
    const raw = JSON.stringify({
      workspace: old,
      session: { actor: 'R. Mehta', role: 'owner' },
    })
    const back = parseStored(raw)
    expect(back).not.toBeNull()
    expect(back!.workspace.rfqs).toEqual([])
    expect(back!.workspace.quotes).toEqual([])
    expect(back!.workspace.orders).toEqual([])
    // and the screens can read it without guarding every list
    expect(() => orderRows(back!.workspace)).not.toThrow()
    expect(() => quoteGroups(back!.workspace)).not.toThrow()
  })
})
