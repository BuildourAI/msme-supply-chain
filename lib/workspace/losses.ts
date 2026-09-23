/**
 * What leaves the store without going into anything.
 *
 * The loss ledger owns "why, and what it cost"; the stock ledger owns the
 * quantity. A loss either carries its own movement — a write-off, a count
 * shortage — or names a part of one already posted, so the two ledgers never
 * count the same metre twice. That is the domain's rule (`CAUSE_MOVES_STOCK`),
 * kept here.
 */
import { issueId } from './defaults'
import { lotOf, post, round3 } from './ledger'
import type { Usability } from '@/lib/domain/types'
import type { Workspace, WsLoss } from './types'

/** ₹ per unit a scrap dealer pays for this material; absent is dead loss. */
export const scrapRateOf = (ws: Workspace, itemId: string): number => ws.scrapRate?.[itemId] ?? 0

export interface WriteOff {
  lotId: string
  qty: number
  on: string
  actor: string
  note: string
}

export function writeOffProblem(ws: Workspace, w: WriteOff): string | null {
  const lot = lotOf(ws, w.lotId)
  if (!lot) return 'That lot is not in the book.'
  if (!Number.isFinite(w.qty) || w.qty <= 0) return 'Put in how much is being written off.'
  if (w.qty > lot.qty + 1e-9) return `Only ${round3(Math.max(0, lot.qty))} is on this lot.`
  if (w.note.trim().length < 4) return 'Say why it is being written off — a write-off is a decision with a reason.'
  return null
}

/**
 * Stock off the book for good: spoiled, damaged past use, or rejected at the
 * gate and not going back. A write-off movement against a loss record, the
 * loss carrying what scrap of it would fetch. A lot the gate rejected is a
 * gate rejection; anything else is store spoilage.
 */
export function writeOff(ws: Workspace, w: WriteOff): [Workspace, string] {
  if (writeOffProblem(ws, w)) return [ws, '']
  const lot = lotOf(ws, w.lotId)!
  const [issued, id] = issueId(ws, 'LS')
  const rejected = lot.id.endsWith('-NU')
  const [moved, moveId] = post(issued, {
    lotId: lot.id, itemId: lot.itemId, on: w.on, kind: 'write_off', qty: -round3(w.qty),
    source: 'loss', sourceRef: id, actor: w.actor, note: w.note.trim(),
  })
  if (!moveId) return [ws, '']
  const loss: WsLoss = {
    id, on: w.on, itemId: lot.itemId, lotId: lot.id, qty: round3(w.qty),
    cause: rejected ? 'grn_rejection' : 'store_spoilage',
    source: rejected && lot.receiptId ? 'grn' : 'loss',
    sourceRef: rejected && lot.receiptId ? lot.receiptId : id,
    recoveryRate: scrapRateOf(ws, lot.itemId),
    actor: w.actor,
    note: w.note.trim(),
  }
  return [{ ...moved, losses: [...(moved.losses ?? []), loss] }, id]
}

/**
 * A lot put on hold, or released from it. No quantity moves, so it is not a
 * movement — it is on the lot's trail as a change of state, dated and named.
 * A held lot is never cover and cannot be issued; releasing it makes it both.
 */
export function setLotState(
  ws: Workspace, lotId: string, to: Usability, reason: string, on: string, actor: string,
): Workspace {
  const lot = lotOf(ws, lotId)
  if (!lot || lot.usability === to) return ws
  if (to !== 'usable' && reason.trim().length < 3) return ws
  const [w, id] = issueId(ws, 'TR')
  return {
    ...w,
    stockLots: w.stockLots.map((l) => (l.id !== lotId ? l : {
      ...l, usability: to, usabilityReason: to === 'usable' ? undefined : reason.trim(),
    })),
    transfers: [...(w.transfers ?? []), {
      id, lotId, from: lot.rack, to: lot.rack, on, actor,
      state: { from: lot.usability, to, note: reason.trim() || undefined },
    }],
  }
}
