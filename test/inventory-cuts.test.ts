/**
 * Cutting and offcuts, behind the switch.
 *
 * Off by default, and off means absent: no rail row, no cards, no figure. On,
 * a cut is refused unless input = parts + kerf + remnants; each usable
 * remnant size becomes a flagged lot that is never cover; a piece under the
 * smallest usable one is scrap at the cut; and switching off again keeps
 * every record where it was.
 */
import { describe, expect, it } from 'vitest'
import { emptyWorkspace } from '@/lib/workspace/defaults'
import { applyCount } from '@/lib/workspace/count'
import { bundleFor } from '@/lib/workspace/bundle'
import {
  cutNotedKey, cutProblem, cutRows, offcutRows, recordCut, remnantEffects, remnantNotedKey,
  removeCut, removeCutProblem, scrapRemnant, scrapRemnantProblem, useRemnant, useRemnantProblem,
  type CutInput,
} from '@/lib/workspace/cutting'
import { inventoryDecisionsFor } from '@/lib/workspace/inventory-decisions'
import {
  addJob, jobProblemToRemove, jobRows, onJob, removeSlip, returnToStore, setJobNumbering,
} from '@/lib/workspace/jobs'
import { drift, remnantOnHand, usableOnHand } from '@/lib/workspace/ledger'
import { scrapRows } from '@/lib/workspace/losses'
import { pickedMetrics, stageMetrics } from '@/lib/workspace/metrics'
import { inventoryNav } from '@/lib/workspace/reveal'
import type { PurchaseOrder, Workspace } from '@/lib/workspace/types'
import type { Item, VendorItem } from '@/lib/domain/types'

const TODAY = '2026-09-20'
const item = (over: Partial<Item> = {}): Item => ({
  id: 'IT-001', code: 'DEN-14', name: 'Denim 14 oz', uom: 'm', itemClass: 'A',
  coverageCeilingMonths: 2, moq: 100, safetyStock: 0, avgDailyConsumption: 20,
  floorConsumptionPerDay: 20, lastPurchaseRate: 240, feeds: [], ...over,
})
const rate: VendorItem = {
  vendorId: 'VN-001', itemId: 'IT-001', rate: 240, freightPerUnit: 0, nonCreditableGst: 0,
  paymentTermCost: 0, rejectionAllowance: 0, quotedLeadTimeDays: 10, trailingLeadTimeDays: 10,
  trailingRejectionRate: 0, onTimePct: 0, score: 0, quoteValidUntil: '',
}
const base = (cutting = true): Workspace => {
  let ws: Workspace = {
    ...emptyWorkspace({ id: 'WS-1', createdAt: '2026-01-01', ownerName: 'R. Mehta', contact: '', companyName: 'Indigo Threads', makes: 'Jeans' }),
    items: [item()],
    vendors: [{ id: 'VN-001', name: 'Arvind Mills', paymentTermsDays: 30 }],
    vendorItems: [rate],
    scrapRate: { 'IT-001': 20 },
    minRemnant: { 'IT-001': 0.5 },
    racks: [{ id: 'RK-001', name: 'C-1' }],
    cutting,
  }
  ws = applyCount(ws, '2026-09-01', { 'IT-001': { good: 1000, rack: 'RK-001' } }, 'R. Mehta')
  ws = setJobNumbering(ws, { word: 'style', prefix: 'ST' })
  ;[ws] = addJob(ws, { no: 'ST-1', openedOn: '2026-09-02' })
  return ws
}
const adds = (ws: Workspace) => expect(drift(ws)).toEqual([])

/** A lay of 100 m for ST-1: 92 m of parts, 1 m kerf, three 2 m remnants and four 0.25 m bits. */
const lay = (over: Partial<CutInput> = {}): CutInput => ({
  itemId: 'IT-001', jobId: 'JB-001', on: '2026-09-10', inputQty: 100,
  plannedPartsQty: 93, partsQty: 92, partsCount: 120, kerfQty: 1,
  remnants: [{ size: 2, pieces: 3, spec: '2 m × full width' }, { size: 0.25, pieces: 4, spec: '' }],
  rack: 'RK-001', operator: 'K. Rao', ...over,
})

describe('the switch', () => {
  it('off: no row, no cards, no figure — and no cut', () => {
    const ws = base(false)
    expect(inventoryNav(ws, TODAY).map((r) => r.label)).not.toContain('Cutting & offcuts')
    expect(stageMetrics(ws, TODAY, 'inventory').map((m) => m.key)).not.toContain('remnants')
    expect(pickedMetrics(ws, TODAY, 'inventory')).toHaveLength(7)
    expect(cutProblem(ws, lay())).toBe('Cutting is switched off in the store rules.')
    expect(recordCut(ws, lay())[0]).toBe(ws)
  })

  it('on: the row sits after the jobs, and the remnants figure is offered and picked', () => {
    const ws = base()
    expect(inventoryNav(ws, TODAY).map((r) => r.label))
      .toEqual(['Dashboard', 'Stock ledger', 'In-house', 'Jobwork', 'Cutting & offcuts', 'Wastage & loss', 'Racks'])
    expect(stageMetrics(ws, TODAY, 'inventory').map((m) => m.key)).toContain('remnants')
    const fig = pickedMetrics(ws, TODAY, 'inventory').find((m) => m.key === 'remnants')!
    expect(fig).toMatchObject({ measured: false, value: 'No remnants yet' })
  })

  it('switching off keeps every record, and switching on finds them where they were', () => {
    let ws = base()
    ;[ws] = recordCut(ws, lay())
    const off = { ...ws, cutting: false }
    expect(off.cuts).toEqual(ws.cuts)
    expect(off.stockLots).toEqual(ws.stockLots)
    expect(off.losses).toEqual(ws.losses)
    expect(inventoryNav(off, TODAY).map((r) => r.label)).not.toContain('Cutting & offcuts')
    expect(inventoryDecisionsFor({ ...off, drafts: {} }, '2027-01-01').filter((d) => d.kind.startsWith('remnant') || d.kind === 'cut-below-plan')).toEqual([])
    const on = { ...off, cutting: true }
    expect(offcutRows(on, TODAY)).toHaveLength(1)
    expect(cutRows(on)).toHaveLength(1)
  })
})

describe('a cut', () => {
  it('is refused unless it adds up, and never over-draws a lot', () => {
    const ws = base()
    expect(cutProblem(ws, lay({ partsQty: 80 }))).toMatch(/does not add up: parts \+ kerf \+ remnants come to 88, and 100 went on the table/)
    expect(cutProblem(ws, lay({ inputQty: 1200, partsQty: 1190 }))).toMatch(/No one lot has that much/)
    const lotId = ws.stockLots[0].id
    expect(cutProblem(ws, lay({ lotId, inputQty: 1200, partsQty: 1190 }))).toMatch(/Only 1000 is on/)
    expect(cutProblem(ws, lay({ remnants: [{ size: 2, pieces: 1.5, spec: '' }] }))).toMatch(/whole number of pieces/)
    expect(cutProblem(ws, lay())).toBeNull()
  })

  it('draws its input off one lot, puts usable remnants back as a flagged lot and bins the rest', () => {
    let ws = base()
    const lotId = ws.stockLots[0].id
    let id: string
    ;[ws, id] = recordCut(ws, lay())
    adds(ws)
    expect(id).toBe('CT-001')
    expect(ws.cuts[0]).toMatchObject({ cutNo: 'CUT-1', workOrder: 'ST-1', jobId: 'JB-001', lotId, rack: 'RK-001' })
    expect(ws.moves.filter((m) => m.sourceRef === 'CUT-1').map((m) => [m.kind, m.qty])).toEqual([
      ['issue', -100], ['offcut_in', 6],
    ])
    // one lot per usable size, flagged, on the rack the cut named, with its pieces
    const rem = ws.stockLots.filter((l) => l.remnant)
    expect(rem).toHaveLength(1)
    expect(rem[0]).toMatchObject({ qty: 6, size: 2, pieces: 3, spec: '2 m × full width', cutId: 'CT-001', rack: 'RK-001', on: '2026-09-10' })
    // under the 0.5 m minimum is scrap at the cut; the blade's share is kerf
    expect(ws.losses.map((l) => [l.cause, l.qty, l.sourceRef, l.jobId, l.recoveryRate])).toEqual([
      ['cut_offcut_scrap', 1, 'CUT-1', 'JB-001', 20],
      ['cut_kerf', 1, 'CUT-1', 'JB-001', 0],
    ])
    // a remnant is on the book and never cover
    expect(usableOnHand(ws, 'IT-001')).toBe(900)
    expect(remnantOnHand(ws, 'IT-001')).toBe(6)
    expect(bundleFor(ws, TODAY).stockLots.some((l) => l.id === rem[0].id)).toBe(false)
  })

  it('counts toward its job: issued is the lay, returned is what went back on a rack, wasted is kerf and scrap', () => {
    let ws = base()
    ;[ws] = recordCut(ws, lay())
    expect(onJob(ws, 'JB-001', 'IT-001')).toEqual({ issued: 100, returned: 6, wasted: 2, withJob: 92 })
    const row = jobRows(ws)[0]
    expect(row.materials[0]).toMatchObject({ issued: 100, returned: 6, wasted: 2, used: 94 })
    expect(row.lastOn).toBe('2026-09-10')
    expect(jobProblemToRemove(ws, 'JB-001')).toMatch(/1 cut/)
  })

  it('reads its yield against the plan, and the split it actually wrote', () => {
    let ws = base()
    ;[ws] = recordCut(ws, lay())
    ;[ws] = recordCut(ws, lay({ on: '2026-09-11', plannedPartsQty: 95, partsQty: 85, kerfQty: 8 }))
    const [second, first] = cutRows(ws)
    expect(first).toMatchObject({ usable: 6, scrap: 1, balances: true, belowPlan: false })
    expect(first.yielded.value).toBe(92)
    expect(second.shortfall.value).toBe(10)
    expect(second.belowPlan).toBe(true)
    // a smallest piece raised later does not rewrite what the cut did
    expect(cutRows({ ...ws, minRemnant: { 'IT-001': 5 } })[1]).toMatchObject({ usable: 6, scrap: 1 })
  })

  it('taken back puts the lay back on its lot, and takes its remnants and losses with it', () => {
    let ws = base()
    const before = ws
    ;[ws] = recordCut(ws, lay())
    const back = removeCut(ws, 'CT-001')
    adds(back)
    expect(back.stockLots).toEqual(before.stockLots)
    expect(back.moves).toEqual(before.moves)
    expect(back.losses).toEqual([])
    expect(back.cuts).toEqual([])
  })

  it('cannot be taken back once a remnant it made has been used', () => {
    let ws = base()
    ;[ws] = recordCut(ws, lay())
    const rem = ws.stockLots.find((l) => l.remnant)!
    ;[ws] = useRemnant(ws, { lotId: rem.id, pieces: 1, jobId: 'JB-001', on: '2026-09-12', actor: 'S. Patil' })
    expect(removeCutProblem(ws, 'CT-001')).toMatch(/has been used or moved since/)
    expect(removeCut(ws, 'CT-001')).toBe(ws)
  })

  it('floor losses at the cut count as scrap against what was issued', () => {
    let ws = base()
    ;[ws] = recordCut(ws, lay())
    const [row] = scrapRows(ws, '2026-09')
    expect(row).toMatchObject({ issued: 100, lost: 2 })
    expect(row.pct.value).toBe(2)
  })
})

describe('the register', () => {
  it('using pieces writes a slip against the job and a remnant movement; taking it back restores the pieces', () => {
    let ws = base()
    ;[ws] = recordCut(ws, lay())
    const rem = ws.stockLots.find((l) => l.remnant)!
    expect(useRemnantProblem(ws, { lotId: rem.id, pieces: 4, jobId: 'JB-001', on: TODAY, actor: '' })).toBe('There are only 3 pieces.')
    let slipId: string
    ;[ws, slipId] = useRemnant(ws, { lotId: rem.id, pieces: 2, jobId: 'JB-001', on: '2026-09-12', actor: 'S. Patil' })
    adds(ws)
    expect(ws.stockLots.find((l) => l.id === rem.id)).toMatchObject({ qty: 2, pieces: 1 })
    expect(ws.issues.find((s) => s.id === slipId)).toMatchObject({ kind: 'issue', jobId: 'JB-001', lines: [{ lotId: rem.id, qty: 4, pieces: 2 }] })
    expect(ws.moves.at(-1)).toMatchObject({ kind: 'offcut_issue', qty: -4, jobId: 'JB-001' })
    expect(onJob(ws, 'JB-001', 'IT-001').issued).toBe(104)
    const back = removeSlip(ws, slipId)
    adds(back)
    expect(back.stockLots.find((l) => l.id === rem.id)).toMatchObject({ qty: 6, pieces: 3 })
  })

  it('scrapping pieces is a write-off and scrap at the cut, at the dealer’s rate', () => {
    let ws = base()
    ;[ws] = recordCut(ws, lay())
    const rem = ws.stockLots.find((l) => l.remnant)!
    expect(scrapRemnantProblem(ws, { lotId: rem.id, pieces: 3, on: TODAY, actor: '', note: '' })).toMatch(/Say why/)
    let lossId: string
    ;[ws, lossId] = scrapRemnant(ws, { lotId: rem.id, pieces: 3, on: TODAY, actor: 'R. Mehta', note: 'Too old to use' })
    adds(ws)
    expect(ws.stockLots.find((l) => l.id === rem.id)).toMatchObject({ qty: 0, pieces: 0 })
    expect(ws.losses.find((l) => l.id === lossId)).toMatchObject({ cause: 'cut_offcut_scrap', qty: 6, recoveryRate: 20, note: 'Too old to use' })
    expect(offcutRows(ws, TODAY)).toEqual([])
  })

  it('a remnant returned from a job without a cut shows too, with the slip and the job', () => {
    let ws = base()
    ;[ws] = recordCut(ws, lay({ remnants: [], partsQty: 99 }))
    ;[ws] = returnToStore(ws, { jobId: 'JB-001', itemId: 'IT-001', qty: 3, on: '2026-09-12', actor: '', asRemnant: true, pieces: 2, rack: 'RK-001' })
    adds(ws)
    const [row] = offcutRows(ws, TODAY)
    expect(row).toMatchObject({ pieces: 2, job: 'ST-1', value: 720 })
    expect(row.from).toMatch(/^IS-/)
    expect(row.rack?.name).toBe('C-1')
  })
})

describe('the cards and the figure, with cutting on', () => {
  it('a remnant past its age asks to be used or scrapped, and the row badges it', () => {
    let ws = base()
    ;[ws] = recordCut(ws, lay())
    const later = '2026-12-20'
    const card = inventoryDecisionsFor(ws, later).find((d) => d.kind === 'remnant-aged')!
    expect(card).toMatchObject({ act: 'use', alt: { act: 'scrap' }, href: '/inventory/offcuts' })
    expect(card.title).toBe('A remnant of Denim 14 oz is 101 days old')
    expect(inventoryNav(ws, later).find((r) => r.label === 'Cutting & offcuts')?.badge).toBe('1')
    const fig = pickedMetrics(ws, later, 'inventory').find((m) => m.key === 'remnants')!
    expect(fig).toMatchObject({ measured: true, value: '₹1,440', sub: '1 of 1 past 90 days', tone: 'warn' })
    // not asked of a store with cutting off
    expect(inventoryDecisionsFor({ ...ws, cutting: false }, later).some((d) => d.kind === 'remnant-aged')).toBe(false)
  })

  it('a cut well below plan is a card until somebody notes it', () => {
    let ws = base()
    ;[ws] = recordCut(ws, lay({ plannedPartsQty: 95, partsQty: 85, kerfQty: 8 }))
    const card = inventoryDecisionsFor(ws, TODAY).find((d) => d.kind === 'cut-below-plan')!
    expect(card).toMatchObject({ act: 'keep', refs: { cutId: 'CT-001' } })
    expect(card.title).toBe('CUT-1 came out 10 points below plan')
    expect(inventoryNav(ws, TODAY).find((r) => r.label === 'Cutting & offcuts')?.badge).toBe('1')
    ws = { ...ws, drafts: { ...ws.drafts, [cutNotedKey('CT-001')]: true } }
    expect(inventoryDecisionsFor(ws, TODAY).some((d) => d.kind === 'cut-below-plan')).toBe(false)
    expect(inventoryNav(ws, TODAY).find((r) => r.label === 'Cutting & offcuts')?.badge).toBeUndefined()
  })

  it('a draft order the remnants would bring down is said; one the smallest order swallows is not a card', () => {
    let ws = base()
    // enough cut away that the desk wants more: 1000 − 900 on the table leaves 100 full lengths
    ;[ws] = recordCut(ws, lay({ inputQty: 900, plannedPartsQty: 780, partsQty: 780, kerfQty: 0, remnants: [{ size: 2, pieces: 60, spec: '' }] }))
    const order = (qty: number, moq = 100): PurchaseOrder => ({
      id: 'PO-001', no: 'PO-1', vendorId: 'VN-001', itemId: 'IT-001', qty, unitPrice: 240,
      orderedOn: TODAY, expectedOn: '2026-09-30', state: 'draft',
    })
    ws = { ...ws, orders: [order(500)] }
    const [e] = remnantEffects(ws, TODAY)
    expect(e.remnant).toBe(120)
    expect(e.without.revisedQty.value).toBeGreaterThan(e.effect.revisedQty.value)
    expect(e.moves).toBe(true)
    const card = inventoryDecisionsFor(ws, TODAY).find((d) => d.kind === 'remnant-covers')!
    expect(card).toMatchObject({ act: 'open', href: '/sourcing/orders', alt: { act: 'keep' }, refs: { orderNo: 'PO-1' } })
    // kept as it is: the card goes
    const kept = { ...ws, drafts: { ...ws.drafts, [remnantNotedKey('PO-1', 'IT-001')]: true } }
    expect(inventoryDecisionsFor(kept, TODAY).some((d) => d.kind === 'remnant-covers')).toBe(false)
    // a smallest order of 1000 rounds both back up to the same figure: nothing moves, no card
    const big = { ...ws, items: [item({ moq: 1000 })] }
    const [b] = remnantEffects(big, TODAY)
    expect(b.moves).toBe(false)
    expect(inventoryDecisionsFor(big, TODAY).some((d) => d.kind === 'remnant-covers')).toBe(false)
  })
})
