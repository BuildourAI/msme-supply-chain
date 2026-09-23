/**
 * Material out of the store against a job, and back.
 *
 * An issue is a slip and a movement on every lot it came off; a return goes
 * back onto its lot or comes in as a remnant; wastage on a job is a loss with
 * no movement, because the material already left. What a job used is then a
 * sum of lines — and the ledger's rule holds throughout.
 */
import { describe, expect, it } from 'vitest'
import { bundleFor } from '@/lib/workspace/bundle'
import { buildRows } from '@/lib/domain/derive'
import { emptyWorkspace } from '@/lib/workspace/defaults'
import { applyCount } from '@/lib/workspace/count'
import {
  addJob, closeJob, issueMaterial, issueProblem, jobProblemToRemove, jobRows, lastDrawnLot, onJob,
  removeJob, removeSlip, removeSlipProblem, returnProblem, returnToStore, setJobNumbering, slipRows,
  wasteOnJob, wasteProblem,
} from '@/lib/workspace/jobs'
import { drift, newLot, post, usableOnHand } from '@/lib/workspace/ledger'
import { addRack } from '@/lib/workspace/racks'
import { buildIssueSlip, issueFileName, issueMessageFor } from '@/lib/paper/issue'
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

/** Denim in two lots — 300 m counted on the 1st, 200 m found on the 10th — and one style open. */
const base = (): Workspace => {
  let ws: Workspace = {
    ...emptyWorkspace({ id: 'WS-1', createdAt: '2026-01-01', ownerName: 'R. Mehta', contact: '', companyName: 'Indigo Threads', makes: 'Jeans' }),
    items: [item(), item({ id: 'IT-002', code: 'ZIP', name: 'YKK zip', uom: 'nos', itemClass: 'C', lastPurchaseRate: 6 })],
    vendors: [{ id: 'VN-001', name: 'Arvind Mills', paymentTermsDays: 30 }],
    vendorItems: [rate],
  }
  ;[ws] = addRack(ws, { name: 'A-1' })
  ws = applyCount(ws, '2026-09-01', { 'IT-001': { good: 300, rack: 'RK-001' }, 'IT-002': { good: 1000 } }, 'R. Mehta')
  ;[ws] = newLot(ws, { itemId: 'IT-001', batchNo: 'FOUND-2026-09-10', usability: 'usable', rack: 'RK-001', on: '2026-09-10' },
    { on: '2026-09-10', kind: 'count_adjust', qty: 200, source: 'count', sourceRef: 'CC-9', actor: '' })
  ws = setJobNumbering(ws, { word: 'style', prefix: 'ST' })
  ;[ws] = addJob(ws, { no: 'ST-4521', name: 'Slim-fit jeans', openedOn: '2026-09-15' })
  return ws
}
const issue = (ws: Workspace, qty: number, over = {}) =>
  issueMaterial(ws, { jobId: 'JB-001', itemId: 'IT-001', qty, on: TODAY, takenBy: 'Cutting master', actor: 'S. Patil', ...over })
const adds = (ws: Workspace) => expect(drift(ws)).toEqual([])

describe('issuing against a job', () => {
  it('takes the oldest lot first, one line per lot, all named for the slip and the job', () => {
    const [ws, id] = issue(base(), 350)
    expect(id).toBe('IS-001')
    const slip = ws.issues[0]
    expect(slip).toMatchObject({ no: 'IS-1', kind: 'issue', jobId: 'JB-001', takenBy: 'Cutting master', actor: 'S. Patil' })
    expect(slip.lines.map((l) => l.qty)).toEqual([300, 50])
    const issued = ws.moves.filter((m) => m.kind === 'issue')
    expect(issued.map((m) => [m.qty, m.sourceRef, m.jobId, m.note])).toEqual([
      [-300, 'IS-1', 'JB-001', 'to ST-4521, taken by Cutting master'],
      [-50, 'IS-1', 'JB-001', 'to ST-4521, taken by Cutting master'],
    ])
    expect(usableOnHand(ws, 'IT-001')).toBe(150)
    adds(ws)
  })

  it('comes off one picked lot when somebody picks it, and refuses what it cannot cover', () => {
    const found = base().stockLots.find((l) => l.batchNo === 'FOUND-2026-09-10')!.id
    const [ws] = issue(base(), 120, { lotId: found })
    expect(ws.stockLots.find((l) => l.id === found)!.qty).toBe(80)
    expect(issueProblem(base(), { jobId: 'JB-001', itemId: 'IT-001', qty: 250, on: TODAY, takenBy: '', actor: '', lotId: found }))
      .toMatch(/That lot does not have that much/)
    expect(issueProblem(base(), { jobId: 'JB-001', itemId: 'IT-001', qty: 600, on: TODAY, takenBy: '', actor: '' }))
      .toMatch(/Only 500 is usable/)
  })

  it('never issues against a closed job, nor from a remnant', () => {
    const closed = closeJob(base(), 'JB-001', TODAY)
    expect(issueProblem(closed, { jobId: 'JB-001', itemId: 'IT-001', qty: 10, on: TODAY, takenBy: '', actor: '' }))
      .toMatch(/ST-4521 is closed/)
    let ws = base()
    ;[ws] = newLot(ws, { itemId: 'IT-001', batchNo: 'ends', usability: 'usable', remnant: true }, {
      on: TODAY, kind: 'offcut_in', qty: 9, source: 'job', sourceRef: 'x', actor: '' })
    expect(issueProblem(ws, { jobId: 'JB-001', itemId: 'IT-001', qty: 501, on: TODAY, takenBy: '', actor: '' })).toMatch(/Only 500/)
  })
})

describe('back into the store', () => {
  it('onto the lot it last came off, and only what is still with the job', () => {
    const [ws0] = issue(base(), 350)
    const back = lastDrawnLot(ws0, 'JB-001', 'IT-001')
    expect(ws0.stockLots.find((l) => l.id === back)!.batchNo).toBe('FOUND-2026-09-10')
    expect(returnProblem(ws0, { jobId: 'JB-001', itemId: 'IT-001', qty: 400, on: TODAY, actor: '' }))
      .toMatch(/ST-4521 has only 350/)
    expect(returnProblem(ws0, { jobId: 'JB-001', itemId: 'IT-002', qty: 1, on: TODAY, actor: '' }))
      .toMatch(/never issued this material/)
    const [ws, id] = returnToStore(ws0, { jobId: 'JB-001', itemId: 'IT-001', qty: 20, on: TODAY, actor: 'S. Patil', note: 'Lay finished short' })
    expect(ws.issues.find((s) => s.id === id)).toMatchObject({ no: 'IS-2', kind: 'return' })
    expect(ws.stockLots.find((l) => l.id === back)!.qty).toBe(170)
    expect(ws.moves.at(-1)).toMatchObject({ kind: 'issue', qty: 20, note: 'back from ST-4521 — Lay finished short' })
    expect(onJob(ws, 'JB-001', 'IT-001')).toEqual({ issued: 350, returned: 20, wasted: 0, withJob: 330 })
    adds(ws)
  })

  it('as a remnant: a flagged lot of its own, on its rack, never cover', () => {
    const [ws0] = issue(base(), 350)
    const [ws] = returnToStore(ws0, {
      jobId: 'JB-001', itemId: 'IT-001', qty: 6.5, on: TODAY, actor: '', asRemnant: true, pieces: 5, rack: 'RK-001',
    })
    const rem = ws.stockLots.at(-1)!
    expect([rem.batchNo, rem.remnant, rem.pieces, rem.rack, rem.qty]).toEqual(['REMNANT-ST-4521', true, 5, 'RK-001', 6.5])
    expect(ws.moves.at(-1)).toMatchObject({ kind: 'offcut_in', sourceRef: 'IS-2' })
    expect(usableOnHand(ws, 'IT-001')).toBe(150)
    expect(buildRows(bundleFor(ws, TODAY), ws.policy)[0].usable.value).toBe(150)
    expect(slipRows(ws)[0].remnant).toBe(true)
    adds(ws)
  })
})

describe('wasted on the job', () => {
  it('is a loss with its cause and its job, and nothing moves', () => {
    const [ws0] = issue({ ...base(), scrapRate: { 'IT-001': 15 } }, 350)
    expect(wasteProblem(ws0, { jobId: 'JB-001', itemId: 'IT-001', qty: 5, on: TODAY, actor: '', note: '' })).toMatch(/Say what happened/)
    const moves = ws0.moves.length
    const [ws] = wasteOnJob(ws0, { jobId: 'JB-001', itemId: 'IT-001', qty: 12, on: TODAY, actor: 'S. Patil', note: 'Two panels mis-cut' })
    expect(ws.moves).toHaveLength(moves)
    expect(ws.losses[0]).toMatchObject({
      cause: 'process_scrap', qty: 12, jobId: 'JB-001', workOrder: 'ST-4521', recoveryRate: 15, note: 'Two panels mis-cut',
    })
    expect(onJob(ws, 'JB-001', 'IT-001').withJob).toBe(338)
  })
})

describe('what a job used', () => {
  it('is issued less returned, waste included, at the last price', () => {
    let [ws] = issue(base(), 350)
    ;[ws] = returnToStore(ws, { jobId: 'JB-001', itemId: 'IT-001', qty: 20, on: TODAY, actor: '' })
    ;[ws] = wasteOnJob(ws, { jobId: 'JB-001', itemId: 'IT-001', qty: 12, on: TODAY, actor: '', note: 'mis-cut' })
    const row = jobRows(ws)[0]
    expect(row.materials).toEqual([expect.objectContaining({ issued: 350, returned: 20, wasted: 12, used: 330, value: 79200 })])
    expect(row.consumption).toBe(79200)
    expect(row.wastedValue).toBe(2880)
  })

  it('a job with material against it is closed, never deleted', () => {
    const [ws] = issue(base(), 10)
    expect(jobProblemToRemove(ws, 'JB-001')).toMatch(/Close it instead/)
    expect(removeJob(ws, 'JB-001')).toBe(ws)
    expect(removeJob(base(), 'JB-001').jobs).toEqual([])
  })
})

describe('taking a slip back', () => {
  it('puts an issue back on its lots, and takes a returned remnant away', () => {
    const [ws0] = issue(base(), 350)
    const undone = removeSlip(ws0, 'IS-001')
    expect(usableOnHand(undone, 'IT-001')).toBe(500)
    expect(undone.issues).toEqual([])
    adds(undone)

    const [ws1] = returnToStore(ws0, { jobId: 'JB-001', itemId: 'IT-001', qty: 6, on: TODAY, actor: '', asRemnant: true, pieces: 3 })
    const gone = removeSlip(ws1, 'IS-002')
    expect(gone.stockLots.some((l) => l.remnant)).toBe(false)
    adds(gone)
  })

  it('refuses when the remnant it made has been used since', () => {
    let [ws] = issue(base(), 350)
    ;[ws] = returnToStore(ws, { jobId: 'JB-001', itemId: 'IT-001', qty: 6, on: TODAY, actor: '', asRemnant: true, pieces: 3 })
    const rem = ws.stockLots.at(-1)!
    ;[ws] = post(ws, { lotId: rem.id, itemId: 'IT-001', on: TODAY, kind: 'offcut_issue', qty: -2, source: 'job', sourceRef: 'IS-9', actor: '' })
    expect(removeSlipProblem(ws, 'IS-002')).toMatch(/used since/)
    expect(removeSlip(ws, 'IS-002')).toBe(ws)
  })
})

describe('the slip on paper', () => {
  it('names the job, every lot and rack it came off, and who took it', () => {
    const [ws] = issue(base(), 350)
    const doc = buildIssueSlip(ws, 'IS-001')!
    expect(doc.job).toBe('Style ST-4521 — Slim-fit jeans')
    expect(doc.lines).toEqual([
      { batch: 'OPENING-2026-09-01', rack: 'A-1', qty: '300 m' },
      { batch: 'FOUND-2026-09-10', rack: 'A-1', qty: '50 m' },
    ])
    expect(doc.total).toBe('350 m')
    expect(issueFileName(doc)).toBe('IS-1-Style-ST-4521.pdf')
    expect(issueMessageFor(doc)).toMatch(/Taken by Cutting master/)
  })
})
