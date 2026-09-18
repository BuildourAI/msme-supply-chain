/**
 * The workspace layer, proved before a pixel moves.
 *
 * The claim under test is the one the whole onboarding rests on: an owner's own
 * company, entered a field at a time, runs through exactly the same derivations
 * as the sample company — no parallel maths, no softened guardrail, no invented
 * number standing in for one nobody has measured yet.
 */
import { describe, expect, it } from 'vitest'
import { buildRows, deskKpis } from '@/lib/domain/derive'
import { trailingLeadTimeDays } from '@/lib/domain/calc'
import type { Item, StockLot, Vendor, VendorItem } from '@/lib/domain/types'
import { SAMPLE_BUNDLE, bundleFor, quotedItems, unquotedItems } from '@/lib/workspace/bundle'
import { SOURCING_STEPS, progressOf } from '@/lib/workspace/checklist'
import { emptyWorkspace, nextId, suggestCode } from '@/lib/workspace/defaults'
import { NEEDS, needFor } from '@/lib/workspace/needs'
import { parseStored } from '@/lib/workspace/storage'
import type { Workspace } from '@/lib/workspace/types'

const TODAY = '2026-09-18'

const fresh = (): Workspace => emptyWorkspace({
  id: 'WS-1', createdAt: TODAY,
  ownerName: 'R. Mehta', contact: '98200 11223',
  companyName: 'Patel Heaters', makes: 'industrial heaters',
})

/** One material: 10 kg a day, 5 days of safety stock. */
const material = (over: Partial<Item> = {}): Item => ({
  id: 'IT-001', code: 'COPPER', name: 'Copper strip 25 mm', uom: 'kg', itemClass: 'B',
  coverageCeilingMonths: 2, moq: 100, safetyStock: 50,
  avgDailyConsumption: 10, floorConsumptionPerDay: 10,
  lastPurchaseRate: 800, feeds: [],
  ...over,
})

const supplier = (over: Partial<Vendor> = {}): Vendor => ({
  id: 'VN-001', name: 'Shah Metals', paymentTermsDays: 30, ...over,
})

const quote = (over: Partial<VendorItem> = {}): VendorItem => ({
  vendorId: 'VN-001', itemId: 'IT-001',
  rate: 800, freightPerUnit: 0, nonCreditableGst: 0,
  paymentTermCost: 0, rejectionAllowance: 0,
  quotedLeadTimeDays: 12, trailingLeadTimeDays: 12, trailingRejectionRate: 0,
  onTimePct: 100, score: 0,
  quoteValidUntil: '2027-01-01',
  ...over,
})

const lot = (over: Partial<StockLot> = {}): StockLot => ({
  id: 'LOT-001', itemId: 'IT-001', batchNo: 'OPENING', qty: 120, usability: 'usable', ...over,
})

/** A workspace with every sourcing step done. */
function setUp(): Workspace {
  const ws = fresh()
  ws.items = [material()]
  ws.vendors = [supplier()]
  ws.vendorItems = [quote()]
  ws.stockLots = [lot()]
  ws.drafts['rules.agreed'] = true
  return ws
}

describe('an empty workspace', () => {
  it('produces a bundle the existing derivation accepts, and no rows', () => {
    const rows = buildRows(bundleFor(fresh(), TODAY), fresh().policy)
    expect(rows).toEqual([])
  })

  it('reports zero on every desk total rather than throwing', () => {
    const k = deskKpis(buildRows(bundleFor(fresh(), TODAY), fresh().policy))
    expect(k.linesNeedingDecision.value).toBe(0)
    expect(k.toRelease.value).toBe(0)
    expect(k.nonUsableValue.value).toBe(0)
    expect(k.draftPoCount).toBe(0)
    expect(k.heldCount).toBe(0)
  })

  it('starts the owner on step 1 of 5, already ticked', () => {
    const p = progressOf(fresh())
    expect(p.total).toBe(5)
    expect(p.doneCount).toBe(1)
    expect(p.next?.id).toBe('materials')
    expect(p.complete).toBe(false)
  })
})

describe('a material with no supplier yet', () => {
  it('is kept out of the priced bundle instead of crashing the derivation', () => {
    const ws = fresh()
    ws.items = [material()]
    expect(unquotedItems(ws).map((i) => i.id)).toEqual(['IT-001'])
    expect(quotedItems(ws)).toEqual([])
    // buildRows assumes every item carries at least one quote; the bundle is what
    // keeps that assumption true rather than the derivation being loosened.
    expect(() => buildRows(bundleFor(ws, TODAY), ws.policy)).not.toThrow()
    expect(buildRows(bundleFor(ws, TODAY), ws.policy)).toEqual([])
  })

  it('is named on the checklist so it cannot be silently dropped', () => {
    const ws = fresh()
    ws.items = [material()]
    expect(SOURCING_STEPS[1].summary(ws)).toBe('1 material · 1 with no supplier yet')
  })

  it('joins the priced bundle the moment a supplier quotes it', () => {
    const ws = fresh()
    ws.items = [material()]
    ws.vendors = [supplier()]
    ws.vendorItems = [quote()]
    expect(quotedItems(ws).map((i) => i.id)).toEqual(['IT-001'])
    expect(buildRows(bundleFor(ws, TODAY), ws.policy)).toHaveLength(1)
  })
})

describe('one material, one supplier, one count', () => {
  const ws = setUp()
  const [row] = buildRows(bundleFor(ws, TODAY), ws.policy)

  it('takes the quoted lead time, because no receipt has been measured', () => {
    expect(row.leadTime.value).toBe(12)
    expect(row.leadTime.formula).toMatch(/no receipts recorded yet/)
    expect(row.leadTime.note).toMatch(/Quoted, not measured/)
    // and it does not pretend a drift it cannot know
    expect(row.leadTime.crossCheck).toBeUndefined()
  })

  it('reorder point is daily use × lead time + safety stock', () => {
    expect(row.reorderPoint.value).toBe(10 * 12 + 50)
  })

  it('cover is what is usable divided by daily use', () => {
    expect(row.coverDays.value).toBe(12)
  })

  it('is at risk, because 120 on the shelf is below the 170 reorder point', () => {
    expect(row.truePosition.value).toBe(120)
    expect(row.status.value).toBe('at_risk')
  })

  it('landed cost is the rate when there is nothing else to add', () => {
    expect(row.chosen.landedPerUnit.value).toBe(800)
    expect(row.quotes).toHaveLength(1)
  })

  it('orders in whole packs of the minimum order quantity', () => {
    expect(row.reorderQty.value % 100).toBe(0)
    expect(row.reorderQty.value).toBeGreaterThan(0)
  })

  it('the money on the line is the quantity at the landed rate', () => {
    expect(row.landedTotal.value).toBe(row.reorderQty.value * 800)
  })

  it('completes the checklist', () => {
    const p = progressOf(ws)
    expect(p.doneCount).toBe(5)
    expect(p.complete).toBe(true)
    expect(p.next).toBeNull()
  })
})

describe('stock that is on the shelf but not usable', () => {
  it('is shown and valued, and never counted as cover', () => {
    const ws = setUp()
    ws.stockLots = [
      lot({ qty: 120 }),
      lot({ id: 'LOT-002', batchNo: 'OPENING-QC', qty: 40, usability: 'qc_hold', usabilityReason: 'waiting on a test report' }),
    ]
    const [row] = buildRows(bundleFor(ws, TODAY), ws.policy)
    expect(row.usable.value).toBe(120)
    expect(row.nonUsable.value).toBe(40)
    expect(row.truePosition.value).toBe(120)
    expect(row.nonUsableValue.value).toBe(40 * 800)
    expect(row.nonUsableReasons).toEqual(['waiting on a test report'])
  })
})

describe('the rules step', () => {
  it('feeds the same policy the desk already reads', () => {
    const ws = setUp()
    ws.policy = { ...ws.policy, cycleDays: { A: 30, B: 30, C: 30 } }
    const [row] = buildRows(bundleFor(ws, TODAY), ws.policy)
    const base = buildRows(bundleFor(setUp(), TODAY), setUp().policy)[0]
    expect(row.reorderQty.value).toBeGreaterThan(base.reorderQty.value)
  })

  it('a sign-off threshold the owner lowers starts catching the line', () => {
    const ws = setUp()
    ws.policy = { ...ws.policy, ownerApprovalThreshold: 1 }
    const [row] = buildRows(bundleFor(ws, TODAY), ws.policy)
    expect(row.needsOwnerSignoff.value).toBe(true)
  })

  it('preferred-supplier mode picks the preferred quote over the cheaper one', () => {
    const ws = setUp()
    ws.vendors = [supplier(), supplier({ id: 'VN-002', name: 'Bombay Metals' })]
    ws.vendorItems = [
      quote({ isPreferred: true }),
      quote({ vendorId: 'VN-002', rate: 700 }),
    ]
    const cheapest = buildRows(bundleFor(ws, TODAY), ws.policy)[0]
    expect(cheapest.chosen.vendor.id).toBe('VN-002')

    const preferred = buildRows(
      bundleFor(ws, TODAY), { ...ws.policy, supplierDefault: 'preferred' },
    )[0]
    expect(preferred.chosen.vendor.id).toBe('VN-001')
  })
})

describe('checklist steps flip exactly when their data appears', () => {
  const cases: [string, (ws: Workspace) => void][] = [
    ['materials', (ws) => { ws.items = [material()] }],
    ['suppliers', (ws) => {
      ws.items = [material()]; ws.vendors = [supplier()]; ws.vendorItems = [quote()]
    }],
    ['stock', (ws) => { ws.stockLots = [lot()] }],
    ['rules', (ws) => { ws.drafts['rules.agreed'] = true }],
  ]
  for (const [id, fill] of cases) {
    it(`${id} is not done until it has data`, () => {
      const ws = fresh()
      const step = SOURCING_STEPS.find((s) => s.id === id)!
      expect(step.done(ws)).toBe(false)
      fill(ws)
      expect(step.done(ws)).toBe(true)
    })
  }

  it('a supplier with no rate against any material does not complete the step', () => {
    const ws = fresh()
    ws.items = [material()]
    ws.vendors = [supplier()]
    const step = SOURCING_STEPS.find((s) => s.id === 'suppliers')!
    expect(step.done(ws)).toBe(false)
  })
})

describe('what each screen is waiting for', () => {
  it('names a blocking reason for every sourcing screen on day one', () => {
    const ws = fresh()
    for (const [path, need] of Object.entries(NEEDS)) {
      const why = need.blocked(ws)
      expect(why, path).toBeTruthy()
      expect(why!.length, path).toBeGreaterThan(10)
    }
  })

  it('clears each screen once its data is in', () => {
    const ws = setUp()
    expect(needFor('/sourcing/desk')!.blocked(ws)).toBeNull()
    expect(needFor('/sourcing/blocked')!.blocked(ws)).toBeNull()
    expect(needFor('/sourcing/intake')!.blocked(ws)).toBeNull()
  })

  it('holds the comparison back until two suppliers quote the same material', () => {
    const ws = setUp()
    expect(needFor('/sourcing/compare')!.blocked(ws)).toMatch(/one supplier so far/)
    ws.vendors = [...ws.vendors, supplier({ id: 'VN-002', name: 'Bombay Metals' })]
    ws.vendorItems = [...ws.vendorItems, quote({ vendorId: 'VN-002', rate: 780 })]
    expect(needFor('/sourcing/compare')!.blocked(ws)).toBeNull()
  })
})

describe('the sample company is untouched', () => {
  it('still builds its nine lines from the seed', () => {
    expect(SAMPLE_BUNDLE.items).toHaveLength(9)
    const rows = buildRows(SAMPLE_BUNDLE, fresh().policy)
    expect(rows).toHaveLength(9)
    // every sample quote still measures its lead time from six real receipts
    for (const r of rows) {
      expect(r.leadTime.inputs.filter((i) => i.name.startsWith('receipt'))).toHaveLength(6)
    }
  })
})

describe('storage', () => {
  const good = JSON.stringify({
    workspace: fresh(),
    session: { actor: 'R. Mehta', role: 'owner' },
  })

  it('round-trips a saved workspace', () => {
    const back = parseStored(good)
    expect(back?.workspace.company.name).toBe('Patel Heaters')
    expect(back?.session.actor).toBe('R. Mehta')
  })

  it('treats anything unreadable as nobody signed in, rather than throwing', () => {
    expect(parseStored(null)).toBeNull()
    expect(parseStored('')).toBeNull()
    expect(parseStored('not json at all')).toBeNull()
    expect(parseStored('{"workspace":null}')).toBeNull()
    expect(parseStored('{"workspace":{"id":"x"}}')).toBeNull()
    expect(parseStored(JSON.stringify({ workspace: fresh() }))).toBeNull()
  })
})

describe('ids and codes', () => {
  it('counts up from nothing', () => {
    expect(nextId('IT', [])).toBe('IT-001')
    expect(nextId('IT', [{ id: 'IT-001' }])).toBe('IT-002')
  })

  it('never reuses the id of something deleted, even where a gap is left', () => {
    // IT-002 was added and removed. Handing that id out again would attach its
    // old stock lots and supplier rates to a different material.
    const existing = [{ id: 'IT-001' }, { id: 'IT-003' }]
    expect(nextId('IT', existing)).toBe('IT-004')
    expect(nextId('IT', [{ id: 'IT-009' }])).toBe('IT-010')
  })

  it('ignores ids belonging to another prefix', () => {
    expect(nextId('IT', [{ id: 'VN-007' }, { id: 'IT-002' }])).toBe('IT-003')
  })

  it('suggests a code from the name and keeps it unique', () => {
    expect(suggestCode('Copper strip 25 mm', [])).toBe('COPP-STRI')
    expect(suggestCode('Copper strip 25 mm', [{ code: 'COPP-STRI' }])).toBe('COPP-STRI-2')
    expect(suggestCode('   ', [])).toBe('ITEM')
  })
})

describe('the lead-time fallback', () => {
  it('still measures from receipts when there are any', () => {
    const history = [
      { orderedOn: '2026-08-01', receivedOn: '2026-08-08' },
      { orderedOn: '2026-08-10', receivedOn: '2026-08-17' },
    ]
    expect(trailingLeadTimeDays(history, 3).value).toBe(7)
  })

  it('uses the quoted figure when nothing has arrived, and says so', () => {
    const d = trailingLeadTimeDays([], 9)
    expect(d.value).toBe(9)
    expect(d.inputs.at(-1)?.source).toMatch(/not yet checked against a receipt/)
  })

  it('is zero only when there is no quote either', () => {
    expect(trailingLeadTimeDays([]).value).toBe(0)
  })
})
