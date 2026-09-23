/**
 * A stock count, written into the book.
 *
 * The first count of a material is its opening position, and a recount
 * before anything else has touched it replaces that position — running the
 * count twice must not double the stock.
 *
 * Once anything else has moved the material — a receipt closed at the gate,
 * material sent to a jobworker, an issue to a job — replacing the opening lot
 * would add the new count on top of those movements: count 120, receive 40,
 * recount 160, and the book says 200. So a recount then is written as what it
 * is, a correction of the difference, which is the ledger's own rule: a count
 * variance is its own movement, never written over the balance. A shortage
 * comes off the oldest lots first, the way the material would have been used;
 * an excess is a lot of its own, found on the count.
 *
 * Every lot this writes is written through `ledger.ts`, so each opens with a
 * line in the journal and the book adds up.
 */
import { dropLots, fifo, isCorrection, newLot, postMany, round3 } from './ledger'
import type { Workspace, WsLot } from './types'

export interface Counted {
  /** usable, ready to issue; absent to leave the material as it is */
  good?: number
  /** of the pile, what cannot be used — including anything the gate rejected */
  held?: number
  why?: string
  /** the rack it sits on, when the store has named its racks */
  rack?: string
}

const isOpening = (l: WsLot) => l.batchNo.startsWith('OPENING')

/**
 * Whether anything but the opening count has touched a material: a lot that is
 * not an opening lot, or an opening lot something has since drawn on.
 */
function moved(ws: Workspace, itemId: string): boolean {
  const mine = ws.stockLots.filter((l) => l.itemId === itemId)
  if (mine.some((l) => !isOpening(l) && !l.batchNo.startsWith('COUNT-'))) return true
  const opening = new Set(mine.filter(isOpening).map((l) => l.id))
  return (ws.moves ?? []).some((m) => opening.has(m.lotId) && m.kind !== 'opening')
}

export function applyCount(
  ws: Workspace, today: string, counts: Record<string, Counted>, actor = '',
): Workspace {
  const known = (v?: number): v is number => v !== undefined && Number.isFinite(v) && v >= 0
  const ref = `COUNT-${today}`
  let w = ws

  const hold = (itemId: string, qty: number, why: string | undefined, rack: string | undefined) => {
    ;[w] = newLot(w, {
      itemId, batchNo: `OPENING-HOLD-${today}`, usability: 'qc_hold', rack,
      usabilityReason: why?.trim() || 'Held back at the opening count',
    }, { on: today, kind: 'opening', qty, source: 'opening', sourceRef: ref, actor })
  }

  for (const it of ws.items) {
    const c = counts[it.id]
    if (!c) continue
    const rack = c.rack || undefined

    if (moved(w, it.id)) {
      const mine = w.stockLots.filter((l) => l.itemId === it.id)
      if (known(c.good)) {
        const book = round3(mine.filter((l) => l.usability === 'usable' && !l.remnant)
          .reduce((a, l) => a + l.qty, 0))
        const diff = round3(c.good - book)
        const note = `Counted ${c.good} against a book of ${book}`
        if (diff > 0) {
          ;[w] = newLot(w, {
            itemId: it.id, batchNo: `FOUND-${today}`, usability: 'usable', rack,
          }, { on: today, kind: 'count_adjust', qty: diff, source: 'count', sourceRef: ref, actor, note })
        } else if (diff < 0) {
          // oldest first, the way it would have gone; never below nothing on any one lot
          let left = -diff
          const off: { lotId: string; qty: number }[] = []
          for (const l of fifo(w, it.id)) {
            if (left <= 1e-9) break
            const take = round3(Math.min(l.qty, left))
            off.push({ lotId: l.id, qty: take })
            left = round3(left - take)
          }
          ;[w] = postMany(w, off.map((o) => ({
            lotId: o.lotId, itemId: it.id, on: today, kind: 'count_adjust' as const, qty: -o.qty,
            source: 'count' as const, sourceRef: ref, actor, note,
          })))
        }
      }
      /*
       * What the count says cannot be used includes what the gate rejected,
       * which already has its own lot and reason. Only the rest is the
       * opening hold, so only the rest is written back.
       */
      if (known(c.held)) {
        const elsewhere = mine
          .filter((l) => l.usability !== 'usable' && !isOpening(l) && !isCorrection(l))
          .reduce((a, l) => a + l.qty, 0)
        const rest = round3(c.held - elsewhere)
        w = dropLots(w, (l) => l.itemId === it.id && l.batchNo.startsWith('OPENING-HOLD'))
        if (rest > 0) hold(it.id, rest, c.why, rack)
      }
      continue
    }

    /*
     * Nothing has moved it: the opening position is replaced, lots and their
     * opening lines together, so a second count never doubles the first.
     */
    w = dropLots(w, (l) => l.itemId === it.id && (isOpening(l) || l.batchNo.startsWith('COUNT-')))
    if (known(c.good) && c.good > 0) {
      ;[w] = newLot(w, {
        itemId: it.id, batchNo: `OPENING-${today}`, usability: 'usable', rack,
      }, { on: today, kind: 'opening', qty: c.good, source: 'opening', sourceRef: ref, actor })
    }
    if (known(c.held) && c.held > 0) hold(it.id, c.held, c.why, rack)
  }
  return w
}
