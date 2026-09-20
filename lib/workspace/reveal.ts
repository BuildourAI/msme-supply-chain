/**
 * What an owner is offered, and when.
 *
 * Today the sidebar builds from `STAGES` and shows forty-one rows, of which one
 * leads anywhere their data can fill. The rest lead to a card explaining what
 * the screen would show. A menu of things you cannot use is the overwhelming
 * part, so in the owner's company the nav is built from here instead: a
 * handful of rows, flat, in the shape of the portal this desk is modelled on.
 *
 * The sample company is untouched and keeps every row. It is the worked example
 * that shows where the system goes, and hiding its screens would make it
 * useless for that.
 */
import type { IconName } from '@/components/ui/icons'
import { staleRates } from './sourcing'
import type { Workspace } from './types'

export interface NavRow {
  label: string
  href: string
  icon: IconName
  /** shown on the right of the row — a count, never a colour alone */
  badge?: string
  /** it exists but is not built yet, so it says so rather than 404ing */
  later?: boolean
}

export const STAGE_TILES = [
  { id: 'sourcing', label: 'Sourcing', icon: 'cart' as IconName, blurb: 'Who you buy from, and what you order' },
  { id: 'inbound', label: 'Inbound', icon: 'tray' as IconName, blurb: 'Goods arriving, and checking them' },
  { id: 'inventory', label: 'Inventory', icon: 'boxes' as IconName, blurb: 'What is on the shelf, and what it is worth' },
  { id: 'production', label: 'Production', icon: 'factory' as IconName, blurb: 'What the floor can run, and for how long' },
  { id: 'dispatch', label: 'Dispatch', icon: 'truck' as IconName, blurb: 'What left, and whether it arrived' },
] as const

export type StageId = typeof STAGE_TILES[number]['id']

/** Sourcing is the stage being built. The rest say so on their tile. */
export const BUILT: StageId[] = ['sourcing']

/**
 * The sourcing desk's own rows.
 *
 * Everything is present from the first day rather than revealed one at a time.
 * Seven rows is still short enough not to overwhelm, and a nav that grows under
 * somebody is a nav they have to keep re-learning — worse than one that is
 * briefly empty. What each screen does when it has nothing is say so, which is
 * a job for the screen rather than the menu.
 */
export function sourcingNav(ws: Workspace, today = ''): NavRow[] {
  // by NUMBER, not by row: several lines sharing one are one order, so a
  // three-line order to one supplier must not badge as three
  const open = new Set(
    ws.orders.filter((o) => o.state !== 'delivered' && o.state !== 'cancelled')
      .map((o) => o.no),
  ).size
  const waiting = ws.rfqs.filter((r) => r.state === 'sent' || r.state === 'quoted').length
  const unfiled = ws.docs.filter((d) => d.status === 'draft').length
  return [
    { label: 'Dashboard', href: '/sourcing/dashboard', icon: 'activity', later: true },
    { label: 'Suppliers', href: '/sourcing/suppliers', icon: 'truck', badge: count(ws.vendors.length) },
    /*
     * Straight after Suppliers, because documents are how suppliers arrive. The
     * badge counts what is waiting on a person rather than how many documents
     * exist — a number that never goes down is not a badge, it is decoration.
     */
    { label: 'Documents', href: '/sourcing/documents', icon: 'doc', badge: count(unfiled) },
    { label: 'Materials', href: '/sourcing/materials', icon: 'boxes', badge: count(ws.items.length) },
    { label: 'Requests', href: '/sourcing/rfqs', icon: 'doc', badge: count(waiting) },
    { label: 'Quotes', href: '/sourcing/quotes', icon: 'scale', badge: count(ws.quotes.length) },
    /*
     * Between the quotes and the order, which is where it sits in the work.
     * The badge counts materials where the cheapest quote is not the cheapest
     * material — a number that goes down when somebody acts on it, rather than
     * one that only ever climbs.
     */
    /*
     * The badge counts two things worth acting on: a material where the
     * cheapest quote is not the cheapest material, and a rate still ranking
     * suppliers on a price that has run out. Both go down when somebody does
     * something about them, which is the only kind of badge worth having.
     */
    {
      label: 'Landed cost',
      href: '/sourcing/compare',
      icon: 'cash',
      badge: count(flipping(ws) + (today ? staleRates(ws, today) : 0)),
    },
    { label: 'Purchase orders', href: '/sourcing/orders', icon: 'cart', badge: count(open) },
  ]
}

const count = (n: number) => (n > 0 ? String(n) : undefined)

/**
 * Materials where the supplier who quoted least is not the one who costs least.
 *
 * Computed here rather than read off a stored flag, the same way the desk
 * derives its own recommendation — and deliberately cheap, because it runs on
 * every render of the sidebar.
 */
function flipping(ws: Workspace): number {
  const landed = (vi: { rate: number; freightPerUnit: number; nonCreditableGst: number
    paymentTermCost: number; rejectionAllowance: number }) =>
    vi.rate + vi.freightPerUnit + vi.nonCreditableGst + vi.paymentTermCost + vi.rejectionAllowance

  const byItem = new Map<string, typeof ws.vendorItems>()
  for (const vi of ws.vendorItems) {
    byItem.set(vi.itemId, [...(byItem.get(vi.itemId) ?? []), vi])
  }

  let n = 0
  for (const quotes of byItem.values()) {
    if (quotes.length < 2) continue
    const best = quotes.reduce((a, b) => (landed(b) < landed(a) ? b : a))
    const cheap = quotes.reduce((a, b) => (b.rate < a.rate ? b : a))
    if (best.vendorId !== cheap.vendorId) n += 1
  }
  return n
}

/** Which stage a path belongs to, so the shell knows which nav to show. */
export function stageOf(pathname: string): StageId | null {
  const seg = pathname.split('/')[1]
  return (STAGE_TILES.some((s) => s.id === seg) ? seg : null) as StageId | null
}
