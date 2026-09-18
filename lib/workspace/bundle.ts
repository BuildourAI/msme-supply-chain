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
 * `receipts` is empty and stays empty until this build records goods actually
 * arriving. That is not a gap to paper over: §5 makes lead time the trailing
 * average of the last six real receipts precisely because the quoted figure
 * flatters. With no receipts the quoted figure is all there is, so
 * `trailingLeadTimeDays` falls back to it and labels it as quoted — the number
 * says what it is, and improves itself the day the first receipt lands.
 */
export function bundleFor(ws: Workspace, today: string): SeedBundle {
  return {
    today,
    items: quotedItems(ws),
    vendors: ws.vendors,
    vendorItems: ws.vendorItems,
    stockLots: ws.stockLots,
    poLines: [],
    receipts: [],
  }
}
