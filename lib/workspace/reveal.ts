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
import { inventoryOpenCount } from './inventory-decisions'
import { openVariances } from './counting'
import { lineWatch, stoppingThisWeek } from './linewatch'
import { jobPlanRows } from './plan'
import { productionOpenCount } from './production-decisions'
import { productsWanting } from './products'
import { orderRows } from './sales'
import { unbooked } from './dispatch-notes'
import { overdueInTransit } from './consignments'
import { overdueReturns } from './returns'
import { dispatchOpenCount } from './dispatch-decisions'
import { cutRows, offcutRows } from './cutting'
import { openJobs } from './jobs'
import { lotRows } from './ledger'
import { unsoldPast } from './losses'
import { unplacedLots } from './racks'
import { challansOut } from './jobwork'
import { dueInCount } from './due'
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
  /**
   * kept under "More" at the foot of the rail: still built, still badged, just
   * not in the way of the rows somebody uses every day
   */
  tucked?: boolean
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
export const BUILT: StageId[] = ['sourcing', 'inbound', 'inventory', 'production', 'dispatch']

export const isBuilt = (s: StageId | null): s is StageId => s !== null && BUILT.includes(s)

/**
 * Where each stage's tile leads. Sourcing opens on its suppliers because a new
 * owner's first job there is to add one; inbound opens on its dashboard,
 * because the gate's first question is what is on its way.
 */
export const STAGE_HOME: Record<StageId, string> = {
  sourcing: '/sourcing/suppliers',
  inbound: '/inbound/dashboard',
  inventory: '/inventory/dashboard',
  production: '/production/dashboard',
  dispatch: '/dispatch/dashboard',
}

/**
 * The sourcing desk's own rows.
 *
 * Everything is present from the first day rather than revealed one at a time.
 * Seven rows is still short enough not to overwhelm, and a nav that grows under
 * somebody is a nav they have to keep re-learning — worse than one that is
 * briefly empty. What each screen does when it has nothing is say so, which is
 * a job for the screen rather than the menu.
 *
 * Documents and Landed cost are tucked under "More": reached now and then,
 * usually from a dashboard card that already links straight to them, so they
 * do not take a row each from the six used every day.
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
     * Documents are how suppliers arrive. The badge counts what is waiting on a
     * person rather than how many documents exist — a number that never goes
     * down is not a badge, it is decoration — and it adds into "More" while
     * the fold is shut.
     */
    { label: 'Documents', href: '/sourcing/documents', icon: 'doc', badge: count(unfiled), tucked: true },
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
      tucked: true,
    },
    { label: 'Purchase orders', href: '/sourcing/orders', icon: 'cart', badge: count(open) },
  ]
}

/**
 * The inbound desk's rows: the gate, what it checks, and what it should expect.
 *
 * Suppliers and materials stay on the sourcing rail — a jobworker is a
 * supplier of type Jobworker, and a material is the same material whichever
 * stage you are standing in. An order is sourcing's too, from draft to the
 * supplier's confirmation of its last change: the gate sees it on Due in, the
 * day it should land, and never changes it. Every badge is a number that goes
 * down when somebody does something.
 */
export function inboundNav(ws: Workspace, today = ''): NavRow[] {
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
    // lines due today or earlier, from suppliers and back from jobworkers, not here yet
    { label: 'Due in', href: '/inbound/due', icon: 'calendar', badge: count(dueInCount(ws, today)) },
  ]
}

/**
 * The store's rows.
 *
 * The ledger is the store: what is on each rack, what the book says, what was
 * last counted. The racks themselves are set up once and walked from the
 * ledger, so their row waits under "More". Every badge is work that goes down
 * when somebody does it — lots past their counting date, lots on no rack.
 */
export function inventoryNav(ws: Workspace, today = ''): NavRow[] {
  // lots past their counting date, and counts outside tolerance nobody has looked at
  const due = (today ? lotRows(ws, today).filter((r) => r.due).length : 0) + openVariances(ws).length
  return [
    {
      label: 'Dashboard',
      href: '/inventory/dashboard',
      icon: 'activity',
      badge: count(inventoryOpenCount(ws, today)),
    },
    { label: 'Stock ledger', href: '/inventory/ledger', icon: 'boxes', badge: count(due) },
    /*
     * Work done on your own floor, against a style, job or order number, with
     * how many are open. Called In-house whatever the owner's word; Jobwork,
     * beside it, is work sent out to somebody else's floor on a challan.
     */
    { label: 'In-house', href: '/inventory/issues', icon: 'factory', badge: count(openJobs(ws).length) },
    /*
     * The store's own material in somebody else's shed, with how many
     * challans are still out. Only what comes back passes the gate.
     */
    { label: 'Jobwork', href: '/inventory/jobwork', icon: 'truck', badge: count(challansOut(ws).length) },
    /*
     * Only in a store that cuts. Remnants past their age, and cuts well below
     * plan nobody has looked at. Switched off, the row goes and every record
     * stays — switching it on again finds them all where they were.
     */
    ...(ws.cutting ? [{
      label: 'Cutting & offcuts', href: '/inventory/offcuts', icon: 'scissors' as const,
      badge: count(today ? offcutRows(ws, today).filter((r) => r.aged).length
        + cutRows(ws).filter((r) => r.belowPlan && !r.noted).length : 0),
    }] : []),
    // scrap booked as money and never collected: the one number here that is owed to you
    { label: 'Wastage & loss', href: '/inventory/wastage', icon: 'alert', badge: count(today ? unsoldPast(ws, today).length : 0) },
    { label: 'Racks', href: '/inventory/racks', icon: 'columns', badge: count(unplacedLots(ws).length), tucked: true },
  ]
}

/**
 * The floor's rows: the week, the plan against what came off, and what it
 * makes. Every badge is work a person can take off: jobs that will not run as
 * planned, jobs behind or unplanned, products whose material list has no
 * quantities.
 */
export function productionNav(ws: Workspace, today = ''): NavRow[] {
  const plans = today ? jobPlanRows(ws, today) : []
  const pace = plans.filter((r) => r.state === 'behind' || r.state === 'late' || r.state === 'unplanned').length
  return [
    {
      label: 'Dashboard',
      href: '/production/dashboard',
      icon: 'activity',
      badge: count(productionOpenCount(ws, today)),
    },
    { label: 'Line watch', href: '/production/line-watch', icon: 'eye', badge: count(today ? stoppingThisWeek(lineWatch(ws, today)).length : 0) },
    { label: 'Plan vs actual', href: '/production/plan', icon: 'calendar', badge: count(pace) },
    // a reading, not a queue: nothing on it goes down when somebody acts
    { label: 'Turnaround', href: '/production/turnaround', icon: 'clock' },
    { label: 'Products', href: '/production/products', icon: 'boxes', badge: count(productsWanting(ws).length), tucked: true },
  ]
}

/**
 * The shipping bay's rows: the order book first, because every dispatch
 * starts from an order. Customers and carriers are masters, reached now and
 * then, so they sit under "More".
 */
export function dispatchNav(ws: Workspace, today = ''): NavRow[] {
  const late = today ? orderRows(ws, today).filter((r) => r.overdue).length : 0
  return [
    {
      label: 'Dashboard',
      href: '/dispatch/dashboard',
      icon: 'activity',
      badge: count(dispatchOpenCount(ws, today)),
    },
    { label: 'Order book', href: '/dispatch/orders', icon: 'doc', badge: count(late) },
    { label: 'Dispatch notes', href: '/dispatch/notes', icon: 'truck', badge: count(unbooked(ws).length) },
    { label: 'Consignments', href: '/dispatch/consignments', icon: 'clock', badge: count(today ? overdueInTransit(ws, today) : 0) },
    { label: 'Returns', href: '/dispatch/returns', icon: 'undo', badge: count(overdueReturns(ws, today).length) },
    { label: 'Customers', href: '/dispatch/customers', icon: 'star', tucked: true },
    { label: 'Carriers', href: '/dispatch/carriers', icon: 'share', tucked: true },
  ]
}

/** The rail for the stage somebody is standing in. */
export const navFor = (stage: StageId, ws: Workspace, today = ''): NavRow[] =>
  stage === 'inbound' ? inboundNav(ws, today)
    : stage === 'inventory' ? inventoryNav(ws, today)
      : stage === 'production' ? productionNav(ws, today)
        : stage === 'dispatch' ? dispatchNav(ws, today)
          : sourcingNav(ws, today)

const count = (n: number) => (n > 0 ? String(n) : undefined)

/**
 * The number on "More": what is waiting behind the fold, added up, so tucking a
 * row away never hides that something in it needs a person.
 */
export const foldCount = (rows: NavRow[]): number =>
  rows.reduce((n, r) => n + (r.tucked && r.badge ? Number(r.badge) || 0 : 0), 0)

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
