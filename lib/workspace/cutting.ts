/**
 * Cutting, and what is left over.
 *
 * Behind a switch in the store rules: a company that does not cut material
 * never sees any of this. One that does records each cut — what went on the
 * table, what came off as parts, what the blade took, and the remnants —
 * and the identity that makes a cut trustworthy is enforced before it is
 * written: input = parts + kerf + remnants.
 *
 * A remnant big enough to use becomes a lot of its own on a rack, flagged,
 * with its piece size and count. Smaller than the material's smallest usable
 * piece, it is scrap at the cut. The kerf and that scrap are losses with their
 * cause, carried inside the cut's own movement, so nothing is counted twice.
 * Remnants are on the book and never counted as cover; they are offered
 * against an order — and when one is about to be bought again while its
 * remnants sit on a rack, that is said.
 */
import { buildRows } from '@/lib/domain/derive'
import {
  cutBalances, cutYield, offcutEffect, plannedYield, remnantAgeDays, yieldShortfall,
  type OffcutEffect,
} from '@/lib/domain/inventory'
import type { Derived, Item, Remnant } from '@/lib/domain/types'
import { bundleFor } from './bundle'
import { issueId } from './defaults'
import { fifo, isRemnant, lotOf, newLot, post, remnantOnHand, round3 } from './ledger'
import { scrapRateOf } from './losses'
import { nextNo } from './sourcing'
import type { IssueSlip, Job, PurchaseOrder, Rack, Workspace, WsCut, WsLoss, WsLot } from './types'

export const minRemnantOf = (ws: Workspace, itemId: string): number => ws.minRemnant?.[itemId] ?? 0
export const isUsableRemnant = (ws: Workspace, itemId: string, size: number): boolean =>
  size >= minRemnantOf(ws, itemId)

export const cutNotedKey = (cutId: string) => `inventory.cutNoted.${cutId}`
export const remnantNotedKey = (orderNo: string, itemId: string) => `inventory.remnantNoted.${orderNo}.${itemId}`

export interface CutInput {
  itemId: string
  /** the lot it is cut from; absent is the oldest one with enough on it */
  lotId?: string
  jobId?: string
  on: string
  inputQty: number
  plannedPartsQty: number
  partsQty: number
  partsCount: number
  kerfQty: number
  remnants: Remnant[]
  /** where the usable remnants go */
  rack?: string
  operator: string
}

/** The lot a cut comes off: the one picked, or the oldest with enough on it for the whole lay. */
export function cutLot(ws: Workspace, c: Pick<CutInput, 'itemId' | 'lotId' | 'inputQty'>): WsLot | undefined {
  if (c.lotId) return lotOf(ws, c.lotId)
  return fifo(ws, c.itemId).find((l) => l.qty + 1e-9 >= c.inputQty)
}

const asCut = (c: CutInput, lotId: string): WsCut => ({
  id: '', cutNo: '', on: c.on, itemId: c.itemId, lotId, workOrder: '',
  inputQty: c.inputQty, plannedPartsQty: c.plannedPartsQty, partsQty: c.partsQty,
  partsCount: c.partsCount, kerfQty: c.kerfQty, remnants: c.remnants, operator: c.operator,
})

export function cutProblem(ws: Workspace, c: CutInput): string | null {
  if (!ws.cutting) return 'Cutting is switched off in the store rules.'
  if (!ws.items.some((i) => i.id === c.itemId)) return 'Pick the material that was cut.'
  const num = (v: number) => Number.isFinite(v) && v >= 0
  if (!Number.isFinite(c.inputQty) || c.inputQty <= 0) return 'Put in how much went on the table.'
  if (!num(c.partsQty) || !num(c.kerfQty) || !num(c.plannedPartsQty)) return 'Parts, kerf and the plan are quantities — nought where there is none.'
  if (!Number.isInteger(c.partsCount) || c.partsCount < 0) return 'Put in how many parts came off, a whole number.'
  if (c.remnants.some((r) => !(r.size > 0) || !Number.isInteger(r.pieces) || r.pieces < 1)) {
    return 'Every remnant needs a size and a whole number of pieces.'
  }
  if (c.jobId) {
    const job = (ws.jobs ?? []).find((j) => j.id === c.jobId)
    if (!job) return 'That job is not on the list.'
    if (job.closedOn) return `${job.no} is closed.`
  }
  const lot = cutLot(ws, c)
  if (!lot) return c.lotId ? 'That lot is not on the book.' : 'No one lot has that much on it — pick the lot it was cut from.'
  if (lot.itemId !== c.itemId) return 'That lot is of another material.'
  if (lot.usability !== 'usable') return `${lot.batchNo} is held — it cannot be cut until it is released.`
  if (lot.qty + 1e-9 < c.inputQty) return `Only ${round3(lot.qty)} is on ${lot.batchNo}.`
  if (!cutBalances(asCut(c, lot.id))) {
    const sum = round3(c.partsQty + c.kerfQty + c.remnants.reduce((a, r) => a + r.size * r.pieces, 0))
    return `It does not add up: parts + kerf + remnants come to ${sum}, and ${round3(c.inputQty)} went on the table.`
  }
  return null
}

/**
 * A cut, written: the input comes off its lot as one movement; each usable
 * remnant size comes back as a flagged lot on its rack; kerf and scrap at the
 * cut are losses inside that movement. Refuses exactly when `cutProblem` says.
 */
export function recordCut(ws: Workspace, c: CutInput): [Workspace, string] {
  if (cutProblem(ws, c)) return [ws, '']
  const lot = cutLot(ws, c)!
  const job = c.jobId ? (ws.jobs ?? []).find((j) => j.id === c.jobId) : undefined
  const [w0, id] = issueId(ws, 'CT')
  const cutNo = nextNo('CUT', (ws.cuts ?? []).map((x) => ({ no: x.cutNo })))
  const [w1, moveId] = post(w0, {
    lotId: lot.id, itemId: c.itemId, on: c.on, kind: 'issue', qty: -round3(c.inputQty),
    source: 'cut', sourceRef: cutNo, actor: c.operator, jobId: c.jobId,
    note: `on the table${job ? ` for ${job.no}` : ''}`,
  })
  if (!moveId) return [ws, '']
  let w = w1

  const losses: Omit<WsLoss, 'id'>[] = []
  for (const r of c.remnants) {
    const qty = round3(r.size * r.pieces)
    if (isUsableRemnant(w, c.itemId, r.size)) {
      ;[w] = newLot(w, {
        itemId: c.itemId, batchNo: `${cutNo} ${r.spec || `${r.size} ${ws.items.find((i) => i.id === c.itemId)?.uom ?? ''} pieces`}`.trim(),
        usability: 'usable', remnant: true, size: r.size, pieces: r.pieces, spec: r.spec || undefined,
        cutId: id, rack: c.rack || undefined, on: c.on,
      }, {
        on: c.on, kind: 'offcut_in', qty, source: 'cut', sourceRef: cutNo, actor: c.operator, jobId: c.jobId,
      })
    } else {
      losses.push({
        on: c.on, itemId: c.itemId, lotId: lot.id, qty, cause: 'cut_offcut_scrap', source: 'cut',
        sourceRef: cutNo, workOrder: job?.no, jobId: c.jobId, recoveryRate: scrapRateOf(w, c.itemId),
        actor: c.operator, note: `${r.pieces} × ${r.size} — under the smallest usable piece`,
      })
    }
  }
  if (c.kerfQty > 0) {
    losses.push({
      on: c.on, itemId: c.itemId, lotId: lot.id, qty: round3(c.kerfQty), cause: 'cut_kerf', source: 'cut',
      sourceRef: cutNo, workOrder: job?.no, jobId: c.jobId, recoveryRate: 0, actor: c.operator,
    })
  }
  for (const l of losses) {
    const [next, lossId] = issueId(w, 'LS')
    w = { ...next, losses: [...(next.losses ?? []), { ...l, id: lossId }] }
  }

  const cut: WsCut = {
    ...asCut(c, lot.id), id, cutNo, workOrder: job?.no ?? 'floor', jobId: c.jobId, rack: c.rack || undefined,
  }
  return [{ ...w, cuts: [...(w.cuts ?? []), cut] }, id]
}

/** Why a cut cannot be taken back: a remnant it made has been used since. */
export function removeCutProblem(ws: Workspace, cutId: string): string | null {
  const cut = (ws.cuts ?? []).find((c) => c.id === cutId)
  if (!cut) return null
  const made = ws.stockLots.filter((l) => l.cutId === cutId).map((l) => l.id)
  if ((ws.moves ?? []).some((m) => made.includes(m.lotId) && m.sourceRef !== cut.cutNo)) {
    return 'A remnant it made has been used or moved since. Take that back first.'
  }
  return null
}

/** A cut taken back — mis-keyed. The input goes back on its lot; its remnants and losses go. */
export function removeCut(ws: Workspace, cutId: string): Workspace {
  const cut = (ws.cuts ?? []).find((c) => c.id === cutId)
  if (!cut || removeCutProblem(ws, cutId)) return ws
  const made = new Set(ws.stockLots.filter((l) => l.cutId === cutId).map((l) => l.id))
  const moves = (ws.moves ?? []).filter((m) => !(m.source === 'cut' && m.sourceRef === cut.cutNo))
  const back = (ws.moves ?? []).filter((m) => m.source === 'cut' && m.sourceRef === cut.cutNo && !made.has(m.lotId))
  return {
    ...ws,
    moves,
    stockLots: ws.stockLots.filter((l) => !made.has(l.id)).map((l) => {
      const d = back.filter((m) => m.lotId === l.id).reduce((a, m) => a + m.qty, 0)
      return d ? { ...l, qty: round3(l.qty - d) } : l
    }),
    transfers: (ws.transfers ?? []).filter((t) => !made.has(t.lotId)),
    losses: (ws.losses ?? []).filter((l) => !(l.source === 'cut' && l.sourceRef === cut.cutNo)),
    cuts: (ws.cuts ?? []).filter((c) => c.id !== cutId),
  }
}

/* ----------------------------------------------------- using a remnant -- */

/** How much a number of pieces of a remnant is — exact where the piece size is known. */
export function piecesQty(lot: WsLot, pieces: number): number {
  if (lot.size) return round3(lot.size * pieces)
  const per = lot.pieces ? lot.qty / lot.pieces : 0
  return round3(per * pieces)
}

export interface UseRemnant { lotId: string; pieces: number; jobId: string; on: string; actor: string }

export function useRemnantProblem(ws: Workspace, u: UseRemnant): string | null {
  const lot = lotOf(ws, u.lotId)
  if (!lot || !isRemnant(lot)) return 'That is not a remnant on the book.'
  const job = (ws.jobs ?? []).find((j) => j.id === u.jobId)
  if (!job) return 'Pick the job it goes to.'
  if (job.closedOn) return `${job.no} is closed.`
  const have = lot.pieces ?? 0
  if (!Number.isInteger(u.pieces) || u.pieces < 1) return 'Put in how many pieces, a whole number.'
  if (have && u.pieces > have) return `There are only ${have} pieces.`
  if (piecesQty(lot, u.pieces) > lot.qty + 1e-9) return `Only ${round3(lot.qty)} is on it.`
  return null
}

/**
 * Remnant pieces into a job — the buy it saves. A slip like any issue, so the
 * job's sheet carries it, and a remnant movement off the flagged lot.
 */
export function useRemnant(ws: Workspace, u: UseRemnant): [Workspace, string] {
  if (useRemnantProblem(ws, u)) return [ws, '']
  const lot = lotOf(ws, u.lotId)!
  const job = (ws.jobs ?? []).find((j) => j.id === u.jobId)!
  const qty = Math.min(piecesQty(lot, u.pieces), lot.qty)
  const [w0, id] = issueId(ws, 'IS')
  const no = nextNo('IS', w0.issues ?? [])
  const [w1, moveId] = post(w0, {
    lotId: lot.id, itemId: lot.itemId, on: u.on, kind: 'offcut_issue', qty: -qty,
    source: 'job', sourceRef: no, actor: u.actor, jobId: u.jobId,
    note: `${u.pieces} piece${u.pieces === 1 ? '' : 's'} to ${job.no}`,
  })
  if (!moveId) return [ws, '']
  const slip: IssueSlip = {
    id, no, kind: 'issue', jobId: u.jobId, on: u.on, takenBy: u.actor, actor: u.actor,
    note: 'remnant pieces', lines: [{ lotId: lot.id, itemId: lot.itemId, qty, pieces: u.pieces }],
  }
  return [{
    ...w1,
    stockLots: w1.stockLots.map((l) => (l.id === lot.id && l.pieces ? { ...l, pieces: Math.max(0, l.pieces - u.pieces) } : l)),
    issues: [...(w1.issues ?? []), slip],
  }, id]
}

export interface ScrapRemnant { lotId: string; pieces: number; on: string; actor: string; note: string }

export function scrapRemnantProblem(ws: Workspace, s: ScrapRemnant): string | null {
  const lot = lotOf(ws, s.lotId)
  if (!lot || !isRemnant(lot)) return 'That is not a remnant on the book.'
  if (!Number.isInteger(s.pieces) || s.pieces < 1) return 'Put in how many pieces, a whole number.'
  if (lot.pieces && s.pieces > lot.pieces) return `There are only ${lot.pieces} pieces.`
  if (s.note.trim().length < 3) return 'Say why — too old, too small to use, damaged.'
  return null
}

/**
 * Remnant pieces scrapped by decision — offered up when they aged past the
 * rule, never scrapped on their own. Off the book as a write-off, on the
 * loss ledger as scrap at the cut, with what the dealer pays for it.
 */
export function scrapRemnant(ws: Workspace, s: ScrapRemnant): [Workspace, string] {
  if (scrapRemnantProblem(ws, s)) return [ws, '']
  const lot = lotOf(ws, s.lotId)!
  const qty = Math.min(piecesQty(lot, s.pieces), lot.qty)
  const [w0, lossId] = issueId(ws, 'LS')
  const [w1, moveId] = post(w0, {
    lotId: lot.id, itemId: lot.itemId, on: s.on, kind: 'write_off', qty: -qty,
    source: 'loss', sourceRef: lossId, actor: s.actor, note: s.note.trim(),
  })
  if (!moveId) return [ws, '']
  const loss: WsLoss = {
    id: lossId, on: s.on, itemId: lot.itemId, lotId: lot.id, qty, cause: 'cut_offcut_scrap',
    source: 'loss', sourceRef: lossId, recoveryRate: scrapRateOf(ws, lot.itemId), actor: s.actor,
    note: s.note.trim(),
  }
  return [{
    ...w1,
    stockLots: w1.stockLots.map((l) => (l.id === lot.id && l.pieces ? { ...l, pieces: Math.max(0, l.pieces - s.pieces) } : l)),
    losses: [...(w1.losses ?? []), loss],
  }, lossId]
}

/* -------------------------------------------------------------- reading -- */

export interface OffcutRow {
  lot: WsLot
  item?: Item
  rack?: Rack
  uom: string
  pieces?: number
  age: Derived
  aged: boolean
  value: number
  from?: string
  job?: string
}

/** Every remnant with something on it — cut or returned — oldest first. */
export function offcutRows(ws: Workspace, today: string): OffcutRow[] {
  return ws.stockLots.filter((l) => isRemnant(l) && l.qty > 0)
    .map((lot) => {
      const item = ws.items.find((i) => i.id === lot.itemId)
      const age = remnantAgeDays(lot.on ?? today, today)
      const cut = lot.cutId ? (ws.cuts ?? []).find((c) => c.id === lot.cutId) : undefined
      const made = (ws.moves ?? []).find((m) => m.lotId === lot.id && m.kind === 'offcut_in')
      const jobId = cut?.jobId ?? made?.jobId
      return {
        lot, item, uom: item?.uom ?? '',
        rack: lot.rack ? (ws.racks ?? []).find((r) => r.id === lot.rack) : undefined,
        pieces: lot.pieces ?? (lot.size ? Math.round(lot.qty / lot.size) : undefined),
        age,
        aged: age.value > ws.policy.remnantAgeDays,
        value: round3(lot.qty * (item?.lastPurchaseRate ?? 0)),
        from: cut?.cutNo ?? made?.sourceRef,
        job: jobId ? (ws.jobs ?? []).find((j) => j.id === jobId)?.no : undefined,
      }
    })
    .sort((a, b) => (a.lot.on ?? '').localeCompare(b.lot.on ?? '') || a.lot.id.localeCompare(b.lot.id))
}

export interface CutRow {
  cut: WsCut
  item?: Item
  job?: Job
  batch: string
  yielded: Derived
  planned: Derived
  shortfall: Derived
  belowPlan: boolean
  noted: boolean
  usable: number
  scrap: number
  balances: boolean
}

export function cutRows(ws: Workspace): CutRow[] {
  return [...(ws.cuts ?? [])]
    .sort((a, b) => b.on.localeCompare(a.on) || b.id.localeCompare(a.id))
    .map((cut) => {
      const shortfall = yieldShortfall(cut)
      // what was written at the cut, not the rule today: a smallest piece changed since does not rewrite it
      const kept = round3((ws.moves ?? []).filter((m) => m.kind === 'offcut_in' && m.source === 'cut'
        && m.sourceRef === cut.cutNo).reduce((a, m) => a + m.qty, 0))
      const binned = round3((ws.losses ?? []).filter((l) => l.cause === 'cut_offcut_scrap' && l.source === 'cut'
        && l.sourceRef === cut.cutNo).reduce((a, l) => a + l.qty, 0))
      return {
        cut,
        item: ws.items.find((i) => i.id === cut.itemId),
        job: cut.jobId ? (ws.jobs ?? []).find((j) => j.id === cut.jobId) : undefined,
        batch: lotOf(ws, cut.lotId)?.batchNo ?? cut.lotId,
        yielded: cutYield(cut),
        planned: plannedYield(cut),
        shortfall,
        belowPlan: shortfall.value > ws.policy.yieldTolerancePct,
        noted: ws.drafts[cutNotedKey(cut.id)] === true,
        usable: kept,
        scrap: binned,
        balances: cutBalances(cut),
      }
    })
}

export interface RemnantEffect {
  order: PurchaseOrder
  item: Item
  remnant: number
  effect: OffcutEffect
  /** the same arithmetic with no remnant — what the order should be anyway */
  without: OffcutEffect
  /**
   * The remnants, and nothing else, bring the order down: it rounds lower with
   * them than without. An order already above its need, remnants or not, is a
   * buying question, not a cutting one.
   */
  moves: boolean
  noted: boolean
}

/**
 * Draft orders for a material whose remnants could cover some of it — the
 * buy about to happen twice. The domain's own arithmetic: the remnant nets
 * off the need, never the cover, and MOQ rounding is applied again, so an
 * order the MOQ swallows is said to stay as it is.
 */
export function remnantEffects(ws: Workspace, today: string): RemnantEffect[] {
  const drafts = ws.orders.filter((o) => o.state === 'draft' && remnantOnHand(ws, o.itemId) > 0)
  if (drafts.length === 0 || !today) return []
  const rows = buildRows(bundleFor(ws, today), ws.policy)
  return drafts.flatMap((order) => {
    const item = ws.items.find((i) => i.id === order.itemId)
    const row = rows.find((r) => r.item.id === order.itemId)
    if (!item || !row) return []
    const remnant = remnantOnHand(ws, order.itemId)
    const run = (offcut: number) => offcutEffect(
      row.reorderPoint.value, ws.policy.cycleDays[item.itemClass], item.avgDailyConsumption,
      row.truePosition.value, Math.max(1, item.moq), order.qty, offcut, item.uom,
    )
    const effect = run(remnant)
    const without = run(0)
    return [{
      order, item, remnant, effect, without,
      moves: effect.reducedBy > 0 && effect.revisedQty.value < without.revisedQty.value,
      noted: ws.drafts[remnantNotedKey(order.no, order.itemId)] === true,
    }]
  })
}
