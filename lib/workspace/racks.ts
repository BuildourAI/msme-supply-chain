/**
 * Where things sit.
 *
 * One store, many racks — A-1, A-2, "Fabric wall", "Trims cupboard". A rack is
 * a name and nothing else; what makes it matter is that every lot is on one,
 * so a count can be walked rack by rack and a lot nobody can find shows up as
 * a lot on no rack.
 *
 * Moving a lot between racks changes no quantity, so it is not a movement in
 * the journal. It is a transfer of its own, kept so the lot's trail still
 * says where it has been.
 */
import { issueId } from './defaults'
import { isPhysical, lotRow } from './ledger'
import type { DeleteImpact } from './sourcing'
import type { Rack, Workspace, WsLot } from './types'

const norm = (s: string) => s.trim().replace(/\s+/g, ' ').toLowerCase()

export const rackOf = (ws: Workspace, lot: WsLot): Rack | undefined =>
  lot.rack ? (ws.racks ?? []).find((r) => r.id === lot.rack) : undefined

export const rackByName = (ws: Workspace, name: string): Rack | undefined =>
  (ws.racks ?? []).find((r) => norm(r.name) === norm(name))

/** Why a rack cannot be called this, or null. */
export function rackProblem(ws: Workspace, name: string, exceptId?: string): string | null {
  if (!name.trim()) return 'Give the rack a name — what is painted on it, or what people call it.'
  const clash = rackByName(ws, name)
  if (clash && clash.id !== exceptId) return `There is already a rack called ${clash.name}.`
  return null
}

export function addRack(ws: Workspace, input: { name: string; note?: string }): [Workspace, string] {
  if (rackProblem(ws, input.name)) return [ws, '']
  const [w, id] = issueId(ws, 'RK')
  const rack: Rack = { id, name: input.name.trim().replace(/\s+/g, ' '), note: input.note?.trim() || undefined }
  return [{ ...w, racks: [...(w.racks ?? []), rack] }, id]
}

export function updateRack(ws: Workspace, id: string, patch: { name?: string; note?: string }): Workspace {
  if (patch.name !== undefined && rackProblem(ws, patch.name, id)) return ws
  return {
    ...ws,
    racks: (ws.racks ?? []).map((r) => (r.id !== id ? r : {
      ...r,
      name: patch.name !== undefined ? patch.name.trim().replace(/\s+/g, ' ') : r.name,
      note: patch.note !== undefined ? (patch.note.trim() || undefined) : r.note,
    })),
  }
}

/** Lots on a rack, whatever is on them. */
export const lotsOn = (ws: Workspace, rackId: string): WsLot[] =>
  ws.stockLots.filter((l) => l.rack === rackId && isPhysical(l) && l.qty !== 0)

export function rackImpact(ws: Workspace, id: string): DeleteImpact {
  const n = lotsOn(ws, id).length
  return n === 0
    ? { losses: [], clean: true }
    : { losses: [`${n} ${n === 1 ? 'lot goes' : 'lots go'} back to no rack — the stock itself stays`], clean: false }
}

/** A rack taken away. What was on it stays on the book, on no rack. */
export function removeRack(ws: Workspace, id: string, on: string, actor: string): Workspace {
  let w = ws
  for (const l of ws.stockLots.filter((x) => x.rack === id)) w = placeLot(w, l.id, undefined, on, actor)
  return { ...w, racks: (w.racks ?? []).filter((r) => r.id !== id) }
}

/** A lot put on a rack, or taken off one, with the move kept on its trail. */
export function placeLot(
  ws: Workspace, lotId: string, rackId: string | undefined, on: string, actor: string,
): Workspace {
  const lot = ws.stockLots.find((l) => l.id === lotId)
  if (!lot || (lot.rack ?? undefined) === (rackId || undefined)) return ws
  if (rackId && !(ws.racks ?? []).some((r) => r.id === rackId)) return ws
  const [w, id] = issueId(ws, 'TR')
  return {
    ...w,
    stockLots: w.stockLots.map((l) => (l.id === lotId ? { ...l, rack: rackId || undefined } : l)),
    transfers: [...(w.transfers ?? []), { id, lotId, from: lot.rack, to: rackId || undefined, on, actor }],
  }
}

/**
 * Lots with something on them that sit on no rack. Only a question once the
 * store has named racks — a store that is one place has nothing to place.
 */
export const unplacedLots = (ws: Workspace): WsLot[] =>
  (ws.racks ?? []).length === 0 ? []
    : ws.stockLots.filter((l) => !l.rack && isPhysical(l) && l.qty > 0)

export interface RackRow {
  rack: Rack
  lots: number
  value: number
  /** the last day anything on it was counted */
  walked?: string
  /** lots on it past their counting date */
  due: number
}

export function rackRows(ws: Workspace, today: string): RackRow[] {
  return (ws.racks ?? []).map((rack) => {
    const rows = lotsOn(ws, rack.id).map((l) => lotRow(ws, l, today))
    const walked = (ws.counts ?? []).filter((c) => c.rack === rack.id).map((c) => c.on).sort().pop()
    return {
      rack,
      lots: rows.length,
      value: Math.round(rows.reduce((a, r) => a + r.value.value, 0) * 100) / 100,
      walked,
      due: rows.filter((r) => r.due).length,
    }
  }).sort((a, b) => a.rack.name.localeCompare(b.rack.name, undefined, { numeric: true }))
}
