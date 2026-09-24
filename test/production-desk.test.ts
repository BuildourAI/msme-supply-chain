/**
 * The floor, for an owner's own company.
 *
 * Built the way an owner builds one — materials counted in, a product with
 * its material list, a style planned — and nothing from the sample. Line
 * watch takes from the store in the order jobs start; output booked is
 * finished stock, one movement against the job; and a job with no plan, or
 * a product with no quantities, is said rather than guessed.
 */
import { describe, expect, it } from 'vitest'
import { emptyWorkspace } from '@/lib/workspace/defaults'
import { applyCount } from '@/lib/workspace/count'
import { PRODUCTION_STEPS, SOURCING_STEPS, INVENTORY_STEPS, progressOf, stepsFor } from '@/lib/workspace/checklist'
import { addJob, issueMaterial, jobProblemToRemove, removeJob, setJobNumbering } from '@/lib/workspace/jobs'
import { JOBWORKER, sendOut } from '@/lib/workspace/jobwork'
import { lineRunsFor, lineWatch, stoppingThisWeek } from '@/lib/workspace/linewatch'
import { pickedMetrics } from '@/lib/workspace/metrics'
import {
  bookOutput, countFinished, countFinishedProblem, fgMoveIdFor, outputProblem, removeOutput, removeOutputProblem,
} from '@/lib/workspace/output'
import {
  DEFAULT_FLOOR, defaultPerDay, jobPlanRow, planJob, planProblem, targetToDate, weekOf, workingDaysBetween,
} from '@/lib/workspace/plan'
import { noteProduction, productionDecisionsFor, productionOpenCount } from '@/lib/workspace/production-decisions'
import {
  addProduct, fgOnHand, needsFor, productProblem, productRows, productsWanting, removeProduct,
  removeProductProblem, suggestedProducts,
} from '@/lib/workspace/products'
import { BUILT, STAGE_HOME, navFor, productionNav } from '@/lib/workspace/reveal'
import { parseStored } from '@/lib/workspace/storage'
import { SCHEMA, type PurchaseOrder, type Workspace } from '@/lib/workspace/types'
import type { Item } from '@/lib/domain/types'

const TODAY = '2026-09-23' // a Wednesday: the week runs Mon 21 – Sat 26
const item = (over: Partial<Item> = {}): Item => ({
  id: 'IT-001', code: 'DEN-14', name: 'Denim 14 oz', uom: 'm', itemClass: 'A',
  coverageCeilingMonths: 2, moq: 100, safetyStock: 0, avgDailyConsumption: 40,
  floorConsumptionPerDay: 40, lastPurchaseRate: 240, feeds: ['Slim-fit jeans'], ...over,
})
const fresh = (): Workspace => ({
  ...emptyWorkspace({ id: 'WS-1', createdAt: '2026-01-01', ownerName: 'R. Mehta', contact: '', companyName: 'Indigo Threads', makes: 'Jeans' }),
  items: [
    item(),
    item({ id: 'IT-002', code: 'THR', name: 'Thread 40s', uom: 'm', avgDailyConsumption: 2000, floorConsumptionPerDay: 2000, lastPurchaseRate: 0.05, feeds: ['Slim-fit jeans', 'Cargo shorts'] }),
  ],
  vendors: [{ id: 'VN-001', name: 'Arvind Mills', paymentTermsDays: 30 }, { id: 'VN-002', name: 'Shree Wash', paymentTermsDays: 0 }],
  vendorType: { 'VN-002': JOBWORKER },
})
/** 500 m of denim and 60,000 m of thread on the shelf; jeans take 1.5 m and 150 m; two styles open. */
const base = (): Workspace => {
  let ws = applyCount(fresh(), '2026-09-01', { 'IT-001': { good: 500 }, 'IT-002': { good: 60000 } }, 'R. Mehta')
  ;[ws] = addProduct(ws, { name: 'Slim-fit jeans', uom: 'nos', standardCost: 420, bom: [{ itemId: 'IT-001', qtyPerUnit: 1.5 }, { itemId: 'IT-002', qtyPerUnit: 150 }] })
  ws = setJobNumbering(ws, { word: 'style', prefix: 'ST' })
  ;[ws] = addJob(ws, { no: 'ST-1', openedOn: '2026-09-15' })
  ;[ws] = addJob(ws, { no: 'ST-2', openedOn: '2026-09-15' })
  return ws
}
const plan = (ws: Workspace, jobId: string, qty: number, start: string, finish: string, perDay?: number) =>
  planJob(ws, jobId, { productId: 'PR-001', qty, plannedStart: start, plannedFinish: finish, perDay })

describe('the floor’s set-up', () => {
  it('has five steps, sharing materials with sourcing and job numbers with the store', () => {
    expect(stepsFor('production')).toBe(PRODUCTION_STEPS)
    expect(PRODUCTION_STEPS.map((s) => s.id)).toEqual(['materials', 'products', 'jobs', 'plan', 'floorRules'])
    expect(PRODUCTION_STEPS[0]).toBe(SOURCING_STEPS.find((s) => s.id === 'materials'))
    expect(PRODUCTION_STEPS[2]).toBe(INVENTORY_STEPS.find((s) => s.id === 'jobs'))
    const p = progressOf(base(), PRODUCTION_STEPS)
    expect(p.steps.map((s) => s.done)).toEqual([true, true, true, false, false])
    expect(p.next?.id).toBe('plan')
    const planned = plan(base(), 'JB-001', 200, '2026-09-21', '2026-09-26')
    expect(progressOf({ ...planned, drafts: { 'production.rules.agreed': true } }, PRODUCTION_STEPS).complete).toBe(true)
    expect(PRODUCTION_STEPS[3].summary(planned)).toBe('1 planned · 1 open without a plan')
  })

  it('opens the stage on its dashboard, with a rail whose badges are work', () => {
    expect(BUILT).toContain('production')
    expect(STAGE_HOME.production).toBe('/production/dashboard')
    const rows = productionNav(base(), TODAY)
    expect(rows.map((r) => r.label)).toEqual(['Dashboard', 'Line watch', 'Plan vs actual', 'Turnaround', 'Products'])
    expect(rows.filter((r) => r.tucked).map((r) => r.label)).toEqual(['Products'])
    // two styles open, neither planned
    expect(rows.find((r) => r.label === 'Plan vs actual')?.badge).toBe('2')
    expect(navFor('production', base(), TODAY)).toEqual(rows)
  })

  it('reads a workspace saved before 8 with everything empty, and twice the same', () => {
    const w = base()
    const old = { ...w, schema: 7 } as Partial<Workspace>
    for (const k of ['products', 'outputs', 'halts', 'fgMoves', 'customers', 'carriers', 'customerOrders', 'dispatchNotes', 'consignments', 'rmas'] as const) delete old[k]
    const once = parseStored(JSON.stringify({ workspace: old, session: { actor: 'R. Mehta', role: 'owner' } }))!.workspace
    expect(once.schema).toBe(SCHEMA)
    expect(once.products).toEqual([])
    expect(once.fgMoves).toEqual([])
    expect(once.customerOrders).toEqual([])
    const twice = parseStored(JSON.stringify({ workspace: once, session: { actor: 'R. Mehta', role: 'owner' } }))!.workspace
    expect(twice).toEqual(once)
  })
})

describe('products', () => {
  it('are suggested from what materials were said to go into', () => {
    const s = suggestedProducts(fresh())
    expect(s).toEqual([
      { name: 'Slim-fit jeans', itemIds: ['IT-001', 'IT-002'] },
      { name: 'Cargo shorts', itemIds: ['IT-002'] },
    ])
    // a product that exists is not suggested again
    expect(suggestedProducts(base()).map((x) => x.name)).toEqual(['Cargo shorts'])
  })

  it('refuse a duplicate name and a material twice, and flag a list with no quantity', () => {
    const ws = base()
    expect(productProblem(ws, { name: 'slim-fit jeans ', uom: 'nos', bom: [] })).toMatch(/already a product/)
    expect(productProblem(ws, { name: 'Shorts', uom: 'nos', bom: [{ itemId: 'IT-001', qtyPerUnit: 1 }, { itemId: 'IT-001', qtyPerUnit: 2 }] })).toMatch(/twice/)
    const [w] = addProduct(ws, { name: 'Cargo shorts', uom: 'nos', bom: [{ itemId: 'IT-002', qtyPerUnit: 0 }] })
    expect(productsWanting(w).map((p) => p.name)).toEqual(['Cargo shorts'])
    expect(productRows(w, TODAY).find((r) => r.product.name === 'Cargo shorts')?.unquantified).toBe(1)
  })

  it('work out what a quantity needs, leaving out lines not yet quantified', () => {
    expect(needsFor(base(), 'PR-001', 200)).toEqual([{ itemId: 'IT-001', qty: 300 }, { itemId: 'IT-002', qty: 30000 }])
    expect(needsFor(base(), 'PR-001', 0)).toEqual([])
  })

  it('cannot be deleted once a job makes one', () => {
    const ws = plan(base(), 'JB-001', 200, '2026-09-21', '2026-09-26')
    expect(removeProductProblem(ws, 'PR-001')).toMatch(/1 job makes it/)
    expect(removeProduct(ws, 'PR-001')).toBe(ws)
    expect(removeProductProblem(base(), 'PR-001')).toBeNull()
  })
})

describe('the plan', () => {
  it('counts working days, and the pace that finishes on time', () => {
    expect(workingDaysBetween('2026-09-21', '2026-09-26', DEFAULT_FLOOR)).toBe(6)
    expect(workingDaysBetween('2026-09-19', '2026-09-21', DEFAULT_FLOOR)).toBe(2) // Sat and Mon; Sunday is off
    expect(weekOf(TODAY, DEFAULT_FLOOR)).toEqual(['2026-09-21', '2026-09-22', '2026-09-23', '2026-09-24', '2026-09-25', '2026-09-26'])
    expect(defaultPerDay(200, '2026-09-21', '2026-09-26', DEFAULT_FLOOR)).toBe(34)
  })

  it('writes the product, quantity, dates, pace and needs onto the job', () => {
    const ws = plan(base(), 'JB-001', 200, '2026-09-21', '2026-09-26')
    const job = ws.jobs.find((j) => j.id === 'JB-001')!
    expect(job).toMatchObject({ productId: 'PR-001', qty: 200, perDay: 34, name: 'Slim-fit jeans' })
    expect(job.needs).toEqual([{ itemId: 'IT-001', qty: 300 }, { itemId: 'IT-002', qty: 30000 }])
    expect(planProblem(ws, 'JB-001', { productId: 'PR-001', qty: 10, plannedStart: '2026-09-26', plannedFinish: '2026-09-21' })).toMatch(/finish before it starts/)
  })

  it('sets a target by the working days already finished, never past the quantity', () => {
    const ws = plan(base(), 'JB-001', 200, '2026-09-21', '2026-09-26', 40)
    const job = ws.jobs[0]
    expect(targetToDate(job, '2026-09-20', DEFAULT_FLOOR)).toBe(0)
    // nothing is due on the first morning
    expect(targetToDate(job, '2026-09-21', DEFAULT_FLOOR)).toBe(0)
    // Wednesday morning: Monday and Tuesday are done
    expect(targetToDate(job, TODAY, DEFAULT_FLOOR)).toBe(80)
    expect(targetToDate(job, '2026-10-05', DEFAULT_FLOOR)).toBe(200)
  })
})

describe('line watch', () => {
  it('takes from the store in the order jobs start: the later job halts, the earlier runs', () => {
    let ws = plan(base(), 'JB-001', 200, '2026-09-21', '2026-09-26') // 300 m of denim
    ws = plan(ws, 'JB-002', 200, '2026-09-24', '2026-09-30') // another 300 m, and only 200 left
    const [first, second] = lineWatch(ws, '2026-09-21')
    expect(first.job.no).toBe('ST-1')
    expect(first.status).toBe('will_run')
    expect(second.status).toBe('will_halt')
    expect(second.needs[0]).toMatchObject({ need: 300, fromShelf: 200, short: 100 })
    expect(second.reasons[0]).toMatch(/Denim 14 oz short by 100 m/)
  })

  it('nets off what has already gone to the job', () => {
    let ws = plan(base(), 'JB-001', 200, '2026-09-21', '2026-09-26')
    ;[ws] = issueMaterial(ws, { jobId: 'JB-001', itemId: 'IT-001', qty: 300, on: '2026-09-21', takenBy: '', actor: '' })
    ws = plan(ws, 'JB-002', 100, '2026-09-24', '2026-09-30')
    const [first, second] = lineWatch(ws, '2026-09-21')
    expect(first.needs[0]).toMatchObject({ gone: 300, still: 0, short: 0 })
    // 200 m left on the shelf covers the 150 m the second needs
    expect(second.status).toBe('will_run')
  })

  it('turns a halt into a risk when an order is due before it is needed', () => {
    let ws = plan(base(), 'JB-001', 200, '2026-09-21', '2026-09-26')
    ws = plan(ws, 'JB-002', 200, '2026-09-28', '2026-10-03')
    const po: PurchaseOrder = {
      id: 'PO-001', no: 'PO-1', vendorId: 'VN-001', itemId: 'IT-001', qty: 150, unitPrice: 240,
      orderedOn: '2026-09-15', expectedOn: '2026-09-25', state: 'confirmed',
    }
    ws = { ...ws, orders: [po] }
    const second = lineWatch(ws, '2026-09-21')[1]
    expect(second.status).toBe('at_risk')
    expect(second.needs[0].claims).toEqual([{ what: 'PO-1 from Arvind Mills', on: '2026-09-25', qty: 100, late: false }])
    expect(second.stockReasons[0]).toMatch(/not in yet — PO-1 from Arvind Mills, due/)
  })

  it('calls a job at risk when a jobworker holding what it needs is past due', () => {
    let ws = plan(base(), 'JB-001', 100, '2026-09-24', '2026-09-30') // 150 m
    ;[ws] = sendOut(ws, { vendorId: 'VN-002', itemId: 'IT-001', qty: 300, sentOn: '2026-09-10', dueBack: '2026-09-20', expectedYield: 1 })
    const [w] = lineWatch(ws, TODAY)
    // 200 m on the shelf covers it, but the washer is three days late with 300 m it could have needed
    expect(w.needs[0].short).toBe(0)
    expect(w.status).toBe('at_risk')
    expect(w.stockReasons.join(' ')).toMatch(/back from Shree Wash on JW-1, past its date/)
  })

  it('sends a late jobworker to the store\'s Jobwork, and what is merely due to the gate\'s Due in', () => {
    let ws = plan(base(), 'JB-001', 100, '2026-09-24', '2026-09-30')
    ;[ws] = sendOut(ws, { vendorId: 'VN-002', itemId: 'IT-001', qty: 300, sentOn: '2026-09-10', dueBack: '2026-09-20', expectedYield: 1 })
    expect(productionDecisionsFor(ws, TODAY).find((d) => d.kind === 'job-at-risk'))
      .toMatchObject({ actLabel: 'Chase the jobworker', href: '/inventory/jobwork' })
    let due = plan(base(), 'JB-001', 200, '2026-09-21', '2026-09-26')
    due = plan(due, 'JB-002', 200, '2026-09-28', '2026-10-03')
    due = { ...due, orders: [{
      id: 'PO-001', no: 'PO-1', vendorId: 'VN-001', itemId: 'IT-001', qty: 150, unitPrice: 240,
      orderedOn: '2026-09-15', expectedOn: '2026-09-25', state: 'confirmed',
    }] }
    expect(productionDecisionsFor(due, '2026-09-21').find((d) => d.kind === 'job-at-risk'))
      .toMatchObject({ actLabel: 'See what is due', href: '/inbound/due' })
  })

  it('gives a style what went out to a jobworker for it first, before an earlier delivery', () => {
    let ws = base()
    // 100 m out to the washer for ST-2, due back after the order lands
    ;[ws] = sendOut(ws, { vendorId: 'VN-002', itemId: 'IT-001', qty: 100, sentOn: '2026-09-15', dueBack: '2026-09-27', expectedYield: 1, jobId: 'JB-002' })
    ws = plan(ws, 'JB-001', 200, '2026-09-21', '2026-09-26') // 300 m, all of it off the shelf
    ws = plan(ws, 'JB-002', 200, '2026-09-24', '2026-09-30') // 300 m: 100 left on the shelf, 200 to come
    const po: PurchaseOrder = {
      id: 'PO-001', no: 'PO-1', vendorId: 'VN-001', itemId: 'IT-001', qty: 150, unitPrice: 240,
      orderedOn: '2026-09-15', expectedOn: '2026-09-25', state: 'confirmed',
    }
    const second = lineWatch({ ...ws, orders: [po] }, '2026-09-21')[1]
    expect(second.job.no).toBe('ST-2')
    expect(second.needs[0].claims.map((c) => [c.what, c.qty])).toEqual([
      ['back from Shree Wash on JW-1', 100],
      ['PO-1 from Arvind Mills', 100],
    ])
  })

  it('never counts another style\'s return from a jobworker', () => {
    let ws = base()
    // 300 m out for ST-2; 200 m left on the shelf
    ;[ws] = sendOut(ws, { vendorId: 'VN-002', itemId: 'IT-001', qty: 300, sentOn: '2026-09-15', dueBack: '2026-09-25', expectedYield: 1, jobId: 'JB-002' })
    ws = plan(ws, 'JB-001', 200, '2026-09-21', '2026-09-30') // 300 m
    const [first] = lineWatch(ws, '2026-09-21')
    expect(first.needs[0]).toMatchObject({ fromShelf: 200, short: 100, claims: [] })
    expect(first.status).toBe('will_halt')
  })

  it('holds a late return against the style it went out for, and no other', () => {
    let ws = base()
    ;[ws] = sendOut(ws, { vendorId: 'VN-002', itemId: 'IT-001', qty: 100, sentOn: '2026-09-10', dueBack: '2026-09-20', expectedYield: 1, jobId: 'JB-002' })
    ws = plan(ws, 'JB-001', 100, '2026-09-24', '2026-09-30') // 150 m, covered
    ws = plan(ws, 'JB-002', 100, '2026-09-25', '2026-10-02') // 150 m, covered, but its washer is late
    const [first, second] = lineWatch(ws, TODAY)
    expect(first.status).toBe('will_run')
    expect(second.status).toBe('at_risk')
    expect(second.stockReasons.join(' ')).toMatch(/back from Shree Wash on JW-1, past its date/)
  })

  it('says how long the line runs on the tightest material, and which jobs stop this week', () => {
    let ws = plan(base(), 'JB-001', 200, '2026-09-21', '2026-09-26')
    ws = plan(ws, 'JB-002', 200, '2026-09-24', '2026-09-30')
    const runs = lineRunsFor(ws)!
    expect(runs.item.name).toBe('Denim 14 oz')
    expect(runs.days.value).toBe(12.5) // 500 m at 40 a day
    expect(stoppingThisWeek(lineWatch(ws, '2026-09-21')).map((w) => w.job.no)).toEqual(['ST-2'])
  })
})

describe('output', () => {
  it('books good pieces into finished stock against the job, and not the rejected', () => {
    let ws = plan(base(), 'JB-001', 200, '2026-09-21', '2026-09-26', 40)
    let id: string
    ;[ws, id] = bookOutput(ws, { jobId: 'JB-001', on: '2026-09-22', good: 70, rejected: 3, reason: 'Stitching', actor: 'K. Rao' }, TODAY)
    expect(id).toBe('OP-001')
    expect(ws.fgMoves).toEqual([{
      id: fgMoveIdFor('OP-001'), fgId: 'PR-001', on: '2026-09-22', kind: 'production', qty: 70,
      sourceRef: 'ST-1', actor: 'K. Rao', note: '70 good off ST-1',
    }])
    expect(fgOnHand(ws, 'PR-001')).toBe(70)
    const row = jobPlanRow(ws, ws.jobs[0], TODAY)
    expect(row).toMatchObject({ made: 70, rejected: 3, target: 80, vsTarget: -10, state: 'behind' })
    expect(row.firstPass).toBe(95.9)
    expect(row.attainment).toBe(35)
  })

  it('refuses a booking with no reason for rejects, on an unplanned job, or in the future', () => {
    const ws = plan(base(), 'JB-001', 200, '2026-09-21', '2026-09-26')
    expect(outputProblem(ws, { jobId: 'JB-001', on: TODAY, good: 10, rejected: 2, actor: '' }, TODAY)).toMatch(/why they were rejected/)
    expect(outputProblem(ws, { jobId: 'JB-002', on: TODAY, good: 10, rejected: 0, actor: '' }, TODAY)).toMatch(/no product yet/)
    expect(outputProblem(ws, { jobId: 'JB-001', on: '2026-09-30', good: 10, rejected: 0, actor: '' }, TODAY)).toMatch(/not happened yet/)
  })

  it('takes a booking back with its movement, unless those pieces have gone out', () => {
    let ws = plan(base(), 'JB-001', 200, '2026-09-21', '2026-09-26')
    ;[ws] = bookOutput(ws, { jobId: 'JB-001', on: '2026-09-22', good: 50, rejected: 0, actor: '' }, TODAY)
    expect(removeOutput(ws, 'OP-001').fgMoves).toEqual([])
    // 30 dispatched since: the booking can no longer be taken back
    const out = { ...ws, fgMoves: [...ws.fgMoves, { id: 'FGM-DN', fgId: 'PR-001', on: TODAY, kind: 'despatch' as const, qty: -30, sourceRef: 'DN-1', actor: '' }] }
    expect(removeOutputProblem(out, 'OP-001')).toMatch(/30 of those pieces have been dispatched/)
    expect(removeOutput(out, 'OP-001')).toBe(out)
  })

  it('counts finished stock onto the book as one movement against the count', () => {
    let ws = base()
    expect(countFinishedProblem(ws, { productId: 'PR-001', qty: 0, on: TODAY, actor: '' })).toMatch(/already says/)
    ws = countFinished(ws, { productId: 'PR-001', qty: 40, on: TODAY, actor: 'R. Mehta' })
    expect(ws.fgMoves[0]).toMatchObject({ kind: 'opening', qty: 40, sourceRef: `COUNT-${TODAY}` })
    ws = countFinished(ws, { productId: 'PR-001', qty: 35, on: TODAY, actor: 'R. Mehta' })
    expect(ws.fgMoves.map((m) => m.qty)).toEqual([40, -5])
    expect(fgOnHand(ws, 'PR-001')).toBe(35)
  })

  it('keeps a job that has output from being deleted', () => {
    let ws = plan(base(), 'JB-001', 200, '2026-09-21', '2026-09-26')
    ;[ws] = bookOutput(ws, { jobId: 'JB-001', on: '2026-09-22', good: 5, rejected: 0, actor: '' }, TODAY)
    expect(jobProblemToRemove(ws, 'JB-001')).toMatch(/1 output booking/)
    expect(removeJob(ws, 'JB-001')).toBe(ws)
  })
})

describe('the queue and the figures', () => {
  it('asks for a plan, a quantity, and says which job will halt', () => {
    let ws = base()
    ;[ws] = addProduct(ws, { name: 'Cargo shorts', uom: 'nos', bom: [{ itemId: 'IT-002', qtyPerUnit: 0 }] })
    expect(productionDecisionsFor(ws, TODAY).map((d) => d.kind)).toEqual(['no-plan', 'no-bom'])
    ws = plan(ws, 'JB-001', 200, '2026-09-24', '2026-09-26')
    ws = plan(ws, 'JB-002', 200, '2026-09-25', '2026-09-30')
    const kinds = productionDecisionsFor(ws, TODAY).map((d) => d.kind)
    expect(kinds).toEqual(['job-will-halt', 'no-bom'])
    const card = productionDecisionsFor(ws, TODAY)[0]
    expect(card.title).toBe('ST-2 (Slim-fit jeans) starts 25 Sep and will halt — Denim 14 oz is 100 m short')
    expect(productionOpenCount(ws, TODAY)).toBe(2)
    // noted, it goes; the shortfall growing brings it back
    const noted = noteProduction(ws, card, TODAY)
    expect(productionDecisionsFor(noted, TODAY).map((d) => d.kind)).toEqual(['no-bom'])
    const worse = plan(noted, 'JB-002', 250, '2026-09-25', '2026-09-30')
    expect(productionDecisionsFor(worse, TODAY).map((d) => d.kind)).toContain('job-will-halt')
  })

  it('says a running job with nothing booked is behind, and one past its finish is late', () => {
    let ws = plan(base(), 'JB-001', 200, '2026-09-21', '2026-09-26', 40)
    const behind = productionDecisionsFor(ws, TODAY).find((d) => d.kind === 'job-behind')!
    expect(behind.title).toBe('Nothing booked on ST-1 (Slim-fit jeans) yet')
    expect(behind).toMatchObject({ act: 'output', refs: { jobId: 'JB-001' } })
    ws = plan(ws, 'JB-001', 200, '2026-09-14', '2026-09-19', 40)
    const late = productionDecisionsFor(ws, TODAY).find((d) => d.kind === 'job-late')!
    expect(late).toMatchObject({ act: 'plan', alt: { act: 'close' } })
  })

  it('offers the floor’s figures, measured once there is something to measure', () => {
    expect(pickedMetrics(base(), TODAY, 'production').map((m) => [m.key, m.measured])).toEqual([
      ['lineRunsFor', true], ['jobsStopping', false], ['attainment', false], ['firstPass', false],
      ['floorDays', false], ['haltDays', false],
    ])
    let ws = plan(base(), 'JB-001', 200, '2026-09-21', '2026-09-26', 40)
    ;[ws] = bookOutput(ws, { jobId: 'JB-001', on: '2026-09-22', good: 96, rejected: 4, reason: 'Stain or mark', actor: '' }, TODAY)
    const m = Object.fromEntries(pickedMetrics(ws, TODAY, 'production').map((x) => [x.key, x]))
    expect(m.attainment).toMatchObject({ value: '120%', sub: '96 made of 80 due by today, over 1 running job', tone: 'good' })
    expect(m.firstPass).toMatchObject({ value: '96%', sub: '96 good, 4 rejected this month' })
    // ahead of its target, with everything on the shelf: nothing stops this week
    expect(m.jobsStopping).toMatchObject({ value: '0', measured: true, sub: 'all 1 of this week’s jobs will run' })
  })
})
