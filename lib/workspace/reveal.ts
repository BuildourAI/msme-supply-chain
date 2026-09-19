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
export function sourcingNav(ws: Workspace): NavRow[] {
  const open = ws.orders.filter((o) => o.state !== 'delivered' && o.state !== 'cancelled').length
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
    { label: 'Purchase orders', href: '/sourcing/orders', icon: 'cart', badge: count(open) },
  ]
}

const count = (n: number) => (n > 0 ? String(n) : undefined)

/** Which stage a path belongs to, so the shell knows which nav to show. */
export function stageOf(pathname: string): StageId | null {
  const seg = pathname.split('/')[1]
  return (STAGE_TILES.some((s) => s.id === seg) ? seg : null) as StageId | null
}
