/**
 * Goods arriving, and what they measure.
 *
 * §5 is unambiguous: "lead time is the trailing average of the last six actual
 * receipts, never the vendor's quoted figure. This is non-negotiable." The
 * sample company has receipts in its seed and has always obeyed it. An owner's
 * workspace passed an empty list to every derivation, so their lead times could
 * only ever be what a supplier claimed about themselves.
 *
 * The last block is the point of the file: the same `buildRows` the sample
 * company runs on, over a workspace an owner built, with the lead time moving
 * off the quoted figure the moment something turns up.
 */
import { describe, expect, it } from 'vitest'
import {
  measuredRejectionPct, outstandingOn, receiptsFor, receivedAgainst,
  recordReceipt, rejectionBasis, removeReceipt, repriceFromReceipts,
} from '@/lib/workspace/receipts'
import { buildRows } from '@/lib/domain/derive'
import { bundleFor } from '@/lib/workspace/bundle'
import { emptyWorkspace } from '@/lib/workspace/defaults'
import { buildRate, buildVendor } from '@/lib/workspace/records'
import { acceptQuote, expired, removeOrder, removeVendor, staleRates } from '@/lib/workspace/sourcing'
import type { PurchaseOrder, Workspace } from '@/lib/workspace/types'
import type { Item } from '@/lib/domain/types'

const TODAY = '2026-09-20'

const material = (over: Partial<Item> = {}): Item => ({
  id: 'IT-001', code: 'CRCA', name: 'CRCA sheet', uom: 'MT', itemClass: 'B',
  coverageCeilingMonths: 2, moq: 1, safetyStock: 20, avgDailyConsumption: 2,
  floorConsumptionPerDay: 2, lastPurchaseRate: 61400, feeds: [], ...over,
})

const order = (over: Partial<PurchaseOrder> = {}): PurchaseOrder => ({
  id: 'PO-001', no: 'PO-1', vendorId: 'VN-001', itemId: 'IT-001',
  qty: 100, unitPrice: 61400, orderedOn: '2026-09-01', expectedOn: '2026-09-08',
  state: 'confirmed', ...over,
})

const base = (): Workspace => {
  const ws = emptyWorkspace({
    id: 'WS-1', createdAt: TODAY, ownerName: 'R. Mehta', contact: '',
    companyName: 'Patel Heaters', makes: 'heaters',
  })
  return {
    ...ws,
    items: [material()],
    nextIds: { IT: 1, VN: 1, PO: 1 },
    vendors: [buildVendor({ id: 'VN-001', name: 'Shah Metals', paymentTermsDays: 30 })],
    vendorItems: [buildRate({ vendorId: 'VN-001', itemId: 'IT-001', rate: 61400, leadDays: 7 })],
    orders: [order()],
  }
}

const arrive = (ws: Workspace, over: Partial<{
  qty: number; accepted: number; rejected: number; receivedOn: string; id: string
}> = {}) => {
  const o = ws.orders.find((x) => x.id === (over.id ?? 'PO-001'))!
  const qty = over.qty ?? 100
  const rejected = over.rejected ?? 0
  return recordReceipt(ws, {
    order: o,
    qty,
    accepted: over.accepted ?? qty - rejected,
    rejected,
    receivedOn: over.receivedOn ?? '2026-09-12',
  })
}

/* ================================================================ recording */

describe('recording what turned up', () => {
  it('writes the receipt against the order, carrying the order date with it', () => {
    const ws = arrive(base())
    expect(ws.receipts).toHaveLength(1)
    expect(ws.receipts[0]).toMatchObject({
      orderId: 'PO-001', vendorId: 'VN-001', itemId: 'IT-001',
      qty: 100, accepted: 100, rejected: 0,
      orderedOn: '2026-09-01', receivedOn: '2026-09-12',
    })
  })

  it('and the order date is copied, not looked up', () => {
    /*
     * A receipt has to say how long it took on its own. Correcting the order's
     * date next month must not silently change a lead time that was measured.
     */
    const ws = arrive(base())
    const edited = { ...ws, orders: ws.orders.map((o) => ({ ...o, orderedOn: '2026-08-01' })) }
    expect(edited.receipts[0].orderedOn).toBe('2026-09-01')
  })

  it('puts what was accepted on the shelf', () => {
    // goods that arrived and passed are stock; recording the arrival without
    // the material would show an empty bin for something you can see
    const ws = arrive(base(), { qty: 100, rejected: 4 })
    const lot = ws.stockLots.find((l) => l.itemId === 'IT-001')!
    expect(lot.qty).toBe(96)
    expect(lot.usability).toBe('usable')
  })

  it('and nothing at all when none of it was usable', () => {
    const ws = arrive(base(), { qty: 10, rejected: 10 })
    expect(ws.stockLots).toEqual([])
  })

  it('closes the order only when all of it has come', () => {
    const part = arrive(base(), { qty: 40 })
    expect(part.orders[0].state).toBe('shipped')
    expect(outstandingOn(part, part.orders[0])).toBe(60)

    const rest = arrive(part, { qty: 60, receivedOn: '2026-09-15' })
    expect(rest.orders[0].state).toBe('delivered')
    expect(outstandingOn(rest, rest.orders[0])).toBe(0)
  })

  it('and an over-delivery is not a debt', () => {
    const ws = arrive(base(), { qty: 140 })
    expect(receivedAgainst(ws, 'PO-001')).toBe(140)
    expect(outstandingOn(ws, ws.orders[0])).toBe(0)
  })
})

/* =============================================================== the measure */

describe('what a receipt measures', () => {
  it('moves the lead time off the supplier\'s quoted figure', () => {
    const before = base()
    expect(before.vendorItems[0].trailingLeadTimeDays).toBe(7)

    // ordered on the 1st, arrived on the 12th
    const after = arrive(before)
    expect(after.vendorItems[0].trailingLeadTimeDays).toBe(11)
  })

  it('and takes the mean of them once there are several', () => {
    let ws = arrive(base())                                        // 11 days
    ws = { ...ws, orders: [...ws.orders, order({ id: 'PO-002', no: 'PO-2', orderedOn: '2026-09-02' })] }
    ws = arrive(ws, { id: 'PO-002', receivedOn: '2026-09-17' })     // 15 days
    expect(ws.vendorItems[0].trailingLeadTimeDays).toBe(13)
  })

  it('measures the rejection rate rather than believing what was typed', () => {
    const ws = arrive(base(), { qty: 100, rejected: 3 })
    expect(measuredRejectionPct(ws, 'VN-001', 'IT-001')).toBe(3)
    expect(ws.vendorItems[0].trailingRejectionRate).toBe(3)
    // and the allowance follows it, in rupees, through the same function
    expect(ws.vendorItems[0].rejectionAllowance).toBe(1842)
  })

  it('and says which of the two any figure is', () => {
    expect(rejectionBasis(base(), 'VN-001', 'IT-001')).toEqual({ measured: false, receipts: 0 })
    expect(rejectionBasis(arrive(base()), 'VN-001', 'IT-001'))
      .toEqual({ measured: true, receipts: 1 })
  })

  it('has nothing to say about a pairing nothing has arrived for', () => {
    expect(measuredRejectionPct(base(), 'VN-001', 'IT-001')).toBeNull()
    // and an entered figure is left exactly where it was
    const typed = {
      ...base(),
      vendorItems: [buildRate({
        vendorId: 'VN-001', itemId: 'IT-001', rate: 61400, leadDays: 7, rejectPct: 2,
      })],
    }
    expect(repriceFromReceipts(typed)).toBe(typed)
  })

  it('run twice, decides the same thing', () => {
    const once = arrive(base())
    expect(repriceFromReceipts(once)).toBe(once)
  })

  it('and keeps only the last six, so an old bad batch stops counting', () => {
    let ws = base()
    for (let i = 1; i <= 7; i += 1) {
      const id = `PO-00${i}`
      ws = { ...ws, orders: [...ws.orders.filter((o) => o.id !== id), order({ id, no: `PO-${i}` })] }
      // the first is a disaster, the six after it are clean
      ws = arrive(ws, { id, qty: 10, rejected: i === 1 ? 10 : 0, receivedOn: `2026-09-0${i + 1}` })
    }
    expect(receiptsFor(ws, 'VN-001', 'IT-001')).toHaveLength(7)
    expect(measuredRejectionPct(ws, 'VN-001', 'IT-001')).toBe(0)
  })
})

/* ================================================================== undoing */

describe('taking a receipt back', () => {
  it('removes it, its stock, and the state it put the order in', () => {
    const ws = arrive(base())
    expect(ws.orders[0].state).toBe('delivered')

    const back = removeReceipt(ws, ws.receipts[0].id)
    expect(back.receipts).toEqual([])
    expect(back.stockLots).toEqual([])
    expect(back.orders[0].state).toBe('confirmed')
  })

  it('and the lead time goes back to the quoted one', () => {
    const ws = arrive(base())
    expect(removeReceipt(ws, ws.receipts[0].id).vendorItems[0].trailingLeadTimeDays).toBe(7)
  })

  it('leaves a part delivery as shipped rather than confirmed', () => {
    let ws = arrive(base(), { qty: 40 })
    ws = arrive(ws, { qty: 60, receivedOn: '2026-09-15' })
    expect(ws.orders[0].state).toBe('delivered')

    const back = removeReceipt(ws, ws.receipts[1].id)
    expect(back.orders[0].state).toBe('shipped')
  })
})

describe('what a delete takes with it', () => {
  it('a deleted order takes its receipts, which measure nothing without it', () => {
    const ws = arrive(base())
    expect(removeOrder(ws, 'PO-001').receipts).toEqual([])
  })

  it('and so does a deleted supplier', () => {
    const ws = arrive(base())
    expect(removeVendor(ws, 'VN-001').receipts).toEqual([])
  })
})

/* ========================================================== the whole point */

describe('the engine an owner\'s screens run on', () => {
  it('called the lead time quoted, and now calls it measured', () => {
    /*
     * Through the real `buildRows` — the same derivation the sample company's
     * twenty-seven reconciled quotes go through, with nothing stubbed. Before
     * receipts existed, `bundleFor` passed an empty list and this could only
     * ever come back as the supplier's own claim.
     */
    const before = buildRows(bundleFor(base(), TODAY), base().policy)[0]
    expect(before.quotes[0].leadTime.value).toBe(7)
    expect(before.quotes[0].leadTime.note).toMatch(/quoted, not measured/i)

    const ws = arrive(base())
    const after = buildRows(bundleFor(ws, TODAY), ws.policy)[0]
    expect(after.quotes[0].leadTime.value).toBe(11)
    expect(after.quotes[0].leadTime.note).toMatch(/never the vendor/i)
  })

  it('and shows the drift between what they said and what they did', () => {
    const ws = arrive(base())
    const row = buildRows(bundleFor(ws, TODAY), ws.policy)[0]
    expect(row.quotes[0].leadTime.crossCheck?.drift).toBe('+4 days')
  })
})

/* ============================================================ going stale == */

/**
 * A price that ran out.
 *
 * `quoteValidUntil` has been declared on `VendorItem` since §5 was written and
 * nothing ever wrote it, so every rate in an owner's workspace claimed to be
 * good for ever. A quotation is the one document that says otherwise.
 */
describe('a quote that has run out', () => {
  it('is expired only once the day has actually passed', () => {
    expect(expired('2026-09-19', TODAY)).toBe(true)
    // the last day is still a day you can order on
    expect(expired('2026-09-20', TODAY)).toBe(false)
    expect(expired('2026-10-15', TODAY)).toBe(false)
  })

  it('and a price with no date never expires, which is not the same as fresh', () => {
    expect(expired(undefined, TODAY)).toBe(false)
    expect(expired('', TODAY)).toBe(false)
  })

  it('carries the quote\'s own date onto the rate when it is accepted', () => {
    const ws: Workspace = {
      ...base(),
      quotes: [{
        id: 'QT-001', vendorId: 'VN-001', itemId: 'IT-001', unitPrice: 60000,
        moq: 0, leadDays: 9, validUntil: '2026-10-15', state: 'received', on: '2026-09-12',
      }],
    }
    const after = acceptQuote(ws, 'QT-001')
    expect(after.vendorItems[0].quoteValidUntil).toBe('2026-10-15')
    expect(staleRates(after, TODAY)).toBe(0)
  })

  it('and counts the ones still ranking suppliers on a price that has gone', () => {
    const ws: Workspace = {
      ...base(),
      quotes: [{
        id: 'QT-001', vendorId: 'VN-001', itemId: 'IT-001', unitPrice: 60000,
        moq: 0, leadDays: 9, validUntil: '2026-08-31', state: 'received', on: '2026-08-01',
      }],
    }
    expect(staleRates(acceptQuote(ws, 'QT-001'), TODAY)).toBe(1)
  })

  it('never invents one when neither the quote nor the document said', () => {
    const ws: Workspace = {
      ...base(),
      quotes: [{
        id: 'QT-001', vendorId: 'VN-001', itemId: 'IT-001', unitPrice: 60000,
        moq: 0, leadDays: 9, state: 'received', on: '2026-09-12',
      }],
    }
    expect(acceptQuote(ws, 'QT-001').vendorItems[0].quoteValidUntil).toBe('')
    expect(staleRates(acceptQuote(ws, 'QT-001'), TODAY)).toBe(0)
  })
})
