/**
 * Goods coming back from a customer.
 *
 * Never more than went out on the note, less what is already coming back;
 * never before the goods arrived. Booked in, the good ones are one movement
 * back onto the finished-goods shelf against the return's number, and the
 * damaged ones stay off it with the reason on the record.
 */
import { describe, expect, it } from 'vitest'
import { bookConsignment, markDelivered } from '@/lib/workspace/consignments'
import { dispatchDecisionsFor, noteDispatch } from '@/lib/workspace/dispatch-decisions'
import { raiseNote, removeNote, removeNoteProblem } from '@/lib/workspace/dispatch-notes'
import { pickedMetrics, stageMetrics } from '@/lib/workspace/metrics'
import { fgOnHand } from '@/lib/workspace/products'
import { dispatchNav } from '@/lib/workspace/reveal'
import {
  authoriseReturn, closeReturn, overdueReturns, receiveProblem, receiveReturn, removeReturn, removeReturnProblem,
  returnMoveId, returnProblem, returnRate, returnRows, returnableNotes, type ReturnInput,
} from '@/lib/workspace/returns'
import type { Workspace } from '@/lib/workspace/types'
import { TODAY, booked } from './dispatch-fixture'

/** SO-1's 100 went on the 18th with VRL; 200 are left on the shelf. */
function sent(delivered = true): Workspace {
  let [ws] = raiseNote(booked(300), { orderId: 'SO-001', on: '2026-09-18', lines: [{ productId: 'PR-001', qty: 100 }], weightKg: 80, authorisedBy: 'R. Mehta', actor: 'K. Rao' }, TODAY)
  ;[ws] = bookConsignment(ws, 'DN-001', { carrierId: 'CR-001', promisedDate: '2026-09-20' })
  if (delivered) ws = markDelivered(ws, 'CN-001', { on: '2026-09-19', by: 'Their stores' }, TODAY)
  return ws
}
const ret = (over: Partial<ReturnInput> = {}): ReturnInput => ({
  noteId: 'DN-001', productId: 'PR-001', qty: 12, reason: 'Wrong wash', raisedOn: '2026-09-20', owner: 'R. Mehta', ...over,
})

describe('agreeing a return', () => {
  it('refuses a return before the goods arrived, more than went, and one with no reason', () => {
    expect(returnProblem(sent(false), ret(), TODAY)).toBe('DC-1 is still on the road — it has to arrive before it can come back.')
    const ws = sent()
    expect(returnProblem(ws, ret({ qty: 101 }), TODAY)).toBe('Only 100 Slim-fit jeans went on DC-1 that are not already coming back.')
    expect(returnProblem(ws, ret({ reason: '' }), TODAY)).toBe('Say why it is coming back.')
    expect(returnProblem(ws, ret({ raisedOn: '2026-09-17' }), TODAY)).toBe('It cannot be agreed before the goods went out.')
    expect(returnProblem(ws, ret({ owner: '' }), TODAY)).toBe('Say who agreed it.')
    expect(returnProblem(ws, ret(), TODAY)).toBeNull()
  })

  it('numbers it, dates it due back by the rule, and counts it against the note', () => {
    let [ws, id] = authoriseReturn(sent(), ret(), TODAY)
    expect(id).toBe('RM-001')
    expect(ws.rmas[0]).toMatchObject({ no: 'RMA-1', orderId: 'SO-001', customerId: 'CU-001', dueBy: '2026-09-27', state: 'authorised' })
    ;[ws] = authoriseReturn(ws, ret({ qty: 80, dueBy: '2026-09-22' }), TODAY)
    expect(returnProblem(ws, ret({ qty: 9 }), TODAY)).toBe('Only 8 Slim-fit jeans went on DC-1 that are not already coming back.')
    expect(returnableNotes(ws).map((n) => n.no)).toEqual(['DC-1'])
    // a note that is coming back cannot be taken back
    expect(removeNoteProblem(ws, 'DN-001')).not.toBeNull()
    expect(removeNote(ws, 'DN-001')).toBe(ws)
  })
})

describe('booking it in', () => {
  it('puts the good ones back on the shelf against the return’s number, and keeps the damaged off it', () => {
    let [ws] = authoriseReturn(sent(), ret(), TODAY)
    expect(fgOnHand(ws, 'PR-001')).toBe(200)
    const x = { on: '2026-09-22', checkedBy: 'K. Rao', good: 10, damaged: 2, damageNote: 'Torn at the seam' }
    expect(receiveProblem(ws, 'RM-001', { ...x, damageNote: '' }, TODAY)).toBe('Say what is wrong with the damaged ones.')
    expect(receiveProblem(ws, 'RM-001', { ...x, good: 11 }, TODAY)).toBe('Only 12 were agreed to come back on RMA-1.')
    expect(receiveProblem(ws, 'RM-001', { ...x, on: '2026-09-24' }, TODAY)).toBe('That day has not happened yet.')
    ws = receiveReturn(ws, 'RM-001', x, TODAY)
    expect(ws.fgMoves.find((m) => m.id === returnMoveId('RM-001'))).toMatchObject({ kind: 'return_in', qty: 10, sourceRef: 'RMA-1', fgId: 'PR-001' })
    expect(fgOnHand(ws, 'PR-001')).toBe(210)
    expect(ws.rmas[0]).toMatchObject({ state: 'received', receivedOn: '2026-09-22', good: 10, damaged: 2, damageNote: 'Torn at the seam' })
    expect(receiveProblem(ws, 'RM-001', x, TODAY)).toBe('RMA-1 has already been booked in.')
    expect(removeReturnProblem(ws, 'RM-001')).toMatch(/The record stays/)
    expect(removeReturn(ws, 'RM-001')).toBe(ws)
    ws = closeReturn(ws, 'RM-001')
    expect(returnRows(ws, TODAY)[0].state).toBe('closed')
  })

  it('writes no movement when nothing came back fit to sell', () => {
    let [ws] = authoriseReturn(sent(), ret({ qty: 3 }), TODAY)
    ws = receiveReturn(ws, 'RM-001', { on: TODAY, checkedBy: 'K. Rao', good: 0, damaged: 3, damageNote: 'Water damage' }, TODAY)
    expect(ws.fgMoves.some((m) => m.kind === 'return_in')).toBe(false)
    expect(fgOnHand(ws, 'PR-001')).toBe(200)
  })

  it('lets a return be withdrawn while nothing has come back', () => {
    const [ws] = authoriseReturn(sent(), ret(), TODAY)
    expect(removeReturnProblem(ws, 'RM-001')).toBeNull()
    expect(removeReturn(ws, 'RM-001').rmas).toHaveLength(0)
  })
})

describe('the register, the card and the rate', () => {
  it('says a return past the day it was due, values it at cost, and lets it be noted', () => {
    const [ws] = authoriseReturn(sent(), ret({ dueBy: '2026-09-21' }), TODAY)
    const r = returnRows(ws, TODAY)[0]
    expect([r.state, r.overdue, r.value?.value]).toEqual(['overdue', true, 5040]) // 12 × ₹420
    expect(overdueReturns(ws, TODAY)).toHaveLength(1)
    expect(dispatchNav(ws, TODAY).find((x) => x.label === 'Returns')?.badge).toBe('1')
    const card = dispatchDecisionsFor(ws, TODAY).find((d) => d.kind === 'return-overdue')!
    expect(card.title).toBe('RMA-1 from Bharat Panels was due back 21 Sep')
    expect(card.detail).toBe('12 Slim-fit jeans against DC-1 — Wrong wash. Agreed by R. Mehta; 2 days past the date they were given.')
    expect([card.act, card.actLabel, card.refs.rmaId]).toEqual(['receive', 'Book it in', 'RM-001'])
    expect(dispatchDecisionsFor(noteDispatch(ws, card, TODAY), TODAY).some((d) => d.kind === 'return-overdue')).toBe(false)
  })

  it('counts the return rate on authorisations, and offers it only once a return exists', () => {
    expect(stageMetrics(sent(), TODAY, 'dispatch').some((m) => m.key === 'returnRate')).toBe(false)
    const [ws] = authoriseReturn(sent(), ret(), TODAY)
    expect(returnRate(ws).value).toBe(12) // 12 of 100
    const m = stageMetrics(ws, TODAY, 'dispatch').find((x) => x.key === 'returnRate')!
    expect([m.value, m.sub, m.tone]).toEqual(['12%', '12 of 100 pieces shipped · 1 return still to come back', 'critical'])
    expect(pickedMetrics(ws, TODAY, 'dispatch').map((x) => x.key)).toContain('returnRate')
  })
})
