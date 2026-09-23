/**
 * Counting the store: what the book says against what is on the rack.
 *
 * A count is its own record — the book at that moment beside what somebody
 * saw — and a difference is never written over the balance. It posts a count
 * adjustment against the count, so the book follows the rack and the history
 * says it was wrong and by how much. A shortfall is also a loss, with a cause:
 * material that was on the book and is not on the rack is gone, and "gone" is
 * money.
 *
 * Record accuracy — how often the book is right when somebody checks — is
 * then a measurement, and a count outside its class's tolerance is raised on
 * the dashboard rather than slipping in with the rest.
 */
import { countVariance, countVariancePct, isCountOverTolerance } from '@/lib/domain/inventory'
import type { Derived, Item, ItemClass, Usability } from '@/lib/domain/types'
import { issueId } from './defaults'
import { isCorrection, lotOf, lotRows, newLot, post, round3, type LotRow } from './ledger'
import type { Rack, Workspace, WsCount, WsLoss } from './types'

export const varianceNotedKey = (countId: string) => `inventory.varianceNoted.${countId}`

export interface Recount {
  lotId: string
  countedQty: number
  on: string
  counter: string
  note?: string
  /** the walk it was part of — a rack, or a material in a store with no racks */
  sheet?: string
}

/** Why a lot cannot be counted as described, or null. */
export function recountProblem(ws: Workspace, r: Recount): string | null {
  const lot = lotOf(ws, r.lotId)
  if (!lot) return 'That lot is not in the book.'
  if (isCorrection(lot)) return 'That is a correction line from before lots were counted one by one — there is nothing on a rack to count.'
  if (!Number.isFinite(r.countedQty) || r.countedQty < 0) return 'Put in what is on the rack — a number, or nought if it is empty.'
  if (r.on.length !== 10) return 'Put in the day it was counted.'
  if (round3(r.countedQty - lot.qty) !== 0 && (r.note ?? '').trim().length < 3) {
    return 'The count differs from the book — say what you found, in a few words.'
  }
  return null
}

/**
 * One lot counted.
 *
 * Writes the count with the book as it stood, then — only if they differ — a
 * count adjustment for the difference, and for a shortfall a count-shortage
 * loss carrying the lost quantity. Refuses exactly when `recountProblem` says.
 */
export function recount(ws: Workspace, r: Recount): [Workspace, string] {
  if (recountProblem(ws, r)) return [ws, '']
  const lot = lotOf(ws, r.lotId)!
  const [issued, id] = issueId(ws, 'CC')
  let w = issued
  const count: WsCount = {
    id, lotId: lot.id, itemId: lot.itemId, on: r.on,
    countedQty: round3(r.countedQty), bookQty: lot.qty, counter: r.counter,
    note: r.note?.trim() || undefined, rack: lot.rack, sheet: r.sheet,
  }
  w = { ...w, counts: [...(w.counts ?? []), count] }
  const diff = round3(r.countedQty - lot.qty)
  if (diff === 0) return [w, id]

  const [moved, moveId] = post(w, {
    lotId: lot.id, itemId: lot.itemId, on: r.on, kind: 'count_adjust', qty: diff,
    source: 'count', sourceRef: id, actor: r.counter,
    note: `Counted ${count.countedQty} against a book of ${lot.qty}${count.note ? ` — ${count.note}` : ''}`,
  })
  if (!moveId) return [ws, '']
  w = moved
  if (diff < 0) {
    const [w2, lossId] = issueId(w, 'LS')
    const loss: WsLoss = {
      id: lossId, on: r.on, itemId: lot.itemId, lotId: lot.id, qty: -diff,
      cause: 'count_shortage', source: 'count', sourceRef: id,
      // missing is missing: nothing to sell
      recoveryRate: 0, actor: r.counter, note: count.note,
    }
    w = { ...w2, losses: [...(w2.losses ?? []), loss] }
  }
  return [w, id]
}

export interface WalkRow { lotId: string; countedQty: number; note?: string }

/** The first row of a walk that cannot be written, named, or null. */
export function walkProblem(ws: Workspace, rows: WalkRow[], on: string, counter: string): string | null {
  if (rows.length === 0) return 'Put in what is on the rack for at least one lot.'
  for (const r of rows) {
    const why = recountProblem(ws, { ...r, on, counter })
    if (why) {
      const lot = lotOf(ws, r.lotId)
      const name = ws.items.find((i) => i.id === lot?.itemId)?.name ?? 'A lot'
      return `${name} · ${lot?.batchNo ?? r.lotId}: ${why}`
    }
  }
  return null
}

/**
 * A walk — one rack, or one material where there are no racks — counted and
 * closed as one. All of it, or none: a sheet half-written because row seven
 * had no note would be worse than the sheet coming back with the reason.
 */
export function walk(
  ws: Workspace, sheet: string, rows: WalkRow[], on: string, counter: string,
): [Workspace, string[]] {
  if (walkProblem(ws, rows, on, counter)) return [ws, []]
  let w = ws
  const ids: string[] = []
  for (const r of rows) {
    const [next, id] = recount(w, { ...r, on, counter, sheet })
    if (!id) return [ws, []]
    w = next
    ids.push(id)
  }
  return [w, ids]
}

export interface FoundLot {
  itemId: string
  qty: number
  on: string
  counter: string
  /** where it came from — always asked, because a lot from nowhere is a question */
  note: string
  rack?: string
  usability?: Usability
  reason?: string
  remnant?: boolean
  pieces?: number
}

export function foundProblem(ws: Workspace, f: FoundLot): string | null {
  if (!ws.items.some((i) => i.id === f.itemId)) return 'Pick the material it is.'
  if (!Number.isFinite(f.qty) || f.qty <= 0) return 'Put in how much there is.'
  if (f.remnant && f.pieces !== undefined && (!Number.isInteger(f.pieces) || f.pieces < 1)) {
    return 'Put in how many pieces, a whole number.'
  }
  if (f.note.trim().length < 3) return 'Say where it came from — found on a rack, returned, an opening lot.'
  if (f.usability && f.usability !== 'usable' && (f.reason ?? '').trim().length < 3) {
    return 'Say what is wrong with it.'
  }
  return null
}

/**
 * A lot the book did not know about — found on a rack, a remnant put back,
 * an opening lot missed at the first count. It opens as a count: the book
 * said nothing was there, somebody counted this much.
 */
export function addFoundLot(ws: Workspace, f: FoundLot): [Workspace, string] {
  if (foundProblem(ws, f)) return [ws, '']
  const [issued, countId] = issueId(ws, 'CC')
  let w = issued
  const held = f.usability && f.usability !== 'usable'
  const [made, lotId] = newLot(w, {
    itemId: f.itemId,
    batchNo: `${f.remnant ? 'REMNANT' : 'FOUND'}-${f.on}`,
    usability: f.usability ?? 'usable',
    usabilityReason: held ? f.reason?.trim() : undefined,
    rack: f.rack || undefined,
    on: f.on,
    ...(f.remnant ? { remnant: true as const, pieces: f.pieces } : {}),
  }, {
    on: f.on, kind: 'count_adjust', qty: round3(f.qty), source: 'count', sourceRef: countId,
    actor: f.counter, note: f.note.trim(),
  })
  if (!lotId) return [ws, '']
  w = made
  const lot = lotOf(w, lotId)!
  const count: WsCount = {
    id: countId, lotId, itemId: f.itemId, on: f.on, countedQty: round3(f.qty), bookQty: 0,
    counter: f.counter, note: f.note.trim(), rack: lot.rack,
  }
  return [{ ...w, counts: [...(w.counts ?? []), count] }, lotId]
}

/* -------------------------------------------------------------- reading -- */

export interface CountRow {
  count: WsCount
  item?: Item
  rack?: Rack
  batch: string
  uom: string
  cls: ItemClass
  variance: Derived
  pct: Derived
  over: boolean
  noted: boolean
  /** a later count of the same lot has since superseded this one */
  superseded: boolean
}

export function countRows(ws: Workspace): CountRow[] {
  const counts = [...(ws.counts ?? [])]
    .sort((a, b) => b.on.localeCompare(a.on) || b.id.localeCompare(a.id))
  const latest = new Map<string, string>()
  for (const c of counts) if (!latest.has(c.lotId)) latest.set(c.lotId, c.id)
  return counts.map((count) => {
    const item = ws.items.find((i) => i.id === count.itemId)
    const cls: ItemClass = item?.itemClass ?? 'C'
    const uom = item?.uom ?? ''
    return {
      count, item, uom, cls,
      rack: count.rack ? (ws.racks ?? []).find((r) => r.id === count.rack) : undefined,
      batch: lotOf(ws, count.lotId)?.batchNo ?? count.lotId,
      variance: countVariance(count, uom),
      pct: countVariancePct(count),
      // a lot found on a count had no book to be judged against
      over: count.bookQty !== 0 && isCountOverTolerance(count, cls, ws.policy),
      noted: ws.drafts[varianceNotedKey(count.id)] === true,
      superseded: latest.get(count.lotId) !== count.id,
    }
  })
}

/** Counts outside their class's tolerance nobody has looked at, and nothing has since recounted. */
export const openVariances = (ws: Workspace): CountRow[] =>
  countRows(ws).filter((r) => r.over && !r.noted && !r.superseded)

/** Lots past their counting date, with something on them. */
export const dueLots = (ws: Workspace, today: string): LotRow[] =>
  today ? lotRows(ws, today).filter((r) => r.due) : []

/**
 * What a walk covers: the lots on a rack, or — in a store with no racks — the
 * lots of one material. Only what has something on it; an empty lot is
 * history, not a pile.
 */
export function sheetLots(ws: Workspace, scope: { rackId?: string; itemId?: string }, today: string): LotRow[] {
  return lotRows(ws, today)
    .filter((r) => !r.correction && r.lot.qty > 0)
    .filter((r) => (scope.rackId ? r.lot.rack === scope.rackId : scope.itemId ? r.lot.itemId === scope.itemId : true))
}

/** The walk's name, which every count on it carries. */
export const sheetOf = (scope: { rackId?: string; itemId?: string }, on: string) =>
  `${scope.rackId ?? scope.itemId ?? 'store'}/${on}`

/**
 * The count sheet as rows, for paper: what is on the book and a blank to
 * write what is on the rack. The lot id comes back with a filled sheet, so it
 * is the first column and the one the reader matches on.
 */
export function sheetRows(ws: Workspace, lots: LotRow[]): string[][] {
  return [
    ['Lot', 'Material', 'Code', 'Batch', 'Rack', 'Book', 'Unit', 'Counted', 'Note'],
    ...lots.map((r) => [
      r.lot.id, r.item?.name ?? '', r.item?.code ?? '', r.lot.batchNo, r.rack?.name ?? '',
      String(r.lot.qty), r.uom, '', '',
    ]),
  ]
}

/**
 * A filled sheet read back: counted and note, by lot id. A row without a lot
 * id that names a batch this sheet has is matched on the batch instead. Rows
 * with nothing counted are left out — a blank is "not counted", never nought.
 */
export function readFilledSheet(
  rows: string[][], lots: LotRow[],
): { counted: Record<string, { qty: string; note: string }>; unmatched: number } {
  if (rows.length < 2) return { counted: {}, unmatched: 0 }
  const head = rows[0].map((h) => h.trim().toLowerCase())
  const col = (...names: string[]) => head.findIndex((h) => names.includes(h))
  const lotCol = col('lot', 'lot id')
  const batchCol = col('batch', 'batch no', 'lot no')
  const countedCol = col('counted', 'counted qty', 'physical', 'actual', 'rack qty')
  const noteCol = col('note', 'notes', 'remarks')
  const counted: Record<string, { qty: string; note: string }> = {}
  let unmatched = 0
  if (countedCol < 0) return { counted, unmatched: rows.length - 1 }
  for (const row of rows.slice(1)) {
    const qty = (row[countedCol] ?? '').trim().replace(/,/g, '')
    if (qty === '') continue
    const byId = lotCol >= 0 ? lots.find((l) => l.lot.id === (row[lotCol] ?? '').trim()) : undefined
    const byBatch = !byId && batchCol >= 0
      ? lots.find((l) => l.lot.batchNo === (row[batchCol] ?? '').trim()) : undefined
    const hit = byId ?? byBatch
    if (!hit) { unmatched += 1; continue }
    counted[hit.lot.id] = { qty, note: noteCol >= 0 ? (row[noteCol] ?? '').trim() : '' }
  }
  return { counted, unmatched }
}
