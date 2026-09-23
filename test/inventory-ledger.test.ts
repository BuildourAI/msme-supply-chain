/**
 * Counting the store, and what happens to stock other than being used.
 *
 * A count never writes over the book: it is a record of the book beside what
 * somebody saw, and a difference is a movement of its own — a shortfall a loss
 * with a cause. Every test here also holds the ledger's one rule: the lines
 * add up to the lots.
 */
import { describe, expect, it } from 'vitest'
import { emptyWorkspace } from '@/lib/workspace/defaults'
import { applyCount } from '@/lib/workspace/count'
import {
  addFoundLot, countRows, dueLots, foundProblem, openVariances, readFilledSheet, recount,
  recountProblem, sheetLots, sheetOf, sheetRows, varianceNotedKey, walk, walkProblem,
} from '@/lib/workspace/counting'
import { inventoryDecisionsFor, HELD_TOO_LONG_DAYS } from '@/lib/workspace/inventory-decisions'
import { drift, trail, usableOnHand } from '@/lib/workspace/ledger'
import { setLotState, writeOff, writeOffProblem } from '@/lib/workspace/losses'
import { pickedMetrics } from '@/lib/workspace/metrics'
import { addRack, placeLot } from '@/lib/workspace/racks'
import { arrive, closeReceipt } from '@/lib/workspace/receipts'
import { inventoryNav } from '@/lib/workspace/reveal'
import type { Workspace } from '@/lib/workspace/types'
import type { Item } from '@/lib/domain/types'

const TODAY = '2026-09-20'

const item = (over: Partial<Item> = {}): Item => ({
  id: 'IT-001', code: 'DEN-14', name: 'Denim 14 oz', uom: 'm', itemClass: 'A',
  coverageCeilingMonths: 2, moq: 100, safetyStock: 0, avgDailyConsumption: 20,
  floorConsumptionPerDay: 20, lastPurchaseRate: 240, feeds: [], ...over,
})
const base = (): Workspace => {
  let ws: Workspace = {
    ...emptyWorkspace({
      id: 'WS-1', createdAt: '2026-01-01', ownerName: 'R. Mehta', contact: '',
      companyName: 'Indigo Threads', makes: 'Jeans',
    }),
    items: [item(), item({ id: 'IT-002', code: 'ZIP', name: 'YKK zip 7"', uom: 'nos', itemClass: 'C', lastPurchaseRate: 6 })],
    vendors: [{ id: 'VN-001', name: 'Arvind Mills', paymentTermsDays: 30 }],
  }
  ;[ws] = addRack(ws, { name: 'A-1' })
  ws = applyCount(ws, '2026-09-01', {
    'IT-001': { good: 500, rack: 'RK-001' },
    'IT-002': { good: 1000, rack: 'RK-001' },
  }, 'R. Mehta')
  return ws
}
const denim = (ws: Workspace) => ws.stockLots.find((l) => l.itemId === 'IT-001')!
const zips = (ws: Workspace) => ws.stockLots.find((l) => l.itemId === 'IT-002')!
const adds = (ws: Workspace) => expect(drift(ws)).toEqual([])

/* ============================================================ one lot */

describe('counting one lot', () => {
  it('agreeing with the book writes the count and nothing else', () => {
    const [ws, id] = recount(base(), { lotId: denim(base()).id, countedQty: 500, on: TODAY, counter: 'S. Patil' })
    expect(id).toBe('CC-001')
    expect(ws.counts[0]).toMatchObject({ bookQty: 500, countedQty: 500, counter: 'S. Patil', rack: 'RK-001' })
    expect(ws.moves.filter((m) => m.kind === 'count_adjust')).toEqual([])
    expect(ws.losses).toEqual([])
    adds(ws)
  })

  it('short: the book follows the rack, and the shortfall is a loss with a cause', () => {
    const [ws] = recount(base(), {
      lotId: denim(base()).id, countedQty: 470, on: TODAY, counter: 'S. Patil', note: 'Roll 4 short',
    })
    expect(denim(ws).qty).toBe(470)
    const adj = ws.moves.find((m) => m.kind === 'count_adjust')!
    expect(adj).toMatchObject({ qty: -30, source: 'count', sourceRef: 'CC-001' })
    expect(adj.note).toBe('Counted 470 against a book of 500 — Roll 4 short')
    expect(ws.losses).toEqual([expect.objectContaining({
      cause: 'count_shortage', qty: 30, sourceRef: 'CC-001', recoveryRate: 0, lotId: denim(ws).id,
    })])
    adds(ws)
  })

  it('over: the book follows the rack, and nothing is lost', () => {
    const [ws] = recount(base(), { lotId: denim(base()).id, countedQty: 512, on: TODAY, counter: 'S. Patil', note: 'Extra roll' })
    expect(denim(ws).qty).toBe(512)
    expect(ws.losses).toEqual([])
    adds(ws)
  })

  it('asks what was found whenever the count differs, and refuses what is not a count', () => {
    const lotId = denim(base()).id
    expect(recountProblem(base(), { lotId, countedQty: 470, on: TODAY, counter: '' })).toMatch(/say what you found/)
    expect(recountProblem(base(), { lotId, countedQty: -1, on: TODAY, counter: '' })).toMatch(/nought if it is empty/)
    expect(recountProblem(base(), { lotId, countedQty: 500, on: TODAY, counter: '' })).toBeNull()
    expect(recount(base(), { lotId, countedQty: 470, on: TODAY, counter: '' })[1]).toBe('')
  })

  it('a lot counted in time is no longer due, and says who confirmed it', () => {
    expect(dueLots(base(), TODAY).map((r) => r.lot.itemId)).toEqual(['IT-001'])
    const [ws] = recount(base(), { lotId: denim(base()).id, countedQty: 500, on: TODAY, counter: 'S. Patil' })
    expect(dueLots(ws, TODAY)).toEqual([])
  })
})

/* ========================================================== a walk */

describe('walking a rack', () => {
  it('covers every lot on the rack with something on it', () => {
    const lots = sheetLots(base(), { rackId: 'RK-001' }, TODAY)
    expect(lots.map((r) => r.item?.name)).toEqual(['Denim 14 oz', 'YKK zip 7"'])
    expect(sheetOf({ rackId: 'RK-001' }, TODAY)).toBe('RK-001/2026-09-20')
  })

  it('is written all together or not at all', () => {
    const ws0 = base()
    const rows = [
      { lotId: denim(ws0).id, countedQty: 500 },
      { lotId: zips(ws0).id, countedQty: 960 },
    ]
    expect(walkProblem(ws0, rows, TODAY, 'S. Patil')).toMatch(/^YKK zip 7" · OPENING-2026-09-01: The count differs/)
    expect(walk(ws0, 'RK-001/2026-09-20', rows, TODAY, 'S. Patil')).toEqual([ws0, []])

    const [ws, ids] = walk(ws0, 'RK-001/2026-09-20',
      [rows[0], { ...rows[1], note: 'Box of 40 missing' }], TODAY, 'S. Patil')
    expect(ids).toEqual(['CC-001', 'CC-002'])
    expect(ws.counts.every((c) => c.sheet === 'RK-001/2026-09-20')).toBe(true)
    expect(zips(ws).qty).toBe(960)
    expect(ws.losses.map((l) => [l.cause, l.qty])).toEqual([['count_shortage', 40]])
    adds(ws)
  })

  it('goes to paper and comes back: the sheet has a blank to fill, and a filled one is read by lot', () => {
    const lots = sheetLots(base(), { rackId: 'RK-001' }, TODAY)
    const sheet = sheetRows(base(), lots)
    expect(sheet[0]).toEqual(['Lot', 'Material', 'Code', 'Batch', 'Rack', 'Book', 'Unit', 'Counted', 'Note'])
    expect(sheet[1]).toEqual([lots[0].lot.id, 'Denim 14 oz', 'DEN-14', 'OPENING-2026-09-01', 'A-1', '500', 'm', '', ''])

    const filled = sheet.map((r, i) => (i === 1 ? [...r.slice(0, 7), '498', 'one torn end'] : i === 2 ? [...r.slice(0, 7), '', ''] : r))
    filled.push(['LOT-999', 'Something', '', '', '', '', '', '5', ''])
    const got = readFilledSheet(filled, lots)
    expect(got.counted).toEqual({ [lots[0].lot.id]: { qty: '498', note: 'one torn end' } })
    // a blank is "not counted", never nought; a lot the sheet does not have is counted as unmatched
    expect(got.unmatched).toBe(1)
  })
})

/* ================================================= found on the rack */

describe('a lot the book did not have', () => {
  it('goes on as a count against nothing, and says where it came from', () => {
    const f = { itemId: 'IT-001', qty: 42, on: TODAY, counter: 'S. Patil', note: 'Behind A-1', rack: 'RK-001' }
    expect(foundProblem(base(), { ...f, note: '' })).toMatch(/where it came from/)
    const [ws, lotId] = addFoundLot(base(), f)
    const lot = ws.stockLots.find((l) => l.id === lotId)!
    expect([lot.batchNo, lot.qty, lot.rack]).toEqual(['FOUND-2026-09-20', 42, 'RK-001'])
    expect(ws.counts.at(-1)).toMatchObject({ lotId, bookQty: 0, countedQty: 42 })
    expect(trail(ws, lotId).map((t) => [t.what, t.qty, t.note])).toEqual([['Count adjustment', 42, 'Behind A-1']])
    expect(usableOnHand(ws, 'IT-001')).toBe(542)
    adds(ws)
  })

  it('a remnant put back is on the book with its pieces, and is never cover', () => {
    const [ws] = addFoundLot(base(), {
      itemId: 'IT-001', qty: 6, on: TODAY, counter: '', note: 'Ends back from ST-12', remnant: true, pieces: 4,
    })
    const lot = ws.stockLots.at(-1)!
    expect([lot.batchNo, lot.remnant, lot.pieces]).toEqual(['REMNANT-2026-09-20', true, 4])
    expect(usableOnHand(ws, 'IT-001')).toBe(500)
  })

  it('is not judged for accuracy — there was no book to be right or wrong', () => {
    const [ws] = addFoundLot(base(), { itemId: 'IT-001', qty: 42, on: TODAY, counter: '', note: 'Behind A-1' })
    expect(pickedMetrics(ws, TODAY, 'inventory').find((m) => m.key === 'accuracy')!.measured).toBe(false)
    expect(countRows(ws)[0].over).toBe(false)
  })
})

/* ======================================================= variances */

describe('a count outside tolerance', () => {
  const short = () => recount(base(), {
    lotId: denim(base()).id, countedQty: 470, on: TODAY, counter: 'S. Patil', note: 'Roll 4 short',
  })[0]

  it('is raised on the dashboard until somebody looks, and badges the ledger', () => {
    const ws = short()
    // class A allows 1%; 30 of 500 is 6%
    expect(openVariances(ws).map((r) => r.count.id)).toEqual(['CC-001'])
    const card = inventoryDecisionsFor(ws, TODAY).find((d) => d.kind === 'count-variance')!
    expect(card.title).toBe('Denim 14 oz counted 6% short')
    expect(card.detail).toMatch(/470 counted against a book of 500 m on 2026-09-20\. Class A allows 1%/)
    expect(card.band).toBe('costs')
    expect(inventoryNav(ws, TODAY).find((r) => r.label === 'Stock ledger')!.badge).toBe('1')

    const noted = { ...ws, drafts: { ...ws.drafts, [varianceNotedKey('CC-001')]: true } }
    expect(openVariances(noted)).toEqual([])
    expect(inventoryDecisionsFor(noted, TODAY).some((d) => d.kind === 'count-variance')).toBe(false)
  })

  it('a later count of the same lot settles it', () => {
    const [ws] = recount(short(), { lotId: denim(short()).id, countedQty: 470, on: TODAY, counter: 'S. Patil' })
    expect(openVariances(ws)).toEqual([])
    expect(countRows(ws).map((r) => r.superseded)).toEqual([false, true])
  })

  it('moves record accuracy, over the counts that had a book to judge', () => {
    let ws = short()
    ;[ws] = recount(ws, { lotId: zips(ws).id, countedQty: 1000, on: TODAY, counter: 'S. Patil' })
    const acc = pickedMetrics(ws, TODAY, 'inventory').find((m) => m.key === 'accuracy')!
    expect([acc.value, acc.sub]).toEqual(['50%', 'of 2 counts inside tolerance'])
  })
})

/* ========================================== hold, release, write off */

describe('what happens to stock other than being used', () => {
  it('a lot put on hold is not cover, cannot be issued, and says so on its trail', () => {
    const lotId = denim(base()).id
    const ws = setLotState(base(), lotId, 'damaged', 'Water damage, outer wraps', '2026-09-05', 'S. Patil')
    expect(denim(ws)).toMatchObject({ usability: 'damaged', usabilityReason: 'Water damage, outer wraps' })
    expect(usableOnHand(ws, 'IT-001')).toBe(0)
    expect(trail(ws, lotId).map((t) => [t.what, t.balance])).toContainEqual(['Put damaged', 500])
    expect(setLotState(base(), lotId, 'qc_hold', '', TODAY, '')).toEqual(base())

    const back = setLotState(ws, lotId, 'usable', 'Rechecked, fine', TODAY, 'S. Patil')
    expect(usableOnHand(back, 'IT-001')).toBe(500)
    expect(trail(back, lotId).at(-1)!.what).toBe('Released — damaged no longer')
  })

  it('held too long, the dashboard asks for a decision', () => {
    const lotId = denim(base()).id
    const ws = setLotState(base(), lotId, 'qc_hold', 'Shade to be checked', '2026-09-01', 'S. Patil')
    expect(inventoryDecisionsFor(ws, '2026-09-10').some((d) => d.kind === 'held-long')).toBe(false)
    const card = inventoryDecisionsFor(ws, TODAY).find((d) => d.kind === 'held-long')!
    expect(HELD_TOO_LONG_DAYS).toBe(14)
    expect(card.title).toBe('Denim 14 oz has been on hold for 19 days')
    expect([card.act, card.alt?.act]).toEqual(['write-off', 'release'])
  })

  it('a write-off comes off the book against a loss, valued for what scrap would fetch', () => {
    const lotId = denim(base()).id
    const ws0 = { ...base(), scrapRate: { 'IT-001': 12 } }
    expect(writeOffProblem(ws0, { lotId, qty: 20, on: TODAY, actor: '', note: '' })).toMatch(/Say why/)
    expect(writeOffProblem(ws0, { lotId, qty: 600, on: TODAY, actor: '', note: 'Mould' })).toMatch(/Only 500/)
    const [ws, lossId] = writeOff(ws0, { lotId, qty: 20, on: TODAY, actor: 'S. Patil', note: 'Mould on two rolls' })
    expect(denim(ws).qty).toBe(480)
    expect(ws.losses.find((l) => l.id === lossId)).toMatchObject({
      cause: 'store_spoilage', qty: 20, recoveryRate: 12, source: 'loss', sourceRef: lossId,
    })
    expect(ws.moves.at(-1)).toMatchObject({ kind: 'write_off', qty: -20, sourceRef: lossId })
    adds(ws)
  })

  it('writing off what the gate rejected is a gate rejection, against the receipt', () => {
    let ws: Workspace = {
      ...base(),
      orders: [{ id: 'PO-001', no: 'PO-1', vendorId: 'VN-001', itemId: 'IT-001', qty: 100, unitPrice: 240,
        orderedOn: '2026-09-02', expectedOn: '2026-09-12', state: 'confirmed' }],
    }
    ;[ws] = arrive(ws, { order: ws.orders[0], qty: 100, receivedOn: '2026-09-12' })
    ws = closeReceipt(ws, 'GR-001', { rejected: 10, reason: 'Shade off', inspector: 'S. Patil', closedAt: '2026-09-12' })
    const [out] = writeOff(ws, { lotId: 'LOT-GR-001-NU', qty: 10, on: TODAY, actor: 'S. Patil', note: 'Supplier will not take it back' })
    expect(out.losses.at(-1)).toMatchObject({ cause: 'grn_rejection', source: 'grn', sourceRef: 'GR-001' })
    adds(out)
  })
})

/* ============================================ lots nobody can count */

describe('the walk only ever covers real piles', () => {
  it('lots on another rack, and empty lots, are off the sheet', () => {
    let ws = base()
    ;[ws] = addRack(ws, { name: 'B-1' })
    ws = placeLot(ws, zips(ws).id, 'RK-002', TODAY, '')
    expect(sheetLots(ws, { rackId: 'RK-001' }, TODAY).map((r) => r.lot.itemId)).toEqual(['IT-001'])
    ;[ws] = recount(ws, { lotId: denim(ws).id, countedQty: 0, on: TODAY, counter: '', note: 'All used, nobody wrote it' })
    expect(sheetLots(ws, { rackId: 'RK-001' }, TODAY)).toEqual([])
  })
})
