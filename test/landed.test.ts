/**
 * What a quoted rate does not tell you.
 *
 * The sample company proves the point on its own data: the cheapest quote is
 * the wrong answer on six of its nine lines. None of that was reachable for an
 * owner, because four of landed cost's five components could be entered
 * nowhere and were hard zeros on every rate they created.
 *
 * The last block in this file is the one that matters. Everything above it
 * tests arithmetic; that one builds a workspace the way an owner builds one and
 * asserts the flip actually happens, through the real derivation.
 */
import { describe, expect, it } from 'vitest'
import {
  breakdownOf, gstCost, rejectionCost, repriceTerms, termCost, unsetComponents,
} from '@/lib/workspace/landed'
import { buildRows } from '@/lib/domain/derive'
import { bundleFor } from '@/lib/workspace/bundle'
import { emptyWorkspace } from '@/lib/workspace/defaults'
import { buildRate, buildVendor } from '@/lib/workspace/records'
import type { Workspace } from '@/lib/workspace/types'
import type { Item, StockLot, VendorItem } from '@/lib/domain/types'

const TODAY = '2026-09-20'

/* ============================================================ the payment term */

describe('what a supplier\'s payment terms cost', () => {
  it('is nothing for whoever gives you the most rope', () => {
    // not because credit is free — because there was nothing better to have had
    expect(termCost(1000, 45, 45, 12)).toBe(0)
  })

  it('and is the interest on the days the others take away', () => {
    // cash against a 45-day supplier, at 12%: 1000 × 45/365 × 0.12
    expect(termCost(1000, 0, 45, 12)).toBe(14.79)
    expect(termCost(1000, 30, 45, 12)).toBe(4.93)
  })

  it('is nothing at all until the owner says what their money costs', () => {
    /*
     * The default is 0 and stays 0. A plausible-looking 11% applied silently
     * would move which supplier the system recommends, on a number nobody gave.
     */
    expect(termCost(1000, 0, 45, 0)).toBe(0)
  })

  it('is never negative, however good their terms are', () => {
    expect(termCost(1000, 90, 45, 12)).toBe(0)
  })

  it('and is nothing on a material with one supplier', () => {
    // their own terms are the best terms; there is nothing to be better than
    expect(termCost(1000, 30, 30, 12)).toBe(0)
  })
})

/* ================================================== the two straight conversions */

describe('the two the owner states as a percentage', () => {
  it('turn into the rupees the formula wants', () => {
    expect(gstCost(62800, 5)).toBe(3140)
    expect(rejectionCost(62800, 1.5)).toBe(942)
  })

  it('and are nothing when there is nothing to claim or reject', () => {
    expect(gstCost(62800, 0)).toBe(0)
    expect(rejectionCost(62800, 0)).toBe(0)
    expect(gstCost(0, 5)).toBe(0)
  })
})

/* ====================================================== repricing the material */

const base = (): Workspace => emptyWorkspace({
  id: 'WS-1', createdAt: TODAY, ownerName: 'R. Mehta', contact: '',
  companyName: 'Patel Heaters', makes: 'heaters',
})

const material = (over: Partial<Item> = {}): Item => ({
  id: 'IT-001', code: 'SHEET', name: 'Sheet', uom: 'MT', itemClass: 'B',
  coverageCeilingMonths: 2, moq: 1, safetyStock: 5, avgDailyConsumption: 1,
  floorConsumptionPerDay: 1, lastPurchaseRate: 0, feeds: [], ...over,
})

/** Two suppliers on one material: one gives 45 days, one wants cash. */
const two = (pct = 12): Workspace => {
  const ws = base()
  return {
    ...ws,
    policy: { ...ws.policy, costOfMoneyPct: pct },
    items: [material()],
    nextIds: { IT: 1, VN: 2 },
    vendors: [
      buildVendor({ id: 'VN-001', name: 'Gives credit', paymentTermsDays: 45 }),
      buildVendor({ id: 'VN-002', name: 'Wants cash', paymentTermsDays: 0 }),
    ],
    vendorItems: [
      buildRate({ vendorId: 'VN-001', itemId: 'IT-001', rate: 1000, leadDays: 7 }),
      buildRate({ vendorId: 'VN-002', itemId: 'IT-001', rate: 1000, leadDays: 7 }),
    ],
  }
}

const termsOf = (ws: Workspace) =>
  Object.fromEntries(ws.vendorItems.map((vi) => [vi.vendorId, vi.paymentTermCost]))

describe('pricing the terms across a material', () => {
  it('charges the one who wants cash and not the one who gives credit', () => {
    expect(termsOf(repriceTerms(two()))).toEqual({ 'VN-001': 0, 'VN-002': 14.79 })
  })

  it('says nothing when the owner has not said what their money costs', () => {
    expect(termsOf(repriceTerms(two(0)))).toEqual({ 'VN-001': 0, 'VN-002': 0 })
  })

  it('run twice, decides the same thing', () => {
    const once = repriceTerms(two())
    // and returns the very same object, so an idle pass provokes no save
    expect(repriceTerms(once)).toBe(once)
  })

  it('reprices the rivals when a better supplier turns up', () => {
    /*
     * The reason this is a pass over the workspace rather than a sum done when
     * a rate is written. Somebody offering ninety days does not only price
     * themselves — they make everyone else on that material dearer.
     */
    const ws = repriceTerms(two())
    expect(termsOf(ws)['VN-002']).toBe(14.79)

    const generous = repriceTerms({
      ...ws,
      nextIds: { ...ws.nextIds, VN: 3 },
      vendors: [...ws.vendors, buildVendor({ id: 'VN-003', name: 'Very generous', paymentTermsDays: 90 })],
      vendorItems: [...ws.vendorItems,
        buildRate({ vendorId: 'VN-003', itemId: 'IT-001', rate: 1000, leadDays: 7 })],
    })

    expect(termsOf(generous)['VN-002']).toBe(29.59)
    expect(termsOf(generous)['VN-001']).toBe(14.79)
    expect(termsOf(generous)['VN-003']).toBe(0)
  })

  it('catches up rates written before the owner said what money costs', () => {
    /*
     * The order this actually happens in. Suppliers are entered on the first
     * afternoon; the rules step, where the cost of capital is asked, is the
     * last one. So a cost of money set afterwards has to reprice what is
     * already there — and until it did, every supplier's credit column read
     * "nothing", which a screenshot of the real screen is how this was found.
     */
    const entered = repriceTerms(two(0))
    expect(termsOf(entered)).toEqual({ 'VN-001': 0, 'VN-002': 0 })

    const told = repriceTerms({ ...entered, policy: { ...entered.policy, costOfMoneyPct: 12 } })
    expect(termsOf(told)).toEqual({ 'VN-001': 0, 'VN-002': 14.79 })
  })

  it('leaves a different material alone', () => {
    const ws = two()
    const other: VendorItem = buildRate({ vendorId: 'VN-002', itemId: 'IT-999', rate: 500, leadDays: 3 })
    const out = repriceTerms({ ...ws, vendorItems: [...ws.vendorItems, other] })
    // one supplier on IT-999, so nothing to be better than
    expect(out.vendorItems.find((vi) => vi.itemId === 'IT-999')!.paymentTermCost).toBe(0)
  })
})

/* ========================================================= naming what is unset */

describe('what nobody has told it', () => {
  it('names every component with nothing behind it', () => {
    expect(unsetComponents(two(0), 'IT-001')).toEqual([
      'freight', 'GST you cannot claim back', 'what your money costs', 'a rejection rate',
    ])
  })

  it('and stops naming one the moment it has a figure', () => {
    const ws = repriceTerms(two(12))
    expect(unsetComponents(ws, 'IT-001')).not.toContain('what your money costs')
    expect(unsetComponents(ws, 'IT-001')).toContain('freight')
  })

  it('has nothing to say about a material with no rates', () => {
    expect(unsetComponents(two(), 'IT-404')).toEqual([])
  })
})

/* ============================================================= the whole point */

describe('the cheapest quote, on a workspace an owner built', () => {
  /*
   * Two suppliers typed in the way the supplier form types them. The cheaper
   * quote wants cash and charges for delivery; the dearer one gives credit and
   * delivers free. Everything below goes through the real `buildRows` — the
   * same derivation the sample company runs on — with nothing stubbed.
   */
  const ws = (): Workspace => {
    const w = repriceTerms({
      ...base(),
      policy: { ...base().policy, costOfMoneyPct: 12 },
      items: [material({ avgDailyConsumption: 2, safetyStock: 20 })],
      nextIds: { IT: 1, VN: 2 },
      stockLots: [{
        id: 'LOT-1', itemId: 'IT-001', batchNo: 'B-1', qty: 5, usability: 'usable',
      } satisfies StockLot],
      vendors: [
        buildVendor({ id: 'VN-001', name: 'Dearer, easier', paymentTermsDays: 45 }),
        buildVendor({ id: 'VN-002', name: 'Cheaper, harder', paymentTermsDays: 0 }),
      ],
      vendorItems: [
        buildRate({ vendorId: 'VN-001', itemId: 'IT-001', rate: 61400, leadDays: 7, freight: 1850 }),
        buildRate({
          vendorId: 'VN-002', itemId: 'IT-001', rate: 60200, leadDays: 7,
          freight: 2400, unclaimableGstPct: 1, rejectPct: 2,
        }),
      ],
    })
    return w
  }

  const row = () => buildRows(bundleFor(ws(), TODAY), ws().policy)[0]

  it('is not the cheapest material', () => {
    const r = row()
    expect(r.flipsVendor).toBe(true)
  })

  it('so the recommendation is the supplier who quoted more', () => {
    const r = row()
    expect(r.quotes[0].vendor.name).toBe('Dearer, easier')
    expect(r.quotes[0].vendorItem.rate).toBe(61400)
    expect(r.quotes.find((q) => q.isLowestRate)!.vendor.name).toBe('Cheaper, harder')
  })

  it('and the gap is the four things the quote does not mention', () => {
    const cheap = ws().vendorItems.find((vi) => vi.vendorId === 'VN-002')!
    const b = breakdownOf(cheap)

    expect(b.rate).toBe(60200)
    expect(b.freight).toBe(2400)
    expect(b.gst).toBe(602)
    // 60,200 × 45/365 × 12% — forty-five days of their money, at their rate
    expect(b.terms).toBe(890.63)
    expect(b.rejection).toBe(1204)
    expect(b.landed).toBe(65296.63)
  })

  it('which is the whole of landed cost, and none of it invented', () => {
    const r = row()
    const cheap = r.quotes.find((q) => q.isLowestRate)!
    const best = r.quotes[0]
    expect(cheap.landedPerUnit.value).toBeGreaterThan(best.landedPerUnit.value)
  })
})
