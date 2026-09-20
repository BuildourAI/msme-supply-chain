/**
 * Bringing a sheet in, and taking it back out again.
 *
 * The undo cases are the reason this file is long. A bulk import is the most
 * destructive thing available in the app, so "undo" has to mean exactly the
 * rows the import touched — not a restore from a snapshot, which throws away
 * every unrelated edit made since and, because custom values for all three
 * lists share one map, would wipe values typed against a different list
 * entirely.
 */
import { describe, expect, it } from 'vitest'
import { emptyWorkspace, issueId } from '@/lib/workspace/defaults'
import { BUILTIN, addField, resolveColumns, setValue, valueOf } from '@/lib/workspace/fields'
import { removeQuote } from '@/lib/workspace/sourcing'
import { buildVendor } from '@/lib/workspace/records'
import {
  NEW_FIELD, applyImport, planImport, summarise, undoImport,
  type DupPolicy, type Mapping,
} from '@/lib/sheet/import'
import type { Workspace } from '@/lib/workspace/types'

const TODAY = '2026-09-18'

const blank = (): Workspace => emptyWorkspace({
  id: 'WS-T', createdAt: TODAY, ownerName: 'R. Mehta', contact: '',
  companyName: 'Patel Heaters', makes: '',
})

/** header: Supplier name | Type | Payment terms | GST number */
const BODY = [
  ['Shah Metals', 'Mill', '30', '27AABCS1429B1ZX'],
  ['Bombay Metals & Alloys', 'Trader', '45', '27AAACB2894G1ZZ'],
  ['Nirmal Enterprises', 'Stockist', '60', ''],
]

const MAP: Mapping[] = [
  { column: 0, target: 'name' },
  { column: 1, target: 'type' },
  { column: 2, target: 'terms' },
  { column: 3, target: NEW_FIELD, create: { label: 'GST number', kind: 'text' } },
]

const run = (ws: Workspace, body = BODY, map = MAP, policy: DupPolicy = 'update') => {
  const plans = planImport(ws, 'supplier', body, map, policy)
  return { plans, ...applyImport(ws, 'supplier', plans, map, 'suppliers.xlsx', TODAY) }
}

describe('planning an import', () => {
  it('calls every row new when nothing is there yet', () => {
    const plans = planImport(blank(), 'supplier', BODY, MAP, 'update')
    expect(summarise(plans)).toEqual({ added: 3, changed: 0, skipped: 0 })
  })

  it('skips a row with no name, and says so', () => {
    const plans = planImport(blank(), 'supplier', [...BODY, ['', 'Mill', '30', '']], MAP, 'update')
    const last = plans[plans.length - 1]
    expect(last.status).toBe('skip')
    expect(last.reason).toMatch(/no name/i)
  })

  it('refuses the whole sheet when no column names the record', () => {
    const noName: Mapping[] = [{ column: 2, target: 'terms' }]
    const plans = planImport(blank(), 'supplier', BODY, noName, 'update')
    expect(plans.every((p) => p.status === 'skip')).toBe(true)
    expect(plans[0].reason).toMatch(/matched to a name/i)
  })

  it('stops a row whose number is not a number, naming the value', () => {
    const plans = planImport(blank(), 'supplier', [['Shah', 'Mill', 'thirty', '']], MAP, 'update')
    expect(plans[0].status).toBe('skip')
    expect(plans[0].reason).toContain('thirty')
  })

  it('stops a row whose unit it cannot place rather than guessing', () => {
    const map: Mapping[] = [{ column: 0, target: 'name' }, { column: 1, target: 'uom' }]
    const plans = planImport(blank(), 'material', [['Copper strip', 'drums']], map, 'update')
    expect(plans[0].status).toBe('skip')
    expect(plans[0].reason).toMatch(/not a unit/i)
  })

  it('offers update, skip or add against something already there', () => {
    const first = run(blank()).ws
    for (const [policy, expected] of [
      ['update', { added: 0, changed: 3, skipped: 0 }],
      ['skip', { added: 0, changed: 0, skipped: 3 }],
      ['add', { added: 3, changed: 0, skipped: 0 }],
    ] as const) {
      expect(summarise(planImport(first, 'supplier', BODY, MAP, policy)), policy).toEqual(expected)
    }
  })

  it('matches an existing supplier however the name is cased', () => {
    const first = run(blank()).ws
    const plans = planImport(first, 'supplier', [['  shah metals ', 'Mill', '30', '']], MAP, 'update')
    expect(plans[0].status).toBe('update')
  })
})

describe('carrying an import out', () => {
  it('creates the records and the column the sheet needed', () => {
    const { ws } = run(blank())
    expect(ws.vendors.map((v) => v.name)).toEqual([
      'Shah Metals', 'Bombay Metals & Alloys', 'Nirmal Enterprises',
    ])
    expect(ws.fields.map((f) => f.label)).toEqual(['GST number'])

    const shah = ws.vendors[0]
    expect(ws.vendorType[shah.id]).toBe('Mill')
    expect(shah.paymentTermsDays).toBe(30)
    expect(valueOf(ws, shah.id, ws.fields[0].id)).toBe('27AABCS1429B1ZX')
  })

  it('does not tell every supplier they want cash on delivery', () => {
    /*
     * 0 payment days reads as "on delivery" on the suppliers screen, so a
     * column that simply was not filled in must not default to it.
     */
    const map: Mapping[] = [{ column: 0, target: 'name' }]
    const { ws } = run(blank(), [['Shah Metals', '', '', '']], map)
    expect(ws.vendors[0].paymentTermsDays).toBe(30)
  })

  it('leaves an empty cell empty rather than storing a blank', () => {
    const { ws } = run(blank())
    const nirmal = ws.vendors[2]
    expect(valueOf(ws, nirmal.id, ws.fields[0].id)).toBe('')
    expect(ws.custom[nirmal.id]).toBeUndefined()
  })

  it('only creates a field for a column still set to new', () => {
    // the person was offered a new column, then picked a real one instead
    const map: Mapping[] = [
      { column: 0, target: 'name' },
      { column: 2, target: 'terms', create: { label: 'Payment terms', kind: 'number' } },
    ]
    const { ws } = run(blank(), BODY, map)
    expect(ws.fields).toHaveLength(0)
    expect(ws.vendors[0].paymentTermsDays).toBe(30)
  })

  it('updates in place without making a second copy', () => {
    const first = run(blank()).ws
    const changed = [['Shah Metals', 'Trader', '15', '27AABCS1429B1ZX']]
    const second = run(first, changed, MAP, 'update').ws
    expect(second.vendors).toHaveLength(3)
    expect(second.vendors[0].paymentTermsDays).toBe(15)
    expect(second.vendorType[second.vendors[0].id]).toBe('Trader')
  })

  it('imports materials through the same builder the dialog uses', () => {
    const map: Mapping[] = [
      { column: 0, target: 'name' }, { column: 1, target: 'uom' },
      { column: 2, target: 'rate' }, { column: 3, target: 'onHand' },
    ]
    const body = [['Copper strip 25 mm', 'Kgs', '800', '1200']]
    const plans = planImport(blank(), 'material', body, map, 'update')
    const { ws } = applyImport(blank(), 'material', plans, map, 'x.csv', TODAY)

    const item = ws.items[0]
    expect(item.uom).toBe('kg')                    // "Kgs" translated, not written through
    expect(item.lastPurchaseRate).toBe(800)        // §13-1 valuation basis
    expect(item.code).toBe('COPP-STRI')            // suggested, as the dialog does
    expect(item.itemClass).toBe('B')               // the nine fields nobody is asked
    expect(item.feeds).toEqual([])
    // nothing has been measured, so nothing is invented
    expect(item.avgDailyConsumption).toBe(0)
    expect(item.safetyStock).toBe(0)
    // on-hand becomes an opening lot, exactly as the stock step makes one
    expect(ws.stockLots).toHaveLength(1)
    expect(ws.stockLots[0].qty).toBe(1200)
    expect(ws.stockLots[0].batchNo).toBe(`OPENING-${TODAY}`)
  })

  it('does not wipe a measured safety stock when a price list is re-imported', () => {
    const map: Mapping[] = [{ column: 0, target: 'name' }, { column: 1, target: 'rate' }]
    const plans = planImport(blank(), 'material', [['Copper strip', '800']], map, 'update')
    let ws = applyImport(blank(), 'material', plans, map, 'x.csv', TODAY).ws
    // the owner then sets real consumption figures through the dialog
    ws = { ...ws, items: [{ ...ws.items[0], avgDailyConsumption: 10, safetyStock: 50 }] }

    const again = planImport(ws, 'material', [['Copper strip', '850']], map, 'update')
    const after = applyImport(ws, 'material', again, map, 'x.csv', TODAY).ws
    expect(after.items[0].lastPurchaseRate).toBe(850)
    expect(after.items[0].safetyStock).toBe(50)
    expect(after.items[0].avgDailyConsumption).toBe(10)
  })

  it('will not invent a material to hang a request on', () => {
    const map: Mapping[] = [{ column: 0, target: 'item' }, { column: 1, target: 'qty' }]
    const plans = planImport(blank(), 'rfq', [['Copper strip', '500']], map, 'update')
    expect(plans[0].status).toBe('skip')
    expect(plans[0].reason).toMatch(/no material called/i)
  })

  it('stores a value the same way however the sheet wrote it', () => {
    const map: Mapping[] = [
      { column: 0, target: 'name' },
      { column: 1, target: NEW_FIELD, create: { label: 'Approved', kind: 'yesno' } },
      { column: 2, target: NEW_FIELD, create: { label: 'Visited', kind: 'date' } },
      { column: 3, target: NEW_FIELD, create: { label: 'Rating', kind: 'number' } },
    ]
    const body = [['Shah Metals', 'TRUE', '15/10/2026', '1,200']]
    const plans = planImport(blank(), 'supplier', body, map, 'update')
    const { ws } = applyImport(blank(), 'supplier', plans, map, 'x.csv', TODAY)
    const id = ws.vendors[0].id
    const by = (label: string) => ws.fields.find((f) => f.label === label)!.id
    expect(valueOf(ws, id, by('Approved'))).toBe('Yes')
    expect(valueOf(ws, id, by('Visited'))).toBe('2026-10-15')
    expect(valueOf(ws, id, by('Rating'))).toBe('1200')
  })
})

describe('undoing the last import', () => {
  it('removes what it added, including the column it created', () => {
    const before = blank()
    const { ws } = run(before)
    const after = undoImport(ws)
    expect(after.vendors).toHaveLength(0)
    expect(after.fields).toHaveLength(0)
    expect(after.custom).toEqual({})
    expect(after.vendorType).toEqual({})
    expect(after.lastImport).toBeUndefined()
  })

  it('puts an overwritten supplier back as it was', () => {
    let ws = blank()
    const [w1, id] = issueId(ws, 'VN')
    ws = {
      ...w1,
      vendors: [buildVendor({ id, name: 'Shah Metals', paymentTermsDays: 90 })],
      vendorType: { [id]: 'Stockist' },
    }
    const imported = run(ws, [['Shah Metals', 'Mill', '30', 'GST1']]).ws
    expect(imported.vendors[0].paymentTermsDays).toBe(30)

    const after = undoImport(imported)
    expect(after.vendors).toHaveLength(1)
    expect(after.vendors[0].paymentTermsDays).toBe(90)
    expect(after.vendorType[id]).toBe('Stockist')
  })

  it('keeps work done after the import, instead of restoring a snapshot', () => {
    /*
     * The case a snapshot gets wrong. Import on Monday, add a supplier by hand
     * on Tuesday, undo on Wednesday — Tuesday's supplier must survive, because
     * it had nothing to do with the import.
     */
    let ws = run(blank()).ws
    const [w2, id] = issueId(ws, 'VN')
    ws = { ...w2, vendors: [...w2.vendors, buildVendor({ id, name: 'Added later', paymentTermsDays: 15 })] }

    const after = undoImport(ws)
    expect(after.vendors.map((v) => v.name)).toEqual(['Added later'])
  })

  it('does not wipe values typed against a different list', () => {
    /*
     * The case the shared custom map gets wrong. All three lists keep their
     * values in one map, so restoring that map wholesale after a SUPPLIER
     * import would throw away something typed against a MATERIAL.
     */
    let ws = blank()
    const made = addField(ws, { entity: 'material', label: 'Grade', kind: 'text' })
    ws = made.ws
    const [w2, itemId] = issueId(ws, 'IT')
    ws = setValue(w2, itemId, made.id, 'ETP')

    const imported = run(ws).ws
    expect(valueOf(imported, itemId, made.id)).toBe('ETP')

    const after = undoImport(imported)
    expect(valueOf(after, itemId, made.id)).toBe('ETP')
    expect(after.fields.map((f) => f.label)).toEqual(['Grade'])
  })

  it('takes the opening lots an on-hand column created', () => {
    const map: Mapping[] = [{ column: 0, target: 'name' }, { column: 1, target: 'onHand' }]
    const plans = planImport(blank(), 'material', [['Copper strip', '1200']], map, 'update')
    const { ws } = applyImport(blank(), 'material', plans, map, 'x.csv', TODAY)
    expect(ws.stockLots).toHaveLength(1)
    expect(undoImport(ws).stockLots).toHaveLength(0)
  })

  it('is a no-op when there is nothing to undo', () => {
    const ws = blank()
    expect(undoImport(ws)).toEqual(ws)
  })

  it('only the most recent import can be undone', () => {
    const first = run(blank()).ws
    const second = run(first, [['Fourth Supplier', 'Mill', '30', '']], MAP, 'add').ws
    expect(second.vendors).toHaveLength(4)

    const after = undoImport(second)
    expect(after.vendors.map((v) => v.name)).not.toContain('Fourth Supplier')
    expect(after.vendors).toHaveLength(3)
    expect(after.lastImport).toBeUndefined()
  })
})

/* ================================================ quotes and orders as lists */

/**
 * The two lists that were left out when custom columns were written.
 *
 * Their own rule, and the reason both of them refuse more rows than the other
 * lists do: a quote and an order each name two records that have to exist
 * already. A sheet that quietly invented the supplier AND the material would
 * leave two masters nobody has described sitting behind a price.
 */
describe('bringing in quotes', () => {
  const withMasters = (): Workspace => {
    let w = blank()
    const [w1, vn] = issueId(w, 'VN')
    w = { ...w1, vendors: [buildVendor({ id: vn, name: 'Shah Metals', paymentTermsDays: 30 })] }
    const [w2, it] = issueId(w, 'IT')
    w = {
      ...w2,
      items: [{
        id: it, code: 'CRCA', name: 'CRCA sheet', uom: 'MT', itemClass: 'B',
        coverageCeilingMonths: 2, moq: 1, safetyStock: 0, avgDailyConsumption: 1,
        floorConsumptionPerDay: 1, lastPurchaseRate: 0, feeds: [],
      }],
    }
    return w
  }

  /** header: Supplier | Material | Price | MOQ | Lead | Ref | Date | HSN */
  const QBODY = [
    ['Shah Metals', 'CRCA sheet', '61400', '12', '7', 'QTR-88', '15/09/2026', '7209'],
  ]
  const QMAP: Mapping[] = [
    { column: 0, target: 'supplier' },
    { column: 1, target: 'item' },
    { column: 2, target: 'price' },
    { column: 3, target: 'moq' },
    { column: 4, target: 'lead' },
    { column: 5, target: 'ref' },
    { column: 6, target: 'on' },
    { column: 7, target: NEW_FIELD, create: { label: 'HSN code', kind: 'text' } },
  ]

  const bring = (ws: Workspace, body = QBODY, map = QMAP) => {
    const plans = planImport(ws, 'quote', body, map, 'update')
    return { plans, ...applyImport(ws, 'quote', plans, map, 'quotes.csv', TODAY) }
  }

  it('writes a quote with every figure off the row', () => {
    const { ws } = bring(withMasters())
    expect(ws.quotes).toHaveLength(1)
    const q = ws.quotes[0]
    expect(q.unitPrice).toBe(61400)
    expect(q.moq).toBe(12)
    expect(q.leadDays).toBe(7)
    expect(q.ref).toBe('QTR-88')
    // day-first, the way it is written in India
    expect(q.on).toBe('2026-09-15')
  })

  it('and a column the build never heard of, against that quote', () => {
    const { ws } = bring(withMasters())
    expect(valueOf(ws, ws.quotes[0].id, ws.fields[0].id)).toBe('7209')
    expect(ws.fields[0].entity).toBe('quote')
  })

  it('refuses a row whose supplier is not on file, by name', () => {
    const plans = planImport(withMasters(), 'quote',
      [['Nobody Ltd', 'CRCA sheet', '61400', '', '7', '', '', '']], QMAP, 'update')
    expect(plans[0].status).toBe('skip')
    expect(plans[0].reason).toContain('Nobody Ltd')
  })

  it('and one whose material is not, by name', () => {
    const plans = planImport(withMasters(), 'quote',
      [['Shah Metals', 'Brass rod', '61400', '', '7', '', '', '']], QMAP, 'update')
    expect(plans[0].status).toBe('skip')
    expect(plans[0].reason).toContain('Brass rod')
  })

  it('and the whole sheet when no column says what was quoted', () => {
    const noItem: Mapping[] = [{ column: 0, target: 'supplier' }, { column: 2, target: 'price' }]
    const plans = planImport(withMasters(), 'quote', QBODY, noItem, 'update')
    expect(plans[0].status).toBe('skip')
    expect(plans[0].reason).toMatch(/matched to a material/i)
  })

  it('never lands accepted, however the sheet describes it', () => {
    /*
     * Accepting a quote writes the rate and turns its rivals down. A
     * spreadsheet cell reading "Accepted" must not do any of that, which is
     * why `state` carries no kind and cannot be mapped at all.
     */
    const { ws } = bring(withMasters())
    expect(ws.quotes[0].state).toBe('received')
    expect(BUILTIN.quote.find((b) => b.key === 'state')?.kind).toBeUndefined()
  })

  it('adds the same supplier twice rather than calling the second an edit', () => {
    // two quotes a week apart are two quotes, not a correction of the first
    const { ws } = bring(withMasters(), [...QBODY, ...QBODY])
    expect(ws.quotes).toHaveLength(2)
    expect(ws.quotes[0].id).not.toBe(ws.quotes[1].id)
  })

  it('and the undo takes the quotes, the cells and the column away', () => {
    const before = withMasters()
    const { ws } = bring(before)
    const back = undoImport(ws)
    expect(back.quotes).toEqual([])
    expect(back.fields).toEqual([])
    expect(back.custom).toEqual({})
    // the masters it was hung off are untouched, because it did not create them
    expect(back.vendors).toHaveLength(1)
    expect(back.items).toHaveLength(1)
  })
})

describe('bringing in orders', () => {
  const withMasters = (): Workspace => {
    let w = blank()
    const [w1, vn] = issueId(w, 'VN')
    w = { ...w1, vendors: [buildVendor({ id: vn, name: 'Shah Metals', paymentTermsDays: 30 })] }
    const [w2, it] = issueId(w, 'IT')
    return {
      ...w2,
      items: [{
        id: it, code: 'CRCA', name: 'CRCA sheet', uom: 'MT', itemClass: 'B',
        coverageCeilingMonths: 2, moq: 1, safetyStock: 0, avgDailyConsumption: 1,
        floorConsumptionPerDay: 1, lastPurchaseRate: 0, feeds: [],
      }],
    }
  }

  /** header: Supplier | Material | Qty | Rate | Ordered | Expected | Status */
  const OMAP: Mapping[] = [
    { column: 0, target: 'vendor' },
    { column: 1, target: 'item' },
    { column: 2, target: 'qty' },
    { column: 3, target: 'rate' },
    { column: 4, target: 'ordered' },
    { column: 5, target: 'expected' },
    { column: 6, target: 'state' },
  ]
  const OBODY = [
    ['Shah Metals', 'CRCA sheet', '12', '61400', '01/09/2026', '08/09/2026', 'shipped'],
    ['Shah Metals', 'CRCA sheet', '5', '61000', '10/09/2026', '17/09/2026', 'whatever'],
  ]

  const bring = (ws: Workspace, body = OBODY) => {
    const plans = planImport(ws, 'order', body, OMAP, 'update')
    return { plans, ...applyImport(ws, 'order', plans, OMAP, 'orders.csv', TODAY) }
  }

  it('numbers each one itself rather than trusting the sheet', () => {
    const { ws } = bring(withMasters())
    expect(ws.orders.map((o) => o.no)).toEqual(['PO-1', 'PO-2'])
  })

  it('reads the dates day-first and the figures as figures', () => {
    const { ws } = bring(withMasters())
    expect(ws.orders[0].orderedOn).toBe('2026-09-01')
    expect(ws.orders[0].expectedOn).toBe('2026-09-08')
    expect(ws.orders[0].qty).toBe(12)
    expect(ws.orders[0].unitPrice).toBe(61400)
  })

  it('takes a status it recognises and falls back to draft, never to a guess', () => {
    // "whatever" becomes the state that asks a person to look, not one that
    // claims goods are on their way
    const { ws } = bring(withMasters())
    expect(ws.orders[0].state).toBe('shipped')
    expect(ws.orders[1].state).toBe('draft')
  })

  it('and the undo removes them without touching the supplier', () => {
    const { ws } = bring(withMasters())
    const back = undoImport(ws)
    expect(back.orders).toEqual([])
    expect(back.vendors).toHaveLength(1)
  })
})

/* ============================================= the columns those lists carry */

describe('the columns a quote and an order ship with', () => {
  it('cannot hide the two records a quote names', () => {
    const identity = BUILTIN.quote.filter((b) => b.identity).map((b) => b.key)
    expect(identity).toEqual(['supplier', 'item'])
  })

  it('keeps the reference column away until a quote actually has one', () => {
    const ws = blank()
    const hiddenOf = (w: Workspace) =>
      resolveColumns(w, 'quote').find((c) => c.key === 'ref')!.hidden
    expect(hiddenOf(ws)).toBe(true)

    const withRef: Workspace = {
      ...ws,
      quotes: [{
        id: 'QT-001', vendorId: 'VN-001', itemId: 'IT-001', unitPrice: 1, moq: 0,
        leadDays: 1, ref: 'QTR-88', state: 'received', on: TODAY,
      }],
    }
    expect(hiddenOf(withRef)).toBe(false)
  })

  it('never offers the order number as something a sheet can set', () => {
    // two orders sharing a number is a thing nobody can untangle afterwards
    expect(BUILTIN.order.find((b) => b.key === 'no')?.derived).toBe(true)
  })

  it('and a deleted quote takes its own columns with it', () => {
    let ws: Workspace = {
      ...blank(),
      quotes: [{
        id: 'QT-001', vendorId: 'VN-001', itemId: 'IT-001', unitPrice: 1, moq: 0,
        leadDays: 1, state: 'received', on: TODAY,
      }],
    }
    const made = addField(ws, { entity: 'quote', label: 'HSN code', kind: 'text' })
    ws = setValue(made.ws, 'QT-001', made.id, '7209')
    expect(valueOf(ws, 'QT-001', made.id)).toBe('7209')

    const after = removeQuote(ws, 'QT-001')
    expect(after.custom['QT-001']).toBeUndefined()
    // the column itself stays — it is the owner's, not that one quote's
    expect(after.fields).toHaveLength(1)
  })
})
