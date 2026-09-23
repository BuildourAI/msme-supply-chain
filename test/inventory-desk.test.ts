/**
 * The store, for an owner's own company.
 *
 * The sample company's inventory stage is proved by `inventory.test.ts`
 * against its seed. This proves the owner's version against a workspace built
 * the way an owner builds one — typed in, nothing from the sample — and holds
 * every writer to the ledger's one rule: Σ movements per lot = the lot's
 * quantity, always.
 */
import { describe, expect, it } from 'vitest'
import { buildRows } from '@/lib/domain/derive'
import { bundleFor } from '@/lib/workspace/bundle'
import { emptyWorkspace } from '@/lib/workspace/defaults'
import { INVENTORY_STEPS, SOURCING_STEPS, progressOf, stepsFor } from '@/lib/workspace/checklist'
import { applyCount } from '@/lib/workspace/count'
import { inventoryDecisionsFor, inventoryOpenCount } from '@/lib/workspace/inventory-decisions'
import {
  allocate, coverLots, drift, lotRows, newLot, post, postProblem, reverse, trail, usableOnHand,
} from '@/lib/workspace/ledger'
import { addJob, jobProblem, nextJobNo, setJobNumbering } from '@/lib/workspace/jobs'
import { pickedMetrics } from '@/lib/workspace/metrics'
import {
  addRack, placeLot, rackImpact, rackProblem, rackRows, removeRack, unplacedLots, updateRack,
} from '@/lib/workspace/racks'
import { closeReceipt, arrive, removeReceipt, removeReceiptProblem } from '@/lib/workspace/receipts'
import { BUILT, STAGE_HOME, inventoryNav, navFor } from '@/lib/workspace/reveal'
import { removeItem } from '@/lib/workspace/sourcing'
import { parseStored } from '@/lib/workspace/storage'
import { SCHEMA, type Workspace } from '@/lib/workspace/types'
import type { Item, Vendor, VendorItem } from '@/lib/domain/types'

const TODAY = '2026-09-20'

const fresh = (): Workspace => emptyWorkspace({
  id: 'WS-1', createdAt: '2026-01-01',
  ownerName: 'R. Mehta', contact: '', companyName: 'Indigo Threads', makes: 'Jeans',
})

const item = (over: Partial<Item> = {}): Item => ({
  id: 'IT-001', code: 'DEN-14', name: 'Denim 14 oz', uom: 'm', itemClass: 'A',
  coverageCeilingMonths: 2, moq: 100, safetyStock: 0, avgDailyConsumption: 20,
  floorConsumptionPerDay: 20, lastPurchaseRate: 240, feeds: [], ...over,
})
const vendor = (over: Partial<Vendor> = {}): Vendor => ({
  id: 'VN-001', name: 'Arvind Mills', paymentTermsDays: 30, ...over,
})
const rate = (over: Partial<VendorItem> = {}): VendorItem => ({
  vendorId: 'VN-001', itemId: 'IT-001', rate: 240,
  freightPerUnit: 0, nonCreditableGst: 0, paymentTermCost: 0, rejectionAllowance: 0,
  quotedLeadTimeDays: 10, trailingLeadTimeDays: 10, trailingRejectionRate: 0,
  onTimePct: 0, score: 0, quoteValidUntil: '', ...over,
})
const set = (): Workspace => ({
  ...fresh(),
  items: [item(), item({ id: 'IT-002', code: 'RIV', name: 'Copper rivet', uom: 'nos', itemClass: 'C', lastPurchaseRate: 1.5 })],
  vendors: [vendor()],
  vendorItems: [rate(), rate({ itemId: 'IT-002', rate: 1.5 })],
})
const counted = (): Workspace =>
  applyCount(set(), '2026-09-01', { 'IT-001': { good: 500 }, 'IT-002': { good: 2000 } }, 'R. Mehta')

/** The rule every writer is held to. */
const adds = (ws: Workspace) => expect(drift(ws)).toEqual([])

/* ================================================================ the steps */

describe('setting up the store', () => {
  it('is five steps, two of them sourcing\'s own', () => {
    expect(INVENTORY_STEPS.map((s) => s.id)).toEqual(['materials', 'racks', 'stock', 'jobs', 'storeRules'])
    expect(INVENTORY_STEPS[0]).toBe(SOURCING_STEPS.find((s) => s.id === 'materials'))
    expect(INVENTORY_STEPS[2]).toBe(SOURCING_STEPS.find((s) => s.id === 'stock'))
    expect(stepsFor('inventory')).toBe(INVENTORY_STEPS)
  })

  it('opens at the masters for a company that starts here, and one that has counted opens further on', () => {
    expect(progressOf(fresh(), INVENTORY_STEPS).next?.id).toBe('materials')
    const p = progressOf(counted(), INVENTORY_STEPS)
    expect(p.next?.id).toBe('racks')
    expect(p.doneCount).toBe(2)
  })

  it('takes "everything is in one place" as an answer to the racks step', () => {
    const racks = INVENTORY_STEPS.find((s) => s.id === 'racks')!
    expect(racks.done(set())).toBe(false)
    expect(racks.done({ ...set(), drafts: { 'inventory.oneRack': true } })).toBe(true)
    expect(racks.summary({ ...set(), drafts: { 'inventory.oneRack': true } })).toBe('one store, no racks')
    const [ws] = addRack(set(), { name: 'A-1' })
    expect(racks.done(ws)).toBe(true)
  })

  it('ticks the job step once the owner has said what they call a job', () => {
    const jobs = INVENTORY_STEPS.find((s) => s.id === 'jobs')!
    expect(jobs.done(set())).toBe(false)
    const ws = setJobNumbering(set(), { word: 'style', prefix: 'st' })
    expect(jobs.done(ws)).toBe(true)
    expect(ws.jobNumbering).toEqual({ word: 'style', prefix: 'ST' })
    expect(jobs.summary(ws)).toBe('styles numbered ST-…')
  })

  it('ticks the store rules only once they are agreed', () => {
    const rules = INVENTORY_STEPS.find((s) => s.id === 'storeRules')!
    expect(rules.done(set())).toBe(false)
    expect(rules.done({ ...set(), drafts: { 'inventory.rules.agreed': true } })).toBe(true)
    expect(rules.summary({ ...set(), cutting: true })).toMatch(/cutting on$/)
  })
})

/* ================================================================== the rail */

describe('the store\'s rail', () => {
  it('is open for an owner, and its tile leads to its dashboard', () => {
    expect(BUILT).toContain('inventory')
    expect(STAGE_HOME.inventory).toBe('/inventory/dashboard')
  })

  it('keeps racks under More, and badges only work waiting', () => {
    const rows = inventoryNav(set(), TODAY)
    expect(rows.map((r) => r.label)).toEqual(['Dashboard', 'Stock ledger', 'In-house', 'Wastage & loss', 'Racks'])
    expect(rows.filter((r) => r.tucked).map((r) => r.label)).toEqual(['Racks'])
    expect(rows.every((r) => r.badge === undefined)).toBe(true)
    expect(navFor('inventory', set(), TODAY)).toEqual(rows)
  })

  it('calls the jobs row In-house whatever the owner\'s word, and badges the open ones', () => {
    let ws = setJobNumbering(set(), { word: 'style', prefix: 'ST' })
    ;[ws] = addJob(ws, { no: 'ST-1', openedOn: TODAY })
    expect(inventoryNav(ws, TODAY).find((r) => r.href === '/inventory/issues')).toMatchObject({ label: 'In-house', badge: '1' })
  })

  it('badges the ledger with lots past their counting date', () => {
    // class A is counted every 7 days; counted on the 1st, the 20th is past it
    const rows = inventoryNav(counted(), TODAY)
    expect(rows.find((r) => r.label === 'Stock ledger')!.badge).toBe('1')
  })
})

/* ============================================================ the ledger */

describe('the ledger', () => {
  it('opens every counted lot with a line, so the book adds up', () => {
    const ws = counted()
    adds(ws)
    expect(ws.moves.map((m) => [m.kind, m.qty, m.sourceRef, m.actor])).toEqual([
      ['opening', 500, 'COUNT-2026-09-01', 'R. Mehta'],
      ['opening', 2000, 'COUNT-2026-09-01', 'R. Mehta'],
    ])
    expect(ws.stockLots.every((l) => l.on === '2026-09-01')).toBe(true)
  })

  it('never takes more off a lot than is on it, nor issues from a held one', () => {
    const ws = counted()
    const lot = ws.stockLots[0]
    const off = { lotId: lot.id, itemId: lot.itemId, on: TODAY, kind: 'issue' as const, source: 'job' as const, sourceRef: 'IS-1', actor: '' }
    expect(postProblem(ws, { ...off, qty: -501 })).toMatch(/Only 500/)
    expect(post(ws, { ...off, qty: -501 })[1]).toBe('')
    expect(postProblem(ws, { ...off, qty: -1, sourceRef: '' })).toMatch(/names the document/)
    const held = { ...ws, stockLots: ws.stockLots.map((l) => (l.id === lot.id ? { ...l, usability: 'qc_hold' as const } : l)) }
    expect(postProblem(held, { ...off, qty: -1 })).toMatch(/is held/)
    // a write-off may come off a held lot — that is what writing off is for
    expect(postProblem(held, { ...off, kind: 'write_off', source: 'loss', qty: -1 })).toBeNull()
  })

  it('writes the balance and the line together, and reverses them together', () => {
    const ws0 = counted()
    const lot = ws0.stockLots[0]
    const [ws, id] = post(ws0, {
      lotId: lot.id, itemId: lot.itemId, on: TODAY, kind: 'issue', qty: -120,
      source: 'job', sourceRef: 'IS-1', actor: 'R. Mehta',
    })
    expect(id).toBe('MV-003')
    expect(ws.stockLots[0].qty).toBe(380)
    adds(ws)
    const back = reverse(ws, (m) => m.sourceRef === 'IS-1')
    expect(back.stockLots[0].qty).toBe(500)
    adds(back)
  })

  it('takes the oldest first, never a remnant, and one picked lot must cover it alone', () => {
    let ws = counted()
    ;[ws] = newLot(ws, { itemId: 'IT-001', batchNo: 'FOUND-2026-09-10', usability: 'usable', on: '2026-09-10' },
      { on: '2026-09-10', kind: 'count_adjust', qty: 100, source: 'count', sourceRef: 'COUNT-2026-09-10', actor: '' })
    ;[ws] = newLot(ws, { itemId: 'IT-001', batchNo: 'JOB ends', usability: 'usable', remnant: true, pieces: 4, on: '2026-08-01' },
      { on: '2026-08-01', kind: 'offcut_in', qty: 6, source: 'job', sourceRef: 'IS-9', actor: '' })
    const [first, found] = ws.stockLots.filter((l) => l.itemId === 'IT-001' && !l.remnant)
    expect(allocate(ws, 'IT-001', 550)).toEqual([{ lotId: first.id, qty: 500 }, { lotId: found.id, qty: 50 }])
    // 606 are on the book but only 600 are cover
    expect(allocate(ws, 'IT-001', 601)).toBeNull()
    expect(allocate(ws, 'IT-001', 90, { lotId: found.id })).toEqual([{ lotId: found.id, qty: 90 }])
    expect(allocate(ws, 'IT-001', 120, { lotId: found.id })).toBeNull()
  })

  it('never counts a remnant as cover — not the desk, not the reorder point', () => {
    let ws = counted()
    ;[ws] = newLot(ws, { itemId: 'IT-001', batchNo: 'ends', usability: 'usable', remnant: true, pieces: 3 },
      { on: TODAY, kind: 'offcut_in', qty: 7.5, source: 'job', sourceRef: 'IS-2', actor: '' })
    expect(usableOnHand(ws, 'IT-001')).toBe(500)
    expect(coverLots(ws).some((l) => l.remnant)).toBe(false)
    expect(buildRows(bundleFor(ws, TODAY), ws.policy).find((r) => r.item.id === 'IT-001')!.usable.value).toBe(500)
  })

  it('tells a lot\'s history with the balance after every line, ending at the book', () => {
    let ws = counted()
    const lot = ws.stockLots[0]
    ;[ws] = addRack(ws, { name: 'A-1' })
    ws = placeLot(ws, lot.id, 'RK-001', '2026-09-05', 'R. Mehta')
    ;[ws] = post(ws, {
      lotId: lot.id, itemId: lot.itemId, on: '2026-09-12', kind: 'issue', qty: -80,
      source: 'job', sourceRef: 'IS-1', actor: 'R. Mehta',
    })
    const t = trail(ws, lot.id)
    expect(t.map((e) => [e.what, e.qty, e.balance])).toEqual([
      ['Opening balance', 500, 500],
      ['Moved no rack → A-1', undefined, 500],
      ['Issued', -80, 420],
    ])
    expect(t[t.length - 1].balance).toBe(ws.stockLots[0].qty)
  })
})

/* =========================================================== every writer */

describe('every writer posts to the ledger', () => {
  const withOrder = (): Workspace => ({
    ...counted(),
    orders: [{
      id: 'PO-001', no: 'PO-1', vendorId: 'VN-001', itemId: 'IT-001', qty: 300, unitPrice: 245,
      orderedOn: '2026-09-02', expectedOn: '2026-09-12', state: 'confirmed',
    }],
  })

  it('a receipt closed at the gate opens its lots as that receipt, on the rack the inspector picked', () => {
    let ws = withOrder()
    ;[ws] = addRack(ws, { name: 'B-2' })
    ;[ws] = arrive(ws, { order: ws.orders[0], qty: 300, receivedOn: '2026-09-12' })
    ws = closeReceipt(ws, 'GR-001', { rejected: 20, reason: 'Shade variation', inspector: 'S. Patil', closedAt: '2026-09-13', rack: 'RK-001' })
    adds(ws)
    const good = ws.stockLots.find((l) => l.id === 'LOT-GR-001')!
    const bad = ws.stockLots.find((l) => l.id === 'LOT-GR-001-NU')!
    expect([good.qty, good.rack, good.receiptId, good.on]).toEqual([280, 'RK-001', 'GR-001', '2026-09-13'])
    expect([bad.qty, bad.usability]).toEqual([20, 'qc_hold'])
    expect(ws.moves.filter((m) => m.sourceRef === 'GR-001').map((m) => [m.kind, m.qty, m.actor]))
      .toEqual([['receipt', 280, 'S. Patil'], ['receipt', 20, 'S. Patil']])
  })

  it('a receipt comes back off cleanly — until what it brought has been used', () => {
    let ws = withOrder()
    ;[ws] = arrive(ws, { order: ws.orders[0], qty: 300, receivedOn: '2026-09-12' })
    ws = closeReceipt(ws, 'GR-001', { rejected: 0, inspector: 'S. Patil', closedAt: '2026-09-13' })
    const back = removeReceipt(ws, 'GR-001')
    expect(back.stockLots.some((l) => l.id === 'LOT-GR-001')).toBe(false)
    expect(back.moves.some((m) => m.sourceRef === 'GR-001')).toBe(false)
    adds(back)

    const [used] = post(ws, {
      lotId: 'LOT-GR-001', itemId: 'IT-001', on: TODAY, kind: 'issue', qty: -50,
      source: 'job', sourceRef: 'IS-1', actor: '',
    })
    expect(removeReceiptProblem(used, 'GR-001')).toMatch(/used since \(IS-1\)/)
    expect(removeReceipt(used, 'GR-001')).toBe(used)
  })

  it('a recount of stock that has moved is an adjustment, off the oldest lot first', () => {
    let ws = withOrder()
    ;[ws] = arrive(ws, { order: ws.orders[0], qty: 300, receivedOn: '2026-09-12' })
    ws = closeReceipt(ws, 'GR-001', { rejected: 0, inspector: 'S. Patil', closedAt: '2026-09-13' })
    const short = applyCount(ws, TODAY, { 'IT-001': { good: 770 } }, 'R. Mehta')
    adds(short)
    expect(usableOnHand(short, 'IT-001')).toBe(770)
    expect(short.stockLots.find((l) => l.batchNo === 'OPENING-2026-09-01' && l.itemId === 'IT-001')!.qty).toBe(470)
    expect(short.stockLots.find((l) => l.id === 'LOT-GR-001')!.qty).toBe(300)
  })

  it('an item deleted takes its lots with every line behind them', () => {
    const ws = removeItem(counted(), 'IT-001')
    expect(ws.stockLots.map((l) => l.itemId)).toEqual(['IT-002'])
    expect(ws.moves.map((m) => m.itemId)).toEqual(['IT-002'])
    adds(ws)
  })
})

/* ================================================= a workspace saved before */

describe('a workspace saved before the store opened', () => {
  const old = (): Partial<Workspace> => {
    const ws = set()
    const { moves: _m, racks: _r, transfers: _t, counts: _c, jobs: _j, issues: _i, cuts: _u, losses: _l,
      minRemnant: _n, scrapRate: _s, ...rest } = ws
    return {
      ...rest,
      stockLots: [
        { id: 'LOT-001', itemId: 'IT-001', batchNo: 'OPENING-2026-08-01', qty: 400, usability: 'usable' },
        { id: 'LOT-GR-001', itemId: 'IT-001', batchNo: 'PO-1/2026-08-20', qty: 150, usability: 'usable' },
        { id: 'LOT-JW-001', itemId: 'IT-001', batchNo: 'JW-1 → Shree Wash', qty: -50, usability: 'usable' },
        { id: 'LOT-002', itemId: 'IT-001', batchNo: 'COUNT-2026-09-01', qty: -12, usability: 'usable' },
      ],
      receipts: [{
        id: 'GR-001', vendorId: 'VN-001', itemId: 'IT-001', qty: 150, accepted: 150, rejected: 0,
        orderedOn: '2026-08-10', receivedOn: '2026-08-20', status: 'closed', closedAt: '2026-08-21',
      }],
      challans: [{
        id: 'JW-001', no: 'JW-1', vendorId: 'VN-001', itemId: 'IT-001', qtySent: 50,
        sentOn: '2026-08-25', dueBack: '2026-09-05', expectedYield: 1, rate: 240, status: 'out',
      }],
      schema: 6,
    }
  }
  const load = (w: Partial<Workspace>) =>
    parseStored(JSON.stringify({ workspace: w, session: { actor: 'R. Mehta', role: 'owner' } }))!.workspace

  it('gives every lot its date and one opening line, named for what it was', () => {
    const ws = load(old())
    expect(ws.schema).toBe(SCHEMA)
    expect(ws.stockLots.map((l) => l.on)).toEqual(['2026-08-01', '2026-08-21', '2026-08-25', '2026-09-01'])
    expect(ws.moves.map((m) => [m.id, m.kind, m.qty, m.sourceRef])).toEqual([
      ['MV-OPEN-LOT-001', 'opening', 400, 'before the ledger'],
      ['MV-OPEN-LOT-GR-001', 'receipt', 150, 'GR-001'],
      ['MV-OPEN-LOT-JW-001', 'jobwork_out', -50, 'JW-1'],
      ['MV-OPEN-LOT-002', 'count_adjust', -12, 'COUNT-2026-09-01'],
    ])
    adds(ws)
    expect([ws.racks, ws.counts, ws.jobs, ws.issues, ws.cuts, ws.losses]).toEqual([[], [], [], [], [], []])
    expect(ws.cutting).toBeUndefined()
  })

  it('writes nothing twice when it is loaded again', () => {
    const once = load(old())
    const twice = load(once)
    expect(twice.moves).toEqual(once.moves)
    adds(twice)
  })

  it('keeps the material\'s total exactly where it was', () => {
    expect(usableOnHand(load(old()), 'IT-001')).toBe(488)
  })

  it('never offers an old correction to be placed or counted', () => {
    let ws = load(old())
    ;[ws] = addRack(ws, { name: 'A-1' })
    expect(unplacedLots(ws).map((l) => l.id)).toEqual(['LOT-001', 'LOT-GR-001'])
    expect(lotRows(ws, TODAY).filter((r) => r.correction).map((r) => r.lot.id)).toEqual(['LOT-JW-001', 'LOT-002'])
    expect(lotRows(ws, TODAY).filter((r) => r.correction).every((r) => !r.due)).toBe(true)
  })

  it('does not reissue a lot or movement id already in use', () => {
    const ws = load({ ...old(), stockLots: [{ id: 'LOT-007', itemId: 'IT-001', batchNo: 'OPENING-2026-08-01', qty: 5, usability: 'usable' }] })
    expect(ws.nextIds.LOT).toBe(7)
    const [, id] = newLot(ws, { itemId: 'IT-001', batchNo: 'x', usability: 'usable' },
      { on: TODAY, kind: 'count_adjust', qty: 1, source: 'count', sourceRef: 'C', actor: '' })
    expect(id).toBe('LOT-008')
  })
})

/* =============================================================== the racks */

describe('racks', () => {
  it('refuses a blank name and a second rack by the same name', () => {
    const [ws, id] = addRack(set(), { name: '  A-1 ' })
    expect(id).toBe('RK-001')
    expect(ws.racks[0].name).toBe('A-1')
    expect(rackProblem(ws, 'a-1')).toMatch(/already a rack called A-1/)
    expect(rackProblem(ws, ' ')).toMatch(/Give the rack a name/)
    expect(addRack(ws, { name: 'a-1' })[1]).toBe('')
    expect(updateRack(ws, 'RK-001', { name: 'A-1', note: 'Denim' }).racks[0].note).toBe('Denim')
  })

  it('places a lot with the move kept, and taking a rack away leaves its stock on the book', () => {
    let ws = counted()
    ;[ws] = addRack(ws, { name: 'A-1' })
    ;[ws] = addRack(ws, { name: 'A-2' })
    const lot = ws.stockLots[0].id
    ws = placeLot(ws, lot, 'RK-001', '2026-09-02', 'R. Mehta')
    ws = placeLot(ws, lot, 'RK-002', '2026-09-03', 'R. Mehta')
    expect(ws.transfers.map((t) => [t.from, t.to])).toEqual([[undefined, 'RK-001'], ['RK-001', 'RK-002']])
    expect(placeLot(ws, lot, 'RK-002', TODAY, '')).toBe(ws)
    expect(rackImpact(ws, 'RK-002').losses[0]).toMatch(/1 lot goes back to no rack/)
    const gone = removeRack(ws, 'RK-002', TODAY, 'R. Mehta')
    expect(gone.racks.map((r) => r.name)).toEqual(['A-1'])
    expect(gone.stockLots.find((l) => l.id === lot)!.rack).toBeUndefined()
    expect(gone.stockLots.find((l) => l.id === lot)!.qty).toBe(500)
  })

  it('counts a store\'s racks: lots, value and what is due', () => {
    let ws = counted()
    ;[ws] = addRack(ws, { name: 'A-1' })
    ws = placeLot(ws, ws.stockLots[0].id, 'RK-001', '2026-09-01', '')
    expect(rackRows(ws, TODAY)).toEqual([expect.objectContaining({ lots: 1, value: 120000, due: 1 })])
  })

  it('the count places what it counts on the rack it names', () => {
    let ws = set()
    ;[ws] = addRack(ws, { name: 'A-1' })
    ws = applyCount(ws, TODAY, { 'IT-001': { good: 200, rack: 'RK-001' } })
    expect(ws.stockLots[0].rack).toBe('RK-001')
    expect(unplacedLots(ws)).toEqual([])
  })
})

/* ================================================================ the jobs */

describe('job numbers', () => {
  it('count up in the owner\'s own style, from the highest used', () => {
    let ws = setJobNumbering(set(), { word: 'style', prefix: 'ST' })
    expect(nextJobNo(ws)).toBe('ST-1')
    ;[ws] = addJob(ws, { no: 'ST-4521', openedOn: TODAY })
    expect(nextJobNo(ws)).toBe('ST-4522')
    expect(jobProblem(ws, { no: 'st-4521', openedOn: TODAY })).toMatch(/already a style numbered ST-4521/)
  })
})

/* ============================================================== the queue */

describe('the store\'s queue', () => {
  it('says nothing without a date, and nothing on a day-one store', () => {
    expect(inventoryDecisionsFor(counted(), '')).toEqual([])
    expect(inventoryDecisionsFor(set(), TODAY)).toEqual([])
  })

  it('asks for a count by material in a store with no racks, and by rack once there are', () => {
    const byItem = inventoryDecisionsFor(counted(), TODAY)
    expect(byItem.map((d) => [d.kind, d.title])).toEqual([['count-due', 'Denim 14 oz is due a count']])
    expect(byItem[0].detail).toMatch(/19 days ago; class A is counted every 7/)

    let ws = counted()
    ;[ws] = addRack(ws, { name: 'A-1' })
    ws = placeLot(ws, ws.stockLots[0].id, 'RK-001', '2026-09-01', '')
    const d = inventoryDecisionsFor(ws, TODAY)
    // the rivets were never placed, 19 days ago; the rack is 12 days past its cadence
    expect(d.map((x) => x.title)).toEqual(['1 lot is on no rack', 'A-1 is due a count'])
    expect(d[1].href).toBe('/inventory/ledger?rack=RK-001')
    expect(inventoryOpenCount(ws, TODAY)).toBe(2)
  })

  it('raises the book below nothing, in the worst band', () => {
    const ws: Workspace = { ...counted(), stockLots: [...counted().stockLots, {
      id: 'LOT-009', itemId: 'IT-002', batchNo: 'COUNT-2026-09-02', qty: -2100, usability: 'usable',
    }] }
    const neg = inventoryDecisionsFor(ws, TODAY).find((d) => d.kind === 'negative-stock')!
    expect(neg.band).toBe('stops')
    expect(neg.title).toBe('The book shows -100 nos of Copper rivet')
  })
})

/* ============================================================ the figures */

describe('the store\'s figures', () => {
  it('are unmeasured on day one, and say what they wait for', () => {
    const m = pickedMetrics(set(), TODAY, 'inventory')
    expect(m.map((x) => x.key)).toEqual(['stockValue', 'unconfirmed', 'accuracy', 'heldStock', 'netLoss', 'scrap'])
    expect(m.every((x) => !x.measured)).toBe(true)
  })

  it('value usable stock at the last price, leave remnants and held stock out, and say what is unverified', () => {
    let ws = counted()
    ;[ws] = newLot(ws, { itemId: 'IT-001', batchNo: 'ends', usability: 'usable', remnant: true },
      { on: TODAY, kind: 'offcut_in', qty: 10, source: 'job', sourceRef: 'IS-1', actor: '' })
    ;[ws] = newLot(ws, { itemId: 'IT-001', batchNo: 'hold', usability: 'damaged' },
      { on: TODAY, kind: 'receipt', qty: 5, source: 'grn', sourceRef: 'GR-9', actor: '' })
    const m = pickedMetrics(ws, TODAY, 'inventory')
    const get = (k: string) => m.find((x) => x.key === k)!
    expect(get('stockValue').value).toBe('₹1,23,000')
    expect(get('heldStock').value).toBe('₹1,200')
    // both counted lots are past their cadence on the 20th: class A at 7 days, class C at 30 is not
    expect(get('unconfirmed').sub).toBe('1 of 4 lots past their counting date')
    expect(get('accuracy').measured).toBe(false)
  })
})
