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
import type { StockLot, VendorItem } from '@/lib/domain/types'
import { issueId } from './defaults'
import { rejectionCost } from './landed'
import type { GoodsReceipt, PurchaseOrder, Workspace } from './types'

/** Every receipt against one supplier-material pairing, newest last. */
export const receiptsFor = (ws: Workspace, vendorId: string, itemId: string): GoodsReceipt[] =>
  (ws.receipts ?? [])
    .filter((r) => r.vendorId === vendorId && r.itemId === itemId)
    .sort((a, b) => a.receivedOn.localeCompare(b.receivedOn))

/** What has already arrived against one order line. */
export const receivedAgainst = (ws: Workspace, orderId: string): number =>
  (ws.receipts ?? []).filter((r) => r.orderId === orderId).reduce((a, r) => a + r.qty, 0)

/** What is still to come on it. Never negative — an over-delivery is not a debt. */
export const outstandingOn = (ws: Workspace, order: PurchaseOrder): number =>
  Math.max(0, order.qty - receivedAgainst(ws, order.id))

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
  ws: Workspace, vendorId: string, itemId: string,
): number | null {
  const last = receiptsFor(ws, vendorId, itemId).slice(-6)
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
  const n = receiptsFor(ws, vendorId, itemId).length
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

export interface ReceiptInput {
  order: PurchaseOrder
  qty: number
  accepted: number
  rejected: number
  note?: string
  receivedOn: string
}

/**
 * Record what turned up.
 *
 * Four things happen, and each is the consequence of goods physically being
 * on the floor rather than a bookkeeping nicety:
 *
 * The receipt is written, carrying the order's date with it so the lead time it
 * measures cannot change afterwards because somebody corrected the order.
 *
 * What was accepted becomes stock. Goods that arrived and passed are on the
 * shelf, and a build that recorded the arrival without the material would show
 * an empty bin for something you can see.
 *
 * The order line moves. Fully delivered when everything ordered has now
 * arrived, shipped while some is still to come — never delivered on a part
 * delivery, which would close a line you are still waiting on.
 *
 * And the supplier's measured figures are recomputed, which is the whole point.
 */
export function recordReceipt(ws: Workspace, r: ReceiptInput): Workspace {
  const [issued, id] = issueId(ws, 'GR')
  let w = issued

  const receipt: GoodsReceipt = {
    id,
    orderId: r.order.id,
    vendorId: r.order.vendorId,
    itemId: r.order.itemId,
    qty: r.qty,
    accepted: r.accepted,
    rejected: r.rejected,
    note: r.note?.trim() || undefined,
    orderedOn: r.order.orderedOn,
    receivedOn: r.receivedOn,
  }
  w = { ...w, receipts: [...(w.receipts ?? []), receipt] }

  if (r.accepted > 0) {
    const lot: StockLot = {
      id: `LOT-${id}`,
      itemId: r.order.itemId,
      batchNo: `${r.order.no}/${r.receivedOn}`,
      qty: r.accepted,
      usability: 'usable',
    }
    w = { ...w, stockLots: [...w.stockLots, lot] }
  }

  const arrived = receivedAgainst(w, r.order.id)
  const state: PurchaseOrder['state'] = arrived >= r.order.qty ? 'delivered' : 'shipped'
  w = { ...w, orders: w.orders.map((o) => (o.id === r.order.id ? { ...o, state } : o)) }

  return repriceFromReceipts(w)
}

/** Taking a receipt back — a mis-keyed delivery is not a permanent fact. */
export function removeReceipt(ws: Workspace, receiptId: string): Workspace {
  const gone = (ws.receipts ?? []).find((r) => r.id === receiptId)
  if (!gone) return ws

  let w: Workspace = {
    ...ws,
    receipts: (ws.receipts ?? []).filter((r) => r.id !== receiptId),
    stockLots: ws.stockLots.filter((l) => l.id !== `LOT-${receiptId}`),
  }

  /*
   * And the order goes back to where the remaining receipts put it. Left
   * alone it would still read "delivered" with nothing recorded against it,
   * which is the state this whole record exists to stop being a guess.
   */
  const order = w.orders.find((o) => o.id === gone.orderId)
  if (order) {
    const arrived = receivedAgainst(w, order.id)
    const state: PurchaseOrder['state'] = arrived === 0 ? 'confirmed'
      : arrived >= order.qty ? 'delivered' : 'shipped'
    w = { ...w, orders: w.orders.map((o) => (o.id === order.id ? { ...o, state } : o)) }
  }

  return repriceFromReceipts(w)
}
