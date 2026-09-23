/**
 * The loss ledger: every loss has a cause, and scrap is money owed.
 *
 * Five of the causes post themselves from the event they came of; two are
 * typed. Net loss counts what scrap actually fetched once it is sold, and
 * the estimate until then. Scrap against target is floor losses over what
 * was issued, per material, per month.
 */
import { describe, expect, it } from 'vitest'
import { emptyWorkspace } from '@/lib/workspace/defaults'
import { applyCount } from '@/lib/workspace/count'
import { recount } from '@/lib/workspace/counting'
import { inventoryDecisionsFor } from '@/lib/workspace/inventory-decisions'
import { addJob, issueMaterial, setJobNumbering, wasteOnJob } from '@/lib/workspace/jobs'
import { closeChallan, removeChallan, sendOut, JOBWORKER } from '@/lib/workspace/jobwork'
import { drift } from '@/lib/workspace/ledger'
import {
  byCause, FLOOR_CAUSES, lossRows, netLossOf, noSale, scrapNotedKey, scrapRows, sellProblem,
  sellScrap, unrealised, unsoldPast, writeOff,
} from '@/lib/workspace/losses'
import { pickedMetrics } from '@/lib/workspace/metrics'
import { inventoryNav } from '@/lib/workspace/reveal'
import type { Workspace } from '@/lib/workspace/types'
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
const base = (): Workspace => {
  let ws: Workspace = {
    ...emptyWorkspace({ id: 'WS-1', createdAt: '2026-01-01', ownerName: 'R. Mehta', contact: '', companyName: 'Indigo Threads', makes: 'Jeans' }),
    items: [item()],
    vendors: [{ id: 'VN-001', name: 'Arvind Mills', paymentTermsDays: 30 }, { id: 'VN-002', name: 'Shree Wash', paymentTermsDays: 0 }],
    vendorType: { 'VN-002': JOBWORKER },
    vendorItems: [rate],
    scrapRate: { 'IT-001': 20 },
  }
  ws = applyCount(ws, '2026-09-01', { 'IT-001': { good: 1000 } }, 'R. Mehta')
  ws = setJobNumbering(ws, { word: 'style', prefix: 'ST' })
  ;[ws] = addJob(ws, { no: 'ST-1', openedOn: '2026-09-02' })
  return ws
}
const adds = (ws: Workspace) => expect(drift(ws)).toEqual([])

describe('every loss has a cause, and most post themselves', () => {
  it('a short count, a spoiled lot, wastage on a job and a jobworker who kept too much', () => {
    let ws = base()
    const lot = ws.stockLots[0].id
    ;[ws] = recount(ws, { lotId: lot, countedQty: 990, on: '2026-09-05', counter: 'S. Patil', note: 'Short a bolt' })
    ;[ws] = writeOff(ws, { lotId: lot, qty: 5, on: '2026-09-06', actor: 'S. Patil', note: 'Water damage' })
    ;[ws] = issueMaterial(ws, { jobId: 'JB-001', itemId: 'IT-001', qty: 200, on: '2026-09-10', takenBy: '', actor: '' })
    ;[ws] = wasteOnJob(ws, { jobId: 'JB-001', itemId: 'IT-001', qty: 8, on: '2026-09-12', actor: '', note: 'Mis-cut' })
    ;[ws] = sendOut(ws, { vendorId: 'VN-002', itemId: 'IT-001', qty: 100, sentOn: '2026-09-10', dueBack: '2026-09-15', expectedYield: 1, actor: '' })
    ws = closeChallan(ws, 'JW-001', { reason: 'Nothing came back — washed out', on: '2026-09-18', unaccounted: 100, actor: 'R. Mehta' })
    adds(ws)
    expect(ws.losses.map((l) => [l.cause, l.qty, l.sourceRef])).toEqual([
      ['count_shortage', 10, 'CC-001'],
      ['store_spoilage', 5, ws.losses[1].id],
      ['process_scrap', 8, 'ST-1'],
      ['jobwork_loss', 100, 'JW-1'],
    ])
    expect(ws.losses[3]).toMatchObject({ source: 'challan', recoveryRate: 0, note: 'Nothing came back — washed out' })
    // the jobworker's loss leaves the challan's own movement as the only one: nothing is taken twice
    expect(ws.moves.filter((m) => m.sourceRef === 'JW-1')).toHaveLength(1)
  })

  it('a challan taken back takes its loss with it', () => {
    let ws = base()
    ;[ws] = sendOut(ws, { vendorId: 'VN-002', itemId: 'IT-001', qty: 100, sentOn: '2026-09-10', dueBack: '2026-09-15', expectedYield: 1, actor: '' })
    ws = closeChallan(ws, 'JW-001', { reason: 'Never came back', on: '2026-09-18', unaccounted: 100 })
    const gone = removeChallan(ws, 'JW-001')
    expect(gone.losses).toEqual([])
    adds(gone)
  })
})

describe('what a loss cost, and what came back', () => {
  const wasted = () => {
    let [ws] = issueMaterial(base(), { jobId: 'JB-001', itemId: 'IT-001', qty: 200, on: '2026-09-10', takenBy: '', actor: '' })
    ;[ws] = wasteOnJob(ws, { jobId: 'JB-001', itemId: 'IT-001', qty: 10, on: '2026-09-12', actor: '', note: 'Mis-cut' })
    return ws
  }

  it('costs at the last price, and owes what the dealer pays until it is sold', () => {
    const ws = wasted()
    const [row] = lossRows(ws, TODAY)
    expect([row.cost.value, row.recovery.value, row.state, row.job]).toEqual([2400, 200, 'owed', 'ST-1'])
    expect(netLossOf(ws).value).toBe(2200)
    expect(unrealised(ws, TODAY).value).toBe(200)
  })

  it('sold: net loss counts what actually arrived, not the estimate', () => {
    const lossId = wasted().losses[0].id
    expect(sellProblem(wasted(), lossId, -1)).toMatch(/what the dealer actually paid/)
    const ws = sellScrap(wasted(), lossId, { on: TODAY, realised: 150 })
    expect(lossRows(ws, TODAY)[0].state).toBe('sold')
    expect(netLossOf(ws).value).toBe(2250)
    expect(sellProblem(ws, lossId, 10)).toMatch(/already settled/)
  })

  it('no sale: the hoped-for recovery becomes a decided dead loss', () => {
    const lossId = wasted().losses[0].id
    const ws = noSale(wasted(), lossId, TODAY)
    expect(lossRows(ws, TODAY)[0].state).toBe('no_sale')
    expect(netLossOf(ws).value).toBe(2400)
  })

  it('by cause adds up to the same net as the ledger', () => {
    let ws = wasted()
    ;[ws] = writeOff(ws, { lotId: ws.stockLots[0].id, qty: 5, on: TODAY, actor: '', note: 'Mould on the wrap' })
    const causes = byCause(ws)
    expect(causes.map((c) => c.cause).sort()).toEqual(['process_scrap', 'store_spoilage'])
    expect(causes.reduce((a, c) => a + c.net, 0)).toBe(netLossOf(ws).value)
  })
})

describe('scrap still in the bin', () => {
  it('is raised once it has sat past the store rule, and "no sale" or a sale settles it', () => {
    let [ws] = issueMaterial(base(), { jobId: 'JB-001', itemId: 'IT-001', qty: 100, on: '2026-05-01', takenBy: '', actor: '' })
    ;[ws] = wasteOnJob(ws, { jobId: 'JB-001', itemId: 'IT-001', qty: 4, on: '2026-05-02', actor: '', note: 'End bits' })
    const lossId = ws.losses[0].id
    // ninety days by default
    expect(unsoldPast(ws, '2026-07-25')).toEqual([])
    const card = inventoryDecisionsFor(ws, TODAY).find((d) => d.kind === 'scrap-unsold')!
    expect(card.title).toBe('Scrap from ST-1 unsold for 141 days')
    expect([card.act, card.alt?.act, card.refs.lossId]).toEqual(['sell', 'no-sale', lossId])
    expect(inventoryNav(ws, TODAY).find((r) => r.label === 'Wastage & loss')!.badge).toBe('1')
    expect(inventoryDecisionsFor(noSale(ws, lossId, TODAY), TODAY).some((d) => d.kind === 'scrap-unsold')).toBe(false)
  })

  it('dead loss is never owed, so never chased', () => {
    let [ws] = issueMaterial({ ...base(), scrapRate: {} }, { jobId: 'JB-001', itemId: 'IT-001', qty: 100, on: '2026-05-01', takenBy: '', actor: '' })
    ;[ws] = wasteOnJob(ws, { jobId: 'JB-001', itemId: 'IT-001', qty: 4, on: '2026-05-02', actor: '', note: 'End bits' })
    expect(lossRows(ws, TODAY)[0].state).toBe('dead')
    expect(unsoldPast(ws, TODAY)).toEqual([])
  })
})

describe('scrap against target', () => {
  it('is floor losses over what was issued this month, per material', () => {
    let [ws] = issueMaterial(base(), { jobId: 'JB-001', itemId: 'IT-001', qty: 200, on: '2026-09-10', takenBy: '', actor: '' })
    ;[ws] = wasteOnJob(ws, { jobId: 'JB-001', itemId: 'IT-001', qty: 10, on: '2026-09-12', actor: '', note: 'Mis-cut' })
    // a spoiled lot is a loss, but not scrap
    ;[ws] = writeOff(ws, { lotId: ws.stockLots[0].id, qty: 50, on: '2026-09-12', actor: '', note: 'Mould on the wrap' })
    const [r] = scrapRows(ws, '2026-09')
    expect([r.issued, r.lost, r.pct.value, r.target, r.over]).toEqual([200, 10, 5, 3, true])
    expect(FLOOR_CAUSES).not.toContain('store_spoilage')
    const card = inventoryDecisionsFor(ws, TODAY).find((d) => d.kind === 'scrap-over')!
    expect(card.title).toBe('Scrap on Denim 14 oz ran 5% this month')
    const noted = { ...ws, drafts: { ...ws.drafts, [scrapNotedKey('IT-001', '2026-09')]: true } }
    expect(inventoryDecisionsFor(noted, TODAY).some((d) => d.kind === 'scrap-over')).toBe(false)
    // and last month's issues do not count in this month's figure
    expect(scrapRows(ws, '2026-08')).toEqual([])
  })

  it('shows on the dashboard as the material furthest over, with net loss beside it', () => {
    let [ws] = issueMaterial(base(), { jobId: 'JB-001', itemId: 'IT-001', qty: 200, on: '2026-09-10', takenBy: '', actor: '' })
    ;[ws] = wasteOnJob(ws, { jobId: 'JB-001', itemId: 'IT-001', qty: 10, on: '2026-09-12', actor: '', note: 'Mis-cut' })
    const m = pickedMetrics(ws, TODAY, 'inventory')
    const get = (k: string) => m.find((x) => x.key === k)!
    expect([get('scrap').value, get('scrap').tone]).toEqual(['5%', 'critical'])
    expect(get('netLoss').value).toBe('₹2,200')
  })
})
