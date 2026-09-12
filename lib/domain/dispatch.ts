/**
 * Stage 5 · Dispatch & logistics — the derivations.
 *
 * The outbound mirror of INB-01. Every figure here is computed from the
 * despatch, consignment and return records rather than stored, which is what
 * turns five executive KPIs from illustrative into measured: customer OTIF,
 * order fulfilment cycle time, delays by carrier, freight per unit shipped and
 * the RMA rate. Each of those carried an assumption before this stage existed,
 * and the assumption is now gone.
 *
 * The rule this stage does NOT break: it never raises a tax invoice and never
 * holds a receivable. Documents are prepared from the despatch note and handed
 * to the accounting package the client already runs (§12). Writing a second
 * books-of-account is how these projects die.
 */
import { daysBetween, round } from './calc'
import type {
  Carrier, Consignment, Customer, DerivationInput, Derived, DespatchNote, FgItem,
  FgMovement, Rma, SalesOrderLine,
} from './types'

const D = <T>(
  value: T, label: string, formula: string, inputs: DerivationInput[],
  extra: { note?: string; unit?: string } = {},
): Derived<T> => ({ value, label, formula, inputs, ...extra })

const q = (n: number) => round(n, 3)

/* ========================================================================== */
/* DSP-01 · the despatch note                                                 */
/* ========================================================================== */

/**
 * A despatch note posts one movement per line, out of the finished-goods
 * balance. Generated from the note rather than stored beside it, so a note and
 * its stock effect can never drift apart — the same reason INB-01 derives a
 * receipt's movement from the GRN.
 */
export function despatchMovements(notes: DespatchNote[]): FgMovement[] {
  return notes.flatMap((n) =>
    n.lines.map((l, i) => ({
      id: `FGM-${n.dnNo}-${i + 1}`,
      fgId: l.fgId,
      on: n.despatchedOn,
      kind: 'despatch' as const,
      qty: -l.qty,
      sourceRef: n.dnNo,
      note: `${n.soNo} · despatched on ${n.authorisedBy}'s authority`,
      actor: n.actor,
    })),
  )
}

/** A finished-goods balance is the sum of its movements. Never a stored number. */
export function fgBalance(movements: FgMovement[], fg: FgItem): Derived {
  const mine = movements.filter((m) => m.fgId === fg.id)
  const value = mine.reduce((a, m) => a + m.qty, 0)
  return D(
    q(value),
    `${fg.code} on the despatch bay`,
    'Σ movements',
    mine.length
      ? mine.map((m) => ({
          name: `${m.on} · ${m.kind.replace('_', ' ')}`, value: q(m.qty), unit: fg.uom,
          source: m.sourceRef + (m.note ? ` — ${m.note}` : ''),
        }))
      : [{ name: 'no movements', value: 0, source: 'nothing has been built or shipped' }],
    { unit: fg.uom, note: 'The same rule the raw-material ledger holds: a balance is a sum of documents, so it can be audited rather than believed.' },
  )
}

export interface OrderRow {
  soNo: string
  customer: Customer
  takenOn: string
  promisedDate: string
  description: string
  lines: SalesOrderLine[]
  /** Σ qty × rate — the order value, derived, never stored twice */
  value: Derived
  ordered: number
  despatched: number
  /** what is still to go out */
  pending: Derived
  notes: DespatchNote[]
  complete: boolean
  /** promised date has passed and the order is not fully out */
  overdue: boolean
}

export function orderValue(lines: SalesOrderLine[], soNo: string): Derived {
  const v = lines.reduce((a, l) => a + l.qty * l.rate, 0)
  return D(
    round(v, 2),
    `${soNo} order value`,
    'Σ (line qty × line rate)',
    lines.map((l) => ({
      name: `${l.fgId} × ${l.qty}`, value: round(l.qty * l.rate, 2), unit: '₹',
      source: `₹${l.rate}/unit${l.note ? ` — ${l.note}` : ''}`,
    })),
    { unit: '₹', note: 'Derived from the lines. An order value typed separately from its lines is two numbers that will disagree.' },
  )
}

export function pendingQty(soNo: string, ordered: number, despatched: number, uom: string): Derived {
  return D(
    q(ordered - despatched),
    `${soNo} still to despatch`,
    'ordered − despatched',
    [
      { name: 'ordered', value: q(ordered), unit: uom, source: 'sum of the order lines' },
      { name: 'despatched', value: q(despatched), unit: uom, source: 'sum of the despatch notes raised against this order' },
    ],
    { unit: uom, note: 'A part shipment is a fact the order book can hold. On a phone call it is a memory.' },
  )
}

/* ========================================================================== */
/* DSP-03 · consignments, milestones, and the OTIF that was illustrative      */
/* ========================================================================== */

export interface ConsignmentRow {
  consignment: Consignment
  note: DespatchNote
  carrier: Carrier
  customer: Customer
  delivered: boolean
  /** delivered on or before the date the customer was given */
  onTime: boolean
  /** the whole ordered quantity went out on this note */
  inFull: boolean
  /** signed days: negative is early, positive is late */
  drift: number
  /** still out and already past its promised date */
  late: boolean
  transitDays: number | null
}

/**
 * Customer OTIF — on time AND in full. Both halves are observed here: on time
 * needs a delivered date somebody confirmed, in full needs the order lines to
 * compare against. Before this stage the figure was an assumption with a note
 * saying so.
 */
export function customerOtif(rows: ConsignmentRow[]): Derived {
  const settled = rows.filter((r) => r.delivered)
  const good = settled.filter((r) => r.onTime && r.inFull)
  const pct = settled.length ? round((good.length / settled.length) * 100, 1) : 0
  const lateOnes = settled.filter((r) => !r.onTime)
  const shortOnes = settled.filter((r) => !r.inFull)
  return D(
    pct,
    'Customer OTIF',
    'delivered on time AND in full ÷ delivered consignments × 100',
    [
      { name: 'delivered consignments', value: settled.length, source: 'a consignment with a confirmed delivery date' },
      { name: 'on time and in full', value: good.length, source: 'delivered on or before the promised date, with the whole order quantity on the note' },
      { name: 'late', value: lateOnes.length, source: lateOnes.map((r) => `${r.note.dnNo} +${r.drift}d`).join(', ') || 'none' },
      { name: 'short', value: shortOnes.length, source: shortOnes.map((r) => `${r.note.dnNo} part shipment`).join(', ') || 'none' },
      { name: 'still in transit', value: rows.length - settled.length, source: 'not counted either way until they arrive' },
    ],
    { unit: '%', note: 'Measured, not assumed. A consignment still in transit is excluded rather than counted as on time — the most common way this figure gets flattered.' },
  )
}

/** From the day the order was taken to the day the goods left the dock. */
export function cycleTime(rows: { takenOn: string; despatchedOn: string; soNo: string }[]): Derived {
  const days = rows.map((r) => daysBetween(r.takenOn, r.despatchedOn))
  const mean = days.length ? round(days.reduce((a, b) => a + b, 0) / days.length, 1) : 0
  return D(
    mean,
    'Order fulfilment cycle time',
    'mean(despatched_on − order_taken_on)',
    rows.map((r, i) => ({ name: r.soNo, value: days[i], unit: 'days', source: `taken ${r.takenOn}, left the dock ${r.despatchedOn}` })),
    { unit: 'days', note: 'Both timestamps are now recorded. Neither existed before this stage, which is why the figure used to be an assumption.' },
  )
}

export interface CarrierRow {
  carrier: Carrier
  shipped: number
  delivered: number
  late: number
  /** mean signed drift in days across delivered consignments */
  drift: Derived
  freight: number
  weightKg: number
}

export function carrierDrift(carrier: Carrier, rows: ConsignmentRow[]): Derived {
  const settled = rows.filter((r) => r.delivered)
  const mean = settled.length ? round(settled.reduce((a, r) => a + r.drift, 0) / settled.length, 1) : 0
  return D(
    mean,
    `${carrier.name} — days against the promise`,
    'mean(delivered_on − promised_date) across delivered consignments',
    settled.length
      ? settled.map((r) => ({
          name: r.note.dnNo, value: r.drift, unit: 'days',
          source: `promised ${r.consignment.promisedDate}, delivered ${r.consignment.deliveredOn} — ${r.consignment.confirmedBy}`,
        }))
      : [{ name: 'nothing delivered yet', value: 0, source: 'this carrier has no completed consignment' }],
    { unit: 'days', note: 'Negative is early. One late delivery on a small sample is not a pattern — the count beside it is what says whether to act.' },
  )
}

/** Freight per unit shipped, the figure that catches a rising surcharge. */
export function freightPerUnit(rows: ConsignmentRow[]): Derived {
  const freight = rows.reduce((a, r) => a + r.consignment.freight, 0)
  const units = rows.reduce((a, r) => a + r.note.lines.reduce((b, l) => b + l.qty, 0), 0)
  const v = units > 0 ? round(freight / units, 2) : 0
  return D(
    v,
    'Freight cost per unit shipped',
    'Σ freight ÷ Σ units despatched',
    [
      { name: 'freight billed', value: round(freight, 2), unit: '₹', source: 'the carriers’ bills against these consignments' },
      { name: 'units despatched', value: units, source: 'every line on every despatch note' },
      { name: 'consignments', value: rows.length },
    ],
    { unit: '₹', note: 'Per unit, not per kilogram: a heavier product that ships less often can hide inside a per-kg average.' },
  )
}

/* ========================================================================== */
/* DSP-04 · returns                                                           */
/* ========================================================================== */

export interface RmaRow {
  rma: Rma
  customer: Customer
  fg: FgItem
  /** authorised, still not back, and past the date the customer was given */
  overdue: boolean
  daysOut: number
  value: Derived
}

export function rmaValue(rma: Rma, fg: FgItem): Derived {
  return D(
    round(rma.qty * fg.standardCost, 2),
    `${rma.rmaNo} value`,
    'qty × standard cost',
    [
      { name: 'qty', value: rma.qty, unit: fg.uom },
      { name: 'standard cost', value: fg.standardCost, unit: `₹/${fg.uom}`, source: 'what it cost us to build, not what it was sold for' },
      { name: 'reason', value: rma.reason, source: `raised ${rma.raisedOn} by ${rma.owner}` },
    ],
    { unit: '₹', note: 'Valued at cost. A return is not a lost sale until it is refunded, and the refund is the accounting package’s business.' },
  )
}

/** Returned units against units shipped. The quality signal a phone call loses. */
export function rmaRate(returnedUnits: number, shippedUnits: number): Derived {
  const v = shippedUnits > 0 ? round((returnedUnits / shippedUnits) * 100, 2) : 0
  return D(
    v,
    'RMA rate',
    'returned units ÷ units shipped × 100',
    [
      { name: 'returned units', value: returnedUnits, source: 'every authorisation raised, open or closed' },
      { name: 'units shipped', value: shippedUnits, source: 'every line on every despatch note' },
    ],
    { unit: '%', note: 'Counted on authorisations rather than on goods physically back, so a return nobody has chased still shows up.' },
  )
}

/* ========================================================================== */
/* the stage headline                                                          */
/* ========================================================================== */

export function despatchedValue(notes: DespatchNote[], fgById: (id: string) => FgItem | undefined): Derived {
  const v = notes.reduce((a, n) =>
    a + n.lines.reduce((b, l) => b + l.qty * (fgById(l.fgId)?.standardCost ?? 0), 0), 0)
  return D(
    round(v, 2),
    'Value that left the building',
    'Σ (line qty × standard cost) across despatch notes',
    notes.map((n) => ({
      name: `${n.dnNo} · ${n.soNo}`,
      value: round(n.lines.reduce((b, l) => b + l.qty * (fgById(l.fgId)?.standardCost ?? 0), 0), 2),
      unit: '₹', source: `despatched ${n.despatchedOn} on ${n.authorisedBy}'s authority`,
    })),
    { unit: '₹', note: 'At cost, which is what left the asset side. The selling value is on the order and belongs to the accounts package.' },
  )
}

/** Orders promised before today with quantity still to go out. */
export function overdueValue(rows: OrderRow[]): Derived {
  const late = rows.filter((r) => r.overdue)
  const v = late.reduce((a, r) => a + (r.value.value as number) * ((r.pending.value as number) / Math.max(1, r.ordered)), 0)
  return D(
    round(v, 2),
    'Order value past its promised date',
    'Σ (order value × undespatched share) where the promised date has passed',
    late.length
      ? late.map((r) => ({
          name: `${r.soNo} · ${r.customer.name}`, value: round((r.value.value as number) * ((r.pending.value as number) / Math.max(1, r.ordered)), 2),
          unit: '₹', source: `promised ${r.promisedDate}, ${r.pending.value} of ${r.ordered} still to go`,
        }))
      : [{ name: 'nothing overdue', value: 0, source: 'every promised date still ahead of us' }],
    { unit: '₹', note: 'The undespatched share only. A part shipment already out is not late — the balance is.' },
  )
}
