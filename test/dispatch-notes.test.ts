/**
 * Goods out of the bay, and the paper that goes with them.
 *
 * A dispatch note never sends more than the order still wants or more than
 * came off the floor, and says which it ran into. Each line is one
 * finished-goods movement out against the note's number, so the shelf is a
 * sum of documents; taking a note back undoes exactly that. The challan
 * carries what the tax invoice and the e-way bill need, and nothing is sent.
 */
import { describe, expect, it } from 'vitest'
import { buildDelivery, deliveryFileName, deliveryMessageFor, deliverySendableFor } from '@/lib/paper/delivery'
import {
  bookConsignment, bookProblem, consignmentRows, deliverProblem, markDelivered, onTheRoad, orderToDock, otifOf,
  suggestFreight,
} from '@/lib/workspace/consignments'
import { dispatchDecisionsFor, noteDispatch } from '@/lib/workspace/dispatch-decisions'
import {
  handoff, noteMoveId, noteProblem, noteRows, raiseNote, removeNote, removeNoteProblem, unbooked, type NoteInput,
} from '@/lib/workspace/dispatch-notes'
import { pickedMetrics, stageMetrics } from '@/lib/workspace/metrics'
import { removeOutputProblem } from '@/lib/workspace/output'
import { fgOnHand } from '@/lib/workspace/products'
import { dispatchNav } from '@/lib/workspace/reveal'
import { addOrder } from '@/lib/workspace/sales'
import type { Workspace } from '@/lib/workspace/types'
import { TODAY, booked, line } from './dispatch-fixture'

const note = (over: Partial<NoteInput> = {}): NoteInput => ({
  orderId: 'SO-001', on: TODAY, lines: [{ productId: 'PR-001', qty: 100 }],
  weightKg: 80, authorisedBy: 'R. Mehta', actor: 'K. Rao', ...over,
})

describe('a dispatch note', () => {
  it('refuses more than the order wants, more than the shelf holds, and a note nobody authorised', () => {
    const ws = booked(120)
    expect(noteProblem(ws, note({ lines: [{ productId: 'PR-001', qty: 150 }] }), TODAY)).toBe('SO-1 only wants 100 more Slim-fit jeans.')
    expect(noteProblem(ws, note({ orderId: 'SO-002', lines: [{ productId: 'PR-001', qty: 150 }] }), TODAY))
      .toBe('Only 120 Slim-fit jeans are on the shelf — book what came off the floor first.')
    expect(noteProblem(ws, note({ authorisedBy: ' ' }), TODAY)).toMatch(/^Say who let it go/)
    expect(noteProblem(ws, note({ on: '2026-09-24' }), TODAY)).toBe('That day has not happened yet.')
    expect(noteProblem(ws, note({ lines: [{ productId: 'PR-001', qty: 0 }] }), TODAY)).toBe('Put in how many are going.')
    expect(noteProblem(ws, note(), TODAY)).toBeNull()
  })

  it('writes one finished-goods movement out per line, against its own number', () => {
    const [ws, id] = raiseNote(booked(120), note(), TODAY)
    expect(id).toBe('DN-001')
    const n = ws.dispatchNotes[0]
    expect([n.no, n.customerId, n.authorisedBy]).toEqual(['DC-1', 'CU-001', 'R. Mehta'])
    const out = ws.fgMoves.filter((m) => m.kind === 'despatch')
    expect(out).toEqual([expect.objectContaining({ id: noteMoveId(id, 0), fgId: 'PR-001', qty: -100, sourceRef: 'DC-1' })])
    expect(fgOnHand(ws, 'PR-001')).toBe(20)
    // the output those pieces came off can no longer be taken back
    expect(removeOutputProblem(ws, ws.outputs[0].id)).not.toBeNull()
  })

  it('is taken back whole — its pieces back on the shelf, its booking with it — until it is delivered', () => {
    let [ws] = raiseNote(booked(120), note({ booking: { carrierId: 'CR-001', promisedDate: '2026-09-25' } }), TODAY)
    expect(ws.consignments).toHaveLength(1)
    const back = removeNote(ws, 'DN-001')
    expect(back.dispatchNotes).toHaveLength(0)
    expect(back.consignments).toHaveLength(0)
    expect(fgOnHand(back, 'PR-001')).toBe(120)
    ws = markDelivered(ws, 'CN-001', { on: '2026-09-23', by: 'Their stores, on the phone' }, TODAY)
    expect(removeNoteProblem(ws, 'DN-001')).toMatch(/delivered/)
    expect(removeNote(ws, 'DN-001')).toBe(ws)
  })

  it('hands the accounts package the taxable value, the place of supply and the e-way bill question', () => {
    let [ws] = raiseNote(booked(300), note(), TODAY)
    ;[ws] = raiseNote(ws, note({ orderId: 'SO-002', lines: [{ productId: 'PR-001', qty: 40 }] }), TODAY)
    expect(handoff(ws, 'DN-001')).toEqual({
      taxable: 90000, from: 'Maharashtra', placeOfSupply: 'Maharashtra', supply: 'intra', ewayNeeded: true, threshold: 50000,
    })
    expect(handoff(ws, 'DN-002')).toMatchObject({ taxable: 38000, placeOfSupply: 'Karnataka', supply: 'inter', ewayNeeded: false })
    // a note on a free order has no value to judge the e-way bill by
    ;[ws] = addOrder(ws, { customerId: 'CU-001', takenOn: TODAY, promisedDate: TODAY, lines: [line(5, 0)] })
    ;[ws] = raiseNote(ws, note({ orderId: 'SO-003', lines: [{ productId: 'PR-001', qty: 5 }] }), TODAY)
    expect(handoff(ws, 'DN-003').ewayNeeded).toBeNull()
    expect(noteRows(ws).map((r) => [r.note.no, r.units, r.valueAtCost])).toEqual([
      ['DC-3', 5, 2100], ['DC-2', 40, 16800], ['DC-1', 100, 42000],
    ])
  })
})

describe('the delivery challan', () => {
  it('is addressed to the customer, and carries the hand-off values in words', () => {
    const [ws] = raiseNote(booked(120), note({ booking: { carrierId: 'CR-001', lrNo: 'VRL 4471902', promisedDate: '2026-09-25' } }), TODAY)
    const doc = buildDelivery(ws, 'DN-001')!
    expect(doc.customer).toMatchObject({ name: 'Bharat Panels', gstin: '27AABCB1234K1Z2', state: 'Maharashtra', shipTo: 'Chakan MIDC, Pune' })
    expect(doc.lines).toEqual([{ product: 'Slim-fit jeans', code: 'SF-32', hsn: '6203', qty: '100 pieces', rate: '₹900', value: '₹90,000' }])
    expect([doc.weight, doc.carrier, doc.docket, doc.expected]).toEqual(['80 kg', 'VRL Logistics (part load)', 'VRL 4471902', '25 Sep 2026'])
    expect(doc.handoffLines).toEqual([
      'Taxable value ₹90,000',
      'Place of supply Maharashtra',
      'Inside the state (CGST + SGST)',
      'E-way bill needed — the value is at or over ₹50,000',
    ])
    expect(deliveryFileName(doc)).toBe('DC-1-Bharat-Panels.pdf')
    const words = deliveryMessageFor(doc)
    expect(words).toMatch(/^Indigo Threads — delivery challan DC-1, 23 Sep 2026/)
    expect(words).toContain('With VRL Logistics (part load), docket VRL 4471902, expected by 25 Sep 2026')
    expect(words).toContain('E-way bill needed')
    expect(deliverySendableFor(doc)).toMatchObject({ vendor: { name: 'Bharat Panels' }, subject: 'Delivery challan DC-1 — SO-1' })
    expect(doc.problems).toEqual([])
  })
})

describe('booking and delivery', () => {
  it('works freight out from the carrier’s rate when weight, distance and rate are all known', () => {
    const [ws] = raiseNote(booked(120), note(), TODAY)
    expect(suggestFreight(ws, 'DN-001', 'CR-001')).toBe(600) // 80 kg × 150 km × ₹0.05
    expect(suggestFreight(ws, 'DN-001', 'CR-002')).toBeUndefined()
    expect(bookProblem(ws, 'DN-001', { carrierId: 'CR-001', promisedDate: '2026-09-22' })).toBe('It cannot arrive before it left.')
    const [w2] = bookConsignment(ws, 'DN-001', { carrierId: 'CR-001', promisedDate: '2026-09-25' })
    expect(w2.consignments[0]).toMatchObject({ id: 'CN-001', noteId: 'DN-001', freight: 600 })
    expect(bookProblem(w2, 'DN-001', { carrierId: 'CR-002', promisedDate: '2026-09-25' })).toBe('It is already booked with a carrier.')
  })

  it('takes a delivery date only with the name of who confirmed it', () => {
    let [ws] = raiseNote(booked(120), note({ booking: { carrierId: 'CR-001', promisedDate: '2026-09-25' } }), TODAY)
    expect(deliverProblem(ws, 'CN-001', { on: TODAY, by: '' }, TODAY)).toMatch(/a delivery date with no name is a guess/)
    ws = markDelivered(ws, 'CN-001', { on: TODAY, by: 'S. Patil at their gate' }, TODAY)
    expect(ws.consignments[0]).toMatchObject({ deliveredOn: TODAY, confirmedBy: 'S. Patil at their gate' })
    expect(deliverProblem(ws, 'CN-001', { on: TODAY, by: 'again' }, TODAY)).toBe('It is already marked delivered.')
  })

  it('judges in full per order, so the balancing shipment of a split order counts', () => {
    let [ws] = raiseNote(booked(300), note({ orderId: 'SO-002', on: '2026-09-22', lines: [{ productId: 'PR-001', qty: 120 }] }), TODAY)
    ;[ws] = raiseNote(ws, note({ orderId: 'SO-002', lines: [{ productId: 'PR-001', qty: 80 }] }), TODAY)
    ;[ws] = bookConsignment(ws, 'DN-001', { carrierId: 'CR-001', promisedDate: '2026-09-23' })
    ;[ws] = bookConsignment(ws, 'DN-002', { carrierId: 'CR-001', promisedDate: '2026-09-25' })
    ws = markDelivered(ws, 'CN-001', { on: '2026-09-23', by: 'Their stores' }, TODAY)
    ws = markDelivered(ws, 'CN-002', { on: '2026-09-23', by: 'Their stores' }, TODAY)
    const rows = consignmentRows(ws, TODAY)
    expect(rows.map((r) => [r.note.no, r.onTime, r.inFull, r.verdict])).toEqual([
      ['DC-2', true, true, 'otif'], ['DC-1', true, false, 'short'],
    ])
    expect(otifOf(rows).value).toBe(50)
    expect(orderToDock(ws).value).toBe(7.5) // 7 and 8 days from the 15th
  })

  it('shows what is on the road under its carrier, the most overdue first', () => {
    let [ws] = raiseNote(booked(300), note({ on: '2026-09-21', booking: { carrierId: 'CR-001', promisedDate: '2026-09-22' } }), TODAY)
    ;[ws] = raiseNote(ws, note({ orderId: 'SO-002', lines: [{ productId: 'PR-001', qty: 60 }], booking: { carrierId: 'CR-001', promisedDate: '2026-09-26' } }), TODAY)
    const road = onTheRoad(ws, TODAY)
    expect(road).toHaveLength(1)
    expect(road[0].carrier?.name).toBe('VRL Logistics')
    expect(road[0].rows.map((x) => [x.row.note.no, x.daysAway, x.units])).toEqual([['DC-1', -1, 100], ['DC-2', 3, 60]])
    expect(consignmentRows(ws, TODAY).find((r) => r.note.no === 'DC-1')?.verdict).toBe('overdue')
  })
})

describe('the bay’s cards and figures', () => {
  it('asks for a carrier on a note nobody booked, and says an e-way bill is needed', () => {
    let [ws] = raiseNote(booked(120), note(), TODAY)
    expect(unbooked(ws).map((n) => n.no)).toEqual(['DC-1'])
    expect(dispatchNav(ws, TODAY).find((r) => r.label === 'Delivery challans')?.badge).toBe('1')
    const cards = dispatchDecisionsFor(ws, TODAY)
    const book = cards.find((d) => d.kind === 'note-no-carrier')!
    expect(book.title).toBe('DC-1 to Bharat Panels has no carrier or docket number')
    expect([book.act, book.alt?.label]).toEqual(['book', 'Collected by them'])
    const eway = cards.find((d) => d.kind === 'note-eway')!
    expect(eway.title).toBe('DC-1 is worth ₹90,000 — an e-way bill is needed before it moves')
    expect(eway.href).toBe('/dispatch/notes?doc=DN-001')
    // booked, the first card goes; noted, the second does
    ;[ws] = bookConsignment(ws, 'DN-001', { carrierId: 'CR-002', promisedDate: TODAY })
    ws = noteDispatch(ws, eway, TODAY)
    expect(dispatchDecisionsFor(ws, TODAY).filter((d) => d.kind.startsWith('note-'))).toEqual([])
  })

  it('leaves every figure unmeasured until the record behind it exists', () => {
    const blank = stageMetrics(booked(0), TODAY, 'dispatch')
    expect(blank.map((m) => m.key)).toEqual(['otif', 'orderToDock', 'pastPromise', 'fgValue', 'freightUnit', 'carrierLate', 'dispatchedMonth'])
    expect(blank.filter((m) => m.measured).map((m) => m.key)).toEqual(['pastPromise'])
    expect(pickedMetrics(booked(0), TODAY, 'dispatch').map((m) => m.key))
      .toEqual(['otif', 'orderToDock', 'pastPromise', 'fgValue', 'freightUnit', 'dispatchedMonth'])
  })

  it('works each figure out from the owner’s own records', () => {
    let [ws] = raiseNote(booked(300), note({ on: '2026-09-21', booking: { carrierId: 'CR-001', promisedDate: '2026-09-22' } }), TODAY)
    ws = markDelivered(ws, 'CN-001', { on: TODAY, by: 'Their stores' }, TODAY)
    const m = Object.fromEntries(stageMetrics(ws, TODAY, 'dispatch').map((x) => [x.key, x])) as Record<string, ReturnType<typeof stageMetrics>[number]>
    expect(m.otif.value).toBe('0%') // a day late
    expect(m.otif.sub).toBe('0 of 1 delivery · target 95%')
    expect(m.orderToDock.value).toBe('11 days')
    expect(m.pastPromise.value).toBe('₹0') // SO-1 has all gone; SO-2 is inside its promise
    expect(m.fgValue.value).toBe('₹84,000') // 200 left × ₹420
    expect(m.freightUnit.value).toBe('₹6') // ₹600 over 100 pieces
    expect(m.carrierLate.value).toBe('100%')
    expect(m.dispatchedMonth.value).toBe('₹42,000')
  })

  it('never judges a figure on a sample company’s records', () => {
    const w: Workspace = booked(0)
    expect(w.company.name).toBe('Indigo Threads')
    expect(stageMetrics(w, TODAY, 'dispatch').find((m) => m.key === 'pastPromise')?.value).toBe('₹90,000')
  })
})
