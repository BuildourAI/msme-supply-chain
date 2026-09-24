/**
 * Goods coming back from a customer.
 *
 * A return is authorised against the dispatch note the goods went out on —
 * never more than went on it, less what is already coming back — with a
 * reason and a day it is due back. When it arrives, somebody checks it: what
 * is fit to sell again goes back on the finished-goods shelf as one movement
 * against the return's number; what is damaged stays off it, with the reason
 * on the record. The return rate is the domain's, counted on authorisations,
 * so a return nobody has chased still shows.
 */
import { addDays } from '@/lib/domain/calc'
import { rmaRate, rmaValue } from '@/lib/domain/dispatch'
import type { Derived, FgMovement, Rma } from '@/lib/domain/types'
import { consignmentOf } from './consignments'
import { customerOf, dispatchRulesOf } from './customers'
import { issueId } from './defaults'
import { asFg, productOf } from './products'
import { orderOf } from './sales'
import { nextNo } from './sourcing'
import type { CustomerOrder, DispatchNote, Product, Workspace, WsCustomer, WsRma } from './types'

export const rmaOf = (ws: Workspace, id?: string): WsRma | undefined =>
  id ? (ws.rmas ?? []).find((r) => r.id === id) : undefined

export const returnMoveId = (rmaId: string) => `FGM-${rmaId}`

export interface ReturnInput {
  noteId: string
  productId: string
  qty: number
  reason: string
  raisedOn: string
  /** blank: the raised day plus the rule's days */
  dueBy?: string
  owner: string
}

/** What went on a note of a product, less what is already coming back against it. */
export function returnableOn(ws: Workspace, noteId: string, productId: string, exceptId?: string): number {
  const note = (ws.dispatchNotes ?? []).find((n) => n.id === noteId)
  if (!note) return 0
  const went = note.lines.filter((l) => l.productId === productId).reduce((a, l) => a + l.qty, 0)
  const back = (ws.rmas ?? []).filter((r) => r.id !== exceptId && r.noteId === noteId && r.productId === productId)
    .reduce((a, r) => a + r.qty, 0)
  return Math.max(0, went - back)
}

export const dueByOf = (ws: Workspace, raisedOn: string): string => addDays(raisedOn, dispatchRulesOf(ws).returnDays)

export function returnProblem(ws: Workspace, x: ReturnInput, today: string): string | null {
  const note = (ws.dispatchNotes ?? []).find((n) => n.id === x.noteId)
  if (!note) return 'Pick the delivery challan it went out on.'
  const c = consignmentOf(ws, note.id)
  if (c && !c.deliveredOn) return `${note.no} is still on the road — it has to arrive before it can come back.`
  const p = productOf(ws, x.productId)
  if (!p || !note.lines.some((l) => l.productId === x.productId)) return `Pick a product that went on ${note.no}.`
  if (!Number.isInteger(x.qty) || x.qty <= 0) return `Put in how many ${p.name} are coming back, a whole number.`
  const can = returnableOn(ws, note.id, p.id)
  if (x.qty > can) return can === 0 ? `Every ${p.name} on ${note.no} is already coming back.` : `Only ${can} ${p.name} went on ${note.no} that are not already coming back.`
  if (x.reason.trim().length < 3) return 'Say why it is coming back.'
  if (!x.raisedOn) return 'Put in the day it was agreed.'
  if (x.raisedOn > today) return 'That day has not happened yet.'
  if (x.raisedOn < note.on) return 'It cannot be agreed before the goods went out.'
  if (x.dueBy && x.dueBy < x.raisedOn) return 'It cannot be due back before it was agreed.'
  if (x.owner.trim().length < 2) return 'Say who agreed it.'
  return null
}

export function authoriseReturn(ws: Workspace, x: ReturnInput, today: string): [Workspace, string] {
  if (returnProblem(ws, x, today)) return [ws, '']
  const note = (ws.dispatchNotes ?? []).find((n) => n.id === x.noteId)!
  const [w, id] = issueId(ws, 'RM')
  const rma: WsRma = {
    id, no: nextNo('RMA', w.rmas ?? []), orderId: note.orderId, noteId: note.id, customerId: note.customerId,
    productId: x.productId, qty: x.qty, reason: x.reason.trim(), raisedOn: x.raisedOn,
    dueBy: x.dueBy || dueByOf(ws, x.raisedOn), owner: x.owner.trim(), state: 'authorised',
  }
  return [{ ...w, rmas: [...(w.rmas ?? []), rma] }, id]
}

export interface Receipt {
  on: string
  checkedBy: string
  good: number
  damaged: number
  damageNote?: string
}

export function receiveProblem(ws: Workspace, id: string, x: Receipt, today: string): string | null {
  const r = rmaOf(ws, id)
  if (!r) return 'That return is not on the register.'
  if (r.state !== 'authorised') return `${r.no} has already been booked in.`
  if (!x.on) return 'Put in the day it came back.'
  if (x.on > today) return 'That day has not happened yet.'
  if (x.on < r.raisedOn) return 'It cannot come back before it was agreed.'
  const whole = (n: number) => Number.isInteger(n) && n >= 0
  if (!whole(x.good) || !whole(x.damaged)) return 'Good and damaged are whole numbers — nought where there were none.'
  if (x.good + x.damaged === 0) return 'Put in how many came back.'
  if (x.good + x.damaged > r.qty) return `Only ${r.qty} were agreed to come back on ${r.no}.`
  if (x.damaged > 0 && !x.damageNote?.trim()) return 'Say what is wrong with the damaged ones.'
  if (x.checkedBy.trim().length < 2) return 'Say who checked it.'
  return null
}

/** Booked in at the gate: the good ones back on the shelf, against the return's number. */
export function receiveReturn(ws: Workspace, id: string, x: Receipt, today: string): Workspace {
  if (receiveProblem(ws, id, x, today)) return ws
  const r = rmaOf(ws, id)!
  const moves: FgMovement[] = x.good > 0 ? [{
    id: returnMoveId(id), fgId: r.productId, on: x.on, kind: 'return_in', qty: x.good, sourceRef: r.no,
    actor: x.checkedBy.trim(), note: `back from ${customerOf(ws, r.customerId)?.name ?? 'the customer'}`,
  }] : []
  return {
    ...ws,
    rmas: (ws.rmas ?? []).map((m) => (m.id !== id ? m : {
      ...m, state: 'received' as const, receivedOn: x.on, checkedBy: x.checkedBy.trim(), good: x.good,
      damaged: x.damaged, damageNote: x.damaged > 0 ? x.damageNote?.trim() : undefined,
    })),
    fgMoves: [...(ws.fgMoves ?? []), ...moves],
  }
}

/** Settled — the credit note, the replacement, whatever was agreed, is done. */
export const closeReturn = (ws: Workspace, id: string): Workspace =>
  ({ ...ws, rmas: (ws.rmas ?? []).map((r) => (r.id === id && r.state === 'received' ? { ...r, state: 'closed' as const } : r)) })

export function removeReturnProblem(ws: Workspace, id: string): string | null {
  const r = rmaOf(ws, id)
  if (!r) return null
  return r.state === 'authorised' ? null : 'It has been booked in, and its good pieces are back on the shelf. The record stays.'
}

/** Withdrawn before anything came back — the customer kept them after all. */
export const removeReturn = (ws: Workspace, id: string): Workspace =>
  (removeReturnProblem(ws, id) ? ws : { ...ws, rmas: (ws.rmas ?? []).filter((r) => r.id !== id) })

/* -------------------------------------------------------------- reading -- */

export type ReturnState = 'authorised' | 'overdue' | 'received' | 'closed'

export const RETURN_WORD: Record<ReturnState, string> = {
  authorised: 'Authorised',
  overdue: 'Overdue',
  received: 'Received',
  closed: 'Closed',
}

const asRma = (r: WsRma, soNo: string, dnNo: string): Rma => ({
  id: r.id, rmaNo: r.no, soNo, dnNo, customerId: r.customerId, fgId: r.productId, qty: r.qty, reason: r.reason,
  raisedOn: r.raisedOn, dueBy: r.dueBy, owner: r.owner, state: r.state, receivedOn: r.receivedOn,
})

export interface ReturnRow {
  rma: WsRma
  customer?: WsCustomer
  product?: Product
  note?: DispatchNote
  order?: CustomerOrder
  state: ReturnState
  /** authorised, not back, and past the day it was due */
  overdue: boolean
  /** at cost to make — the domain's, so a return is never valued at its selling price */
  value: Derived | null
}

export function returnRows(ws: Workspace, today: string): ReturnRow[] {
  return [...(ws.rmas ?? [])]
    .sort((a, b) => Number(a.state !== 'authorised') - Number(b.state !== 'authorised') || a.dueBy.localeCompare(b.dueBy) || b.id.localeCompare(a.id))
    .map((rma) => {
      const note = (ws.dispatchNotes ?? []).find((n) => n.id === rma.noteId)
      const order = orderOf(ws, rma.orderId)
      const product = productOf(ws, rma.productId)
      const overdue = rma.state === 'authorised' && !!today && rma.dueBy < today
      return {
        rma, note, order, product, overdue,
        customer: customerOf(ws, rma.customerId),
        state: overdue ? 'overdue' : rma.state,
        value: product ? rmaValue(asRma(rma, order?.no ?? '', note?.no ?? ''), asFg(product)) : null,
      }
    })
}

export const overdueReturns = (ws: Workspace, today: string): WsRma[] =>
  (ws.rmas ?? []).filter((r) => r.state === 'authorised' && !!today && r.dueBy < today)

/** Units agreed to come back against units shipped — every authorisation, open or closed. */
export function returnRate(ws: Workspace): Derived {
  const returned = (ws.rmas ?? []).reduce((a, r) => a + r.qty, 0)
  const shipped = (ws.dispatchNotes ?? []).reduce((a, n) => a + n.lines.reduce((b, l) => b + l.qty, 0), 0)
  return rmaRate(returned, shipped)
}

/** Notes a return can be raised against: arrived, or never booked with a carrier. */
export const returnableNotes = (ws: Workspace): DispatchNote[] =>
  (ws.dispatchNotes ?? []).filter((n) => {
    const c = consignmentOf(ws, n.id)
    return (!c || !!c.deliveredOn) && n.lines.some((l) => returnableOn(ws, n.id, l.productId) > 0)
  })
