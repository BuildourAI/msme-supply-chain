/**
 * Consignments on the road, and whether they got there.
 *
 * A delivery counts only once somebody says it landed and who they are; a
 * consignment past its promise with nobody saying so is a card with a chase
 * beside it; a carrier who keeps landing late is a number, not a feeling.
 */
import { describe, expect, it } from 'vitest'
import {
  bookConsignment, carrierRows, carriersThisMonth, chaseText, chasedKey, consignmentRows, markDelivered,
  overdueInTransit, updateConsignment,
} from '@/lib/workspace/consignments'
import { dispatchDecisionsFor, noteDispatch } from '@/lib/workspace/dispatch-decisions'
import { raiseNote, type NoteInput } from '@/lib/workspace/dispatch-notes'
import { dispatchNav } from '@/lib/workspace/reveal'
import { addOrder } from '@/lib/workspace/sales'
import type { Workspace } from '@/lib/workspace/types'
import { TODAY, booked, line } from './dispatch-fixture'

const note = (over: Partial<NoteInput> = {}): NoteInput => ({
  orderId: 'SO-001', on: '2026-09-18', lines: [{ productId: 'PR-001', qty: 100 }],
  weightKg: 80, authorisedBy: 'R. Mehta', actor: 'K. Rao', ...over,
})

/** Four notes with VRL across the month: SO-1 in full, then three small orders. */
function lane(): Workspace {
  let ws = booked(300)
  ;[ws] = raiseNote(ws, note({ booking: { carrierId: 'CR-001', lrNo: 'VRL 1', promisedDate: '2026-09-20' } }), TODAY)
  for (const [i, taken] of ['2026-09-02', '2026-09-03', '2026-09-04'].entries()) {
    ;[ws] = addOrder(ws, { customerId: 'CU-002', takenOn: taken, promisedDate: '2026-09-15', lines: [line(10, 950)] })
    ;[ws] = raiseNote(ws, note({ orderId: `SO-00${3 + i}`, on: '2026-09-10', lines: [{ productId: 'PR-001', qty: 10 }],
      booking: { carrierId: 'CR-001', promisedDate: '2026-09-12' } }), TODAY)
  }
  return ws
}

describe('on the road', () => {
  it('says a consignment past its promise that nobody has confirmed, with a chase beside it', () => {
    const ws = lane()
    expect(overdueInTransit(ws, TODAY)).toBe(4)
    expect(dispatchNav(ws, TODAY).find((r) => r.label === 'Consignments')?.badge).toBe('4')
    const card = dispatchDecisionsFor(ws, TODAY).find((d) => d.id === 'delivery-due:CN-001')!
    expect(card.title).toBe('DN-1 to Bharat Panels was promised 20 Sep and nobody has confirmed delivery')
    expect(card.detail).toMatch(/^With VRL Logistics, docket VRL 1, left 18 Sep\./)
    expect([card.band, card.act, card.alt?.act]).toEqual(['costs', 'delivered', 'chase'])
    // chased, the card says when
    const chased = { ...ws, drafts: { ...ws.drafts, [chasedKey('CN-001')]: TODAY } }
    expect(dispatchDecisionsFor(chased, TODAY).find((d) => d.id === 'delivery-due:CN-001')?.detail).toContain('You chased them today.')
  })

  it('asks on the day it is due, more quietly', () => {
    let [ws] = raiseNote(booked(300), note({ on: TODAY, booking: { carrierId: 'CR-002', promisedDate: TODAY } }), TODAY)
    const card = dispatchDecisionsFor(ws, TODAY).find((d) => d.kind === 'delivery-due')!
    expect(card.title).toBe('DN-1 to Bharat Panels is due today — has it arrived?')
    expect(card.band).toBe('unfinished')
    ws = markDelivered(ws, 'CN-001', { on: TODAY, by: 'Driver, with their stamp' }, TODAY)
    expect(dispatchDecisionsFor(ws, TODAY).some((d) => d.kind === 'delivery-due')).toBe(false)
  })

  it('puts the docket, the promise and the customer into the words a person sends', () => {
    const r = consignmentRows(lane(), TODAY).find((x) => x.note.no === 'DN-1')!
    expect(chaseText(r, 'Indigo Threads')).toBe([
      'Indigo Threads — consignment DN-1, your docket VRL 1.',
      'It left on 2026-09-18 for Bharat Panels, Chakan MIDC, Pune, promised for 2026-09-20.',
      'Where is it, and when will it be delivered?',
    ].join('\n'))
  })

  it('lets the booking be put right until the customer has it', () => {
    let ws = lane()
    ws = updateConsignment(ws, 'CN-001', { lrNo: 'VRL 1A', freight: 750 })
    expect(ws.consignments[0]).toMatchObject({ lrNo: 'VRL 1A', freight: 750 })
  })
})

describe('by carrier', () => {
  it('adds up shipped, delivered, late and the days behind', () => {
    let ws = lane()
    ws = markDelivered(ws, 'CN-001', { on: '2026-09-22', by: 'Their stores' }, TODAY) // 2 days late
    ws = markDelivered(ws, 'CN-002', { on: '2026-09-12', by: 'Their stores' }, TODAY) // on the day
    ws = markDelivered(ws, 'CN-003', { on: '2026-09-15', by: 'Their stores' }, TODAY) // 3 days late
    const vrl = carrierRows(ws, TODAY).find((c) => c.carrier.id === 'CR-001')!
    expect([vrl.shipped, vrl.delivered, vrl.late]).toEqual([4, 3, 2])
    expect(vrl.drift.value).toBe(1.7) // (2 + 0 + 3) ÷ 3
    expect(vrl.freight).toBe(600 + 3 * 3360) // 80 kg × km × ₹0.05: 150 km to Bharat, 840 km to Deccan
    const month = carriersThisMonth(ws, TODAY).find((c) => c.carrier.id === 'CR-001')!
    expect([month.delivered, month.late, month.behind]).toEqual([3, 2, 2.5])
    expect(carrierRows(ws, TODAY).map((c) => c.carrier.name)).toEqual(['VRL Logistics', 'Our own vehicle'])
  })

  it('says a carrier who keeps landing late, and comes back only with another late one', () => {
    let ws = lane()
    ws = markDelivered(ws, 'CN-001', { on: '2026-09-22', by: 'Their stores' }, TODAY)
    ws = markDelivered(ws, 'CN-002', { on: '2026-09-12', by: 'Their stores' }, TODAY)
    expect(dispatchDecisionsFor(ws, TODAY).some((d) => d.kind === 'carrier-late')).toBe(false)
    ws = markDelivered(ws, 'CN-003', { on: '2026-09-15', by: 'Their stores' }, TODAY)
    const card = dispatchDecisionsFor(ws, TODAY).find((d) => d.kind === 'carrier-late')!
    expect(card.title).toBe('VRL Logistics delivered 2 of 3 late this month, 2.5 days behind on average')
    expect(card.href).toBe('/dispatch/consignments?view=carriers')
    ws = noteDispatch(ws, card, TODAY)
    expect(dispatchDecisionsFor(ws, TODAY).some((d) => d.kind === 'carrier-late')).toBe(false)
    ws = markDelivered(ws, 'CN-004', { on: '2026-09-16', by: 'Their stores' }, TODAY)
    expect(dispatchDecisionsFor(ws, TODAY).find((d) => d.kind === 'carrier-late')?.title).toMatch(/^VRL Logistics delivered 3 of 4 late/)
  })

  it('keeps a carrier with nothing booked out of the figures', () => {
    const [ws] = bookConsignment(booked(300), 'DN-999', { carrierId: 'CR-001', promisedDate: TODAY })
    expect(ws.consignments).toHaveLength(0)
    expect(carrierRows(booked(), TODAY).every((c) => c.shipped === 0 && c.delivered === 0)).toBe(true)
  })
})
