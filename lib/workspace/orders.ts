/**
 * An order, and what its supplier has been told about it.
 *
 * The moment an order is handed over, two quantities exist: what we want, and
 * what the supplier is making. They are the same until somebody changes the
 * order — a job cancelled, a customer's order grown — and from then they are
 * different until the supplier confirms the change. The sample company's
 * INB-02 exists for exactly that gap, and its rule is the one this follows:
 * cover is computed on the quantity the supplier has ACKNOWLEDGED, never on an
 * internal change they have not seen.
 *
 * Version 1 is the order as handed over. Handing it over is the supplier
 * receiving it, so version 1 counts as acknowledged — a supplier who has the
 * page is making what is on it. Every later change is a new version, and
 * stays unconfirmed until somebody records that the supplier agreed, against a
 * reply they can point to.
 *
 * `qty` and `expectedOn` on the order are always OUR truth — what we now want —
 * which is what the order screen, the document and the arrival form show. The
 * supplier's truth is the acknowledged version, and only `bundleFor` and the
 * board read that.
 */
import {
  churn, daysAwaitingAck, internalQty, lineExposure, quantityGap, revisionAt, syncState,
  vendorKnownQty, type SyncState,
} from '@/lib/domain/inbound'
import type { Derived, Item, PoChangeKind, PoRevision, PoSync, Vendor } from '@/lib/domain/types'
import { toSync } from './inbound'
import type { PurchaseOrder, Workspace } from './types'

/** Version 1, as it was handed over. */
export const v1Of = (o: PurchaseOrder, on: string, by: string): PoRevision => ({
  version: 1, qty: o.qty, promisedDate: o.expectedOn,
  changedOn: on, changedBy: by, kind: 'created', reason: 'Order handed over',
})

export const latestOf = (o: PurchaseOrder): PoRevision | null =>
  o.revisions && o.revisions.length > 0 ? o.revisions[o.revisions.length - 1] : null

/**
 * The version the supplier confirmed. An order never handed over through the
 * build — recorded as confirmed by hand — is taken as the owner recorded it:
 * they are the one who knows the supplier has it.
 */
const acked = (o: PurchaseOrder): PoRevision | null => {
  if (!o.revisions || o.revisions.length === 0) return null
  const s = { revisions: o.revisions } as Parameters<typeof revisionAt>[0]
  return revisionAt(s, o.ackedVersion ?? 1)
}

/** What will actually arrive. The only quantity cover may use. */
export const ackedQty = (o: PurchaseOrder): number => acked(o)?.qty ?? o.qty
/** And when the supplier said it would. */
export const ackedDate = (o: PurchaseOrder): string => acked(o)?.promisedDate ?? o.expectedOn

/** Where a line stands with its supplier — the domain's own three words. */
export function syncOf(ws: Workspace, o: PurchaseOrder): SyncState | null {
  const s = toSync(ws, o)
  return s ? syncState(s) : null
}

const live = (o: PurchaseOrder) => o.state !== 'cancelled' && o.state !== 'delivered'

/**
 * The order's document went to its supplier.
 *
 * The first time, every line gets its version 1 and the supplier is taken to
 * have it — they are holding the page. After a change, sending the document
 * again IS the change notice: the supplier now has the latest version, and is
 * awaiting nothing but their confirmation. A draft handed over becomes
 * confirmed, as it always has.
 */
export function markHandedOver(ws: Workspace, no: string, on: string, actor: string): Workspace {
  return {
    ...ws,
    orders: ws.orders.map((o) => {
      if (o.no !== no || o.state === 'cancelled') return o
      const state = o.state === 'draft' ? 'confirmed' as const : o.state
      if (!o.revisions || o.revisions.length === 0) {
        return {
          ...o, state,
          revisions: [v1Of(o, on, actor)],
          notifiedVersion: 1, ackedVersion: 1, notifiedOn: on, ackedOn: on,
          ackRef: o.ackRef ?? 'Order handed over',
        }
      }
      return { ...o, state, notifiedVersion: latestOf(o)!.version, notifiedOn: on }
    }),
  }
}

export interface Revision {
  qty: number
  expectedOn: string
  reason: string
  changedBy: string
  on: string
}

/**
 * The versions a line has, or would have.
 *
 * An order recorded as confirmed by hand — placed on the phone, typed in after
 * — never went through the document, so it has no version 1 on file. The
 * supplier still has it: the owner is the one who knows, and said so by
 * recording it confirmed. So it reads as version 1, confirmed on the day it
 * was ordered, and its first change is version 2 like any other.
 */
export function revisionsOf(o: PurchaseOrder): PoRevision[] {
  if (o.revisions && o.revisions.length > 0) return o.revisions
  if (o.state !== 'confirmed' && o.state !== 'shipped') return []
  return [{ ...v1Of(o, o.orderedOn, 'you'), reason: 'Recorded as placed' }]
}

/** Why a change cannot be saved as it stands, or null. */
export function reviseProblem(o: PurchaseOrder, c: Revision): string | null {
  const vs = revisionsOf(o)
  const cur = vs.length ? vs[vs.length - 1] : null
  if (!cur) return 'This order has not been handed over — edit it on the Purchase orders screen instead.'
  if (!Number.isFinite(c.qty) || c.qty <= 0) return 'Put in the quantity you now want.'
  if (c.expectedOn.length !== 10) return 'Put in the date you now want it by.'
  if (c.qty === cur.qty && c.expectedOn === cur.promisedDate) return 'Nothing has changed.'
  if (c.reason.trim().length < 4) return 'Say why it is changing — the supplier will ask.'
  return null
}

/**
 * A change to a line its supplier already holds.
 *
 * A new version, and our own figures move to it straight away — the order
 * screen and the document show what we now want. What will actually arrive
 * does not move: that stays on the version the supplier confirmed until they
 * confirm this one.
 */
export function reviseOrder(ws: Workspace, orderId: string, c: Revision): Workspace {
  const o = ws.orders.find((x) => x.id === orderId)
  if (!o || reviseProblem(o, c)) return ws
  const had = revisionsOf(o)
  const cur = had[had.length - 1]
  const kind: PoChangeKind = c.qty !== cur.qty ? 'qty' : 'date'
  const next: PoRevision = {
    version: cur.version + 1, qty: c.qty, promisedDate: c.expectedOn,
    changedOn: c.on, changedBy: c.changedBy, kind, reason: c.reason.trim(),
  }
  // a hand-recorded order gets its version 1 on file with its first change
  const first = !o.revisions || o.revisions.length === 0
  return {
    ...ws,
    orders: ws.orders.map((x) => (x.id !== orderId ? x : {
      ...x,
      qty: c.qty, expectedOn: c.expectedOn, revisions: [...had, next],
      ...(first ? {
        notifiedVersion: 1, ackedVersion: 1, notifiedOn: o.orderedOn, ackedOn: o.orderedOn,
        ackRef: o.ackRef ?? 'Recorded as placed',
      } : {}),
    })),
  }
}

export interface Ack {
  /** what they confirmed with, in words */
  ref: string
  on: string
  /** a picture of the confirmation, kept on the device */
  imageId?: string
}

/**
 * The supplier confirmed.
 *
 * By order NUMBER, because a supplier confirms a document, not a line — and
 * against a reply somebody can point to: a reference in words, a picture, or
 * both. From here the confirmed version is the one cover uses.
 */
export function recordAck(ws: Workspace, no: string, a: Ack): Workspace {
  return {
    ...ws,
    orders: ws.orders.map((o) => {
      if (o.no !== no || !o.revisions || o.revisions.length === 0 || o.state === 'cancelled') return o
      const v = latestOf(o)!.version
      return {
        ...o,
        ackedVersion: v,
        notifiedVersion: Math.max(o.notifiedVersion ?? 1, v),
        ackedOn: a.on,
        ackRef: a.ref.trim() || o.ackRef,
        // a picture of an earlier confirmation proves nothing about this one
        ackImageId: a.imageId,
      }
    }),
  }
}

/** Lines whose supplier has not confirmed the latest version. */
export const awaitingAck = (ws: Workspace): PurchaseOrder[] =>
  ws.orders.filter((o) => live(o) && o.revisions && o.revisions.length > 0
    && (o.ackedVersion ?? 1) < latestOf(o)!.version)

/** The order NUMBERS awaiting a confirmation — the rail counts documents, not lines. */
export const awaitingAckNos = (ws: Workspace): string[] =>
  [...new Set(awaitingAck(ws).map((o) => o.no))]

/** Every picture of a confirmation this workspace points at, so nothing prunes it. */
export const ackImageIds = (ws: Workspace): string[] =>
  ws.orders.map((o) => o.ackImageId).filter((x): x is string => Boolean(x))

/* ----------------------------------------------------------- the screen -- */

/**
 * One line of an open order, and where it stands with its supplier.
 *
 * Every figure is the domain's INB-02 arithmetic over the line's versions —
 * what we need, what they are making, the gap, what the gap is worth, how long
 * the notice has gone unanswered, how often the line has moved — so the
 * owner's screen says exactly what the sample company's does.
 */
export interface SyncLine {
  order: PurchaseOrder
  item?: Item
  uom: string
  sync: PoSync
  state: SyncState
  need: Derived
  making: Derived
  gap: Derived
  exposure: Derived
  awaiting: Derived
  churn: Derived
  /** changed more often in thirty days than the gate rules allow */
  whipsawed: boolean
  /** a notice unanswered past the days the gate rules allow */
  chaseOverdue: boolean
  /** recorded confirmed by hand, never through the document */
  byHand: boolean
}

/** One order number: what a supplier holds, and confirms, as one page. */
export interface SyncOrder {
  no: string
  vendor?: Vendor
  lines: SyncLine[]
  /** the worst of its lines */
  state: SyncState
  exposure: number
  ackedOn?: string
  ackRef?: string
  ackImageId?: string
  notifiedOn?: string
  shipped: boolean
}

const RANK: Record<SyncState, number> = { not_told: 0, awaiting_ack: 1, acknowledged: 2 }

export function syncLine(ws: Workspace, o: PurchaseOrder, today: string): SyncLine | null {
  const revisions = revisionsOf(o)
  if (revisions.length === 0) return null
  const item = ws.items.find((i) => i.id === o.itemId)
  const uom = item?.uom ?? ''
  const byHand = !o.revisions || o.revisions.length === 0
  const sync: PoSync = {
    poLineId: o.id,
    poNo: o.no,
    itemId: o.itemId,
    vendorName: ws.vendors.find((v) => v.id === o.vendorId)?.name ?? 'Unknown supplier',
    shipped: o.state === 'shipped',
    revisions,
    notifiedVersion: byHand ? 1 : (o.notifiedVersion ?? 1),
    ackedVersion: byHand ? 1 : (o.ackedVersion ?? 1),
    notifiedOn: byHand ? o.orderedOn : o.notifiedOn,
    ackedOn: byHand ? o.orderedOn : o.ackedOn,
    ackRef: byHand ? 'Recorded as placed' : o.ackRef,
  }
  const state = syncState(sync)
  const gap = quantityGap(sync, uom)
  const awaiting = daysAwaitingAck(sync, today)
  const ch = churn(sync, today)
  return {
    order: o, item, uom, sync, state,
    need: internalQty(sync, uom),
    making: vendorKnownQty(sync, uom),
    gap,
    exposure: lineExposure(gap.value, item?.lastPurchaseRate ?? 0, uom),
    awaiting,
    churn: ch,
    whipsawed: ch.value > ws.policy.poChurnLimit,
    chaseOverdue: state === 'awaiting_ack' && awaiting.value > ws.policy.ackChaseDays,
    byHand,
  }
}

/**
 * Every order still out with its supplier, one card per number: the ones
 * nobody has told the supplier about first, then the ones waiting on a reply,
 * then the ones that are fine — worst exposure first within each.
 */
export function syncOrders(ws: Workspace, today: string): SyncOrder[] {
  const byNo = new Map<string, SyncLine[]>()
  for (const o of ws.orders) {
    if (o.state !== 'confirmed' && o.state !== 'shipped') continue
    const l = syncLine(ws, o, today)
    if (!l) continue
    byNo.set(o.no, [...(byNo.get(o.no) ?? []), l])
  }
  const out: SyncOrder[] = []
  for (const [no, lines] of byNo) {
    const head = lines[0].order
    const state = lines.map((l) => l.state).sort((a, b) => RANK[a] - RANK[b])[0]
    out.push({
      no,
      vendor: ws.vendors.find((v) => v.id === head.vendorId),
      lines,
      state,
      exposure: lines.reduce((a, l) => a + l.exposure.value, 0),
      ackedOn: lines[0].sync.ackedOn,
      ackRef: lines[0].sync.ackRef,
      ackImageId: head.ackImageId,
      notifiedOn: lines[0].sync.notifiedOn,
      shipped: lines.some((l) => l.sync.shipped),
    })
  }
  return out.sort((a, b) => RANK[a.state] - RANK[b.state] || b.exposure - a.exposure
    || a.no.localeCompare(b.no, undefined, { numeric: true }))
}

/** The words for a state, the same three the sample company uses. */
export const SYNC_WORDS: Record<SyncState, string> = {
  not_told: 'changed, supplier not told',
  awaiting_ack: 'awaiting confirmation',
  acknowledged: 'in sync',
}

/**
 * A line that will land after the line stops, as text a person sends.
 *
 * §11: the system never contacts a supplier. This is the words, and the
 * WhatsApp and mail buttons beside it only open with them already in.
 */
export function expediteDraft(
  vendorName: string, no: string, itemName: string, qty: string, promised: string, needBy: string,
): string {
  return [
    `Dear ${vendorName},`,
    '',
    `${no} — ${itemName}, ${qty}.`,
    `You confirmed it for ${promised}. We run out on ${needBy}, so we need it to reach us before then.`,
    '',
    'Can you despatch sooner, even part of it? Please tell us the earliest date you can.',
  ].join('\n')
}
