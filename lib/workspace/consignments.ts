/**
 * A dispatch note on its way with a carrier, and whether it got there.
 *
 * One consignment per note: the carrier, the docket number their own system
 * knows it by, the day the customer was told it would arrive, and — when
 * somebody confirms it — the day it did and who said so. A delivery date with
 * no name is a guess, so it is not taken without one.
 *
 * On time and in full, order-to-dock time, carrier drift and freight per unit
 * are the domain's own arithmetic over these; "in full" is judged per order —
 * everything ordered had gone by the time this note left — so the balancing
 * shipment of a split order can count.
 */
import { daysBetween } from '@/lib/domain/calc'
import { carrierDrift, customerOtif, cycleTime, freightPerUnit, type ConsignmentRow } from '@/lib/domain/dispatch'
import type { Derived } from '@/lib/domain/types'
import { carrierOf, customerOf } from './customers'
import { issueId } from './defaults'
import { asCarrier, asConsignment, asCustomer, asNote } from './dispatch-domain'
import { orderOf } from './sales'
import type { CustomerOrder, DispatchNote, Workspace, WsCarrier, WsConsignment, WsCustomer } from './types'

export const consignmentOf = (ws: Workspace, noteId: string): WsConsignment | undefined =>
  (ws.consignments ?? []).find((c) => c.noteId === noteId)

export interface Booking { carrierId: string; lrNo?: string; promisedDate: string; freight?: number }

/** Freight from the carrier's rate, when the note's weight, the customer's distance and the rate are all known. */
export function suggestFreight(ws: Workspace, noteId: string, carrierId: string): number | undefined {
  const note = (ws.dispatchNotes ?? []).find((n) => n.id === noteId)
  const carrier = carrierOf(ws, carrierId)
  const km = customerOf(ws, note?.customerId)?.distanceKm
  if (!note?.weightKg || !carrier?.ratePerKgKm || !km) return undefined
  return Math.round(note.weightKg * km * carrier.ratePerKgKm * 100) / 100
}

export function bookProblem(ws: Workspace, noteId: string, b: Booking, noteOn?: string): string | null {
  const note = (ws.dispatchNotes ?? []).find((n) => n.id === noteId)
  const on = note?.on ?? noteOn
  if (!on) return 'That note is not on the register.'
  if (note && consignmentOf(ws, noteId)) return 'It is already booked with a carrier.'
  if (!carrierOf(ws, b.carrierId)) return 'Pick the carrier.'
  if (!b.promisedDate) return 'Put in the day the customer was told it would arrive.'
  if (b.promisedDate < on) return 'It cannot arrive before it left.'
  if (b.freight !== undefined && (!Number.isFinite(b.freight) || b.freight < 0)) return 'Freight is rupees, or blank.'
  return null
}

export function bookConsignment(ws: Workspace, noteId: string, b: Booking): [Workspace, string] {
  if (bookProblem(ws, noteId, b)) return [ws, '']
  const [w, id] = issueId(ws, 'CN')
  const c: WsConsignment = {
    id, noteId, carrierId: b.carrierId, lrNo: b.lrNo?.trim() || undefined, promisedDate: b.promisedDate,
    freight: b.freight ?? suggestFreight(ws, noteId, b.carrierId),
  }
  return [{ ...w, consignments: [...(w.consignments ?? []), c] }, id]
}

/** The docket, the freight bill or the promised date put right. Who confirmed a delivery is never edited. */
export function updateConsignment(ws: Workspace, id: string, patch: Partial<Pick<WsConsignment, 'lrNo' | 'freight' | 'promisedDate' | 'carrierId'>>): Workspace {
  return { ...ws, consignments: (ws.consignments ?? []).map((c) => (c.id === id ? { ...c, ...patch } : c)) }
}

export interface Delivery { on: string; by: string }

export function deliverProblem(ws: Workspace, id: string, d: Delivery, today: string): string | null {
  const c = (ws.consignments ?? []).find((x) => x.id === id)
  if (!c) return 'That consignment is not on the register.'
  if (c.deliveredOn) return 'It is already marked delivered.'
  const note = (ws.dispatchNotes ?? []).find((n) => n.id === c.noteId)
  if (!d.on) return 'Put in the day it arrived.'
  if (note && d.on < note.on) return 'It cannot arrive before it left.'
  if (d.on > today) return 'That day has not happened yet.'
  if (d.by.trim().length < 3) return 'Say who confirmed it, and how — a delivery date with no name is a guess.'
  return null
}

export function markDelivered(ws: Workspace, id: string, d: Delivery, today: string): Workspace {
  if (deliverProblem(ws, id, d, today)) return ws
  return { ...ws, consignments: (ws.consignments ?? []).map((c) => (c.id === id ? { ...c, deliveredOn: d.on, confirmedBy: d.by.trim() } : c)) }
}

/* -------------------------------------------------------------- reading -- */

export type Verdict = 'otif' | 'late' | 'short' | 'overdue' | 'transit'

export const VERDICT_WORD: Record<Verdict, string> = {
  otif: 'On time, in full',
  late: 'Late',
  short: 'Short',
  overdue: 'Overdue in transit',
  transit: 'In transit',
}

export interface CRow {
  consignment: WsConsignment
  note: DispatchNote
  order?: CustomerOrder
  customer?: WsCustomer
  carrier?: WsCarrier
  delivered: boolean
  onTime: boolean
  inFull: boolean
  /** signed days against the promise: negative early, positive late */
  drift: number
  /** still out and already past the promise */
  late: boolean
  transitDays: number | null
  verdict: Verdict
  /** the domain's row, for the domain's sums */
  domain: ConsignmentRow
}

/** Everything ordered had gone out by the day this note left. */
function inFullBy(ws: Workspace, order: CustomerOrder | undefined, note: DispatchNote): boolean {
  if (!order) return true
  const ordered = order.lines.reduce((a, l) => a + l.qty, 0)
  const gone = (ws.dispatchNotes ?? []).filter((n) => n.orderId === order.id && (n.on < note.on || (n.on === note.on && n.id <= note.id)))
    .reduce((a, n) => a + n.lines.reduce((b, l) => b + l.qty, 0), 0)
  return gone >= ordered
}

export function consignmentRows(ws: Workspace, today: string): CRow[] {
  return (ws.consignments ?? []).flatMap((consignment) => {
    const note = (ws.dispatchNotes ?? []).find((n) => n.id === consignment.noteId)
    if (!note) return []
    const order = orderOf(ws, note.orderId)
    const customer = customerOf(ws, note.customerId)
    const carrier = carrierOf(ws, consignment.carrierId)
    const delivered = Boolean(consignment.deliveredOn)
    const onTime = delivered && consignment.deliveredOn! <= consignment.promisedDate
    const inFull = inFullBy(ws, order, note)
    const drift = delivered ? daysBetween(consignment.promisedDate, consignment.deliveredOn!) : 0
    const late = !delivered && !!today && consignment.promisedDate < today
    const transitDays = delivered ? daysBetween(note.on, consignment.deliveredOn!) : null
    const verdict: Verdict = !delivered ? (late ? 'overdue' : 'transit') : !onTime ? 'late' : !inFull ? 'short' : 'otif'
    const domain: ConsignmentRow = {
      consignment: asConsignment(consignment, note.no),
      note: asNote(note, order?.no ?? ''),
      carrier: carrier ? asCarrier(carrier) : { id: '', name: 'Unknown carrier', mode: '', ratePerKgKm: 0 },
      customer: customer ? asCustomer(customer) : { id: '', name: 'Unknown customer', gstin: '', state: '', shipTo: '', distanceKm: 0, paymentTerms: 0 },
      delivered, onTime, inFull, drift, late, transitDays,
    }
    return [{ consignment, note, order, customer, carrier, delivered, onTime, inFull, drift, late, transitDays, verdict, domain }]
  }).sort((a, b) => Number(a.delivered) - Number(b.delivered)
    || b.consignment.promisedDate.localeCompare(a.consignment.promisedDate))
}

/** On time and in full, over consignments that have landed. */
export const otifOf = (rows: CRow[]): Derived => customerOtif(rows.map((r) => r.domain))

/** Days from order taken to note raised, over every note. */
export function orderToDock(ws: Workspace): Derived {
  return cycleTime((ws.dispatchNotes ?? []).flatMap((n) => {
    const o = orderOf(ws, n.orderId)
    return o ? [{ takenOn: o.takenOn, despatchedOn: n.on, soNo: o.no }] : []
  }))
}

export const freightUnitOf = (rows: CRow[]): Derived => freightPerUnit(rows.map((r) => r.domain))

export interface CarrierRow {
  carrier: WsCarrier
  shipped: number
  delivered: number
  /** delivered after the promised date */
  late: number
  drift: Derived
  freight: number
  weightKg: number
}

export function carrierRows(ws: Workspace, today: string, rows = consignmentRows(ws, today)): CarrierRow[] {
  return (ws.carriers ?? []).map((carrier) => {
    const mine = rows.filter((r) => r.consignment.carrierId === carrier.id)
    return {
      carrier,
      shipped: mine.length,
      delivered: mine.filter((r) => r.delivered).length,
      late: mine.filter((r) => r.delivered && !r.onTime).length,
      drift: carrierDrift(asCarrier(carrier), mine.map((r) => r.domain)),
      freight: Math.round(mine.reduce((a, r) => a + (r.consignment.freight ?? 0), 0) * 100) / 100,
      weightKg: mine.reduce((a, r) => a + (r.note.weightKg ?? 0), 0),
    }
  }).sort((a, b) => b.shipped - a.shipped || a.carrier.name.localeCompare(b.carrier.name))
}

/** A message for a person to send the carrier — the system never sends it. */
export function chaseText(r: CRow, company: string): string {
  return [
    `${company} — consignment ${r.note.no}${r.consignment.lrNo ? `, your docket ${r.consignment.lrNo}` : ''}.`,
    `It left on ${r.note.on} for ${r.customer?.name ?? 'our customer'}${r.customer?.shipTo ? `, ${r.customer.shipTo}` : ''}, promised for ${r.consignment.promisedDate}.`,
    'Where is it, and when will it be delivered?',
  ].join('\n')
}

export interface OnRoad {
  carrierId: string
  carrier?: WsCarrier
  rows: { row: CRow; units: number; daysAway: number; progress: number }[]
}

/** Consignments nobody has confirmed yet, under their carrier, the most overdue first. */
export function onTheRoad(ws: Workspace, today: string, rows = consignmentRows(ws, today)): OnRoad[] {
  const out: OnRoad[] = []
  const live = rows.filter((r) => !r.delivered).map((row) => {
    const span = daysBetween(row.note.on, row.consignment.promisedDate)
    const gone = daysBetween(row.note.on, today)
    return {
      row,
      units: row.note.lines.reduce((a, l) => a + l.qty, 0),
      daysAway: daysBetween(today, row.consignment.promisedDate),
      progress: span > 0 ? Math.min(Math.max((gone / span) * 100, 0), 100) : 100,
    }
  }).sort((a, b) => a.daysAway - b.daysAway)
  for (const x of live) {
    const held = out.find((g) => g.carrierId === x.row.consignment.carrierId)
    if (held) held.rows.push(x)
    else out.push({ carrierId: x.row.consignment.carrierId, carrier: x.row.carrier, rows: [x] })
  }
  return out
}

/** Not yet confirmed as delivered, and past the day the customer was given. */
export const overdueInTransit = (ws: Workspace, today: string): number =>
  consignmentRows(ws, today).filter((r) => r.late).length

export const chasedKey = (consignmentId: string) => `dispatch.chased.${consignmentId}`

export interface CarrierMonth {
  carrier: WsCarrier
  delivered: number
  late: number
  /** mean days behind the promise, over this month's late ones */
  behind: number
}

/** How each carrier did this month, over deliveries somebody confirmed this month. */
export function carriersThisMonth(ws: Workspace, today: string, rows = consignmentRows(ws, today)): CarrierMonth[] {
  const month = today.slice(0, 7)
  return (ws.carriers ?? []).map((carrier) => {
    const mine = rows.filter((r) => r.consignment.carrierId === carrier.id && r.delivered && r.consignment.deliveredOn!.slice(0, 7) === month)
    const late = mine.filter((r) => !r.onTime)
    return {
      carrier,
      delivered: mine.length,
      late: late.length,
      behind: late.length ? Math.round((late.reduce((a, r) => a + r.drift, 0) / late.length) * 10) / 10 : 0,
    }
  })
}
