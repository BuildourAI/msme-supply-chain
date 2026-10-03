/**
 * What each dashboard shows, beyond its figures, and what the owner has
 * switched off.
 *
 * Every dashboard is the same few parts: figures in a row (chosen in
 * `metrics.ts`), pictures of the records, and on a desk a strip of cards and
 * the recent work; on the Welcome page the goals and the recent activity. A
 * company that makes to stock has no use for "Sales orders by promise"; one
 * that never sends material out has no use for the jobworker tile. So each of
 * these can be switched off, per dashboard, and the page closes up round
 * what is left.
 *
 * Stored as what is HIDDEN rather than what is shown, so that a picture added
 * in a later release appears for everybody — including an owner who arranged
 * their dashboard last month — rather than waiting to be discovered.
 *
 * Two things are never offered: the list of what is waiting on you (the work
 * itself; the rail's badges count from it) and, on the Welcome page, the stage
 * cards (the way into each stage).
 */
import type { Workspace } from './types'

export type Board = 'welcome' | 'sourcing' | 'inbound' | 'inventory' | 'production' | 'dispatch'

export interface BoardPart {
  key: string
  label: string
  /** one line on what it shows, and what fills it when nothing has yet */
  what: string
}

/** The pictures, in the order each dashboard draws them. Keys are each card's `chart`. */
export const PICTURES: Record<Board, BoardPart[]> = {
  welcome: [
    { key: 'dispatched', label: 'Dispatched', what: 'What left each month this financial year, at selling value. Fills from your delivery challans.' },
    { key: 'promise', label: 'Sales orders by promise', what: 'Every open sales order against its promised date, and what is late. Fills from your sales orders.' },
    { key: 'sits', label: 'Where your money is', what: 'Stock on the shelf, held, finished, at jobworkers and on order, in rupees.' },
    { key: 'spend', label: 'Spend by material', what: 'What you bought this month, by material. Fills from purchase orders and receipts.' },
    { key: 'jobs', label: 'Job cards', what: 'Each open job card as a ring: how much of its plan has come off.' },
    { key: 'cover', label: 'Days of stock', what: 'How many days each material lasts at its daily use, against when a new order would land.' },
  ],
  sourcing: [
    { key: 'orders', label: 'Orders with suppliers', what: 'Each recent purchase order from ordered to promised, and when it really came.' },
    { key: 'suppliers', label: 'Supplier scorecard', what: 'Every delivery per supplier, early, on time or late. Fills once goods are received.' },
    { key: 'received', label: 'Received', what: 'What came in each month, in rupees.' },
    { key: 'landing', label: 'Landing in the next 10 days', what: 'What is due at the gate, day by day — supplier orders and jobwork coming back.' },
  ],
  inbound: [
    { key: 'gate', label: 'Time at the gate', what: 'How long each lorry has been waiting to be checked, against your gate rules.' },
    { key: 'landing', label: 'Landing in the next 10 days', what: 'What is due at the gate, day by day — supplier orders and jobwork coming back.' },
    { key: 'punctual', label: 'On the promised day?', what: 'Recent deliveries against the day the supplier promised.' },
    { key: 'accepted', label: 'Accepted at the gate', what: 'This month, by material: accepted, rejected and still waiting.' },
  ],
  inventory: [
    { key: 'shelf', label: 'What the shelf is worth', what: 'Stock value by material, at the last price paid.' },
    { key: 'cover', label: 'Days of stock', what: 'How many days each material lasts at its daily use, against when a new order would land.' },
    { key: 'counts', label: 'Counted in time?', what: 'Lots due for a count against your store rules. Fills once you count.' },
    { key: 'loss', label: 'Loss & scrap', what: 'This month’s loss by cause, against your scrap target.' },
  ],
  production: [
    { key: 'plan', label: 'Job cards against the plan', what: 'Each open job card across its planned days, and the days it stood still.' },
    { key: 'weekly', label: 'Made each week', what: 'Good and rejected pieces each week against what the plan said.' },
    { key: 'halts', label: 'Why the line stopped', what: 'This month’s halt days by cause. Fills once a halt is recorded.' },
    { key: 'firstpass', label: 'Right first time', what: 'This month’s good pieces against rejected, by job card.' },
  ],
  dispatch: [
    { key: 'promise', label: 'Sales orders by promise', what: 'Every open sales order against its promised date, and what is late.' },
    { key: 'road', label: 'On the road', what: 'Consignments that have left, against the day they were promised. Fills once a challan is booked.' },
    { key: 'customers', label: 'Deliveries by customer', what: 'Each customer’s deliveries, on time and in full or not. Fills once a consignment is delivered.' },
    { key: 'shelf', label: 'Shelf against promises', what: 'Finished stock on the shelf against what open orders still need.' },
  ],
}

/** The other parts a dashboard can do without. */
export const SECTIONS: Record<Board, BoardPart[]> = {
  welcome: [
    { key: 'goals', label: 'Goals', what: 'Your own rules — on-time delivery, scrap, counts — and whether each is on track.' },
    { key: 'activity', label: 'Recent activity', what: 'The last few things written, across every desk.' },
  ],
  sourcing: [
    { key: 'strip', label: 'Material cards', what: 'A card per material: days of stock, and what is on order.' },
    { key: 'recent', label: 'Recent in sourcing', what: 'The last few orders, quotes and requests written.' },
  ],
  inbound: [
    { key: 'strip', label: 'Receipt cards', what: 'A card per recent receipt: checked, waiting or late.' },
    { key: 'recent', label: 'Recent at the gate', what: 'The last few receipts and checks written.' },
  ],
  inventory: [
    { key: 'strip', label: 'Stock cards', what: 'A card per material: usable, at jobworkers and held.' },
    { key: 'recent', label: 'Recent in the store', what: 'The last few counts, issues and losses written.' },
  ],
  production: [
    { key: 'strip', label: 'Job card rings', what: 'A ring per open job card: how much of its plan has come off.' },
    { key: 'recent', label: 'Recent on the floor', what: 'The last few bookings, plans and halts written.' },
  ],
  dispatch: [
    { key: 'strip', label: 'Order cards', what: 'A card per open sales order: ready, short or late.' },
    { key: 'recent', label: 'Recent in dispatch', what: 'The last few challans, deliveries and returns written.' },
  ],
}

/**
 * The Welcome page's five money tiles. They are its figures, chosen the way a
 * desk's figures are, but every one is on until the owner says otherwise.
 */
export const HEADLINES = ['orderBook', 'dispatchedValue', 'onOrder', 'stockValue', 'atJobworkers'] as const

/** Everything a dashboard lets the owner switch off. */
const known = (board: Board): Set<string> => new Set([
  ...PICTURES[board].map((p) => p.key),
  ...SECTIONS[board].map((p) => p.key),
  ...(board === 'welcome' ? HEADLINES : []),
])

/** What the owner has switched off on one dashboard. */
export function hiddenOn(ws: Workspace, board: Board): Set<string> {
  return new Set(ws.boardHidden?.[board] ?? [])
}

/** Whether a part of a dashboard is shown. Anything nobody has switched off is. */
export const shows = (ws: Workspace, board: Board, key: string): boolean => !hiddenOn(ws, board).has(key)

/** The pictures still shown, in order — how many decides the layout. */
export const shownPictures = (ws: Workspace, board: Board): BoardPart[] => {
  const hidden = hiddenOn(ws, board)
  return PICTURES[board].filter((p) => !hidden.has(p.key))
}

/**
 * Write what is switched off on one dashboard. Keys the dashboard does not
 * have are dropped, and an empty list removes the entry, so "back to the
 * usual" leaves nothing behind.
 */
export function setHiddenOn(ws: Workspace, board: Board, hidden: Iterable<string>): Workspace {
  const k = known(board)
  const list = [...new Set(hidden)].filter((key) => k.has(key)).sort()
  const { [board]: _gone, ...rest } = ws.boardHidden ?? {}
  const next = list.length > 0 ? { ...rest, [board]: list } : rest
  return { ...ws, boardHidden: Object.keys(next).length > 0 ? next : undefined }
}

/** A stored choice, read back: only boards that exist, only lists of words. */
export function readBoardHidden(raw: unknown): Workspace['boardHidden'] {
  if (!raw || typeof raw !== 'object') return undefined
  const out: Partial<Record<Board, string[]>> = {}
  for (const board of Object.keys(PICTURES) as Board[]) {
    const v = (raw as Record<string, unknown>)[board]
    if (!Array.isArray(v)) continue
    const k = known(board)
    const list = v.filter((x): x is string => typeof x === 'string' && k.has(x))
    if (list.length > 0) out[board] = list
  }
  return Object.keys(out).length > 0 ? out : undefined
}

/* --------------------------------------------------------------- layout -- */

// a six-column grid on a laptop: three pictures to a row, and a short last row shares it
const WELCOME_XL: Record<number, number[]> = {
  1: [6], 2: [3, 3], 3: [2, 2, 2], 4: [3, 3, 3, 3], 5: [2, 2, 2, 3, 3], 6: [2, 2, 2, 2, 2, 2],
}
const XL_SPAN: Record<number, string> = { 2: 'xl:col-span-2', 3: 'xl:col-span-3', 6: 'xl:col-span-6' }

/**
 * How wide each shown picture is, so the page closes up round what is left
 * rather than keeping a hole where a picture was.
 *
 * A desk draws its pictures two to a row; an odd one out takes the whole row.
 * The Welcome page draws three to a row on a laptop and two on a tablet; four
 * become two rows of two, and five a row of three over a row of two. Returned
 * as the class each card adds, keyed by picture.
 */
export function pictureSpans(board: Board, shown: string[]): Record<string, string> {
  const n = shown.length
  const out: Record<string, string> = {}
  shown.forEach((key, i) => {
    const lastOdd = n % 2 === 1 && i === n - 1
    if (board !== 'welcome') { out[key] = lastOdd ? 'md:col-span-2' : ''; return }
    out[key] = [lastOdd ? 'sm:col-span-2' : '', XL_SPAN[WELCOME_XL[n][i]]].filter(Boolean).join(' ')
  })
  return out
}
