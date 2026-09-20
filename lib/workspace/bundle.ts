/**
 * Turning a workspace into the bundle every derivation already reads.
 *
 * `buildRows` takes a `SeedBundle` and returns a priced, statused row per item.
 * It makes one assumption the sample data always satisfied and a real company
 * does not: that every item has at least one quote. An owner adds their
 * materials in step 2 and their suppliers in step 3, so between those two steps
 * a material exists with nobody to buy it from.
 *
 * Rather than weaken the derivation — a material with no supplier genuinely has
 * no reorder recommendation, no landed cost and no order-by date, and inventing
 * a neutral one would be the kind of confident wrong number this whole build
 * exists to avoid — the bundle carries only the items that can be priced, and
 * `unquotedItems` names the rest so a screen can say plainly what is missing.
 */
import * as S from '@/lib/seed/sourcing'
import type { SeedBundle } from '@/lib/domain/derive'
import type { Item } from '@/lib/domain/types'
import type { Workspace } from './types'

/** The demo company, unchanged — the same bundle `app/page.tsx` reads today. */
export const SAMPLE_BUNDLE: SeedBundle = {
  today: S.TODAY_SOURCING,
  items: S.items,
  vendors: S.vendors,
  vendorItems: S.vendorItems,
  stockLots: S.stockLots,
  poLines: S.poLines,
  receipts: S.receipts,
}

/** Items the owner has entered that no supplier quotes yet. */
export function unquotedItems(ws: Workspace): Item[] {
  return ws.items.filter((it) => !ws.vendorItems.some((vi) => vi.itemId === it.id))
}

export function quotedItems(ws: Workspace): Item[] {
  return ws.items.filter((it) => ws.vendorItems.some((vi) => vi.itemId === it.id))
}

/**
 * The owner's company as a bundle.
 *
 * `receipts` was empty for as long as nothing recorded goods arriving, and the
 * comment here said so at length: §5 makes lead time the trailing average of
 * the last six real receipts precisely because the quoted figure flatters, and
 * with none the quoted figure stood in and was labelled as quoted.
 *
 * It no longer stands in. Every receipt the owner records is passed through,
 * and `trailingLeadTimeDays` takes the last six of them — so the lead time on
 * an owner's screen is the same kind of number as the sample company's, and it
 * says which it is. A material nobody has received yet still falls back to the
 * quoted figure, which is the honest answer for it.
 *
 * Only the four fields the domain `Receipt` has are passed. A goods receipt
 * carries quantities and a note as well; those are the owner's record of what
 * happened, and the derivation has no business seeing them.
 */
export function bundleFor(ws: Workspace, today: string): SeedBundle {
  return {
    today,
    items: quotedItems(ws),
    vendors: ws.vendors,
    vendorItems: ws.vendorItems,
    stockLots: ws.stockLots,
    poLines: [],
    receipts: (ws.receipts ?? []).map((r) => ({
      id: r.id,
      vendorId: r.vendorId,
      itemId: r.itemId,
      orderedOn: r.orderedOn,
      receivedOn: r.receivedOn,
    })),
  }
}
