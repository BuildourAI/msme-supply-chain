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
import type { PurchaseOrder, Quote, Rfq, Workspace } from '@/lib/workspace/types'
import type { Item, Vendor, VendorItem } from '@/lib/domain/types'
import {
  acceptQuote, addDays, itemImpact, materialRows, nextNo, orderFromQuote, orderRows,
  quoteGroups, removeItem, removeQuote, removeRfq, removeVendor, rfqRows, rfqStateFrom,
  supplierRows, syncRfqStates, vendorImpact,
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

const quote = (over: Partial<Quote> = {}): Quote => ({
  id: 'QT-001', rfqId: 'RF-001', vendorId: 'VN-001', itemId: 'IT-001',
  unitPrice: 780, moq: 200, leadDays: 10, state: 'received', on: TODAY, ...over,
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
    expect(groups[0].rows[0].quote.unitPrice).toBe(780)
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
    expect(rfqStateFrom(rfq(), [quote({ state: 'accepted' })])).toBe('awarded')
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
    ws.quotes = [quote(), quote({ id: 'QT-002', vendorId: 'VN-002', unitPrice: 810 })]
    return ws
  }

  it('rejects the others on the same request — a request has one winner', () => {
    const ws = acceptQuote(base(), 'QT-001')
    expect(ws.quotes.find((q) => q.id === 'QT-001')?.state).toBe('accepted')
    // the loser is left as received rather than silently rejected...
    expect(ws.quotes.find((q) => q.id === 'QT-002')?.state).toBe('received')
    // ...and accepting the second one demotes the first
    const again = acceptQuote(ws, 'QT-002')
    expect(again.quotes.find((q) => q.id === 'QT-001')?.state).toBe('rejected')
    expect(again.quotes.find((q) => q.id === 'QT-002')?.state).toBe('accepted')
  })

  it('moves the request to awarded', () => {
    expect(acceptQuote(base(), 'QT-001').rfqs[0].state).toBe('awarded')
  })

  it('orders what was asked for, not the supplier’s minimum', () => {
    const ws = base()                       // the request asks for 500
    expect(orderFromQuote(ws, ws.quotes[0], TODAY).qty).toBe(500)
  })

  it('takes the minimum when it is larger than what was asked', () => {
    const ws = base()
    ws.quotes = [quote({ moq: 900 })]
    expect(orderFromQuote(ws, ws.quotes[0], TODAY).qty).toBe(900)
  })

  it('falls back to the minimum when no request is behind it', () => {
    const ws = base()
    ws.quotes = [quote({ rfqId: undefined, moq: 200 })]
    expect(orderFromQuote(ws, ws.quotes[0], TODAY).qty).toBe(200)
  })

  it('does not invent a quantity when there is nothing to take one from', () => {
    // a quote with no request and no minimum used to draft an order for 0,
    // which prices at nothing and reads as a bug
    const ws = base()
    ws.rfqs = []
    ws.quotes = [quote({ rfqId: undefined, moq: 0 })]
    const draft = orderFromQuote(ws, ws.quotes[0], TODAY)
    expect(draft.qty).toBe(0)
    expect(draft.unitPrice).toBe(780)
  })

  it('fills an order with the quote’s own figures, as a draft', () => {
    const ws = base()
    const draft = orderFromQuote(ws, ws.quotes[0], TODAY)
    expect(draft.no).toBe('PO-1')
    expect(draft.unitPrice).toBe(780)
    expect(draft.expectedOn).toBe(addDays(TODAY, 10))
    // §11 — the system drafts, a person places it
    expect(draft.state).toBe('draft')
    expect(draft.quoteId).toBe('QT-001')
  })

  it('does not place the order itself', () => {
    const ws = acceptQuote(base(), 'QT-001')
    expect(ws.orders).toEqual([])
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
