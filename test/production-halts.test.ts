/**
 * When the floor stopped, and how long material takes to become a product.
 *
 * A halt someone records overrides whatever Line watch computed; resuming it
 * ends the days down, which are working days. Turnaround is read off records
 * the store and the floor already keep: the day a lot came onto the book, the
 * first issue to the job, the last output.
 */
import { describe, expect, it } from 'vitest'
import { emptyWorkspace } from '@/lib/workspace/defaults'
import { applyCount } from '@/lib/workspace/count'
import { daysDown, haltProblem, haltRows, haltsByCause, recordHalt, removeHalt, resumeHalt, resumeProblem } from '@/lib/workspace/halts'
import { addJob, closeJob, issueMaterial, setJobNumbering } from '@/lib/workspace/jobs'
import { lineWatch } from '@/lib/workspace/linewatch'
import { pickedMetrics } from '@/lib/workspace/metrics'
import { bookOutput } from '@/lib/workspace/output'
import { planJob } from '@/lib/workspace/plan'
import { productionDecisionsFor } from '@/lib/workspace/production-decisions'
import { addProduct } from '@/lib/workspace/products'
import { meanTurnaround, turnaroundOf, turnaroundRows } from '@/lib/workspace/turnaround'
import type { Workspace } from '@/lib/workspace/types'
import type { Item } from '@/lib/domain/types'

const TODAY = '2026-09-23' // Wednesday
const item: Item = {
  id: 'IT-001', code: 'DEN-14', name: 'Denim 14 oz', uom: 'm', itemClass: 'A',
  coverageCeilingMonths: 2, moq: 100, safetyStock: 0, avgDailyConsumption: 40,
  floorConsumptionPerDay: 40, lastPurchaseRate: 240, feeds: [],
}
const base = (): Workspace => {
  let ws: Workspace = {
    ...emptyWorkspace({ id: 'WS-1', createdAt: '2026-01-01', ownerName: 'R. Mehta', contact: '', companyName: 'Indigo Threads', makes: 'Jeans' }),
    items: [item],
  }
  ws = applyCount(ws, '2026-09-01', { 'IT-001': { good: 1000 } }, 'R. Mehta')
  ;[ws] = addProduct(ws, { name: 'Slim-fit jeans', uom: 'nos', bom: [{ itemId: 'IT-001', qtyPerUnit: 1.5 }] })
  ws = setJobNumbering(ws, { word: 'style', prefix: 'ST' })
  ;[ws] = addJob(ws, { no: 'ST-1', openedOn: '2026-09-10' })
  ws = planJob(ws, 'JB-001', { productId: 'PR-001', qty: 200, plannedStart: '2026-09-14', plannedFinish: '2026-09-30', perDay: 20 })
  return ws
}

describe('halts', () => {
  it('overrides what Line watch computed, and puts a card at the top of the queue', () => {
    let ws = base()
    expect(lineWatch(ws, TODAY)[0].status).not.toBe('halted')
    ;[ws] = recordHalt(ws, { jobId: 'JB-001', on: '2026-09-21', cause: 'machine', note: 'Overlock 3', actor: 'K. Rao' }, TODAY)
    const [w] = lineWatch(ws, TODAY)
    expect(w.status).toBe('halted')
    expect(w.reasons[0]).toBe('Stopped since 21 Sep — machine down: Overlock 3')
    const card = productionDecisionsFor(ws, TODAY)[0]
    expect(card).toMatchObject({ kind: 'job-halted', band: 'stops', act: 'resume', refs: { jobId: 'JB-001', haltId: 'HL-001' } })
  })

  it('refuses a second halt on a halted job, a future day, and "other" with nothing said', () => {
    let ws = base()
    ;[ws] = recordHalt(ws, { jobId: 'JB-001', on: '2026-09-21', cause: 'power', actor: '' }, TODAY)
    expect(haltProblem(ws, { jobId: 'JB-001', on: TODAY, cause: 'machine', actor: '' }, TODAY)).toMatch(/already halted/)
    expect(haltProblem(base(), { jobId: 'JB-001', on: '2026-09-30', cause: 'machine', actor: '' }, TODAY)).toMatch(/not happened yet/)
    expect(haltProblem(base(), { jobId: 'JB-001', on: TODAY, cause: 'other', actor: '' }, TODAY)).toMatch(/Say what it was/)
  })

  it('counts working days down, and resuming ends them', () => {
    let ws = base()
    ;[ws] = recordHalt(ws, { jobId: 'JB-001', on: '2026-09-19', cause: 'manpower', actor: '' }, TODAY) // a Saturday
    // Sat, Mon, Tue, and today: Sunday is not a working day
    expect(daysDown(ws, ws.halts[0], TODAY)).toBe(4)
    expect(resumeProblem(ws, 'HL-001', '2026-09-18', TODAY)).toMatch(/before it stopped/)
    ws = resumeHalt(ws, 'HL-001', '2026-09-22', TODAY)
    expect(daysDown(ws, ws.halts[0], TODAY)).toBe(2) // Sat and Mon
    expect(lineWatch(ws, TODAY)[0].status).not.toBe('halted')
    expect(haltRows(ws, TODAY)[0]).toMatchObject({ open: false, days: 2 })
  })

  it('reads a month by cause, splitting a halt that crosses into it', () => {
    let ws = base()
    ;[ws] = recordHalt(ws, { jobId: 'JB-001', on: '2026-08-31', cause: 'power', actor: '' }, TODAY)
    ws = resumeHalt(ws, 'HL-001', '2026-09-02', TODAY)
    ;[ws] = recordHalt(ws, { jobId: 'JB-001', on: '2026-09-21', cause: 'machine', actor: '' }, TODAY)
    expect(haltsByCause(ws, '2026-09', TODAY)).toEqual([
      { cause: 'machine', halts: 1, days: 3 },
      { cause: 'power', halts: 1, days: 1 },
    ])
    const m = pickedMetrics(ws, TODAY, 'production').find((x) => x.key === 'haltDays')!
    expect(m).toMatchObject({ value: '4 days', sub: 'this month · most for machine down', tone: 'critical' })
  })

  it('can be taken back', () => {
    let ws = base()
    ;[ws] = recordHalt(ws, { jobId: 'JB-001', on: TODAY, cause: 'power', actor: '' }, TODAY)
    expect(removeHalt(ws, 'HL-001').halts).toEqual([])
  })
})

describe('turnaround', () => {
  it('splits shelf time from floor time, off records already kept', () => {
    let ws = base()
    ;[ws] = issueMaterial(ws, { jobId: 'JB-001', itemId: 'IT-001', qty: 300, on: '2026-09-14', takenBy: '', actor: '' })
    ;[ws] = bookOutput(ws, { jobId: 'JB-001', on: '2026-09-18', good: 100, rejected: 0, actor: '' }, TODAY)
    ;[ws] = bookOutput(ws, { jobId: 'JB-001', on: '2026-09-22', good: 100, rejected: 0, actor: '' }, TODAY)
    const t = turnaroundOf(ws, ws.jobs[0])
    // the lot was counted onto the book on the 1st
    expect(t).toMatchObject({ receivedOn: '2026-09-01', firstIssue: '2026-09-14', lastOutput: '2026-09-22', wait: 13, floor: 8, total: 21 })
    expect(turnaroundRows(ws).map((r) => r.job.no)).toEqual(['ST-1'])
  })

  it('means only closed jobs in the window, so an open one never moves the figure', () => {
    let ws = base()
    ;[ws] = issueMaterial(ws, { jobId: 'JB-001', itemId: 'IT-001', qty: 300, on: '2026-09-14', takenBy: '', actor: '' })
    ;[ws] = bookOutput(ws, { jobId: 'JB-001', on: '2026-09-22', good: 200, rejected: 0, actor: '' }, TODAY)
    expect(meanTurnaround(ws, TODAY).jobs).toBe(0)
    ws = closeJob(ws, 'JB-001', '2026-09-22')
    expect(meanTurnaround(ws, TODAY)).toMatchObject({ jobs: 1, wait: 13, floor: 8, total: 21 })
    const m = Object.fromEntries(pickedMetrics(ws, TODAY, 'production').map((x) => [x.key, x]))
    expect(m.floorDays).toMatchObject({ value: '8 days', measured: true })
  })
})

describe('a halt the same day it started', () => {
  it('costs no whole day, and still counts as a halt by its cause', () => {
    let ws = base()
    ;[ws] = recordHalt(ws, { jobId: 'JB-001', on: TODAY, cause: 'power', actor: '' }, TODAY)
    ws = resumeHalt(ws, 'HL-001', TODAY, TODAY)
    expect(daysDown(ws, ws.halts[0], TODAY)).toBe(0)
    expect(haltsByCause(ws, '2026-09', TODAY)).toEqual([{ cause: 'power', halts: 1, days: 0 }])
  })
})
