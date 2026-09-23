/**
 * Goods out of the bay against an order.
 *
 * A dispatch note is what left, for which order, on whose authority — one
 * finished-goods movement out per line, against the note's number, so the
 * shelf's balance is always output booked less what went. A note refuses to
 * send more than the order still wants or more than is on the shelf, and says
 * which of the two it ran into.
 *
 * The note also carries what the accounts package needs to raise the tax
 * invoice and what the e-way bill wants: the taxable value at the order's
 * rates, the place of supply, whether the supply is inside the state or
 * across it, and whether the value crosses the e-way bill threshold. The
 * invoice itself is raised there, not here.
 */
import type { FgMovement } from '@/lib/domain/types'
import { bookConsignment, bookProblem, consignmentOf, type Booking } from './consignments'
import { customerOf, dispatchRulesOf } from './customers'
import { issueId } from './defaults'
import { companyState, customerState, supplyType } from './gst'
import { fgOnHand, productOf } from './products'
import { dispatchedOn, orderOf } from './sales'
import { nextNo } from './sourcing'
import type { CustomerOrder, DispatchNote, Product, Workspace, WsCarrier, WsConsignment, WsCustomer } from './types'

export const noteMoveId = (noteId: string, i: number) => `FGM-${noteId}-${i + 1}`

export interface NoteInput {
  orderId: string
  on: string
  lines: { productId: string; qty: number }[]
  weightKg?: number
  authorisedBy: string
  actor: string
  note?: string
  /** booked with a carrier as it is raised; or later, from the register */
  booking?: Booking
}

/** What an order still wants of a product. */
export const pendingOf = (ws: Workspace, order: CustomerOrder, productId: string): number =>
  Math.max(0, order.lines.filter((l) => l.productId === productId).reduce((a, l) => a + l.qty, 0) - dispatchedOn(ws, order.id, productId))

export function noteProblem(ws: Workspace, x: NoteInput, today: string): string | null {
  const order = orderOf(ws, x.orderId)
  if (!order) return 'Pick the order it goes against.'
  if (order.state !== 'open') return `${order.no} is cancelled.`
  if (!x.on) return 'Put in the day it went.'
  if (x.on > today) return 'That day has not happened yet.'
  if (x.on < order.takenOn) return 'It cannot go before the order was taken.'
  const going = x.lines.filter((l) => l.qty > 0)
  if (going.length === 0) return 'Put in how many are going.'
  for (const l of going) {
    const p = productOf(ws, l.productId)
    if (!p) return 'A line is for a product that is not on the list.'
    if (!Number.isInteger(l.qty)) return `How many ${p.name} is a whole number.`
    const pending = pendingOf(ws, order, l.productId)
    if (l.qty > pending) return `${order.no} only wants ${pending} more ${p.name}.`
    const stock = fgOnHand(ws, l.productId)
    if (l.qty > stock) return `Only ${stock} ${p.name} are on the shelf — book what came off the floor first.`
  }
  if (x.weightKg !== undefined && (!Number.isFinite(x.weightKg) || x.weightKg < 0)) return 'Weight is kilograms, or blank.'
  if (x.authorisedBy.trim().length < 2) return 'Say who let it go. A dispatch without a name is stock walking.'
  if (x.booking) return bookProblem(ws, '', x.booking, x.on)
  return null
}

export function raiseNote(ws: Workspace, x: NoteInput, today: string): [Workspace, string] {
  if (noteProblem(ws, x, today)) return [ws, '']
  const order = orderOf(ws, x.orderId)!
  const [w0, id] = issueId(ws, 'DN')
  const no = nextNo('DN', w0.dispatchNotes ?? [])
  const lines = x.lines.filter((l) => l.qty > 0).map((l) => ({ productId: l.productId, qty: l.qty }))
  const note: DispatchNote = {
    id, no, orderId: order.id, customerId: order.customerId, on: x.on, lines,
    weightKg: x.weightKg, authorisedBy: x.authorisedBy.trim(), actor: x.actor, note: x.note?.trim() || undefined,
  }
  const moves: FgMovement[] = lines.map((l, i) => ({
    id: noteMoveId(id, i), fgId: l.productId, on: x.on, kind: 'despatch', qty: -l.qty, sourceRef: no,
    actor: x.actor, note: `to ${customerOf(ws, order.customerId)?.name ?? 'the customer'} on ${order.no}`,
  }))
  let w: Workspace = { ...w0, dispatchNotes: [...(w0.dispatchNotes ?? []), note], fgMoves: [...(w0.fgMoves ?? []), ...moves] }
  if (x.booking) [w] = bookConsignment(w, id, x.booking)
  return [w, id]
}

/** Why a note cannot be taken back: the customer has it, or has sent some of it back. */
export function removeNoteProblem(ws: Workspace, noteId: string): string | null {
  if (consignmentOf(ws, noteId)?.deliveredOn) return 'It has been delivered. A note the customer has cannot be taken back.'
  if ((ws.rmas ?? []).some((r) => r.noteId === noteId)) return 'A return has been raised against it.'
  return null
}

/** A note taken back — mis-keyed. Its pieces go back on the shelf, and its consignment goes with it. */
export function removeNote(ws: Workspace, noteId: string): Workspace {
  if (!(ws.dispatchNotes ?? []).some((n) => n.id === noteId) || removeNoteProblem(ws, noteId)) return ws
  return {
    ...ws,
    dispatchNotes: (ws.dispatchNotes ?? []).filter((n) => n.id !== noteId),
    fgMoves: (ws.fgMoves ?? []).filter((m) => !m.id.startsWith(`FGM-${noteId}-`)),
    consignments: (ws.consignments ?? []).filter((c) => c.noteId !== noteId),
  }
}

export interface Handoff {
  /** Σ qty × the order's rate — what the tax invoice is raised on */
  taxable: number
  from?: string
  placeOfSupply?: string
  supply?: 'intra' | 'inter'
  /** null when there is no value to judge it by */
  ewayNeeded: boolean | null
  threshold: number
}

/** What the accounts package and the e-way bill need from a note. */
export function handoff(ws: Workspace, noteId: string): Handoff {
  const note = (ws.dispatchNotes ?? []).find((n) => n.id === noteId)
  const order = orderOf(ws, note?.orderId)
  const customer = customerOf(ws, note?.customerId)
  const threshold = dispatchRulesOf(ws).ewayThreshold
  if (!note || !order) return { taxable: 0, ewayNeeded: null, threshold }
  const rateOf = (pid: string) => order.lines.find((l) => l.productId === pid)?.rate ?? 0
  const taxable = Math.round(note.lines.reduce((a, l) => a + l.qty * rateOf(l.productId), 0) * 100) / 100
  const from = companyState(ws)
  const to = customerState(customer)
  return {
    taxable, from, placeOfSupply: to, supply: supplyType(from, to),
    ewayNeeded: taxable > 0 ? taxable >= threshold : null, threshold,
  }
}

export interface NoteRow {
  note: DispatchNote
  order?: CustomerOrder
  customer?: WsCustomer
  consignment?: WsConsignment
  carrier?: WsCarrier
  lines: { product?: Product; qty: number }[]
  units: number
  /** at what each costs to make — the value that left the building */
  valueAtCost: number
  handoff: Handoff
}

export function noteRows(ws: Workspace): NoteRow[] {
  return [...(ws.dispatchNotes ?? [])]
    .sort((a, b) => b.on.localeCompare(a.on) || b.id.localeCompare(a.id))
    .map((note) => {
      const consignment = consignmentOf(ws, note.id)
      const lines = note.lines.map((l) => ({ product: productOf(ws, l.productId), qty: l.qty }))
      return {
        note, consignment, lines,
        order: orderOf(ws, note.orderId),
        customer: customerOf(ws, note.customerId),
        carrier: consignment ? (ws.carriers ?? []).find((c) => c.id === consignment.carrierId) : undefined,
        units: note.lines.reduce((a, l) => a + l.qty, 0),
        valueAtCost: Math.round(lines.reduce((a, l) => a + l.qty * (l.product?.standardCost ?? 0), 0) * 100) / 100,
        handoff: handoff(ws, note.id),
      }
    })
}

/** Notes not yet given to a carrier. */
export const unbooked = (ws: Workspace) => (ws.dispatchNotes ?? []).filter((n) => !consignmentOf(ws, n.id))
