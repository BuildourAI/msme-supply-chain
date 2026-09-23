/**
 * Goods arriving, which is the only thing that measures a supplier.
 *
 * Every figure this build holds about a supplier until now came from the
 * supplier: their quoted lead time, and a rejection rate the owner typed from
 * memory. §5 is explicit that neither is good enough — "lead time is the
 * trailing average of the last six actual receipts, never the vendor's quoted
 * figure. This is non-negotiable" — and the sample company has receipts in its
 * seed, so its screens have always said "measured". The owner's could not.
 *
 * Recording one is therefore not bookkeeping. It is the act that moves a
 * supplier's numbers from what they said to what they did, and every screen
 * downstream — the reorder point, the landed cost, the comparison — changes
 * with it.
 *
 * Nothing in `lib/domain/` is touched. `trailingLeadTimeDays` is the same
 * function the sample company's twenty-seven reconciled quotes run through; it
 * is imported and used, not reimplemented.
 */
import { trailingLeadTimeDays } from '@/lib/domain/calc'
import { acceptedQty, failedChecks, inspectionComplete } from '@/lib/domain/inbound'
import type { CheckResult, StockLot, Usability, VendorItem } from '@/lib/domain/types'
import { checksFor } from './checks'
import { issueId } from './defaults'
import { rejectionCost } from './landed'
import type { Challan, GoodsReceipt, PurchaseOrder, Workspace } from './types'

/**
 * Waiting at the gate: arrived, not yet inspected. Absent status reads as
 * closed — a receipt recorded before there was a gate was a finished fact.
 */
export const isOpen = (r: GoodsReceipt): boolean => r.status === 'open'
export const openReceipts = (ws: Workspace): GoodsReceipt[] => (ws.receipts ?? []).filter(isOpen)
export const closedReceipts = (ws: Workspace): GoodsReceipt[] =>
  (ws.receipts ?? []).filter((r) => !isOpen(r))

/**
 * Receipts against a purchase order — what measures a supplier.
 *
 * A jobwork return is a receipt too, through the same gate, but it measures
 * a jobworker's turnaround rather than a supplier's lead time, and letting it
 * into the trailing average would move a supplier's figure on a delivery they
 * never made.
 */
export const purchaseReceipts = (ws: Workspace): GoodsReceipt[] =>
  (ws.receipts ?? []).filter((r) => Boolean(r.orderId))

/**
 * Every purchase receipt against one supplier-material pairing, newest last.
 *
 * Open ones included: lead time is about when the lorry arrived, and it
 * arrived whether or not anybody has inspected it yet.
 */
export const receiptsFor = (ws: Workspace, vendorId: string, itemId: string): GoodsReceipt[] =>
  purchaseReceipts(ws)
    .filter((r) => r.vendorId === vendorId && r.itemId === itemId)
    .sort((a, b) => a.receivedOn.localeCompare(b.receivedOn))

/** What has already arrived against one order line. */
export const receivedAgainst = (ws: Workspace, orderId: string): number =>
  (ws.receipts ?? []).filter((r) => r.orderId === orderId).reduce((a, r) => a + r.qty, 0)

/** What is still to come on it. Never negative — an over-delivery is not a debt. */
export const outstandingOn = (ws: Workspace, order: PurchaseOrder): number =>
  Math.max(0, order.qty - receivedAgainst(ws, order.id))

/**
 * What has been inspected and closed against a line — the only arrivals that
 * move an order. A lorry at the gate is observed, but its goods are not stock
 * until somebody has looked at them.
 */
const settledAgainst = (ws: Workspace, orderId: string): number =>
  (ws.receipts ?? []).filter((r) => r.orderId === orderId && !isOpen(r))
    .reduce((a, r) => a + r.qty, 0)

/**
 * Whether anything on these lines is still to come.
 *
 * The one guard the late decision, the gate's "goods due" and the on-its-way
 * column all share: a lorry that has arrived early is no longer on its way,
 * and one whose goods are all at the gate is not late any more — it is
 * waiting to be inspected, which is a different question on a different
 * screen.
 */
export const awaitingArrival = (ws: Workspace, lines: PurchaseOrder[]): boolean =>
  lines.some((o) => o.state !== 'cancelled' && outstandingOn(ws, o) > 0)

/**
 * What a supplier's rejection rate actually is, on the evidence.
 *
 * The last six receipts, the same window §5 uses for lead time — an owner who
 * had a bad batch two years ago is not still being charged for it. Returns
 * null rather than zero when there is nothing to go on, because "nobody has
 * ever rejected anything from them" and "nothing has arrived yet" are
 * different claims and only one of them is worth acting on.
 */
export function measuredRejectionPct(
  ws: Workspace, vendorId: string, itemId: string, except?: string,
): number | null {
  /*
   * Closed receipts only — an open one has had nothing rejected YET, and
   * counting it as a clean delivery would flatter a supplier for the days it
   * sat at the gate. `except` leaves out the receipt being judged, so a spike
   * is measured against the supplier's record before it, not including it.
   */
  const last = receiptsFor(ws, vendorId, itemId)
    .filter((r) => !isOpen(r) && r.id !== except)
    .slice(-6)
  if (last.length === 0) return null
  const seen = last.reduce((a, r) => a + r.accepted + r.rejected, 0)
  if (seen <= 0) return null
  const bad = last.reduce((a, r) => a + r.rejected, 0)
  return Math.round((bad / seen) * 1000) / 10
}

/** Whether a pairing's rejection figure was measured, and off how many receipts. */
export interface Basis {
  measured: boolean
  receipts: number
}

export const rejectionBasis = (ws: Workspace, vendorId: string, itemId: string): Basis => {
  const n = receiptsFor(ws, vendorId, itemId).filter((r) => !isOpen(r)).length
  return { measured: n > 0 && measuredRejectionPct(ws, vendorId, itemId) !== null, receipts: n }
}

/* ------------------------------------------------------------- repricing -- */

/**
 * Every rate's measured figures, brought up to date.
 *
 * A separate pass for the same reason `repriceTerms` is one: a receipt changes
 * what the build knows about a pairing, and the rate record is where every
 * screen reads it from. Idempotent, and it returns the very same object when
 * nothing moved so a caller can compare by reference.
 *
 * A pairing with no receipts is NOT skipped, which it was until a test asked
 * what happens when the last receipt is taken back: its lead time stayed at
 * the measured figure for ever, on evidence that no longer existed.
 * `trailingLeadTimeDays` already answers that case correctly — with nothing to
 * average it hands back the quoted figure and labels it quoted — so it is
 * simply asked every time.
 *
 * The rejection rate is left alone when there is nothing to measure it from.
 * There is no earlier figure to restore: an owner's typed rate is a stand-in
 * for the measurement and the measurement replaced it. `rejectionBasis` is
 * what lets a screen say which of the two it is looking at.
 */
export function repriceFromReceipts(ws: Workspace): Workspace {
  let moved = false
  const vendorItems = ws.vendorItems.map((vi) => {
    const mine = receiptsFor(ws, vi.vendorId, vi.itemId)
    const lead = trailingLeadTimeDays(mine, vi.quotedLeadTimeDays).value
    const pct = measuredRejectionPct(ws, vi.vendorId, vi.itemId)
    const next: VendorItem = {
      ...vi,
      trailingLeadTimeDays: lead,
      trailingRejectionRate: pct ?? vi.trailingRejectionRate,
      rejectionAllowance: rejectionCost(vi.rate, pct ?? vi.trailingRejectionRate),
    }
    if (next.trailingLeadTimeDays === vi.trailingLeadTimeDays
      && next.trailingRejectionRate === vi.trailingRejectionRate
      && next.rejectionAllowance === vi.rejectionAllowance) return vi

    moved = true
    return next
  })
  return moved ? { ...ws, vendorItems } : ws
}

/* --------------------------------------------------------------- writing -- */

export interface ArriveInput {
  /** a purchase — or, below, a jobwork return; exactly one of the two */
  order?: PurchaseOrder
  challan?: Challan
  qty: number
  receivedOn: string
  note?: string
}

/**
 * Goods at the gate.
 *
 * An OPEN receipt, and nothing else: no lot is written and the order does not
 * move, because material nobody has inspected is not stock anyone can issue
 * (§11 — non-usable is never cover). It does count as arrived — it is no longer
 * "to come", and its date is a measurement of the supplier's lead time from the
 * moment the lorry is in, which is why the supplier is repriced here.
 *
 * Carries the version of the order the supplier had confirmed, so a delivery
 * against an out-of-date version can be told apart from a short one.
 */
export function arrive(ws: Workspace, a: ArriveInput): [Workspace, string] {
  const [issued, id] = issueId(ws, 'GR')
  const source = a.order ?? a.challan
  if (!source) return [ws, '']
  const receipt: GoodsReceipt = {
    id,
    orderId: a.order?.id,
    challanId: a.challan?.id,
    vendorId: source.vendorId,
    itemId: source.itemId,
    qty: a.qty,
    accepted: 0,
    rejected: 0,
    note: a.note?.trim() || undefined,
    // a return's clock starts when the material left, which is its turnaround
    orderedOn: a.order?.orderedOn ?? a.challan!.sentOn,
    // the promise, copied for the same reason the order date is: whether this
    // delivery was late must not change because somebody edits the order later.
    // A jobwork return was never promised by a date a supplier gave.
    expectedOn: a.order?.expectedOn,
    receivedOn: a.receivedOn,
    status: 'open',
    againstVersion: a.order?.ackedVersion,
  }
  return [repriceFromReceipts({ ...issued, receipts: [...(issued.receipts ?? []), receipt] }), id]
}

/**
 * One check marked, kept on the receipt as it is marked — an inspection broken
 * off for a phone call is still half done when the screen is opened again.
 */
export function markCheck(ws: Workspace, receiptId: string, result: CheckResult): Workspace {
  return {
    ...ws,
    receipts: (ws.receipts ?? []).map((r) => {
      if (r.id !== receiptId || !isOpen(r)) return r
      const rest = (r.results ?? []).filter((x) => x.checkId !== result.checkId)
      return { ...r, results: result.outcome === 'not_checked' && result.measured == null ? rest : [...rest, result] }
    }),
  }
}

/**
 * Why a receipt cannot close as it stands, or null.
 *
 * Three refusals, and only three. Every check marked "must" has to be
 * answered — a GRN cannot close on a partial inspection. Nobody can reject more
 * than arrived. And a failure with nothing rejected, or a rejection with
 * nothing failed, needs a reason in writing: override, never block — the gate
 * will let you, but the trail says why.
 */
export function closeBlockedBy(
  ws: Workspace, r: GoodsReceipt, rejected: number, reason?: string,
): string | null {
  if (!isOpen(r)) return 'This receipt is already closed.'
  const checks = checksFor(ws, r.itemId)
  if (!inspectionComplete(checks, r.results ?? [])) {
    return 'Every check marked “must” has to be answered first.'
  }
  if (!Number.isFinite(rejected) || rejected < 0) return 'Put in how much was rejected, or nought.'
  if (rejected > r.qty) return 'You cannot reject more than arrived.'
  const failed = failedChecks(checks, r.results ?? [])
  const said = (reason ?? '').trim().length >= 4
  if (failed.length > 0 && rejected === 0 && !said) {
    return 'A check failed and nothing is rejected — say why it is being accepted.'
  }
  if (failed.length === 0 && rejected > 0 && !said) {
    return 'Nothing failed a check — say why it is being rejected.'
  }
  return null
}

export interface CloseInput {
  rejected: number
  /** why a failure was let through, or why something was rejected with nothing failed */
  reason?: string
  /** the signed-in name */
  inspector: string
  closedAt: string
}

/**
 * Inspected, and closed into stock.
 *
 * Accepted is what arrived less what was rejected — the domain's own
 * arithmetic. What was accepted becomes a usable lot. What was rejected becomes
 * a lot too, a non-usable one, in the bucket the failed check names and
 * carrying its reason — it is on the premises, it is always displayed and it is
 * never cover. Until now a rejected quantity simply vanished, which is the one
 * thing §11 says non-usable stock must never do.
 *
 * The order moves on what has been CLOSED against it. The material's last
 * purchase price becomes what this order paid (§13-1 values stock at the last
 * purchase price, and until now nothing ever moved it off the first quote),
 * with the old figure kept on the receipt so taking it back puts it back. And
 * the supplier's measured figures are recomputed, which is the point.
 *
 * Refuses — returns the workspace unchanged — exactly when `closeBlockedBy`
 * says so, so a screen that forgot to ask cannot close a receipt that should
 * not close.
 */
export function closeReceipt(ws: Workspace, receiptId: string, c: CloseInput): Workspace {
  const r = (ws.receipts ?? []).find((x) => x.id === receiptId)
  if (!r || closeBlockedBy(ws, r, c.rejected, c.reason)) return ws

  const checks = checksFor(ws, r.itemId)
  const results = r.results ?? []
  const failed = failedChecks(checks, results)
  const accepted = acceptedQty(r.qty, c.rejected).value
  const order = r.orderId ? ws.orders.find((o) => o.id === r.orderId) : undefined
  const challan = r.challanId ? (ws.challans ?? []).find((x) => x.id === r.challanId) : undefined
  const reason = c.reason?.trim() || undefined
  let w = ws

  const batch = `${order?.no ?? challan?.no ?? r.id}/${r.receivedOn}`
  const lots: StockLot[] = []
  if (accepted > 0) {
    lots.push({ id: `LOT-${r.id}`, itemId: r.itemId, batchNo: batch, qty: accepted, usability: 'usable' })
  }
  if (c.rejected > 0) {
    // the first failure that actually puts material out of use names the bucket
    const rule = failed.find((f) => f.failBucket !== 'usable') ?? failed[0]
    const bucket: Usability = rule && rule.failBucket !== 'usable' ? rule.failBucket : 'qc_hold'
    lots.push({
      id: `LOT-${r.id}-NU`, itemId: r.itemId, batchNo: `${batch} rejected`, qty: c.rejected,
      usability: bucket,
      usabilityReason: rule?.failReason ?? reason ?? 'Rejected at the gate',
    })
  }
  w = { ...w, stockLots: [...w.stockLots, ...lots] }

  const item = w.items.find((i) => i.id === r.itemId)
  const priceBefore = order && item ? item.lastPurchaseRate : undefined
  w = {
    ...w,
    receipts: (w.receipts ?? []).map((x) => (x.id !== r.id ? x : {
      ...x,
      status: 'closed' as const,
      accepted,
      rejected: c.rejected,
      failedCheckIds: failed.length ? failed.map((f) => f.id) : undefined,
      deviationReason: failed.length > 0 && c.rejected === 0 ? reason : x.deviationReason,
      rejectReason: failed.length === 0 && c.rejected > 0 ? reason : undefined,
      inspector: c.inspector,
      closedAt: c.closedAt,
      noSpec: checks.length === 0 || undefined,
      priceBefore,
    })),
  }

  if (order) {
    const settled = settledAgainst(w, order.id)
    const state: PurchaseOrder['state'] = settled >= order.qty ? 'delivered' : 'shipped'
    w = {
      ...w,
      orders: w.orders.map((o) => (o.id === order.id ? { ...o, state } : o)),
      // §13-1: what was last paid is what this order paid
      items: w.items.map((i) => (i.id === r.itemId && order.unitPrice > 0
        ? { ...i, lastPurchaseRate: order.unitPrice } : i)),
    }
  }

  return repriceFromReceipts(w)
}

export interface ReceiptInput {
  order: PurchaseOrder
  qty: number
  accepted: number
  rejected: number
  note?: string
  receivedOn: string
  /** who closed it; a receipt recorded in one step was not inspected */
  inspector?: string
}

/**
 * Arrived and closed in one step, for a material with no checks written.
 *
 * The gate still happens — the receipt is opened and then closed, through the
 * same `closeReceipt`, so the lots, the order and the repricing are exactly
 * what inspection would have written. A material WITH checks cannot be
 * recorded this way: `closeReceipt` refuses an inspection that has not been
 * done, and nothing bypasses the gate because it arrived through another
 * screen.
 */
export function recordReceipt(ws: Workspace, r: ReceiptInput): Workspace {
  const [w, id] = arrive(ws, { order: r.order, qty: r.qty, receivedOn: r.receivedOn, note: r.note })
  return closeReceipt(w, id, {
    rejected: r.rejected,
    reason: r.rejected > 0 ? (r.note?.trim() || 'Rejected on arrival') : undefined,
    inspector: r.inspector ?? 'unchecked',
    closedAt: r.receivedOn,
  })
}

/**
 * Taking a receipt back — a mis-keyed delivery is not a permanent fact.
 *
 * Both of its lots go, the order goes back to where the remaining closed
 * receipts put it, and the material's valuation goes back to what it was before
 * this receipt moved it.
 */
export function removeReceipt(ws: Workspace, receiptId: string): Workspace {
  const gone = (ws.receipts ?? []).find((r) => r.id === receiptId)
  if (!gone) return ws

  let w: Workspace = {
    ...ws,
    receipts: (ws.receipts ?? []).filter((r) => r.id !== receiptId),
    stockLots: ws.stockLots.filter((l) => l.id !== `LOT-${receiptId}` && l.id !== `LOT-${receiptId}-NU`),
  }

  /*
   * And the order goes back to where the remaining receipts put it. Left
   * alone it would still read "delivered" with nothing recorded against it,
   * which is the state this whole record exists to stop being a guess.
   */
  const order = gone.orderId ? w.orders.find((o) => o.id === gone.orderId) : undefined
  if (order) {
    const settled = settledAgainst(w, order.id)
    const state: PurchaseOrder['state'] = settled === 0 ? 'confirmed'
      : settled >= order.qty ? 'delivered' : 'shipped'
    w = { ...w, orders: w.orders.map((o) => (o.id === order.id ? { ...o, state } : o)) }
  }
  /*
   * The valuation goes back only if this receipt is still the one that set it.
   * A later receipt from another order moved it since, and taking this one
   * back must not undo that.
   */
  const later = purchaseReceipts(w).some((r) => r.itemId === gone.itemId && !isOpen(r)
    && (r.closedAt ?? r.receivedOn) >= (gone.closedAt ?? gone.receivedOn))
  if (gone.priceBefore != null && !later) {
    w = {
      ...w,
      items: w.items.map((i) => (i.id === gone.itemId ? { ...i, lastPurchaseRate: gone.priceBefore! } : i)),
    }
  }

  return repriceFromReceipts(w)
}
