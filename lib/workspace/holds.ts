/**
 * Why an order is held before it goes to the supplier.
 *
 * Two of the owner's rules promise a hold, and until now only the sample
 * company kept that promise. The rules step says an order that "would leave
 * more than N months of stock" is held with a reason, and that "anything dearer
 * [than the sign-off amount] waits for your sign-off". A hold here is exactly
 * that: a reason, read before the order is handed over. It never refuses and
 * never cancels — the owner reads it, and decides.
 *
 * Judged on the order as drafted — its real quantities and rates — not on the
 * quantity the reorder maths would have suggested, because the draft is what
 * the supplier would receive.
 */
import { money } from '@/lib/domain/format'
import { usableOnHand } from './ledger'
import { outstandingOn } from './receipts'
import type { Workspace } from './types'

export interface Hold {
  kind: 'ceiling' | 'signoff'
  /** the reason, as one line the owner reads */
  text: string
}

/** What stock of a material will be on hand or on its way once this order lands, in months of use. */
function monthsAfter(ws: Workspace, itemId: string, adding: number, exceptNo: string): number | null {
  const item = ws.items.find((i) => i.id === itemId)
  if (!item || item.avgDailyConsumption <= 0) return null
  // other orders already with a supplier; drafts are not stock anybody is sending
  const coming = ws.orders
    .filter((o) => o.itemId === itemId && o.no !== exceptNo && (o.state === 'confirmed' || o.state === 'shipped'))
    .reduce((a, o) => a + outstandingOn(ws, o), 0)
  return (usableOnHand(ws, itemId) + coming + adding) / (item.avgDailyConsumption * 30)
}

/**
 * The holds on one order, by its number. Empty when nothing is held — and
 * empty until the owner has been through the rules step: a hold says "your
 * ceiling" and "your sign-off amount", and a number nobody chose is not theirs.
 */
export function orderHolds(ws: Workspace, no: string): Hold[] {
  if (ws.drafts['rules.agreed'] !== true) return []
  const lines = ws.orders.filter((o) => o.no === no && o.state !== 'cancelled')
  if (lines.length === 0) return []
  const out: Hold[] = []

  for (const line of lines) {
    if (line.qty <= 0) continue
    const item = ws.items.find((i) => i.id === line.itemId)
    if (!item) continue
    const ceiling = ws.policy.coverageCeiling[item.itemClass]
    const months = monthsAfter(ws, line.itemId, line.qty, no)
    if (months !== null && ceiling > 0 && months > ceiling) {
      out.push({
        kind: 'ceiling',
        text: `${item.name}: this order would leave ${months.toFixed(1)} months of stock — your ceiling is ${ceiling} month${ceiling === 1 ? '' : 's'}`,
      })
    }
  }

  const value = lines.reduce((a, o) => a + o.qty * o.unitPrice, 0)
  const threshold = ws.policy.ownerApprovalThreshold
  if (threshold > 0 && value > threshold) {
    out.push({
      kind: 'signoff',
      text: `${money(value)} is above your ${money(threshold)} sign-off amount`,
    })
  }
  return out
}
