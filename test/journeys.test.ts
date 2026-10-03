/**
 * Where a record has got to, as steps: a sales order, a purchase order, a job
 * card and material out for jobwork — each read off the owner's own records.
 */
import { describe, expect, it } from 'vitest'
import { bookConsignment, markDelivered } from '@/lib/workspace/consignments'
import { raiseNote } from '@/lib/workspace/dispatch-notes'
import { addJob, issueMaterial, closeJob } from '@/lib/workspace/jobs'
import { JOBWORKER, bookReturn, closeChallan, sendOut } from '@/lib/workspace/jobwork'
import {
  jobBoard, jobJourney, jobworkBoard, jobworkJourney, matchesPick, matchesWhere, orderBoard, orderJourney,
  purchaseBoard, purchaseJourney, type Journey,
} from '@/lib/workspace/journeys'
import { markHandedOver, recordAck, reviseOrder, v1Of } from '@/lib/workspace/orders'
import { arrive, closeReceipt, recordReceipt } from '@/lib/workspace/receipts'
import { addOrder, cancelOrder, setMadeFor } from '@/lib/workspace/sales'
import { orderGroups, orderRows } from '@/lib/workspace/sourcing'
import type { PurchaseOrder, Workspace } from '@/lib/workspace/types'
import { TODAY, booked, line } from './dispatch-fixture'

/** "Taken:done Job card:skip Made:skip Dispatched:now* Delivered:next" */
const read = (j: Journey<unknown>) =>
  j.steps.map((s) => `${s.label}:${s.state}${s.state === 'part' ? `(${s.pct}%)` : ''}${s.current ? '*' : ''}`).join(' ')

const so = (ws: Workspace, no: string) => orderJourney(ws, ws.customerOrders.find((o) => o.no === no)!, TODAY)

const note = (orderId: string, qty: number, over: Partial<Parameters<typeof raiseNote>[1]> = {}) =>
  ({ orderId, on: TODAY, lines: [{ productId: 'PR-001', qty }], authorisedBy: 'R. Mehta', actor: 'K. Rao', ...over })

describe('a sales order', () => {
  it('goes from stock when the shelf holds what it needs: no job card, nothing to make', () => {
    // SO-1 wants 100; 120 are on the shelf off ST-1, and no line names a job card
    const j = so(booked(), 'SO-1')
    expect(read(j)).toBe('Taken:done Job card:skip Made:skip Dispatched:now* Delivered:next')
    expect(j.steps[1].sub).toBe('from stock')
    expect(j.act).toEqual({ kind: 'dispatch', label: 'Dispatch' })
    expect(j.where).toBe('dispatched')
    expect(j.word).toBe('Ready to dispatch')
  })

  it('is late on the step holding it, by the days past its promise', () => {
    const j = so(booked(), 'SO-1') // promised the 20th, today is the 23rd
    expect(j.late).toBe(3)
    expect(j.steps[3].late).toBe('3 days past the promise')
    expect(j.steps.filter((s) => s.late)).toHaveLength(1)
  })

  it('needs a job card when the shelf cannot cover it', () => {
    const j = so(booked(), 'SO-2') // 200 wanted, 120 on the shelf
    expect(read(j)).toBe('Taken:done Job card:now* Made:next Dispatched:next Delivered:next')
    expect(j.steps[1].sub).toBe('none opened yet')
    expect(j.act).toEqual({ kind: 'job', label: 'Open a job card', lineId: 'SO-002/1' })
    expect(j.word).toBe('Needs a job card')
    expect(j.late).toBe(0)
  })

  it('shows its job card under the step, and what has come off it as a ring', () => {
    const ws = setMadeFor(booked(), 'JB-001', undefined, 'SO-002/1')
    const j = so(ws, 'SO-2')
    expect(read(j)).toBe('Taken:done Job card:done Made:part(60%)* Dispatched:next Delivered:next')
    expect(j.steps[1].docs).toEqual([{ kind: 'job', id: 'JB-001', label: 'ST-1' }])
    expect(j.steps[1].sub).toBe('planned 16 Sep – 30 Sep')
    expect(j.steps[2].sub).toBe('120 of 200')
    expect(j.act).toEqual({ kind: 'output', label: 'Book output', jobId: 'JB-001' })
    expect(j.word).toBe('Made 60%')
    expect(j.where).toBe('made')
  })

  it('carries what is on the road on the line before Delivered, and asks for the carrier when none is booked', () => {
    let ws = booked()
    ;[ws] = raiseNote(ws, note('SO-001', 30, { booking: { carrierId: 'CR-001', lrNo: 'VRL 1', promisedDate: '2026-09-25' } }), TODAY)
    let j = so(ws, 'SO-1')
    expect(read(j)).toBe('Taken:done Job card:skip Made:skip Dispatched:part(30%)* Delivered:next')
    expect(j.between[3]).toEqual({ text: 'left today', late: false })
    expect(j.steps[4].sub).toBe('30 with VRL Logistics')
    expect(j.steps[3].docs).toEqual([{ kind: 'note', id: 'DN-001', label: 'DC-1' }])
    expect(j.word).toBe('Dispatched 30%')

    // the other 70 went yesterday, and nobody booked a carrier for them
    ;[ws] = raiseNote(ws, note('SO-001', 70, { on: '2026-09-22' }), TODAY)
    j = so(ws, 'SO-1')
    expect(read(j)).toBe('Taken:done Job card:skip Made:skip Dispatched:done Delivered:now*')
    expect(j.between[3]).toEqual({ text: 'no carrier booked', late: true })
    expect(j.act).toEqual({ kind: 'book', label: 'Book the carrier', noteId: 'DN-002' })
    expect(j.where).toBe('road')
    expect(j.word).toBe('On the road')
    expect(j.papers.map((p) => [p.note.no, p.state, p.late])).toEqual([['DC-2', 'unbooked', true], ['DC-1', 'road', false]])
  })

  it('is over once every challan is delivered, and is no longer late', () => {
    let ws = booked()
    ;[ws] = raiseNote(ws, note('SO-001', 100, { on: '2026-09-18', booking: { carrierId: 'CR-001', promisedDate: '2026-09-20' } }), TODAY)
    let j = so(ws, 'SO-1')
    expect(j.between[3]).toEqual({ text: '5 days on the road · 3d late', late: true })
    expect(j.act).toEqual({ kind: 'deliver', label: 'Mark delivered', consignmentId: 'CN-001' })
    ws = markDelivered(ws, 'CN-001', { on: '2026-09-21', by: 'Their stores' }, TODAY)
    j = so(ws, 'SO-1')
    expect(read(j)).toBe('Taken:done Job card:skip Made:skip Dispatched:done Delivered:done')
    expect(j.done).toBe(true)
    expect(j.late).toBe(0)
    expect(j.word).toBe('Delivered')
    expect(j.steps[4].on).toBe('2026-09-21')
    expect(j.between[3]).toEqual({ text: '3 days on the road' })
  })

  it('shares what went of a product over the lines asking for it, in order', () => {
    let [ws] = addOrder(booked(), { customerId: 'CU-001', takenOn: '2026-09-20', promisedDate: '2026-10-10', lines: [line(40, 900), line(60, 880)] })
    ;[ws] = raiseNote(ws, note('SO-003', 50), TODAY)
    const j = so(ws, 'SO-3')
    expect(j.lines.map((l) => [l.qty, l.sent, l.still])).toEqual([[40, 40, 0], [60, 10, 50]])
    expect(j.steps[0].sub).toBe('2 lines · 100 in all')
    expect(j.value).toBe(40 * 900 + 60 * 880)
  })

  it('stops where it was when cancelled, with nothing to do', () => {
    const j = so(cancelOrder(booked(), 'SO-001'), 'SO-1')
    expect(j.cancelled).toBe(true)
    expect(j.where).toBe('cancelled')
    expect(j.act).toBeUndefined()
    expect(j.steps.some((s) => s.current)).toBe(false)
  })
})

describe('the sales order list', () => {
  const board = (ws: Workspace) => {
    const rows = ws.customerOrders.map((order) => ({ order, j: orderJourney(ws, order, TODAY) }))
    const b = orderBoard(rows, (r) => r.j, TODAY)
    const nos = (xs: typeof rows) => xs.map((r) => r.order.no)
    return { late: nos(b.late), soon: nos(b.soon), later: nos(b.later), over: nos(b.over) }
  }

  it('puts what is late first, then this week, then later, and folds away what is over', () => {
    let [ws] = addOrder(booked(), { customerId: 'CU-001', takenOn: '2026-09-20', promisedDate: '2026-10-20', lines: [line(10, 900)] })
    ;[ws] = addOrder(ws, { customerId: 'CU-002', takenOn: '2026-09-20', promisedDate: '2026-09-21', lines: [line(5, 900)] })
    ;[ws] = raiseNote(ws, note('SO-004', 5, { on: '2026-09-21', booking: { carrierId: 'CR-002', promisedDate: '2026-09-21' } }), TODAY)
    ws = markDelivered(ws, 'CN-001', { on: '2026-09-21', by: 'Driver' }, TODAY)
    expect(board(ws)).toEqual({ late: ['SO-1'], soon: ['SO-2'], later: ['SO-3'], over: ['SO-4'] })
  })

  it('sorts the late ones most late first', () => {
    const [ws] = addOrder(booked(), { customerId: 'CU-002', takenOn: '2026-09-01', promisedDate: '2026-09-10', lines: [line(5, 900)] })
    expect(board(ws).late).toEqual(['SO-3', 'SO-1'])
  })

  it('filters on where each order is, and on being late across all of them', () => {
    const ws = booked()
    const one = so(ws, 'SO-1'), two = so(ws, 'SO-2')
    expect([matchesWhere(one, 'late'), matchesWhere(two, 'late')]).toEqual([true, false])
    expect([matchesWhere(one, 'dispatched'), matchesWhere(two, 'job')]).toEqual([true, true])
    expect(matchesWhere(two, 'delivered')).toBe(false)
    expect(matchesWhere(two, '')).toBe(true)
  })
})

const po = (over: Partial<PurchaseOrder> = {}): PurchaseOrder => ({
  id: 'PO-001', no: 'PO-1', vendorId: 'VN-001', itemId: 'IT-001', qty: 200, unitPrice: 240,
  orderedOn: '2026-09-10', expectedOn: '2026-09-18', state: 'confirmed', notifiedOn: '2026-09-10', ...over,
})
const buying = (...orders: PurchaseOrder[]): Workspace =>
  ({ ...booked(), vendors: [{ id: 'VN-001', name: 'Arvind Mills', paymentTermsDays: 30 }], orders })
const poj = (ws: Workspace, no = 'PO-1') =>
  purchaseJourney(ws, orderGroups(orderRows(ws)).find((g) => g.no === no)!, TODAY)

describe('a purchase order', () => {
  it('waits at the gate once handed over, and says when it was promised', () => {
    // handing the page over is version 1 confirmed — the order's own sync block reads it so
    const ws = markHandedOver(buying(po({ notifiedOn: undefined })), 'PO-1', '2026-09-10', 'K. Rao')
    const j = poj(ws)
    expect(read(j)).toBe('Handed over:done They confirmed:done At the gate:now* Checked:next On the shelf:next')
    expect(j.steps[1]).toMatchObject({ on: '2026-09-10', sub: 'Order handed over' })
    expect(j.between[1]).toEqual({ text: 'promised 18 Sep · 5d late', late: true })
    expect(j.steps[2].late).toBe('5 days past the promise')
  })

  it('reads a change as not sent, then not confirmed, then confirmed in their words', () => {
    let ws = markHandedOver(buying(po({ notifiedOn: undefined })), 'PO-1', '2026-09-10', 'K. Rao')
    ws = reviseOrder(ws, 'PO-001', { qty: 250, expectedOn: '2026-09-18', reason: 'More wanted', changedBy: 'K. Rao', on: '2026-09-12' })
    expect(poj(ws).steps[0]).toMatchObject({ sub: 'a change not sent yet', warn: true })
    ws = markHandedOver(ws, 'PO-1', '2026-09-12', 'K. Rao')
    expect(poj(ws).steps[1]).toMatchObject({ state: 'skip', sub: 'not the latest change' })
    ws = recordAck(ws, 'PO-1', { ref: 'WhatsApp from Rakesh', on: '2026-09-13' })
    expect(poj(ws).steps[1]).toMatchObject({ state: 'done', on: '2026-09-13', sub: 'WhatsApp from Rakesh' })
  })

  it('says when a supplier never replied to the page they were given', () => {
    const j = poj(buying(po({ revisions: [v1Of(po(), '2026-09-10', 'K. Rao')], notifiedVersion: 1 })))
    expect(j.steps[1]).toMatchObject({ state: 'skip', sub: 'no reply yet' })
  })

  it('is still on your desk as a draft', () => {
    const j = poj(buying(po({ state: 'draft', notifiedOn: undefined })))
    expect(read(j)).toBe('Handed over:now* They confirmed:next At the gate:next Checked:next On the shelf:next')
    expect(j.steps[0].sub).toBe('drafted 10 Sep')
    expect(j.steps[2].sub).toBe('due 18 Sep')
  })

  it('counts a lorry at the gate, and is late at the gate past the owner’s rule', () => {
    const ws0 = buying(po({ ackedOn: '2026-09-11' }))
    const [ws] = arrive(ws0, { order: ws0.orders[0], qty: 200, receivedOn: '2026-09-19' })
    const j = poj(ws)
    expect(read(j)).toBe('Handed over:done They confirmed:done At the gate:done Checked:now* On the shelf:next')
    expect(j.steps[2].sub).toBe('1 day after the promise')
    expect(j.steps[2].warn).toBe(true)
    expect(j.steps[3].sub).toBe('waiting at the gate')
    expect(j.steps[3].late).toBe(`4 days at the gate — your rule is ${ws.policy.inboundQcDays}`)
  })

  it('is on the shelf once what came has been checked, with what was rejected said', () => {
    const ws0 = buying(po())
    const ws = recordReceipt(ws0, { order: ws0.orders[0], qty: 200, accepted: 196, rejected: 4, receivedOn: '2026-09-17', inspector: 'S. Kale' })
    const j = poj(ws)
    expect(read(j)).toBe('Handed over:done They confirmed:done At the gate:done Checked:done On the shelf:done')
    expect(j.steps[1].sub).toBe('recorded as placed')
    expect(j.steps[2].sub).toBe('1 day early')
    expect(j.steps[3].sub).toBe('196 accepted · 4 rejected')
    expect(j.steps[4].sub).toBe('196 m')
    expect(j.done).toBe(true)
  })

  it('sums the lines on one order, and rings what has come so far', () => {
    const ws0 = buying(po(), po({ id: 'PO-002', qty: 100 }))
    const ws = recordReceipt(ws0, { order: ws0.orders[0], qty: 150, accepted: 150, rejected: 0, receivedOn: '2026-09-18', inspector: 'S. Kale' })
    const j = poj(ws)
    expect(j.steps[2].state).toBe('part')
    expect(j.steps[2].pct).toBe(50)
    expect(j.steps[2].current).toBe(true)
    expect(j.late).toBe(5)
  })
})

describe('a job card', () => {
  it('reads opened, issued, made and closed, and is late past its planned finish', () => {
    let ws = setMadeFor(booked(), 'JB-001', undefined, 'SO-002/1')
    let j = jobJourney(ws, ws.jobs[0], TODAY)
    // 120 off it with no slip on record: issuing was never written down, not missed
    expect(read(j)).toBe('Opened:done Material issued:skip Made:part(40%)* Closed:next')
    expect(j.steps[0].sub).toBe('for SO-2 · planned 16 Sep – 30 Sep')
    expect(j.late).toBe(0)
    ;[ws] = issueMaterial(ws, { jobId: 'JB-001', itemId: 'IT-001', qty: 100, on: '2026-09-16', takenBy: 'Cutting master', actor: 'S. Patil' })
    j = jobJourney(ws, ws.jobs[0], '2026-10-03')
    expect(j.steps[1]).toMatchObject({ state: 'done', sub: '1 slip', on: '2026-09-16' })
    expect(j.steps[2].late).toBe('3 days past its finish')
  })

  it('is over once closed', () => {
    const ws = closeJob(booked(), 'JB-001', TODAY)
    const j = jobJourney(ws, ws.jobs[0], TODAY)
    expect(j.done).toBe(true)
    expect(j.steps[3]).toMatchObject({ state: 'done', on: TODAY })
  })
})

describe('material out for jobwork', () => {
  const out = () => {
    const ws: Workspace = { ...booked(), vendors: [{ id: 'VN-002', name: 'Shree Wash', paymentTermsDays: 0 }], vendorType: { 'VN-002': JOBWORKER } }
    return sendOut(ws, { vendorId: 'VN-002', itemId: 'IT-001', qty: 100, sentOn: '2026-09-10', dueBack: '2026-09-20', expectedYield: 1, process: 'Stone wash' })
  }

  it('is with the jobworker until something comes back, late past due back', () => {
    const [ws, id] = out()
    const j = jobworkJourney(ws, ws.challans.find((c) => c.id === id)!, TODAY)
    expect(read(j)).toBe('Sent out:done With Shree Wash:now* Back at the gate:next Back on the shelf:next Settled:next')
    expect(j.steps[0].sub).toBe('100 m · Stone wash')
    expect(j.steps[1].sub).toBe('due back 20 Sep')
    expect(j.steps[1].late).toBe('3 days past due back')
  })

  it('rings what is back, through the gate and onto the shelf, and is over once settled', () => {
    let [ws, id] = out()
    ;[ws] = bookReturn(ws, id, { qty: 60, receivedOn: '2026-09-21' })
    let j = jobworkJourney(ws, ws.challans.find((c) => c.id === id)!, TODAY)
    expect(read(j)).toBe('Sent out:done With Shree Wash:done Back at the gate:part(60%)* Back on the shelf:next Settled:next')
    ws = closeReceipt(ws, ws.receipts.at(-1)!.id, { rejected: 0, inspector: 'S. Kale', closedAt: TODAY })
    j = jobworkJourney(ws, ws.challans.find((c) => c.id === id)!, TODAY)
    expect(j.steps[3]).toMatchObject({ state: 'part', pct: 60 })
    ws = closeChallan(ws, id, { reason: 'Rest lost in the wash', on: TODAY, unaccounted: 40 })
    j = jobworkJourney(ws, ws.challans.find((c) => c.id === id)!, TODAY)
    expect(j.done).toBe(true)
    expect(j.steps[4]).toMatchObject({ state: 'done', sub: '40 m written off' })
  })
})

/* ------------------------------------------------ where, word and the one thing to do -- */

describe('a purchase order says where it is, and the one thing to do', () => {
  it('a draft is not handed over: make the document', () => {
    const j = poj(buying(po({ state: 'draft', notifiedOn: undefined })))
    expect(j).toMatchObject({ where: 'handed', word: 'Not handed over', act: { kind: 'paper', label: 'Make the document' } })
  })

  it('handed over and not here: record what arrived, on the line still short', () => {
    const j = poj(buying(po()))
    expect(j).toMatchObject({ where: 'gate', word: 'Not here yet', lateShort: '5 days late' })
    expect(j.act).toEqual({ kind: 'receive', label: 'Record what arrived', orderId: 'PO-001' })
  })

  it('a lorry at the gate: check it, and the phone says how long it has waited', () => {
    const ws0 = buying(po())
    const [ws, id] = arrive(ws0, { order: ws0.orders[0], qty: 200, receivedOn: '2026-09-19' })
    const j = poj(ws)
    expect(j).toMatchObject({ where: 'checked', word: 'At the gate', lateShort: '4 days at the gate' })
    expect(j.act).toEqual({ kind: 'inspect', label: 'Check it', receiptId: id })
    expect(matchesPick(j, 'checked')).toBe(true)
    expect(matchesPick(j, 'gate')).toBe(false)
  })

  it('received: nothing left to do', () => {
    const ws0 = buying(po())
    const ws = recordReceipt(ws0, { order: ws0.orders[0], qty: 200, accepted: 200, rejected: 0, receivedOn: '2026-09-17', inspector: 'S. Kale' })
    expect(poj(ws)).toMatchObject({ where: 'done', word: 'Received', done: true })
    expect(poj(ws).act).toBeUndefined()
  })

  it('lists what is late first, then what is on your desk, then this week, then later, and folds the rest', () => {
    const ws0 = buying(
      po(),                                                                                            // late
      po({ id: 'PO-002', no: 'PO-2', state: 'draft', notifiedOn: undefined, expectedOn: '2026-10-20' }), // on your desk
      po({ id: 'PO-003', no: 'PO-3', expectedOn: '2026-09-27' }),                                      // this week
      po({ id: 'PO-004', no: 'PO-4', expectedOn: '2026-10-15' }),                                      // later
      po({ id: 'PO-005', no: 'PO-5' }),                                                                // received
    )
    const ws = recordReceipt(ws0, { order: ws0.orders[4], qty: 200, accepted: 200, rejected: 0, receivedOn: '2026-09-17', inspector: 'S. Kale' })
    const groups = orderGroups(orderRows(ws))
    const b = purchaseBoard(groups, (g) => purchaseJourney(ws, g, TODAY), TODAY)
    const nos = (xs: { no: string }[]) => xs.map((g) => g.no)
    expect({ late: nos(b.late), desk: nos(b.desk), soon: nos(b.soon), later: nos(b.later), over: nos(b.over) })
      .toEqual({ late: ['PO-1'], desk: ['PO-2'], soon: ['PO-3'], later: ['PO-4'], over: ['PO-5'] })
  })
})

describe('a job card says where it is, and the one thing to do', () => {
  const jj = (ws: Workspace, id = 'JB-001') => jobJourney(ws, ws.jobs.find((j) => j.id === id)!, TODAY)

  it('a card nobody has planned needs its plan first', () => {
    const [ws, id] = addJob(booked(), { no: 'ST-2', openedOn: TODAY })
    expect(jj(ws, id)).toMatchObject({ where: 'plan', word: 'Needs a plan', act: { kind: 'plan', label: 'Plan it' } })
  })

  it('planned with nothing issued: issue material', () => {
    expect(jj(booked(0))).toMatchObject({ where: 'issued', word: 'Waiting for material', act: { kind: 'issue' } })
  })

  it('part made: book output, and the ring says how far', () => {
    expect(jj(booked())).toMatchObject({ where: 'made', word: 'Made 40%', act: { kind: 'output', label: 'Book output' } })
  })

  it('all made: close it; closed: nothing left', () => {
    expect(jj(booked(300))).toMatchObject({ where: 'closed', word: 'Made — to close', act: { kind: 'close' } })
    expect(jj(closeJob(booked(300), 'JB-001', TODAY))).toMatchObject({ where: 'done', word: 'Closed', act: undefined })
  })

  it('lists past its finish, then behind, then on track, then not planned, and folds the closed', () => {
    let ws = booked()                                     // ST-1, planned to the 30th: on track by the journey
    ;[ws] = addJob(ws, { no: 'ST-2', openedOn: TODAY })    // not planned
    ;[ws] = addJob(ws, { no: 'ST-3', openedOn: '2026-09-01' })
    ws = closeJob(ws, 'JB-003', TODAY)                     // closed
    const rows = ws.jobs.map((job) => ({ job }))
    const b = jobBoard(rows, (r) => jobJourney(ws, r.job, TODAY), () => false)
    const nos = (xs: { job: { no: string } }[]) => xs.map((r) => r.job.no)
    expect({ late: nos(b.late), behind: nos(b.behind), track: nos(b.track), unplanned: nos(b.unplanned), over: nos(b.over) })
      .toEqual({ late: [], behind: [], track: ['ST-1'], unplanned: ['ST-2'], over: ['ST-3'] })
    const late = jobBoard(rows, (r) => jobJourney(ws, r.job, '2026-10-05'), () => false)
    expect(nos(late.late)).toEqual(['ST-1'])
    expect(nos(jobBoard(rows, (r) => jobJourney(ws, r.job, TODAY), (r) => r.job.no === 'ST-1').behind)).toEqual(['ST-1'])
  })
})

describe('material out for jobwork says where it is, and the one thing to do', () => {
  const out = () => {
    const ws: Workspace = { ...booked(), vendors: [{ id: 'VN-002', name: 'Shree Wash', paymentTermsDays: 0 }], vendorType: { 'VN-002': JOBWORKER } }
    return sendOut(ws, { vendorId: 'VN-002', itemId: 'IT-001', qty: 100, sentOn: '2026-09-10', dueBack: '2026-09-20', expectedYield: 1, process: 'Stone wash' })
  }
  const jw = (ws: Workspace, id: string) => jobworkJourney(ws, ws.challans.find((c) => c.id === id)!, TODAY)

  it('out: it came back, and the phone says how late', () => {
    const [ws, id] = out()
    expect(jw(ws, id)).toMatchObject({ where: 'with', word: 'With the jobworker', lateShort: '3 days late', act: { kind: 'return', label: 'It came back' } })
  })

  it('some back at the gate: inspect it first; inspected, wait for the rest', () => {
    let [ws, id] = out()
    let gr: string
    ;[ws, gr] = bookReturn(ws, id, { qty: 60, receivedOn: '2026-09-21' })
    expect(jw(ws, id)).toMatchObject({ where: 'gate', word: 'Back at the gate 60%', act: { kind: 'inspect', receiptId: gr } })
    ws = closeReceipt(ws, gr, { rejected: 0, inspector: 'S. Kale', closedAt: TODAY })
    expect(jw(ws, id).act).toEqual({ kind: 'return', label: 'It came back' })
    ws = closeChallan(ws, id, { reason: 'Rest lost in the wash', on: TODAY, unaccounted: 40 })
    expect(jw(ws, id)).toMatchObject({ where: 'done', word: 'Settled' })
    expect(jw(ws, id).act).toBeUndefined()
  })

  it('lists past due back first, then due this week, then later', () => {
    let [ws] = out()                                                                                                       // due the 20th: late
    ;[ws] = sendOut(ws, { vendorId: 'VN-002', itemId: 'IT-001', qty: 50, sentOn: '2026-09-20', dueBack: '2026-09-28', expectedYield: 1 })   // this week
    ;[ws] = sendOut(ws, { vendorId: 'VN-002', itemId: 'IT-001', qty: 50, sentOn: '2026-09-20', dueBack: '2026-10-20', expectedYield: 1 })   // later
    const rows = ws.challans.map((challan) => ({ challan }))
    const b = jobworkBoard(rows, (r) => jobworkJourney(ws, r.challan, TODAY), TODAY)
    const nos = (xs: { challan: { no: string } }[]) => xs.map((r) => r.challan.no)
    expect({ late: nos(b.late), soon: nos(b.soon), later: nos(b.later) }).toEqual({ late: ['JW-1'], soon: ['JW-2'], later: ['JW-3'] })
  })
})
