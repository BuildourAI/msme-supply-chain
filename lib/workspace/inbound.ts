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
  challanAccounting, quantityGap, unacknowledgedExposure, valueAt, valueHeldInQc,
} from '@/lib/domain/inbound'
import type { Derived, Grn, JobworkChallan, PoSync } from '@/lib/domain/types'
import { checksFor } from './checks'
import { openReceipts } from './receipts'
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
