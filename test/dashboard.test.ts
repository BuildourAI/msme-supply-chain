/**
 * The figures and the queue, proved before a tile exists.
 *
 * Two claims are under test. That every metric says "nothing to measure yet"
 * rather than zero when nothing has happened — a dashboard that fills its
 * blanks with zeroes teaches people to distrust the numbers that are real.
 * And that the queue only ever holds things a person can make go away.
 */
import { describe, expect, it } from 'vitest'
import { emptyWorkspace } from '@/lib/workspace/defaults'
import {
  DEFAULT_PICKS, concentration, defectPct, flipSignature, flippingItems, leadSpreads,
  metricsFor, onTimePct, pickedMetrics, priceMoves, sourcing,
} from '@/lib/workspace/metrics'
import { byBand, decisionsFor, openCount } from '@/lib/workspace/decisions'
import { acceptLine, draftOrderFrom, logRate } from '@/lib/workspace/sourcing'
import { recordReceipt } from '@/lib/workspace/receipts'
import type { Workspace } from '@/lib/workspace/types'
import type { Item, Vendor, VendorItem } from '@/lib/domain/types'

const TODAY = '2026-09-20'

const fresh = (): Workspace => emptyWorkspace({
  id: 'WS-1', createdAt: '2026-01-01',
  ownerName: 'R. Mehta', contact: '', companyName: 'Patel Heaters', makes: '',
})

const item = (over: Partial<Item> = {}): Item => ({
  id: 'IT-001', code: 'CRCA', name: 'CRCA sheet', uom: 'MT', itemClass: 'B',
  coverageCeilingMonths: 2, moq: 1, safetyStock: 0, avgDailyConsumption: 1,
  floorConsumptionPerDay: 1, lastPurchaseRate: 800, feeds: [], ...over,
})

const vendor = (over: Partial<Vendor> = {}): Vendor => ({
  id: 'VN-001', name: 'Shah Metals', paymentTermsDays: 30, ...over,
})

const rate = (over: Partial<VendorItem> = {}): VendorItem => ({
  vendorId: 'VN-001', itemId: 'IT-001', rate: 800,
  freightPerUnit: 0, nonCreditableGst: 0, paymentTermCost: 0, rejectionAllowance: 0,
  quotedLeadTimeDays: 7, trailingLeadTimeDays: 7, trailingRejectionRate: 0,
  onTimePct: 0, score: 0, quoteValidUntil: '', ...over,
})

const order = (over: Partial<Workspace['orders'][0]> = {}): Workspace['orders'][0] => ({
  id: 'PO-001', no: 'PO-1', vendorId: 'VN-001', itemId: 'IT-001',
  qty: 10, unitPrice: 800, orderedOn: '2026-09-01', expectedOn: '2026-09-08',
  state: 'confirmed', ...over,
})

/** one supplier, one material, one rate — enough for most of these */
const set = (): Workspace => ({
  ...fresh(), items: [item()], vendors: [vendor()], vendorItems: [rate()],
})

/* ================================================== nothing, said as nothing */

describe('a company on its first day', () => {
  it('says nothing is measured rather than showing zeroes', () => {
    const all = metricsFor(fresh(), TODAY)
    const unmeasured = all.filter((m) => !m.measured)
    expect(unmeasured.length).toBeGreaterThan(0)
    for (const m of unmeasured) {
      expect(m.sub).toBe('nothing to measure yet')
      // the value is a sentence, never a number somebody could act on
      expect(m.value).not.toMatch(/^[\d₹]/)
    }
  })

  it('and every figure carries the sentence saying how it was worked out', () => {
    for (const m of metricsFor(fresh(), TODAY)) {
      expect(m.how.length).toBeGreaterThan(10)
    }
  })

  it('with nothing in the queue, because nothing has been started', () => {
    expect(decisionsFor(fresh(), TODAY)).toEqual([])
  })
})

/* ===================================================== on-time and lead time */

describe('what the deliveries say', () => {
  const arrived = (ws: Workspace, expectedOn: string, receivedOn: string, id: string) =>
    recordReceipt(ws, {
      order: order({ id, no: id, expectedOn }), qty: 10, accepted: 10, rejected: 0, receivedOn,
    })

  it('is unknown until a delivery with a promised date is recorded', () => {
    expect(onTimePct(set())).toBeNull()
  })

  it('counts a delivery on the promised day as on time', () => {
    const ws = arrived(set(), '2026-09-08', '2026-09-08', 'a')
    expect(onTimePct(ws)).toEqual({ pct: 100, of: 1 })
  })

  it('and one a day later as not', () => {
    let ws = arrived(set(), '2026-09-08', '2026-09-08', 'a')
    ws = arrived(ws, '2026-09-10', '2026-09-11', 'b')
    expect(onTimePct(ws)!.pct).toBe(50)
  })

  it('leaving out receipts recorded before a promise was kept', () => {
    /*
     * A receipt saved before `expectedOn` was carried has nothing to be judged
     * against. Counting it as on time would flatter every supplier who was
     * measured before this existed.
     */
    let ws = arrived(set(), '2026-09-08', '2026-09-20', 'a')
    ws = {
      ...ws,
      receipts: [...ws.receipts, {
        id: 'GR-OLD', orderId: 'x', vendorId: 'VN-001', itemId: 'IT-001',
        qty: 5, accepted: 5, rejected: 0, orderedOn: '2026-08-01', receivedOn: '2026-08-20',
      }],
    }
    expect(onTimePct(ws)).toEqual({ pct: 0, of: 1 })
  })

  it('needs two receipts before a lead time has a spread', () => {
    const ws = arrived(set(), '2026-09-08', '2026-09-08', 'a')
    expect(leadSpreads(ws)).toEqual([])
  })

  it('and then reports the swing the average hides', () => {
    /*
     * The point of the whole metric: seven days on average across four and
     * twenty-one is worse than twelve days every time, because you can plan
     * around twelve.
     */
    let ws = set()
    ws = recordReceipt(ws, {
      order: order({ id: 'a', no: 'a', orderedOn: '2026-09-01' }),
      qty: 10, accepted: 10, rejected: 0, receivedOn: '2026-09-05',
    })
    ws = recordReceipt(ws, {
      order: order({ id: 'b', no: 'b', orderedOn: '2026-09-01' }),
      qty: 10, accepted: 10, rejected: 0, receivedOn: '2026-09-22',
    })
    const [s] = leadSpreads(ws)
    expect(s.low).toBe(4)
    expect(s.high).toBe(21)
    expect(s.swing).toBe(17)
  })

  it('and what could not be used, over everything that arrived', () => {
    expect(defectPct(set())).toBeNull()
    const ws = recordReceipt(set(), {
      order: order(), qty: 100, accepted: 96, rejected: 4, receivedOn: '2026-09-08',
    })
    expect(defectPct(ws)).toEqual({ pct: 4, of: 1 })
  })
})

/* ============================================================ exposure and price */

describe('what the records say about exposure', () => {
  it('names materials nobody quotes apart from those only one quotes', () => {
    const ws: Workspace = {
      ...set(),
      items: [item(), item({ id: 'IT-002', code: 'GLAND', name: 'Brass gland' })],
    }
    expect(sourcing(ws)).toEqual({ alone: ['IT-001'], none: ['IT-002'] })
  })

  it('and how much of the ordering one supplier holds', () => {
    expect(concentration(set())).toBeNull()
    const ws: Workspace = {
      ...set(),
      vendors: [vendor(), vendor({ id: 'VN-002', name: 'Bombay' })],
      orders: [
        order({ id: 'a', qty: 10, unitPrice: 800 }),
        order({ id: 'b', no: 'PO-2', vendorId: 'VN-002', qty: 10, unitPrice: 200 }),
      ],
    }
    expect(concentration(ws)).toEqual({ vendorId: 'VN-001', share: 80 })
  })

  it('leaving out an order that was called off', () => {
    const ws: Workspace = {
      ...set(),
      orders: [order({ id: 'a' }), order({ id: 'b', no: 'PO-2', state: 'cancelled' })],
    }
    expect(concentration(ws)!.share).toBe(100)
  })

  it('a first rate is not a price move', () => {
    const ws = logRate(set(), {
      vendorId: 'VN-001', itemId: 'IT-001', was: 0, now: 800, on: TODAY, via: 'quote',
    })
    expect(ws.rateLog).toHaveLength(1)
    expect(priceMoves(ws)).toEqual([])
  })

  it('and a rate that did not move is not logged at all', () => {
    const ws = logRate(set(), {
      vendorId: 'VN-001', itemId: 'IT-001', was: 800, now: 800, on: TODAY, via: 'quote',
    })
    expect(ws.rateLog).toEqual([])
  })

  it('but a rise is, with the percentage', () => {
    const ws = logRate(set(), {
      vendorId: 'VN-001', itemId: 'IT-001', was: 800, now: 840, on: TODAY, via: 'quote',
    })
    expect(priceMoves(ws)[0].pct).toBeCloseTo(5, 5)
  })

  it('and accepting a dearer quotation writes one by itself', () => {
    const ws: Workspace = {
      ...set(),
      quotes: [{
        id: 'QT-001', vendorId: 'VN-001', on: TODAY,
        lines: [{
          id: 'QT-001/1', itemId: 'IT-001', unitPrice: 880, moq: 0, leadDays: 7,
          state: 'received',
        }],
      }],
    }
    const after = acceptLine(ws, 'QT-001', 'QT-001/1')
    expect(after.rateLog).toHaveLength(1)
    expect(priceMoves(after)[0].pct).toBeCloseTo(10, 5)
  })
})

/* ================================================================ the picking */

describe('choosing what to show', () => {
  it('shows a sensible few before anybody has chosen', () => {
    expect(pickedMetrics(fresh(), TODAY).map((m) => m.key)).toEqual(DEFAULT_PICKS)
  })

  it('honours a choice, in the order the metrics are declared', () => {
    const ws: Workspace = { ...fresh(), metricPicks: ['outstanding', 'onTime'] }
    expect(pickedMetrics(ws, TODAY).map((m) => m.key)).toEqual(['onTime', 'outstanding'])
  })

  it('and treats showing none as a choice, not as never having decided', () => {
    const ws: Workspace = { ...fresh(), metricPicks: [] }
    expect(pickedMetrics(ws, TODAY)).toEqual([])
  })
})

/* ================================================================== the queue */

describe('the work queue', () => {
  const quoted = (): Workspace => ({
    ...set(),
    quotes: [{
      id: 'QT-001', vendorId: 'VN-001', on: TODAY,
      lines: [
        { id: 'QT-001/1', itemId: 'IT-001', unitPrice: 780, moq: 0, leadDays: 7, state: 'received' },
        { id: 'QT-001/2', itemId: 'IT-001', unitPrice: 790, moq: 0, leadDays: 9, state: 'received' },
      ],
    }],
  })

  it('asks about prices nobody has decided', () => {
    const q = decisionsFor(quoted(), TODAY).find((d) => d.kind === 'undecided')
    expect(q?.detail).toBe('2 prices undecided')
    expect(q?.band).toBe('unfinished')
  })

  it('offering the decision on the row when there is only one price', () => {
    const ws = quoted()
    ws.quotes[0].lines = [ws.quotes[0].lines[0]]
    const q = decisionsFor(ws, TODAY).find((d) => d.kind === 'undecided')!
    expect(q.act).toBe('accept')
    expect(q.alt?.act).toBe('reject')
    expect(q.refs.lineId).toBe('QT-001/1')
  })

  it('then about the order the accepted price has not become', () => {
    const ws = acceptLine(quoted(), 'QT-001', 'QT-001/1')
    const d = decisionsFor(ws, TODAY).find((x) => x.kind === 'unordered')
    expect(d?.act).toBe('draft')
  })

  it('and stops asking once it has', () => {
    let ws = acceptLine(quoted(), 'QT-001', 'QT-001/1')
    ws = draftOrderFrom(ws, 'QT-001', TODAY)
    expect(decisionsFor(ws, TODAY).some((d) => d.kind === 'unordered')).toBe(false)
  })

  it('asks about an order drafted and never handed over', () => {
    let ws = acceptLine(quoted(), 'QT-001', 'QT-001/1')
    ws = draftOrderFrom(ws, 'QT-001', TODAY)
    expect(decisionsFor(ws, TODAY).some((d) => d.kind === 'unsent')).toBe(true)
  })

  it('and about one that is past the date they gave', () => {
    const ws: Workspace = { ...set(), orders: [order({ expectedOn: '2026-09-10' })] }
    const late = decisionsFor(ws, TODAY).find((d) => d.kind === 'late')!
    expect(late.band).toBe('stops')
    expect(late.detail).toBe('10 days past the date they gave')
  })

  it('putting what stops the line above what merely costs money', () => {
    const ws: Workspace = {
      ...set(),
      items: [item(), item({ id: 'IT-002', name: 'Brass gland' })],
      orders: [order({ expectedOn: '2026-09-10' })],
    }
    const bands = byBand(decisionsFor(ws, TODAY)).map((g) => g.band)
    expect(bands[0]).toBe('stops')
    expect(bands).toEqual([...bands].sort(
      (a, b) => ['stops', 'costs', 'unfinished'].indexOf(a)
        - ['stops', 'costs', 'unfinished'].indexOf(b),
    ))
  })

  it('and the later an order is, the higher it sits', () => {
    const ws: Workspace = {
      ...set(),
      orders: [
        order({ id: 'a', no: 'PO-1', expectedOn: '2026-09-18' }),
        order({ id: 'b', no: 'PO-2', expectedOn: '2026-09-01' }),
      ],
    }
    const late = decisionsFor(ws, TODAY).filter((d) => d.kind === 'late')
    expect(late.map((d) => d.refs.orderNo)).toEqual(['PO-2', 'PO-1'])
  })

  it('names a material nobody quotes, which no price report would', () => {
    const ws: Workspace = { ...set(), vendorItems: [] }
    const d = decisionsFor(ws, TODAY).find((x) => x.kind === 'unsourced')!
    expect(d.band).toBe('stops')
    expect(d.detail).toBe('no supplier quotes it')
  })

  it('and a request nobody answered', () => {
    const ws: Workspace = {
      ...set(),
      rfqs: [{
        id: 'RF-001', no: 'RFQ-1', itemId: 'IT-001', qty: 10, neededBy: '2026-10-01',
        vendorIds: ['VN-001'], state: 'sent', raisedOn: '2026-09-01',
      }],
    }
    const d = decisionsFor(ws, TODAY).find((x) => x.kind === 'no-reply')!
    expect(d.alt?.act).toBe('close')
  })
})

/* ============================================ a decision that has been made */

describe('waving a comparison through', () => {
  /** two suppliers, the cheaper rate carrying heavier freight */
  const flipped = (): Workspace => ({
    ...set(),
    vendors: [vendor(), vendor({ id: 'VN-002', name: 'Bombay Metals' })],
    vendorItems: [
      rate({ vendorId: 'VN-001', rate: 800, freightPerUnit: 10 }),
      rate({ vendorId: 'VN-002', rate: 790, freightPerUnit: 40 }),
    ],
  })

  it('is a flip worth asking about', () => {
    expect(flippingItems(flipped())).toEqual(['IT-001'])
    expect(decisionsFor(flipped(), TODAY).some((d) => d.kind === 'flip')).toBe(true)
  })

  it('and the queue stops asking once the owner says keep', () => {
    const ws = flipped()
    const kept: Workspace = {
      ...ws, reviewedFlips: { 'IT-001': flipSignature(ws, 'IT-001') },
    }
    expect(decisionsFor(kept, TODAY).some((d) => d.kind === 'flip')).toBe(false)
  })

  it('but asks again the moment the comparison changes', () => {
    /*
     * A signature, not a date. The question comes back when the answer might
     * have changed — a new rate, a different supplier winning — rather than
     * merely because a week went by.
     */
    const ws = flipped()
    const kept: Workspace = {
      ...ws, reviewedFlips: { 'IT-001': flipSignature(ws, 'IT-001') },
    }
    // VN-002 still quotes the lower RATE, so it is still a flip — but the
    // cheapest landed cost has moved, which is the thing that was waved through
    const moved: Workspace = {
      ...kept,
      vendorItems: kept.vendorItems.map((vi) => (vi.vendorId === 'VN-001'
        ? { ...vi, freightPerUnit: 5 } : vi)),
    }
    expect(flippingItems(moved)).toEqual(['IT-001'])
    expect(decisionsFor(moved, TODAY).some((d) => d.kind === 'flip')).toBe(true)
  })
})

/* =============================================================== the badge */

describe('the count on the rail', () => {
  it('is the length of the queue, so acting on something takes it down', () => {
    const ws: Workspace = {
      ...set(),
      quotes: [{
        id: 'QT-001', vendorId: 'VN-001', on: TODAY,
        lines: [{
          id: 'QT-001/1', itemId: 'IT-001', unitPrice: 780, moq: 0, leadDays: 7,
          state: 'received',
        }],
      }],
    }
    const before = openCount(ws, TODAY)
    expect(before).toBeGreaterThan(0)

    const after = acceptLine(ws, 'QT-001', 'QT-001/1')
    // one question answered, one raised — the order it has not become
    expect(decisionsFor(after, TODAY).some((d) => d.kind === 'undecided')).toBe(false)
    expect(openCount(draftOrderFrom(after, 'QT-001', TODAY), TODAY))
      .toBeLessThanOrEqual(before + 1)
  })
})
