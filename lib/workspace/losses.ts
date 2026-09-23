/**
 * What leaves the store without going into anything.
 *
 * The loss ledger owns "why, and what it cost"; the stock ledger owns the
 * quantity. A loss either carries its own movement — a write-off, a count
 * shortage — or names a part of one already posted, so the two ledgers never
 * count the same metre twice. That is the domain's rule (`CAUSE_MOVES_STOCK`),
 * kept here.
 */
import { daysBetween } from '@/lib/domain/calc'
import {
  lossByCause, lossValue, netLoss, overScrapTarget, realisedValue, recoveryValue, scrapPct,
  unrealisedRecovery,
} from '@/lib/domain/inventory'
import type { Derived, Item, ItemClass, LossCause, Usability } from '@/lib/domain/types'
import { issueId } from './defaults'
import { lotOf, post, round3 } from './ledger'
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

/* ------------------------------------------------------------- settling -- */

export const scrapNotedKey = (itemId: string, month: string) => `inventory.scrapNoted.${itemId}.${month}`

export function sellProblem(ws: Workspace, lossId: string, realised: number): string | null {
  const l = (ws.losses ?? []).find((x) => x.id === lossId)
  if (!l) return 'That loss is not on the ledger.'
  if (l.soldOn || l.noSaleOn) return 'It is already settled.'
  if (!Number.isFinite(realised) || realised < 0) return 'Put in what the dealer actually paid, in rupees.'
  return null
}

/**
 * The scrap sold, for what it actually fetched — typed in, not the booked
 * rate. Net loss then counts the money that arrived.
 */
export function sellScrap(ws: Workspace, lossId: string, s: { on: string; realised: number }): Workspace {
  if (sellProblem(ws, lossId, s.realised)) return ws
  return {
    ...ws,
    losses: (ws.losses ?? []).map((l) => (l.id !== lossId ? l
      : { ...l, soldOn: s.on, realised: Math.round(s.realised * 100) / 100 })),
  }
}

/** Nobody bought it: the hoped-for recovery becomes a decided dead loss. */
export function noSale(ws: Workspace, lossId: string, on: string): Workspace {
  const l = (ws.losses ?? []).find((x) => x.id === lossId)
  if (!l || l.soldOn || l.noSaleOn) return ws
  return { ...ws, losses: (ws.losses ?? []).map((x) => (x.id !== lossId ? x : { ...x, noSaleOn: on })) }
}

/* --------------------------------------------------------------- reading -- */

export type LossState = 'dead' | 'owed' | 'sold' | 'no_sale'

export interface LossRow {
  loss: WsLoss
  item?: Item
  uom: string
  rate: number
  cost: Derived
  recovery: Derived
  realised: Derived
  state: LossState
  job?: string
  /** days since it was booked, for scrap still in the bin */
  age: number
}

const stateOf = (l: WsLoss): LossState => (l.soldOn ? 'sold' : l.noSaleOn ? 'no_sale' : l.recoveryRate > 0 ? 'owed' : 'dead')

export function lossRows(ws: Workspace, today = ''): LossRow[] {
  return [...(ws.losses ?? [])]
    .sort((a, b) => b.on.localeCompare(a.on) || b.id.localeCompare(a.id))
    .map((loss) => {
      const item = ws.items.find((i) => i.id === loss.itemId)
      const uom = item?.uom ?? ''
      const rate = item?.lastPurchaseRate ?? 0
      return {
        loss, item, uom, rate,
        cost: lossValue(loss, rate, uom),
        recovery: recoveryValue(loss, uom),
        realised: realisedValue(loss, uom),
        state: stateOf(loss),
        job: loss.jobId ? (ws.jobs ?? []).find((j) => j.id === loss.jobId)?.no : undefined,
        age: today ? daysBetween(loss.on, today) : 0,
      }
    })
}

const withRate = (ws: Workspace, losses: WsLoss[]) =>
  losses.map((loss) => ({ loss, rate: ws.items.find((i) => i.id === loss.itemId)?.lastPurchaseRate ?? 0 }))

/** Net loss — what it cost, less what came back — over some losses, or all of them. */
export const netLossOf = (ws: Workspace, losses: WsLoss[] = ws.losses ?? []): Derived =>
  netLoss(withRate(ws, losses))

export const byCause = (ws: Workspace, losses: WsLoss[] = ws.losses ?? []) =>
  lossByCause(withRate(ws, losses))

export const unrealised = (ws: Workspace, today: string): Derived =>
  unrealisedRecovery(withRate(ws, ws.losses ?? []), today, ws.policy)

/** Recoverable scrap nobody has sold or written off, older than the store rules allow. */
export const unsoldPast = (ws: Workspace, today: string): LossRow[] =>
  lossRows(ws, today).filter((r) => r.state === 'owed' && r.age > ws.policy.scrapUnrealisedDays)

/**
 * Losses that come of using material — scrap on the floor, cutting losses,
 * what a jobworker consumed past the allowance. Scrap against target is these
 * over what was issued; a shortfall on a count, spoilage on the shelf and a
 * rejection at the gate are losses too, but not scrap, and are not in it.
 */
export const FLOOR_CAUSES: LossCause[] = ['process_scrap', 'cut_kerf', 'cut_offcut_scrap', 'jobwork_loss']

export interface ScrapRow {
  item: Item
  cls: ItemClass
  issued: number
  lost: number
  pct: Derived
  target: number
  over: boolean
  noted: boolean
  net: number
}

/**
 * Scrap against target, per material, for one month: floor losses over
 * material issued to jobs and sent to jobworkers, net of what came back.
 */
export function scrapRows(ws: Workspace, month: string): ScrapRow[] {
  const inMonth = (on: string) => on.slice(0, 7) === month
  return ws.items.map((item) => {
    const moves = (ws.moves ?? []).filter((m) => m.itemId === item.id && inMonth(m.on))
    const issued = Math.round(-moves.filter((m) => m.kind === 'issue' || m.kind === 'jobwork_out' || m.kind === 'offcut_issue')
      .reduce((a, m) => a + m.qty, 0) * 1000) / 1000
    const losses = (ws.losses ?? []).filter((l) => l.itemId === item.id && inMonth(l.on) && FLOOR_CAUSES.includes(l.cause))
    const lost = Math.round(losses.reduce((a, l) => a + l.qty, 0) * 1000) / 1000
    const pct = scrapPct(lost, issued, item.uom)
    return {
      item, cls: item.itemClass, issued, lost, pct,
      target: ws.policy.scrapTargetPct[item.itemClass],
      over: issued > 0 && overScrapTarget(pct.value, item.itemClass, ws.policy),
      noted: ws.drafts[scrapNotedKey(item.id, month)] === true,
      net: netLossOf(ws, losses).value,
    }
  }).filter((r) => r.issued > 0 || r.lost > 0)
}
