/**
 * The shipping bay's set-up and its order book, for an owner's own company.
 *
 * Five steps, one of them the floor's own; a rail whose badges are work; a
 * customer's state read off the GSTIN; an order's value always derived from
 * its lines; and a promise at risk said from the Line watch verdict on the
 * style making it, before the customer notices.
 */
import { describe, expect, it } from 'vitest'
import { DISPATCH_STEPS, PRODUCTION_STEPS, progressOf, stepsFor } from '@/lib/workspace/checklist'
import {
  addCarrier, addCustomer, customerProblem, removeCarrierProblem, removeCustomer, removeCustomerProblem,
} from '@/lib/workspace/customers'
import { coverFromStock, dispatchDecisionsFor, dispatchOpenCount, noteDispatch } from '@/lib/workspace/dispatch-decisions'
import { companyState, isGstin, stateOfGstin, supplyType } from '@/lib/workspace/gst'
import { addJob } from '@/lib/workspace/jobs'
import { planJob } from '@/lib/workspace/plan'
import { removeProductProblem } from '@/lib/workspace/products'
import { BUILT, STAGE_HOME, dispatchNav, navFor } from '@/lib/workspace/reveal'
import {
  addOrder, cancelOrder, lastRateFor, openJobForOrder, orderProblem, orderRows, removeOrder, removeOrderProblem,
  reopenOrder, updateOrder,
} from '@/lib/workspace/sales'
import { raiseNote } from '@/lib/workspace/dispatch-notes'
import { emptyWorkspace } from '@/lib/workspace/defaults'
import { TODAY, bay, booked, line, made, shop } from './dispatch-fixture'

describe('the bay’s set-up', () => {
  it('has five steps, the first shared with the floor', () => {
    expect(stepsFor('dispatch')).toBe(DISPATCH_STEPS)
    expect(DISPATCH_STEPS.map((s) => s.id)).toEqual(['products', 'customers', 'carriers', 'firstOrder', 'dispatchRules'])
    expect(DISPATCH_STEPS[0]).toBe(PRODUCTION_STEPS[1])
    expect(progressOf(shop(), DISPATCH_STEPS).steps.map((s) => s.done)).toEqual([true, false, false, false, false])
    expect(progressOf(bay(), DISPATCH_STEPS).next?.id).toBe('firstOrder')
    const done = { ...booked(), drafts: { 'dispatch.rules.agreed': true } }
    expect(progressOf(done, DISPATCH_STEPS).complete).toBe(true)
    expect(DISPATCH_STEPS[4].summary(done)).toBe('Maharashtra · e-way bill from ₹50,000 · on time 95%')
  })

  it('opens on its dashboard, with a rail whose badges are work', () => {
    expect(BUILT).toContain('dispatch')
    expect(STAGE_HOME.dispatch).toBe('/dispatch/dashboard')
    const rows = dispatchNav(booked(), TODAY)
    expect(rows.map((r) => r.label)).toEqual(['Dashboard', 'Sales orders', 'Delivery challans', 'Consignments', 'Returns', 'Customers', 'Carriers'])
    expect(rows.filter((r) => r.tucked).map((r) => r.label)).toEqual(['Customers', 'Carriers'])
    // SO-1 was promised the 20th and nothing has gone
    expect(rows.find((r) => r.label === 'Sales orders')?.badge).toBe('1')
    expect(navFor('dispatch', booked(), TODAY)).toEqual(rows)
  })

  it('starts empty: nothing of the sample reaches an owner’s company', () => {
    const ws = emptyWorkspace({ id: 'WS-9', createdAt: '2026-01-01', ownerName: 'A', contact: '', companyName: 'A Co', makes: '' })
    expect([ws.customers, ws.carriers, ws.customerOrders, ws.dispatchNotes, ws.consignments, ws.rmas, ws.fgMoves].map((l) => l.length))
      .toEqual([0, 0, 0, 0, 0, 0, 0])
    expect(dispatchDecisionsFor(ws, TODAY)).toEqual([])
  })
})

describe('customers, carriers and the GSTIN', () => {
  it('reads the state off a GSTIN, and says when a supply crosses a state line', () => {
    expect(isGstin('27AABCB1234K1Z2')).toBe(true)
    expect(isGstin('27AABCB1234K1Y2')).toBe(false)
    expect(isGstin('99AABCB1234K1Z2')).toBe(false)
    expect(stateOfGstin('29AABCD1234K1Z9')).toBe('Karnataka')
    expect(companyState(shop())).toBe('Maharashtra')
    expect(companyState({ ...shop(), company: { ...shop().company, state: 'Gujarat' } })).toBe('Gujarat')
    expect(supplyType('Maharashtra', 'maharashtra')).toBe('intra')
    expect(supplyType('Maharashtra', 'Karnataka')).toBe('inter')
    expect(supplyType(undefined, 'Karnataka')).toBeUndefined()
  })

  it('refuses a duplicate name and a GSTIN in the wrong shape', () => {
    const ws = bay()
    expect(customerProblem(ws, { name: 'bharat panels ' })).toBe('Bharat Panels is already a customer.')
    expect(customerProblem(ws, { name: 'New Co', gstin: '27ABC' })).toMatch(/not in the right shape/)
    expect(customerProblem(ws, { name: 'New Co', distanceKm: -3 })).toBe('Distance is kilometres, or blank.')
    const [w2, id] = addCustomer(ws, { name: 'New Co', gstin: '24aabcn1234k1z3' })
    expect(w2.customers.find((c) => c.id === id)?.gstin).toBe('24AABCN1234K1Z3')
    expect(addCarrier(ws, { name: 'vrl logistics', mode: 'full' })[1]).toBe('')
  })

  it('keeps a customer an order names, and a product an order line names', () => {
    const ws = booked()
    expect(removeCustomerProblem(ws, 'CU-001')).toBe('1 order names them. Their record has to stay with it.')
    expect(removeCustomer(ws, 'CU-001').customers).toHaveLength(2)
    expect(removeProductProblem(ws, 'PR-001')).not.toBeNull()
    expect(removeCarrierProblem(ws, 'CR-001')).toBeNull()
  })
})

describe('the order book', () => {
  it('numbers orders, derives their value from the lines, and offers the last rate', () => {
    const ws = booked()
    expect(ws.customerOrders.map((o) => o.no)).toEqual(['SO-1', 'SO-2'])
    expect(ws.customerOrders[0].lines[0].id).toBe('SO-001/1')
    const rows = orderRows(ws, TODAY)
    expect(rows.map((r) => r.order.no)).toEqual(['SO-1', 'SO-2']) // earliest promise first
    expect(rows.map((r) => r.value.value)).toEqual([90000, 190000])
    expect(rows.map((r) => r.pending.value)).toEqual([100, 200])
    expect(lastRateFor(ws, 'CU-002', 'PR-001')).toBe(950)
    expect(lastRateFor(ws, 'CU-002', 'PR-999')).toBeUndefined()
  })

  it('refuses what a person could not mean', () => {
    const ws = booked()
    const o = { customerId: 'CU-001', takenOn: '2026-09-20', promisedDate: '2026-09-30', lines: [line(10, 900)] }
    expect(orderProblem(ws, { ...o, customerId: '' })).toBe('Pick the customer.')
    expect(orderProblem(ws, { ...o, promisedDate: '2026-09-19' })).toBe('It cannot be promised before it was taken.')
    expect(orderProblem(ws, { ...o, lines: [line(2.5, 900)] })).toBe('Put in how many Slim-fit jeans, a whole number.')
    expect(orderProblem(ws, { ...o, lines: [line(10, NaN)] })).toMatch(/rate for Slim-fit jeans/)
    expect(orderProblem(ws, { ...o, lines: [] })).toBe('Put at least one product on it.')
    expect(orderProblem(ws, o)).toBeNull()
  })

  it('says not out, part shipped, in full, past the promise and cancelled', () => {
    let ws = booked(300)
    const status = () => orderRows(ws, TODAY).map((r) => r.status)
    expect(status()).toEqual(['late', 'not_out'])
    ;[ws] = raiseNote(ws, { orderId: 'SO-002', on: TODAY, lines: [{ productId: 'PR-001', qty: 50 }], authorisedBy: 'R. Mehta', actor: 'R. Mehta' }, TODAY)
    expect(status()).toEqual(['late', 'part'])
    ;[ws] = raiseNote(ws, { orderId: 'SO-001', on: TODAY, lines: [{ productId: 'PR-001', qty: 100 }], authorisedBy: 'R. Mehta', actor: 'R. Mehta' }, TODAY)
    expect(status()).toEqual(['full', 'part'])
    expect(orderRows(ws, TODAY).map((r) => r.dispatched)).toEqual([100, 50])
    ws = cancelOrder(ws, 'SO-002')
    expect(status()).toEqual(['full', 'cancelled'])
    ws = reopenOrder(ws, 'SO-002')
    expect(status()).toEqual(['full', 'part'])
  })

  it('stops an order being changed or deleted once something has gone against it', () => {
    let ws = booked()
    ;[ws] = raiseNote(ws, { orderId: 'SO-001', on: TODAY, lines: [{ productId: 'PR-001', qty: 20 }], authorisedBy: 'R. Mehta', actor: '' }, TODAY)
    const o = ws.customerOrders[0]
    const input = { customerId: o.customerId, takenOn: o.takenOn, promisedDate: '2026-10-01', lines: [line(100, 900)] }
    expect(orderProblem(ws, input, 'SO-001')).toMatch(/can no longer be changed/)
    expect(updateOrder(ws, 'SO-001', input)).toBe(ws)
    expect(removeOrderProblem(ws, 'SO-001')).toMatch(/Cancel it instead/)
    expect(removeOrder(ws, 'SO-001').customerOrders).toHaveLength(2)
    expect(removeOrder(ws, 'SO-002').customerOrders.map((x) => x.no)).toEqual(['SO-1'])
  })

  it('opens a style for a line, planned to finish two working days before the promise', () => {
    let ws = booked()
    ;[ws] = addOrder(ws, { customerId: 'CU-001', takenOn: TODAY, promisedDate: '2026-10-05', lines: [line(150, 900)] })
    const [w2, jobId] = openJobForOrder(ws, 'SO-003', 'SO-003/1', TODAY)
    const job = w2.jobs.find((j) => j.id === jobId)!
    expect(job.no).toBe('ST-2')
    expect(job.customer).toBe('Bharat Panels')
    expect([job.productId, job.qty, job.plannedStart, job.plannedFinish]).toEqual(['PR-001', 150, TODAY, '2026-10-02'])
    expect(w2.customerOrders[2].lines[0].jobId).toBe(jobId)
    // a line already made by somebody is left alone
    expect(openJobForOrder(w2, 'SO-003', 'SO-003/1', TODAY)[1]).toBe('')
    // and the order now sees the style
    expect(orderRows(w2, TODAY)[2].lines[0].job?.no).toBe('ST-2')
  })

  it('takes a promise at risk from the Line watch verdict on the style making it', () => {
    let ws = made()
    // ST-2 needs 600 m of denim from the 24th; ST-1 has taken 450 of the 500
    ;[ws] = addJob(ws, { no: 'ST-2', openedOn: '2026-09-20' })
    ws = planJob(ws, 'JB-002', { productId: 'PR-001', qty: 400, plannedStart: '2026-09-24', plannedFinish: '2026-09-29', perDay: 80 })
    ;[ws] = addOrder(ws, { customerId: 'CU-002', takenOn: '2026-09-15', promisedDate: '2026-09-30', lines: [line(400, 950, { jobId: 'JB-002' })] })
    const r = orderRows(ws, TODAY)[0]
    expect(r.risk?.status).toBe('will_halt')
    expect(r.risk?.jobNo).toBe('ST-2')
    const card = dispatchDecisionsFor(ws, TODAY).find((d) => d.kind === 'order-at-risk')!
    expect(card.band).toBe('stops')
    expect(card.title).toBe('SO-1 for Deccan Retail, due 30 Sep, is at risk — ST-2 will halt')
    expect(card.actLabel).toBe('See the style')
    // "Noted" keeps it away until what it said changes
    const noted = noteDispatch(ws, card, TODAY)
    expect(dispatchDecisionsFor(noted, TODAY).some((d) => d.kind === 'order-at-risk')).toBe(false)
  })

  it('says a style that finishes after the promise, when nothing else is wrong', () => {
    let ws = made()
    ;[ws] = addOrder(ws, { customerId: 'CU-001', takenOn: '2026-09-15', promisedDate: '2026-09-28', lines: [line(100, 900, { jobId: 'JB-001' })] })
    expect(orderRows(ws, TODAY)[0].risk).toMatchObject({ status: 'finishes_late', jobNo: 'ST-1' })
  })
})

describe('the bay’s queue', () => {
  it('says a promise that has passed, worth the share still to go', () => {
    const d = dispatchDecisionsFor(booked(), TODAY)
    const late = d.find((x) => x.kind === 'order-late')!
    expect(late.title).toBe('SO-1 for Bharat Panels was promised 20 Sep and is not out')
    expect(late.detail).toBe('100 of 100 still to go, worth ₹90,000.')
    expect([late.band, late.act, late.actLabel]).toEqual(['stops', 'dispatch', 'Dispatch it'])
    expect(d[0].kind).toBe('order-late')
  })

  it('shares the shelf out to the earliest promise first', () => {
    const ws = booked(120)
    const cover = coverFromStock(ws, orderRows(ws, TODAY))
    expect(cover.map((c) => [c.orderId, c.need, c.fromStock, c.short])).toEqual([
      ['SO-001', 100, 100, 0],
      ['SO-002', 200, 20, 180],
    ])
  })

  it('asks for a style when nobody is making what an order still needs', () => {
    const ws = booked(120)
    const card = dispatchDecisionsFor(ws, TODAY).find((d) => d.kind === 'order-no-style')!
    expect(card.title).toBe('Nobody is making the 180 Slim-fit jeans SO-2 still needs')
    expect(card.band).toBe('stops') // promised the 25th: inside three days
    expect([card.act, card.actLabel, card.refs.lineId]).toEqual(['plan', 'Open a style for it', 'SO-002/1'])
    const [w2] = openJobForOrder(ws, 'SO-002', 'SO-002/1', TODAY)
    expect(dispatchDecisionsFor(w2, TODAY).some((d) => d.kind === 'order-no-style')).toBe(false)
  })

  it('says an order due in days with too little made, and lets it be noted', () => {
    let ws = booked(120)
    ws = { ...ws, customerOrders: ws.customerOrders.map((o) => (o.id === 'SO-002' ? { ...o, lines: o.lines.map((l) => ({ ...l, jobId: 'JB-001' })) } : o)) }
    const card = dispatchDecisionsFor(ws, TODAY).find((d) => d.kind === 'order-short-stock')!
    expect(card.title).toBe('SO-2 is due 25 Sep and 20 of 200 Slim-fit jeans are ready')
    expect(card.detail).toMatch(/^ST-1 is making them — 120 made so far/)
    const before = dispatchOpenCount(ws, TODAY)
    expect(dispatchOpenCount(noteDispatch(ws, card, TODAY), TODAY)).toBe(before - 1)
  })
})
