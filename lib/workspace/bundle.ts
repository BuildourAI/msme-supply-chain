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
import { ackedDate, ackedQty } from './orders'
import { purchaseReceipts, receivedAgainst } from './receipts'
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
 *
 * `poLines` was empty too, and that one was wrong in a way the owner could see:
 * the desk's true position, its status and its reorder quantity all read the
 * open order lines, so a material read "out of cover — order now" while an
 * order for it sat confirmed and due next week, and the suggested quantity
 * ignored it. Every order handed to its supplier and not yet in is passed now:
 *
 *  - at the quantity the supplier CONFIRMED, never a change they have not seen
 *    — the rule the sample company's INB-02 exists for;
 *  - less what has already arrived, or a part delivery would be counted once
 *    on the shelf and again as open — and what is at the gate is in neither,
 *    which is right: it is not stock until inspected, and not coming any more;
 *  - dropped at nothing left, because a line of nought still names an arrival
 *    date the derivation would read as the earliest one coming;
 *  - `in_transit` once the supplier has shipped part, `open` before.
 *
 * One thing the derivation does with these that is not changed here:
 * `buyerStatus` reads an order whose promised date has PASSED as still
 * covering. A late order is not covering anything, which is what the sourcing
 * queue's "late" decision says, in the worst band — that is the guard.
 */
export function bundleFor(ws: Workspace, today: string): SeedBundle {
  return {
    today,
    items: quotedItems(ws),
    vendors: ws.vendors,
    vendorItems: ws.vendorItems,
    stockLots: ws.stockLots,
    poLines: ws.orders
      .filter((o) => o.state === 'confirmed' || o.state === 'shipped')
      .map((o) => ({
        id: o.id,
        poNo: o.no,
        itemId: o.itemId,
        qty: Math.max(0, Math.round((ackedQty(o) - receivedAgainst(ws, o.id)) * 1000) / 1000),
        promisedDate: ackedDate(o),
        status: o.state === 'shipped' ? 'in_transit' as const : 'open' as const,
      }))
      .filter((l) => l.qty > 0),
    // purchases only: a jobwork return measures a jobworker's turnaround, and
    // must not move a supplier's lead time on a delivery they never made
    receipts: purchaseReceipts(ws).map((r) => ({
      id: r.id,
      vendorId: r.vendorId,
      itemId: r.itemId,
      orderedOn: r.orderedOn,
      receivedOn: r.receivedOn,
    })),
  }
}
