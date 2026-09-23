/**
 * The owner's gate, read through the sample company's arithmetic.
 *
 * `lib/domain/inbound.ts` already knows how to age a receipt at the gate, value
 * what is held there, split a jobwork challan five ways and price a change the
 * supplier has not confirmed. It does that over its own record shapes — a
 * `Grn`, a `PoSync`, a `JobworkChallan` — which carry names where the owner's
 * records carry ids. These adapters translate, and nothing else. There is no
 * second copy of any of that arithmetic here, which is the promise
 * `test/workspace.test.ts` makes about every stage: an owner's company runs the
 * same derivations as the sample, with no softened guardrail.
 *
 * Three things the translation has to get right, each checked against the
 * function it feeds:
 *
 *  - `trailingRejectionRate` takes the FIRST six GRNs it is given, because the
 *    sample's are stored newest-first. `toGrns` sorts that way for it.
 *  - A GRN's `rate` is the §13-1 valuation basis — last purchase price, ex-
 *    freight — so it is read off the material now rather than frozen at the
 *    gate. Stock is valued at one basis everywhere or the totals disagree.
 *  - A challan's `asOf` is today, and its `floor` only names which run date a
 *    derivation cites; it enters no arithmetic.
 */
import {
  actualYield, allowedLoss, challanAccounting, chaseDraft, daysLate, expectedReturn, failedChecks,
  inspectionComplete, isRejectionSpike, issuableFrom, jobworkerExposure, qcAgeDays, qcState,
  quantityGap, rejectionPct, unacknowledgedExposure, valueAt, valueHeldInQc,
  type Accounting, type QcState,
} from '@/lib/domain/inbound'
import type {
  CheckResult, Derived, Grn, Item, JobworkChallan, PoSync, SpecCheck, Vendor,
} from '@/lib/domain/types'
import { checksFor } from './checks'
import { isOpen, measuredRejectionPct, openReceipts } from './receipts'
import type { Challan, GoodsReceipt, PurchaseOrder, Workspace } from './types'

const uomOf = (ws: Workspace, itemId: string) => ws.items.find((i) => i.id === itemId)?.uom ?? ''

/** One receipt, as the domain's goods receipt note. */
export function toGrn(ws: Workspace, r: GoodsReceipt): Grn {
  const item = ws.items.find((i) => i.id === r.itemId)
  const order = r.orderId ? ws.orders.find((o) => o.id === r.orderId) : undefined
  const closed = r.status !== 'open'
  return {
    id: r.id,
    grnNo: r.id,
    itemId: r.itemId,
    itemName: item?.name ?? 'Unknown material',
    uom: item?.uom ?? '',
    vendorName: ws.vendors.find((v) => v.id === r.vendorId)?.name ?? 'Unknown supplier',
    poNo: order?.no,
    poLineId: r.orderId,
    challanId: r.challanId,
    receivedOn: r.receivedOn,
    qtyReceived: r.qty,
    // the two halves of OTIF, for a purchase only — a jobwork return was
    // never ordered and never promised by a date a supplier gave
    orderedQty: order?.qty,
    promisedDate: r.challanId ? undefined : r.expectedOn,
    againstVersion: r.againstVersion,
    rate: item?.lastPurchaseRate ?? 0,
    status: closed ? 'closed' : 'open',
    results: r.results,
    acceptedQty: closed ? r.accepted : undefined,
    rejectedQty: closed ? r.rejected : undefined,
    failedCheckIds: r.failedCheckIds,
    inspector: r.inspector,
    closedAt: r.closedAt,
    noSpec: r.noSpec ?? (closed ? undefined : checksFor(ws, r.itemId).length === 0),
  }
}

/** Every receipt as a GRN, newest first — the order the domain's trailing figures read. */
export const toGrns = (ws: Workspace): Grn[] =>
  [...(ws.receipts ?? [])]
    .sort((a, b) => b.receivedOn.localeCompare(a.receivedOn) || b.id.localeCompare(a.id))
    .map((r) => toGrn(ws, r))

/** Received, paid for and not issuable: what is standing at the gate, in rupees. */
export const qcHeld = (ws: Workspace): Derived =>
  valueHeldInQc(openReceipts(ws).map((r) => toGrn(ws, r)))

/**
 * An order line and everything its supplier has been told, as the domain's
 * sync record. Null for a line never handed over — nobody has been told
 * anything, so there is nothing to be in or out of step with.
 */
export function toSync(ws: Workspace, o: PurchaseOrder): PoSync | null {
  if (!o.revisions || o.revisions.length === 0) return null
  return {
    poLineId: o.id,
    poNo: o.no,
    itemId: o.itemId,
    vendorName: ws.vendors.find((v) => v.id === o.vendorId)?.name ?? 'Unknown supplier',
    shipped: o.state === 'shipped',
    revisions: o.revisions,
    notifiedVersion: o.notifiedVersion ?? 1,
    ackedVersion: o.ackedVersion ?? 1,
    notifiedOn: o.notifiedOn,
    ackedOn: o.ackedOn,
    ackRef: o.ackRef,
  }
}

/** Money riding on changes a supplier has not confirmed. Zero is the resting state. */
export function unackedExposure(ws: Workspace): Derived {
  const lines = ws.orders
    .filter((o) => o.state === 'confirmed' || o.state === 'shipped')
    .map((o) => ({ o, s: toSync(ws, o) }))
    .filter((x): x is { o: PurchaseOrder; s: PoSync } => x.s !== null)
    .map(({ o, s }) => ({
      poNo: o.no,
      gap: quantityGap(s).value,
      rate: ws.items.find((i) => i.id === o.itemId)?.lastPurchaseRate ?? 0,
      uom: uomOf(ws, o.itemId),
    }))
    .filter((l) => l.gap !== 0)
  return unacknowledgedExposure(lines)
}

/** A challan, as the domain's. Valued at the rate it left at (§13-1 on the day). */
export function toChallan(ws: Workspace, c: Challan, today: string): JobworkChallan {
  const item = ws.items.find((i) => i.id === c.itemId)
  return {
    id: c.id,
    challanNo: c.no,
    // names which run date a derivation cites, and nothing more
    floor: 'heaters',
    asOf: today,
    itemId: c.itemId,
    itemName: item?.name ?? 'Unknown material',
    uom: item?.uom ?? '',
    jobworkerName: ws.vendors.find((v) => v.id === c.vendorId)?.name ?? 'Unknown jobworker',
    process: c.process?.trim() || 'Jobwork',
    qtySent: c.qtySent,
    sentOn: c.sentOn,
    dueBack: c.dueBack,
    expectedYield: c.expectedYield,
    rate: c.rate,
    purpose: c.note,
    status: c.status,
    closedOn: c.closedOn,
  }
}

/** Material still physically with jobworkers, valued. Never counted as cover. */
export function atJobworkersValue(ws: Workspace, today: string): number {
  const grns = toGrns(ws)
  return (ws.challans ?? [])
    .filter((c) => c.status === 'out')
    .map((c) => {
      const jc = toChallan(ws, c, today)
      const acc = challanAccounting(jc, grns, ws.policy)
      return valueAt(acc.atVendor.value, c.rate, jc.uom, 'At the jobworker').value
    })
    .reduce((a, b) => a + b, 0)
}

/* ------------------------------------------------------ the gate, as rows -- */

/**
 * One receipt, with everything the gate needs to say about it.
 *
 * Age, whether it is past the window, the day it could be issued, what it is
 * worth standing there, and — once somebody is inspecting — whether the
 * inspection is complete, which checks have failed, and whether this
 * delivery's rejection is a spike against the supplier's own record. Every one
 * of those is the domain's function, over the owner's record.
 */
export interface ReceiptRow {
  receipt: GoodsReceipt
  item?: Item
  vendor?: Vendor
  order?: PurchaseOrder
  challan?: Challan
  /** "PO-1", "JW-1", or nothing */
  against: string
  checks: SpecCheck[]
  results: CheckResult[]
  age: Derived
  state: QcState
  issuable: Derived<string>
  value: Derived
  complete: boolean
  failed: SpecCheck[]
  /** the supplier's rejection rate before this receipt; null with nothing to go on */
  trailingPct: number | null
}

export function receiptRow(ws: Workspace, r: GoodsReceipt, today: string): ReceiptRow {
  const checks = checksFor(ws, r.itemId)
  const results = r.results ?? []
  const order = r.orderId ? ws.orders.find((o) => o.id === r.orderId) : undefined
  const challan = r.challanId ? (ws.challans ?? []).find((c) => c.id === r.challanId) : undefined
  const age = qcAgeDays(r.receivedOn, isOpen(r) ? today : (r.closedAt ?? today))
  /*
   * A receipt with no checks written is never at rest: nobody can inspect it
   * against anything, so it reads "at the limit" from the day it arrives
   * until somebody closes it unchecked — the sample company's rule.
   */
  const state = checks.length === 0 && age.value <= ws.policy.qcOverdueDays && isOpen(r)
    ? 'at_limit' : qcState(age.value, ws.policy)
  return {
    receipt: r,
    item: ws.items.find((i) => i.id === r.itemId),
    vendor: ws.vendors.find((v) => v.id === r.vendorId),
    order,
    challan,
    against: order?.no ?? challan?.no ?? '',
    checks,
    results,
    age,
    state,
    issuable: issuableFrom(r.receivedOn, ws.policy),
    value: valueHeldInQc([toGrn(ws, r)]),
    complete: inspectionComplete(checks, results),
    failed: failedChecks(checks, results),
    trailingPct: r.orderId ? measuredRejectionPct(ws, r.vendorId, r.itemId, r.id) : null,
  }
}

/** Open receipts first, oldest waiting at the top; then everything closed, newest first. */
export function receiptRows(ws: Workspace, today: string): ReceiptRow[] {
  const all = (ws.receipts ?? []).map((r) => receiptRow(ws, r, today))
  const open = all.filter((x) => isOpen(x.receipt))
    .sort((a, b) => a.receipt.receivedOn.localeCompare(b.receipt.receivedOn))
  const closed = all.filter((x) => !isOpen(x.receipt))
    .sort((a, b) => (b.receipt.closedAt ?? b.receipt.receivedOn).localeCompare(a.receipt.closedAt ?? a.receipt.receivedOn)
      || b.receipt.id.localeCompare(a.receipt.id))
  return [...open, ...closed]
}

/**
 * Whether a closed receipt's rejection was out of line with the supplier's
 * own record — a pattern, not a bad batch. Against the record BEFORE it, so a
 * delivery cannot raise its own bar. The domain's rule and the owner's multiple.
 */
export function spikeOf(ws: Workspace, r: GoodsReceipt): { spike: boolean; thisPct: number; trailingPct: number } {
  const thisPct = rejectionPct(r.rejected, r.qty).value
  /*
   * No record is not a clean record. The domain rule treats a supplier who
   * has never had anything rejected as one whose first rejection is a spike —
   * right when there IS a clean history, wrong for the first delivery ever,
   * which has nothing to be out of line with.
   */
  const before = r.orderId ? measuredRejectionPct(ws, r.vendorId, r.itemId, r.id) : null
  if (before === null) return { spike: false, thisPct, trailingPct: 0 }
  return { spike: !isOpen(r) && isRejectionSpike(thisPct, before, ws.policy), thisPct, trailingPct: before }
}

/* ---------------------------------------------------- jobwork, as rows -- */

/**
 * One challan, with everything the register says about it: the five-way
 * split, how late it is, what it is worth still out and what went missing, the
 * yield so far and the chase note. The domain's INB-03 arithmetic, over the
 * owner's challan — so the split sums to what was sent, always.
 */
export interface ChallanRow {
  challan: Challan
  item?: Item
  vendor?: Vendor
  uom: string
  jc: JobworkChallan
  acct: Accounting
  expected: Derived
  allowed: Derived
  late: Derived
  /** out, and past its date by more than the grace the gate rules allow */
  overdue: boolean
  valueOut: Derived
  valueLost: Derived
  yielded: Derived
  /** returns still at the gate — the challan cannot close over them */
  atGate: GoodsReceipt[]
  chase: string
}

export function challanRow(ws: Workspace, c: Challan, today: string, grns = toGrns(ws)): ChallanRow {
  const jc = toChallan(ws, c, today)
  const acct = challanAccounting(jc, grns, ws.policy)
  const late = daysLate(jc)
  const back = acct.returned.value + acct.inQc.value
  return {
    challan: c,
    item: ws.items.find((i) => i.id === c.itemId),
    vendor: ws.vendors.find((v) => v.id === c.vendorId),
    uom: jc.uom,
    jc,
    acct,
    expected: expectedReturn(jc),
    allowed: allowedLoss(jc),
    late,
    overdue: c.status === 'out' && late.value > ws.policy.jobworkGraceDays,
    valueOut: valueAt(acct.atVendor.value, c.rate, jc.uom, 'Value with the jobworker'),
    valueLost: valueAt(acct.unaccounted.value, c.rate, jc.uom, 'Value unaccounted'),
    yielded: actualYield(jc, back),
    atGate: (ws.receipts ?? []).filter((r) => r.challanId === c.id && isOpen(r)),
    // everything not back, including what the process may have consumed — the
    // jobworker has not declared any of it as scrap yet
    chase: chaseDraft(jc, Math.round((c.qtySent - back) * 1000) / 1000, late.value),
  }
}

/** Out first — overdue at the top — then everything closed, newest first. */
export function challanRows(ws: Workspace, today: string): ChallanRow[] {
  const grns = toGrns(ws)
  const rows = (ws.challans ?? []).map((c) => challanRow(ws, c, today, grns))
  const out = rows.filter((r) => r.challan.status === 'out')
    .sort((a, b) => b.late.value - a.late.value || a.challan.sentOn.localeCompare(b.challan.sentOn))
  const closed = rows.filter((r) => r.challan.status === 'closed')
    .sort((a, b) => (b.challan.closedOn ?? '').localeCompare(a.challan.closedOn ?? ''))
  return [...out, ...closed]
}

/** What each jobworker is holding, against the most the gate rules allow one to hold. */
export interface JobworkerHolding {
  vendor: Vendor
  held: Derived
  over: boolean
  unaccounted: number
}

export function jobworkerHoldings(ws: Workspace, today: string): JobworkerHolding[] {
  const rows = challanRows(ws, today)
  const ids = [...new Set(rows.filter((r) => r.challan.status === 'out').map((r) => r.challan.vendorId))]
  return ids.map((id) => {
    const vendor = ws.vendors.find((v) => v.id === id) ?? { id, name: 'Unknown jobworker', paymentTermsDays: 0 }
    const held = jobworkerExposure(vendor.name,
      rows.map((r) => ({ challan: r.jc, balance: r.acct.atVendor.value })))
    return {
      vendor,
      held,
      over: held.value > ws.policy.jobworkerExposureCeiling,
      unaccounted: Math.round(rows.filter((r) => r.challan.vendorId === id)
        .reduce((a, r) => a + r.valueLost.value, 0) * 100) / 100,
    }
  }).sort((a, b) => b.held.value - a.held.value)
}
