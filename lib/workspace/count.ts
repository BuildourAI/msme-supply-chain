/**
 * A stock count, written into the book.
 *
 * The first count of a material is its opening position, and a recount
 * before anything else has touched it replaces that position — running the
 * count twice must not double the stock.
 *
 * Once anything else has moved the material — a receipt closed at the gate,
 * material sent to a jobworker — replacing the opening lot would add the new
 * count on top of those movements: count 120, receive 40, recount 160, and the
 * book says 200. So a recount then is written as what it is, a correction of
 * the difference, which is the ledger's own rule: a count variance is its own
 * movement, never written over the balance.
 */
import type { StockLot } from '@/lib/domain/types'
import type { Workspace } from './types'

export interface Counted {
  /** usable, ready to issue; absent to leave the material as it is */
  good?: number
  /** of the pile, what cannot be used — including anything the gate rejected */
  held?: number
  why?: string
}

export function applyCount(ws: Workspace, today: string, counts: Record<string, Counted>): Workspace {
  const lots: StockLot[] = []
  const adjusted = new Set<string>()
  // never a lot id that is already in use, whatever has been deleted since
  const used = new Set(ws.stockLots.map((l) => l.id))
  let n = ws.stockLots.length
  const nextId = () => {
    let id = ''
    do { n += 1; id = `LOT-${String(n).padStart(3, '0')}` } while (used.has(id))
    used.add(id)
    return id
  }
  const holdFor = (itemId: string, qty: number, why?: string): StockLot => ({
    id: nextId(), itemId, batchNo: `OPENING-HOLD-${today}`, qty, usability: 'qc_hold',
    usabilityReason: why?.trim() || 'Held back at the opening count',
  })
  const known = (v?: number): v is number => v !== undefined && Number.isFinite(v) && v >= 0

  for (const it of ws.items) {
    const c = counts[it.id]
    if (!c) continue
    const mine = ws.stockLots.filter((l) => l.itemId === it.id)
    const moved = mine.some((l) => !l.batchNo.startsWith('OPENING') && !l.batchNo.startsWith('COUNT-'))

    if (moved) {
      adjusted.add(it.id)
      if (known(c.good)) {
        const book = mine.filter((l) => l.usability === 'usable').reduce((a, l) => a + l.qty, 0)
        const diff = Math.round((c.good - book) * 1000) / 1000
        if (diff !== 0) {
          lots.push({
            id: nextId(), itemId: it.id, batchNo: `COUNT-${today}`, qty: diff, usability: 'usable',
            usabilityReason: `Counted ${c.good} against a book of ${Math.round(book * 1000) / 1000}`,
          })
        }
      }
      /*
       * What the count says cannot be used includes what the gate rejected,
       * which already has its own lot and reason. Only the rest is the
       * opening hold, so only the rest is written back.
       */
      if (known(c.held)) {
        const elsewhere = mine
          .filter((l) => l.usability !== 'usable' && !l.batchNo.startsWith('OPENING'))
          .reduce((a, l) => a + l.qty, 0)
        const rest = Math.round((c.held - elsewhere) * 1000) / 1000
        if (rest > 0) lots.push(holdFor(it.id, rest, c.why))
      }
      continue
    }

    if (known(c.good)) {
      lots.push({ id: nextId(), itemId: it.id, batchNo: `OPENING-${today}`, qty: c.good, usability: 'usable' })
    }
    if (known(c.held) && c.held > 0) lots.push(holdFor(it.id, c.held, c.why))
  }

  /*
   * The opening position is replaced — except, for a material something else
   * has moved since, the opening usable lot stays (its correction was written
   * above as its own lot) and only the opening hold is replaced.
   */
  const counted = new Set(Object.keys(counts))
  return {
    ...ws,
    stockLots: [
      ...ws.stockLots.filter((l) => {
        if (!l.batchNo.startsWith('OPENING')) return true
        if (!counted.has(l.itemId)) return true
        return adjusted.has(l.itemId) && !l.batchNo.startsWith('OPENING-HOLD')
      }),
      ...lots,
    ],
  }
}
