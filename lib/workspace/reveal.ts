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
import { buildRows } from '@/lib/domain/derive'
import { bundleFor } from './bundle'
import { uncheckedItems } from './checks'
import { openCount } from './decisions'
import { inboundOpenCount } from './inbound-decisions'
import { challansOut } from './jobwork'
import { openReceipts } from './receipts'
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

/**
 * The stages an owner can work in. The rest say so on their tile.
 *
 * Inbound is second because it is where sourcing ends: every order in the
 * sourcing dashboard's right-hand column finishes at this gate.
 */
export const BUILT: StageId[] = ['sourcing', 'inbound']

export const isBuilt = (s: StageId | null): s is StageId => s !== null && BUILT.includes(s)

/**
 * Where each stage's tile leads. Sourcing opens on its suppliers because a new
 * owner's first job there is to add one; inbound opens on its dashboard,
 * because the gate's first question is what is on its way.
 */
export const STAGE_HOME: Record<StageId, string> = {
  sourcing: '/sourcing/suppliers',
  inbound: '/inbound/dashboard',
  inventory: '/',
  production: '/',
  dispatch: '/',
}

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
    /*
     * The badge is the length of the work queue, so it is the one number on
     * the rail that goes DOWN when somebody does something — and the only one
     * that counts things from every other row at once, which is the point of
     * the screen it leads to.
     *
     * It runs the same derivation the dashboard runs. Doing it the cheap way,
     * without the at-risk rows, would have the rail say 2 and the screen it
     * opens say 3 — a badge that disagrees with its own page is worse than no
     * badge. It is arithmetic over a handful of materials, and the desk has
     * always run it on every render.
     */
    {
      label: 'Dashboard',
      href: '/sourcing/dashboard',
      icon: 'activity',
      badge: count(openCount(ws, today, atRisk(ws, today))),
    },
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

/**
 * The inbound desk's rows: the gate, and the three things that decide what
 * reaches it.
 *
 * Five rows, not eight. Suppliers and materials stay on the sourcing rail — a
 * jobworker is a supplier of type Jobworker, and a material is the same
 * material whichever stage you are standing in. Every badge is a number that
 * goes down when somebody does something.
 */
export function inboundNav(ws: Workspace, today = ''): NavRow[] {
  // by NUMBER: one confirmation covers every line on the document
  const unconfirmed = new Set(
    ws.orders
      .filter((o) => o.revisions && (o.ackedVersion ?? 0) < o.revisions.length)
      .map((o) => o.no),
  ).size
  return [
    {
      label: 'Dashboard',
      href: '/inbound/dashboard',
      icon: 'activity',
      badge: count(inboundOpenCount(ws, today)),
    },
    // what is waiting to be inspected, not how much has ever arrived
    { label: 'Receiving', href: '/inbound/receiving', icon: 'tray', badge: count(openReceipts(ws).length) },
    // materials nobody has written a check for yet
    { label: 'Checks', href: '/inbound/checks', icon: 'check', badge: count(uncheckedItems(ws).length) },
    { label: 'Open orders', href: '/inbound/orders', icon: 'cart', badge: count(unconfirmed) },
    { label: 'Jobwork', href: '/inbound/jobwork', icon: 'factory', badge: count(challansOut(ws).length) },
  ]
}

/** The rail for the stage somebody is standing in. */
export const navFor = (stage: StageId, ws: Workspace, today = ''): NavRow[] =>
  stage === 'inbound' ? inboundNav(ws, today) : sourcingNav(ws, today)

const count = (n: number) => (n > 0 ? String(n) : undefined)

/**
 * The materials the desk says are in trouble.
 *
 * Empty when no date is in hand — `CommandSearch` asks for the rows to know
 * what screens exist, not what is on fire, and a reorder point worked out
 * against an empty date would be arithmetic on a NaN.
 */
const atRisk = (ws: Workspace, today: string) =>
  (today ? buildRows(bundleFor(ws, today), ws.policy) : [])

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
