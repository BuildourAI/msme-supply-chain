/**
 * The store's book.
 *
 * A lot's quantity is a balance, not a number somebody typed: every change to
 * it is a movement against the document that made it — a receipt closed at the
 * gate, a slip issued to a job, a challan out to a jobworker, a count, a
 * write-off. `lot.qty` is kept, because ten readers across three stages sum
 * it, but nothing writes it except `post` below, which writes the movement in
 * the same breath. Σ movements per lot = `lot.qty`, and the tests hold every
 * writer to that.
 *
 * So "why is the book 40 short?" always has an answer, and it is on a list.
 */
import { daysSinceConfirmed, isStale, lastConfirmed, MOVEMENT_LABEL, valueAt } from '@/lib/domain/inventory'
import type { Derived, Item, ItemClass, MovementKind, Usability } from '@/lib/domain/types'
import { issueId } from './defaults'
import type {
  Challan, GoodsReceipt, Rack, StockMove, WsCount, WsLot, Workspace,
} from './types'

export const round3 = (n: number) => Math.round(n * 1000) / 1000

export type MoveInput = Omit<StockMove, 'id'>

/* ------------------------------------------------------------ which lots -- */

/**
 * Lots written before the journal existed that were never a pile on a rack:
 * the negative lot a jobwork send-out used to write, and the signed
 * correction a recount used to write. They still count — they are what made
 * the material's total right — but nobody can walk to them, so they are never
 * placed, counted or issued from.
 */
export const isCorrection = (l: WsLot): boolean =>
  l.id.startsWith('LOT-JW-') || l.batchNo.startsWith('COUNT-')

export const isPhysical = (l: WsLot): boolean => !isCorrection(l)

export const isRemnant = (l: WsLot): boolean => l.remnant === true

/**
 * What the desk may count as cover: everything but remnants.
 *
 * A remnant is stock, and it is on the ledger, but three short ends are not
 * three metres of fabric for a lay that needs one long piece. The domain says
 * so of offcuts — they are offered against an order, never assumed to be one
 * — so the reorder point, the jobwork check and the board read this.
 */
export const coverLots = (ws: Workspace): WsLot[] => ws.stockLots.filter((l) => !isRemnant(l))

/** Usable stock of a material right now, less remnants — what can go out. */
export const usableOnHand = (ws: Workspace, itemId: string): number =>
  round3(coverLots(ws)
    .filter((l) => l.itemId === itemId && l.usability === 'usable')
    .reduce((a, l) => a + l.qty, 0))

export const remnantOnHand = (ws: Workspace, itemId: string): number =>
  round3(ws.stockLots
    .filter((l) => l.itemId === itemId && isRemnant(l) && l.usability === 'usable')
    .reduce((a, l) => a + l.qty, 0))

export const lotOf = (ws: Workspace, lotId: string): WsLot | undefined =>
  ws.stockLots.find((l) => l.id === lotId)

export const movesOf = (ws: Workspace, lotId: string): StockMove[] =>
  (ws.moves ?? []).filter((m) => m.lotId === lotId)
    .sort((a, b) => a.on.localeCompare(b.on) || a.id.localeCompare(b.id))

/* ------------------------------------------------------------ the writer -- */

/** Movements that draw stock for use, and so need it usable. */
const DRAWS = new Set<MovementKind>(['issue', 'jobwork_out', 'offcut_issue'])

/** Why a movement cannot be written, or null. */
export function postProblem(ws: Workspace, m: MoveInput): string | null {
  const lot = lotOf(ws, m.lotId)
  if (!lot) return 'That lot is not in the book.'
  if (lot.itemId !== m.itemId) return 'That lot is of another material.'
  if (!Number.isFinite(m.qty) || m.qty === 0) return 'A movement has a quantity.'
  if (!m.sourceRef) return 'Every movement names the document behind it.'
  if (m.qty < 0) {
    if (-m.qty > lot.qty + 1e-9) {
      return `Only ${round3(Math.max(0, lot.qty))} is on ${lot.batchNo} — more than that cannot come off it.`
    }
    if (DRAWS.has(m.kind) && lot.usability !== 'usable') {
      return `${lot.batchNo} is held — it cannot be issued or sent out until it is released.`
    }
  }
  return null
}

/**
 * The only way a lot's quantity changes: the movement is appended and its
 * signed quantity applied, together. Refuses — returns the workspace
 * unchanged and an empty id — exactly when `postProblem` says so.
 */
export function post(ws: Workspace, m: MoveInput): [Workspace, string] {
  if (postProblem(ws, m)) return [ws, '']
  const [w, id] = issueId(ws, 'MV')
  return [{
    ...w,
    moves: [...(w.moves ?? []), { ...m, id }],
    stockLots: w.stockLots.map((l) => (l.id === m.lotId ? { ...l, qty: round3(l.qty + m.qty) } : l)),
  }, id]
}

/** Several movements as one: all of them, or none. */
export function postMany(ws: Workspace, ms: MoveInput[]): [Workspace, string[]] {
  let w = ws
  const ids: string[] = []
  for (const m of ms) {
    const [next, id] = post(w, m)
    if (!id) return [ws, []]
    w = next
    ids.push(id)
  }
  return [w, ids]
}

/** A lot id nobody has had, whatever has been deleted since. */
export function issueLotId(ws: Workspace): [Workspace, string] {
  let [w, id] = issueId(ws, 'LOT')
  while (ws.stockLots.some((l) => l.id === id)) [w, id] = issueId(w, 'LOT')
  return [w, id]
}

/**
 * A lot coming into being, with the movement that brought it.
 *
 * Written at nothing and then posted, so even a lot's first quantity is a line
 * in the journal. An id may be given — a receipt's lots are named for the
 * receipt — and otherwise one is issued.
 */
export function newLot(
  ws: Workspace,
  lot: Omit<WsLot, 'qty' | 'id'> & { id?: string },
  first: Omit<MoveInput, 'lotId' | 'itemId'>,
): [Workspace, string] {
  if (!Number.isFinite(first.qty) || first.qty <= 0) return [ws, '']
  let w = ws
  let id = lot.id
  if (id) {
    if (lotOf(ws, id)) return [ws, '']
  } else {
    [w, id] = issueLotId(ws)
  }
  const born: WsLot = { ...lot, id, qty: 0, on: lot.on ?? first.on }
  const [posted, moveId] = post(
    { ...w, stockLots: [...w.stockLots, born] },
    { ...first, lotId: id, itemId: lot.itemId },
  )
  return moveId ? [posted, id] : [ws, '']
}

/**
 * Taking movements back — a receipt deleted, a slip mis-keyed, an import
 * undone. The matching lines go and their quantities come off the lots they
 * were on, so the book is exactly as if they had never been written.
 */
export function reverse(ws: Workspace, pred: (m: StockMove) => boolean): Workspace {
  const gone = (ws.moves ?? []).filter(pred)
  if (gone.length === 0) return ws
  const delta = new Map<string, number>()
  for (const m of gone) delta.set(m.lotId, (delta.get(m.lotId) ?? 0) + m.qty)
  return {
    ...ws,
    moves: (ws.moves ?? []).filter((m) => !pred(m)),
    stockLots: ws.stockLots.map((l) => (delta.has(l.id) ? { ...l, qty: round3(l.qty - delta.get(l.id)!) } : l)),
  }
}

/** Lots gone for good, with every line, count and rack move that hung off them. */
export function dropLots(ws: Workspace, pred: (l: WsLot) => boolean): Workspace {
  const gone = new Set(ws.stockLots.filter(pred).map((l) => l.id))
  if (gone.size === 0) return ws
  return {
    ...ws,
    stockLots: ws.stockLots.filter((l) => !gone.has(l.id)),
    moves: (ws.moves ?? []).filter((m) => !gone.has(m.lotId)),
    transfers: (ws.transfers ?? []).filter((t) => !gone.has(t.lotId)),
    counts: (ws.counts ?? []).filter((c) => !gone.has(c.lotId)),
  }
}

/**
 * Which lots a quantity comes off: the oldest usable first, remnants never —
 * or the one lot somebody picked, which then has to cover it alone. Null when
 * there is not enough.
 */
export function allocate(
  ws: Workspace, itemId: string, qty: number, pick?: { lotId?: string },
): { lotId: string; qty: number }[] | null {
  if (!Number.isFinite(qty) || qty <= 0) return null
  if (pick?.lotId) {
    const l = lotOf(ws, pick.lotId)
    if (!l || l.itemId !== itemId || l.usability !== 'usable' || l.qty + 1e-9 < qty) return null
    return [{ lotId: l.id, qty: round3(qty) }]
  }
  const lots = fifo(ws, itemId)
  const out: { lotId: string; qty: number }[] = []
  let left = qty
  for (const l of lots) {
    if (left <= 1e-9) break
    const take = round3(Math.min(l.qty, left))
    out.push({ lotId: l.id, qty: take })
    left = round3(left - take)
  }
  return left > 1e-9 ? null : out
}

/** Usable, physical, non-remnant lots of a material with something on them, oldest first. */
export const fifo = (ws: Workspace, itemId: string): WsLot[] =>
  ws.stockLots
    .filter((l) => l.itemId === itemId && l.usability === 'usable' && l.qty > 0
      && isPhysical(l) && !isRemnant(l))
    .sort((a, b) => (a.on ?? '').localeCompare(b.on ?? '') || a.id.localeCompare(b.id))

/* -------------------------------------------------- lots saved before it -- */

interface OpeningCtx {
  lots: WsLot[]
  moves: StockMove[]
  receipts: GoodsReceipt[]
  challans: Challan[]
  createdAt: string
  actor: string
}

const DATE_AT_END = /(\d{4}-\d{2}-\d{2})$/

/** The day a lot came to be, for one saved before lots carried a date. */
export function lotDate(lot: WsLot, ctx: Pick<OpeningCtx, 'receipts' | 'challans' | 'createdAt'>): string {
  if (lot.on) return lot.on
  const gr = /^LOT-(GR-\d+)/.exec(lot.id)
  if (gr) {
    const r = ctx.receipts.find((x) => x.id === gr[1])
    if (r) return r.closedAt ?? r.receivedOn
  }
  const jw = /^LOT-(JW-\d+)$/.exec(lot.id)
  if (jw) {
    const c = ctx.challans.find((x) => x.id === jw[1])
    if (c) return c.sentOn
  }
  const at = DATE_AT_END.exec(lot.batchNo) ?? /(\d{4}-\d{2}-\d{2})/.exec(lot.batchNo)
  return at?.[1] ?? ctx.createdAt.slice(0, 10)
}

/**
 * One movement for every lot saved before the journal existed, so the book
 * adds up from the first load.
 *
 * `migrate` runs on every load, so the ids are the lot's own — `MV-OPEN-…` —
 * never the counter: a second load finds the line already there and writes
 * nothing. Each is named for what the lot actually was, as far as its id
 * says: a receipt's lot opens as that receipt, a jobwork send-out's negative
 * lot as that challan, a recount's correction as that count.
 */
export function openingMovesFor(ctx: OpeningCtx): StockMove[] {
  const moved = new Set(ctx.moves.map((m) => m.lotId))
  const out: StockMove[] = []
  for (const lot of ctx.lots) {
    if (moved.has(lot.id) || !Number.isFinite(lot.qty) || lot.qty === 0) continue
    const on = lotDate(lot, ctx)
    const base = { id: `MV-OPEN-${lot.id}`, lotId: lot.id, itemId: lot.itemId, on, qty: lot.qty, actor: ctx.actor }
    const gr = /^LOT-(GR-\d+)/.exec(lot.id)
    const jw = /^LOT-(JW-\d+)$/.exec(lot.id)
    if (gr) {
      const r = ctx.receipts.find((x) => x.id === gr[1])
      out.push({ ...base, kind: r?.challanId ? 'jobwork_return' : 'receipt', source: 'grn', sourceRef: gr[1] })
    } else if (jw) {
      const c = ctx.challans.find((x) => x.id === jw[1])
      out.push({ ...base, kind: 'jobwork_out', source: 'challan', sourceRef: c?.no ?? jw[1] })
    } else if (lot.batchNo.startsWith('COUNT-')) {
      out.push({ ...base, kind: 'count_adjust', source: 'count', sourceRef: lot.batchNo })
    } else {
      out.push({ ...base, kind: 'opening', source: 'opening', sourceRef: 'before the ledger' })
    }
  }
  return out
}

/* -------------------------------------------------------------- reading -- */

export interface LotRow {
  lot: WsLot
  item?: Item
  rack?: Rack
  uom: string
  cls: ItemClass
  moves: StockMove[]
  counts: WsCount[]
  lastCount?: WsCount
  /** counted − book at the last count; null when never counted */
  difference: number | null
  confirmed: Derived<string>
  sinceConfirmed: Derived
  /** past its class's counting cadence, with something on it to count */
  due: boolean
  value: Derived
  correction: boolean
  /** the documents behind it, in the order they happened */
  docs: string[]
}

export function lotRow(ws: Workspace, lot: WsLot, today: string): LotRow {
  const item = ws.items.find((i) => i.id === lot.itemId)
  const uom = item?.uom ?? ''
  const cls: ItemClass = item?.itemClass ?? 'C'
  const moves = movesOf(ws, lot.id)
  const counts = (ws.counts ?? []).filter((c) => c.lotId === lot.id)
    .sort((a, b) => a.on.localeCompare(b.on) || a.id.localeCompare(b.id))
  const lastCount = counts[counts.length - 1]
  const confirmed = lastConfirmed(moves, counts, lot.on ?? today)
  const sinceConfirmed = daysSinceConfirmed(confirmed.value, today || confirmed.value)
  const correction = isCorrection(lot)
  const docs = [...new Set(moves.filter((m) => m.source !== 'opening').map((m) => m.sourceRef))]
  return {
    lot, item, uom, cls, moves, counts, lastCount,
    rack: lot.rack ? (ws.racks ?? []).find((r) => r.id === lot.rack) : undefined,
    difference: lastCount ? round3(lastCount.countedQty - lastCount.bookQty) : null,
    confirmed,
    sinceConfirmed,
    due: !!today && !correction && lot.qty > 0 && isStale(sinceConfirmed.value, cls, ws.policy),
    value: valueAt(lot.qty, item?.lastPurchaseRate ?? 0, uom, 'Value at last purchase price'),
    correction,
    docs,
  }
}

/** Every lot with something on it (or a count history), by material then age. */
export function lotRows(ws: Workspace, today: string): LotRow[] {
  const name = (id: string) => ws.items.find((i) => i.id === id)?.name ?? ''
  return ws.stockLots
    .filter((l) => l.qty !== 0 || (ws.counts ?? []).some((c) => c.lotId === l.id))
    .map((l) => lotRow(ws, l, today))
    .sort((a, b) => name(a.lot.itemId).localeCompare(name(b.lot.itemId))
      || (a.lot.on ?? '').localeCompare(b.lot.on ?? '') || a.lot.id.localeCompare(b.lot.id))
}

/* ------------------------------------------------------------ the trail -- */

export interface TrailEntry {
  on: string
  what: string
  doc: string
  /** signed; absent on a rack move */
  qty?: number
  balance: number
  actor: string
  note?: string
  kind: MovementKind | 'transfer'
}

export const STATE_WORD: Record<Usability, string> = {
  usable: 'Usable', qc_hold: 'On hold', damaged: 'Damaged', expired: 'Expired',
}

const rackName = (ws: Workspace, id?: string) =>
  (id ? (ws.racks ?? []).find((r) => r.id === id)?.name : undefined) ?? 'no rack'

/**
 * One lot's history, oldest first, with the balance after every line — which
 * ends, always, at the lot's quantity. Rack moves sit between the movements
 * in the order they happened, carrying the balance through unchanged.
 */
export function trail(ws: Workspace, lotId: string): TrailEntry[] {
  const rows: { on: string; order: string; entry: Omit<TrailEntry, 'balance'> }[] = []
  for (const m of movesOf(ws, lotId)) {
    rows.push({
      on: m.on, order: m.id,
      entry: {
        on: m.on, what: MOVEMENT_LABEL[m.kind], doc: m.sourceRef, qty: m.qty,
        actor: m.actor, note: m.note, kind: m.kind,
      },
    })
  }
  for (const t of (ws.transfers ?? []).filter((x) => x.lotId === lotId)) {
    rows.push({
      on: t.on, order: t.id,
      entry: {
        on: t.on,
        what: t.state
          ? (t.state.to === 'usable' ? `Released — ${STATE_WORD[t.state.from].toLowerCase()} no longer`
            : `Put ${STATE_WORD[t.state.to].toLowerCase()}`)
          : `Moved ${rackName(ws, t.from)} → ${rackName(ws, t.to)}`,
        doc: t.id, actor: t.actor, note: t.state?.note, kind: 'transfer',
      },
    })
  }
  rows.sort((a, b) => a.on.localeCompare(b.on) || a.order.localeCompare(b.order))
  let balance = 0
  return rows.map((r) => {
    if (r.entry.qty !== undefined) balance = round3(balance + r.entry.qty)
    return { ...r.entry, balance }
  })
}

/** Lots whose quantity is not what their movements add up to — never, if every writer posts. */
export const drift = (ws: Workspace): WsLot[] =>
  ws.stockLots.filter((l) => round3(movesOf(ws, l.id).reduce((a, m) => a + m.qty, 0)) !== round3(l.qty))

