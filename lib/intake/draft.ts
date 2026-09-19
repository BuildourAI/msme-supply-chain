/**
 * Rows off a document, into lines with a material against each.
 *
 * The order here is the whole point and it is the sample company's order: a
 * wording this supplier has already been asked about resolves outright and
 * never reaches the queue; everything else is scored, and the score decides
 * whether a person is shown it as a decision, as a suggestion, or not at all.
 *
 * Pure — a workspace in, lines out — so what the owner will be shown can be
 * tested without a browser, a file or a click.
 */
import { resolveAlias } from './alias'
import { rowsToLines } from './lines'
import { bestMatch, classify, idfOf, matchable } from './match'
import type { DocLine } from './types'
import type { Workspace } from '@/lib/workspace/types'

export function draftLines(
  ws: Workspace,
  vendorId: string | undefined,
  rows: string[][],
  docId: string,
): DocLine[] {
  const items = matchable(ws.items)
  const idf = idfOf(items)

  return rowsToLines(rows).map((l, n) => {
    const id = `${docId}/${n + 1}`

    /*
     * A learned wording is not a very good guess — it is a decision somebody
     * already made, so it short-circuits the scorer entirely rather than being
     * fed in as another signal. Confidence 1 is reserved for exactly this.
     */
    const known = resolveAlias(ws.aliases, vendorId, l.raw)
    if (known && ws.items.some((i) => i.id === known)) {
      return { id, raw: l.raw, qty: l.qty, uom: l.uom, rate: l.rate, itemId: known, confidence: 1, via: 'alias' }
    }

    const hit = bestMatch(l.raw, l.uom, items, idf)
    if (!hit) {
      // below the floor nothing is suggested at all — a pre-filled box under it
      // is an invitation to accept a guess with one click
      return { id, raw: l.raw, qty: l.qty, uom: l.uom, rate: l.rate, confidence: 0, via: 'unmapped' }
    }

    return {
      id, raw: l.raw, qty: l.qty, uom: l.uom, rate: l.rate,
      itemId: hit.itemId,
      confidence: hit.score,
      via: classify(hit.score) === 'matched' ? 'matched' : 'review',
    }
  })
}

/** How many lines still want a person. What the rail badge counts. */
export const waitingOn = (lines: DocLine[]): number =>
  lines.filter((l) => !l.decision && (l.via === 'review' || l.via === 'unmapped')).length
