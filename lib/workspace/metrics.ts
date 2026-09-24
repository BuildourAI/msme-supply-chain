/**
 * The figures an owner watches, and the honest answer when nothing measures one
 * yet.
 *
 * Every one of these is computed from records the owner made — a receipt, an
 * order, an accepted price. None is a target, a benchmark or an index, because
 * this build has never had a figure nobody can trace. Each carries the sentence
 * that says how it was worked out, so a number that looks wrong can be argued
 * with rather than believed.
 *
 * The important part is `measured`. A company on its first day has no
 * deliveries, so on-time delivery is not 100% and it is not 0% — it is unknown,
 * and the tile says so. A dashboard that fills its blanks with zeroes teaches
 * people to distrust the ones that are real.
 *
 * Nothing in `lib/domain/` is touched. Where a figure already exists there —
 * the rejection rate, landed cost — it is read, not reimplemented.
 */
import { recordAccuracy, isCountOverTolerance, remnantAgeDays } from '@/lib/domain/inventory'
import type { Item, ItemClass, Vendor } from '@/lib/domain/types'
import { atJobworkersValue, qcHeld, unackedExposure } from './inbound'
import { coverLots, isPhysical, isRemnant, lotRows } from './ledger'
import { netLossOf, scrapRows } from './losses'
import { daysInventoryOutstanding } from '@/lib/domain/exec'
import { buildRows } from '@/lib/domain/derive'
import { bundleFor } from './bundle'
import { closedReceipts, openReceipts, receiptsFor } from './receipts'
import { expired } from './sourcing'
import { HALT_WORD, lineRunsFor, lineWatch, stoppingThisWeek } from './linewatch'
import { haltsByCause } from './halts'
import { meanTurnaround } from './turnaround'
import { jobPlanRows } from './plan'
import { despatchedValue, overdueValue } from '@/lib/domain/dispatch'
import { consignmentRows, freightUnitOf, orderToDock, otifOf } from './consignments'
import { dispatchRulesOf } from './customers'
import { asNote, asOrderRow } from './dispatch-domain'
import { asFg, fgOnHand, productOf } from './products'
import { orderRows } from './sales'
import { returnRate } from './returns'
import type { Workspace } from './types'

/* -------------------------------------------------------------- the shape -- */

export type MetricTone = 'good' | 'warn' | 'critical' | 'neutral'

/**
 * The little picture on a tile, as data rather than as marks.
 *
 * Built here so it is pure and testable, and so a shape can only ever be made
 * of the figure's OWN arithmetic. `Sparkbars` set the rule this follows: draw
 * what the number is made of, never noise that looks like data — and a figure
 * with nothing behind it gets no picture at all rather than a decorative one.
 */
export type Chart =
  /** one mark per delivery judged, true where it landed by the promised day */
  | { kind: 'dots'; dots: boolean[] }
  /** the fastest, the usual and the slowest of the last six */
  | { kind: 'range'; low: number; mean: number; high: number }
  /** what arrived against what could not be used */
  | { kind: 'split'; good: number; bad: number }
  /** n of a countable whole — materials, rates */
  | { kind: 'pips'; on: number; of: number }
  /** one share of a total, as a closed arc */
  | { kind: 'ring'; pct: number }
  /** rates that moved, signed, biggest first */
  | { kind: 'moves'; values: number[] }
  /** how one total divides between suppliers, largest first */
  | { kind: 'stack'; parts: number[] }

export interface Metric {
  key: MetricKey
  /** what it is called on the tile */
  label: string
  /**
   * The figure, already formatted. A metric decides its own units — days,
   * per cent, rupees — and a tile that reformatted them would have to know
   * which is which.
   */
  value: string
  /** the line under it, naming what it is of */
  sub: string
  tone: MetricTone
  /** false when nothing has happened yet; `value` then says so in words */
  measured: boolean
  /** the screen holding the rows behind it */
  href?: string
  /** how it was worked out, for the owner who wants to argue with it */
  how: string
  /** its own numbers, drawn. Absent when there is nothing honest to draw. */
  chart?: Chart
}

export type MetricKey =
  | 'onTime' | 'lead' | 'defects' | 'flip' | 'stale'
  | 'singleSource' | 'concentration' | 'priceMoves' | 'outstanding'
  /* the gate's */
  | 'qcHeld' | 'inspectedOnTime' | 'atJobworkers' | 'unacked'
  /* the store's */
  | 'stockValue' | 'unconfirmed' | 'heldStock' | 'accuracy' | 'netLoss' | 'scrap' | 'dio'
  /* only with cutting switched on */
  | 'remnants'
  /* the floor's */
  | 'lineRunsFor' | 'jobsStopping' | 'attainment' | 'firstPass' | 'floorDays' | 'rmToFg' | 'haltDays'
  /* the bay's */
  | 'otif' | 'orderToDock' | 'pastPromise' | 'fgValue' | 'freightUnit' | 'carrierLate' | 'dispatchedMonth'
  /* only once a return has been agreed */
  | 'returnRate'

/** The desks that have a dashboard of figures. */
export type MetricStage = 'sourcing' | 'inbound' | 'inventory' | 'production' | 'dispatch'

/**
 * Which figures belong to which desk, in the order each shows them.
 *
 * Three appear on both, because both desks care: whether deliveries land on
 * time, how much of what lands is rejected, and which supplier's delivery time
 * cannot be planned around. They are the same figure on both screens, worked
 * out once.
 */
export const STAGE_METRICS: Record<MetricStage, MetricKey[]> = {
  sourcing: [
    'onTime', 'lead', 'defects', 'flip', 'stale',
    'singleSource', 'concentration', 'priceMoves', 'outstanding', 'unacked',
  ],
  inbound: ['qcHeld', 'inspectedOnTime', 'defects', 'onTime', 'lead'],
  inventory: ['stockValue', 'unconfirmed', 'accuracy', 'heldStock', 'atJobworkers', 'netLoss', 'scrap', 'dio', 'remnants'],
  production: ['lineRunsFor', 'jobsStopping', 'attainment', 'firstPass', 'floorDays', 'rmToFg', 'haltDays'],
  dispatch: ['otif', 'orderToDock', 'pastPromise', 'fgValue', 'freightUnit', 'carrierLate', 'dispatchedMonth', 'returnRate'],
}

/** Figures that belong to a switch in the store rules, and are not offered with it off. */
const NEEDS_CUTTING: MetricKey[] = ['remnants']

/** A return rate is not offered to a bay that has never agreed a return — nought would read as a verdict. */
const NEEDS_RETURNS: MetricKey[] = ['returnRate']

/**
 * What a new owner sees before they have chosen.
 *
 * Seven, not ten. The three left out — concentration, price moves, single
 * sourcing — are the ones you look at once a quarter, and a dashboard that
 * opens with everything on it is one nobody reads. What rides on changes the
 * supplier has not confirmed is here because confirming them is the buyer's.
 */
export const DEFAULT_PICKS: MetricKey[] = [
  'onTime', 'lead', 'defects', 'flip', 'stale', 'outstanding', 'unacked',
]

/**
 * The gate's, before anybody has chosen. The spread of lead times joins now
 * that confirming changes is sourcing's — it is what makes a delivery date
 * something the gate can plan a day around, or not.
 */
export const INBOUND_PICKS: MetricKey[] = [
  'qcHeld', 'inspectedOnTime', 'defects', 'onTime', 'lead',
]

/**
 * The store's, before anybody has chosen: what it is worth, whether the book
 * can be believed, and how much of it is in somebody else's shed. Remnants
 * join them in a store that cuts — and are not offered in one that does not,
 * so there it is the first seven.
 */
export const INVENTORY_PICKS: MetricKey[] = [
  'stockValue', 'unconfirmed', 'accuracy', 'heldStock', 'atJobworkers', 'netLoss', 'scrap', 'remnants',
]

export const DEFAULTS_FOR: Record<MetricStage, MetricKey[]> = {
  sourcing: DEFAULT_PICKS,
  inbound: INBOUND_PICKS,
  inventory: INVENTORY_PICKS,
  production: ['lineRunsFor', 'jobsStopping', 'attainment', 'firstPass', 'floorDays', 'haltDays'],
  dispatch: ['otif', 'orderToDock', 'pastPromise', 'fgValue', 'freightUnit', 'dispatchedMonth', 'returnRate'],
}

export const METRIC_LABEL: Record<MetricKey, string> = {
  onTime: 'On-time delivery',
  lead: 'Least predictable',
  defects: 'Rejected on arrival',
  flip: 'Cheapest ≠ cheapest',
  stale: 'Prices run out',
  singleSource: 'Single-sourced',
  concentration: 'Largest supplier',
  priceMoves: 'Price moves',
  outstanding: 'Still out',
  qcHeld: 'Held at the gate',
  inspectedOnTime: 'Inspected in time',
  atJobworkers: 'At jobworkers',
  unacked: 'Not yet confirmed',
  stockValue: 'Stock on the shelf',
  unconfirmed: 'Not counted in time',
  heldStock: 'Held, not usable',
  accuracy: 'Record accuracy',
  netLoss: 'Net loss',
  scrap: 'Scrap against target',
  dio: 'Days of stock',
  remnants: 'Remnants on the racks',
  lineRunsFor: 'The line runs for',
  jobsStopping: 'Jobs stopping this week',
  attainment: 'Plan attainment',
  firstPass: 'Right first time',
  floorDays: 'Days on the floor',
  rmToFg: 'Raw material to finished',
  haltDays: 'Days halted',
  otif: 'On time, in full',
  orderToDock: 'Order to dock',
  pastPromise: 'Past the promise',
  fgValue: 'Finished stock',
  freightUnit: 'Freight per unit',
  carrierLate: 'Delivered late',
  dispatchedMonth: 'Dispatched this month',
  returnRate: 'Returned',
}

/** One line each, for the dialog where the owner picks. */
export const METRIC_WHY: Record<MetricKey, string> = {
  onTime: 'How often deliveries land by the date the supplier gave.',
  lead: 'The supplier whose delivery time swings most — the average hides it.',
  defects: 'How much of what arrives you cannot use.',
  flip: 'Materials where the cheapest quote is not the cheapest material.',
  stale: 'Rates still ranking suppliers on a quotation that has expired.',
  singleSource: 'Materials only one supplier quotes. The quiet exposure.',
  concentration: 'How much of your ordering sits with one supplier.',
  priceMoves: 'Rates that changed, and by how much.',
  outstanding: 'Money on orders placed and not yet delivered.',
  qcHeld: 'Material that has arrived and cannot be used until somebody inspects it.',
  inspectedOnTime: 'How often a receipt is inspected within the days your gate rules allow.',
  atJobworkers: 'Your material in sheds you do not control. Never counted as stock you can use.',
  unacked: 'Changes to orders that the supplier has not confirmed — money riding on hope.',
  stockValue: 'What usable stock is worth at what you last paid for it.',
  unconfirmed: 'Stock nobody has counted within its class’s counting cadence — not wrong, unverified.',
  heldStock: 'Stock on the premises that cannot be used: on hold, damaged, expired.',
  accuracy: 'How often the book is right when somebody counts — inside the tolerance for its class.',
  netLoss: 'What material lost this month cost, less what its scrap fetched.',
  scrap: 'Scrap on the floor as a share of what was issued, for the material furthest over its target.',
  dio: 'How many days the usable stock would last at the rate it is used — money sitting on the shelf.',
  remnants: 'What the offcuts on the racks are worth, and how much of it is past the age a remnant gets used by.',
  lineRunsFor: 'Days until the tightest material runs out at the rate it is used — the day the floor stops if nothing arrives.',
  jobsStopping: 'This week’s jobs that are halted, will halt for want of material, or are at risk.',
  attainment: 'Good pieces made against what the plan said should be made by today, over the jobs running now.',
  firstPass: 'Of every piece off the floor this month, the share that was good first time.',
  floorDays: 'How long a job takes from its first issue of material to its last output — over jobs closed in the last 90 days.',
  rmToFg: 'From the day material came onto the book to the day the finished product came off the floor — shelf time and floor time added.',
  haltDays: 'Working days jobs stood still this month, and the cause that cost most.',
  otif: 'Of the consignments somebody confirmed as delivered, the share that landed by the promised day with the whole order gone.',
  orderToDock: 'Days from taking an order to the goods leaving the bay — the wait a customer feels before anything moves.',
  pastPromise: 'What is still to go on orders whose promised day has passed, at the order’s own rates.',
  fgValue: 'Finished goods on the shelf, at what each costs you to make.',
  freightUnit: 'What the carriers billed, per piece shipped — the figure a creeping surcharge shows up in.',
  carrierLate: 'Of this month’s confirmed deliveries, the share that landed after the day the customer was given.',
  dispatchedMonth: 'What left the building this month, at what it cost to make.',
  returnRate: 'Of every piece shipped, the share customers were agreed to send back — counted when agreed, not when it arrives.',
}

/* ------------------------------------------------------------- the maths -- */

const pct = (n: number) => `${Math.round(n * 10) / 10}%`
const money = (n: number) =>
  `₹${new Intl.NumberFormat('en-IN', { maximumFractionDigits: 0 }).format(Math.round(n))}`

const nameOf = (xs: { id: string; name: string }[], id: string) =>
  xs.find((x) => x.id === id)?.name ?? 'Unknown'

/**
 * Deliveries that landed by the date the supplier gave.
 *
 * Only receipts that carry a promise count. One recorded before the promise
 * was kept has nothing to be judged against, and counting it as on time would
 * flatter every supplier who was measured before this existed.
 */
export function onTimePct(ws: Workspace): { pct: number; of: number } | null {
  const judged = (ws.receipts ?? []).filter((r) => Boolean(r.expectedOn))
  if (judged.length === 0) return null
  const kept = judged.filter((r) => r.receivedOn <= (r.expectedOn as string)).length
  return { pct: (kept / judged.length) * 100, of: judged.length }
}

/**
 * Each judged delivery, in order, true where it landed by the promised day.
 *
 * The percentage says how often; this says which, and a run of three reds at
 * the end means something a single figure cannot.
 */
export function onTimeRun(ws: Workspace, cap = 14): boolean[] {
  return (ws.receipts ?? [])
    .filter((r) => Boolean(r.expectedOn))
    .sort((a, b) => a.receivedOn.localeCompare(b.receivedOn))
    .slice(-cap)
    .map((r) => r.receivedOn <= (r.expectedOn as string))
}

/** How one supplier's share of the ordering divides, largest first. */
export function orderShares(ws: Workspace, cap = 6): number[] {
  const live = ws.orders.filter((o) => o.state !== 'cancelled')
  const total = live.reduce((a, o) => a + o.qty * o.unitPrice, 0)
  if (total <= 0) return []
  const byVendor = new Map<string, number>()
  for (const o of live) {
    byVendor.set(o.vendorId, (byVendor.get(o.vendorId) ?? 0) + o.qty * o.unitPrice)
  }
  return [...byVendor.values()]
    .sort((a, b) => b - a)
    .slice(0, cap)
    .map((v) => (v / total) * 100)
}

export interface Spread {
  vendorId: string
  itemId: string
  mean: number
  low: number
  high: number
  /** how far apart the best and worst of the last six were */
  swing: number
}

/**
 * How unpredictable each supplier is on each material.
 *
 * The mean is already computed for the reorder point, and it is the figure
 * that gets an owner into trouble: seven days on average across four and
 * twenty-one is worse than twelve days every time, because you can plan around
 * twelve. `trailingLeadTimeDays` in `calc.ts` works the spans out and returns
 * only the mean; this reads the same receipts and keeps the spread.
 *
 * Two receipts minimum. One delivery has no spread, and calling it perfectly
 * predictable would be the opposite of the truth.
 */
export function leadSpreads(ws: Workspace): Spread[] {
  const out: Spread[] = []
  for (const vi of ws.vendorItems) {
    const mine = receiptsFor(ws, vi.vendorId, vi.itemId).slice(-6)
    if (mine.length < 2) continue
    const spans = mine.map((r) => days(r.orderedOn, r.receivedOn))
    const low = Math.min(...spans)
    const high = Math.max(...spans)
    out.push({
      vendorId: vi.vendorId,
      itemId: vi.itemId,
      mean: Math.round((spans.reduce((a, b) => a + b, 0) / spans.length) * 10) / 10,
      low,
      high,
      swing: high - low,
    })
  }
  return out.sort((a, b) => b.swing - a.swing)
}

const days = (from: string, to: string) =>
  Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86400000)

/** What you cannot use, across everything that has arrived. */
export function defectPct(
  ws: Workspace,
): { pct: number; of: number; good: number; bad: number } | null {
  // inspected purchases only: an open receipt has had nothing rejected YET,
  // and a jobwork return measures a jobworker, not a supplier
  const rs = closedReceipts(ws).filter((r) => Boolean(r.orderId))
  if (rs.length === 0) return null
  const qty = rs.reduce((a, r) => a + r.qty, 0)
  if (qty <= 0) return null
  const bad = rs.reduce((a, r) => a + r.rejected, 0)
  return { pct: (bad / qty) * 100, of: rs.length, good: qty - bad, bad }
}

/**
 * What the comparison on one material looks like right now.
 *
 * Stored when the owner waves a flip through, and compared when the queue is
 * built. A signature rather than a date, so the question returns when the
 * answer might have changed rather than merely when time has passed.
 */
export function flipSignature(ws: Workspace, itemId: string): string {
  const mine = ws.vendorItems.filter((vi) => vi.itemId === itemId)
  if (mine.length === 0) return ''
  const best = [...mine].sort((a, b) => landedOf(a) - landedOf(b))[0]
  return `${best.vendorId}:${Math.round(landedOf(best) * 100)}`
}

const landedOf = (vi: {
  rate: number; freightPerUnit: number; nonCreditableGst: number
  paymentTermCost: number; rejectionAllowance: number
}) => vi.rate + vi.freightPerUnit + vi.nonCreditableGst
  + vi.paymentTermCost + vi.rejectionAllowance

/** Materials where the cheapest quoted rate is not the cheapest material. */
export function flippingItems(ws: Workspace): string[] {
  const byItem = new Map<string, typeof ws.vendorItems>()
  for (const vi of ws.vendorItems) byItem.set(vi.itemId, [...(byItem.get(vi.itemId) ?? []), vi])

  const out: string[] = []
  for (const [itemId, quotes] of byItem) {
    if (quotes.length < 2) continue
    const byRate = [...quotes].sort((a, b) => a.rate - b.rate)[0]
    const byLanded = [...quotes].sort((a, b) => landedOf(a) - landedOf(b))[0]
    if (byRate.vendorId !== byLanded.vendorId) out.push(itemId)
  }
  return out
}

/** Materials only one supplier quotes — and the ones nobody quotes at all. */
export function sourcing(ws: Workspace): { alone: string[]; none: string[] } {
  const alone: string[] = []
  const none: string[] = []
  for (const it of ws.items) {
    const n = ws.vendorItems.filter((vi) => vi.itemId === it.id).length
    if (n === 0) none.push(it.id)
    else if (n === 1) alone.push(it.id)
  }
  return { alone, none }
}

/**
 * How much of your ordering sits with one supplier.
 *
 * Of what has been ORDERED, not paid — there are no invoices in this build and
 * §12 keeps it that way. Cancelled lines are left out: an order you called off
 * is not business you gave anybody.
 */
export function concentration(ws: Workspace): { vendorId: string; share: number } | null {
  const live = ws.orders.filter((o) => o.state !== 'cancelled')
  const total = live.reduce((a, o) => a + o.qty * o.unitPrice, 0)
  if (total <= 0) return null

  const byVendor = new Map<string, number>()
  for (const o of live) {
    byVendor.set(o.vendorId, (byVendor.get(o.vendorId) ?? 0) + o.qty * o.unitPrice)
  }
  const [vendorId, value] = [...byVendor].sort((a, b) => b[1] - a[1])[0]
  return { vendorId, share: (value / total) * 100 }
}

export interface Move {
  vendorId: string
  itemId: string
  pct: number
  on: string
}

/**
 * Rates that moved, newest first, biggest move at the top.
 *
 * A first rate is not a move — there was nothing to move from — so anything
 * logged against a `was` of zero is left out rather than shown as an infinite
 * rise.
 */
export function priceMoves(ws: Workspace, sinceDays = 90, today = ''): Move[] {
  const cut = today ? addDays(today, -sinceDays) : ''
  return (ws.rateLog ?? [])
    .filter((c) => c.was > 0 && (!cut || c.on >= cut))
    .map((c) => ({
      vendorId: c.vendorId,
      itemId: c.itemId,
      pct: ((c.now - c.was) / c.was) * 100,
      on: c.on,
    }))
    .sort((a, b) => Math.abs(b.pct) - Math.abs(a.pct))
}

const addDays = (iso: string, n: number) => {
  const d = new Date(`${iso}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}

/** What is on orders placed and not yet delivered. */
export function outstandingValue(ws: Workspace): number {
  return ws.orders
    .filter((o) => o.state !== 'delivered' && o.state !== 'cancelled')
    .reduce((a, o) => a + o.qty * o.unitPrice, 0)
}

/* -------------------------------------------------------------- the tiles -- */

/**
 * Every figure, whether or not the owner has chosen to show it.
 *
 * The picking happens on the screen, over this list, so a metric that is
 * switched off is still computed and still testable — and switching it on
 * cannot be the moment it first breaks.
 */
export function metricsFor(ws: Workspace, today: string): Metric[] {
  const items = ws.items as Item[]
  const vendors = ws.vendors as Vendor[]

  const ot = onTimePct(ws)
  const spread = leadSpreads(ws)[0]
  const def = defectPct(ws)
  const flip = flippingItems(ws)
  const src = sourcing(ws)
  const con = concentration(ws)
  const moves = priceMoves(ws, 90, today)
  const stale = ws.vendorItems.filter((vi) => expired(vi.quoteValidUntil, today))
  const out = outstandingValue(ws)
  const run = onTimeRun(ws)
  const shares = orderShares(ws)
  // only materials two suppliers quote can flip, so that is what the pips count
  const comparable = new Set(
    ws.items.map((i) => i.id)
      .filter((id) => ws.vendorItems.filter((vi) => vi.itemId === id).length > 1),
  ).size

  const nothing = nothingOf

  return [
    ot
      ? {
        key: 'onTime', label: METRIC_LABEL.onTime, value: pct(ot.pct),
        sub: `of ${ot.of} deliver${ot.of === 1 ? 'y' : 'ies'}`,
        tone: ot.pct >= 90 ? 'good' : ot.pct >= 75 ? 'warn' : 'critical',
        measured: true, href: '/sourcing/orders',
        how: 'received_on ≤ expected_on, over every receipt carrying a promised date',
        chart: { kind: 'dots', dots: run },
      }
      : nothing('onTime', 'No deliveries yet',
        'needs a receipt recorded against an order that had a delivery date'),

    spread
      ? {
        key: 'lead', label: METRIC_LABEL.lead,
        value: `${spread.low}–${spread.high} days`,
        sub: `${nameOf(vendors, spread.vendorId)} · ${nameOf(items, spread.itemId)}`,
        tone: spread.swing >= 7 ? 'critical' : spread.swing >= 3 ? 'warn' : 'good',
        measured: true, href: '/sourcing/suppliers',
        how: 'widest gap between the fastest and slowest of the last 6 receipts, '
          + 'across every supplier-material pairing',
        chart: { kind: 'range', low: spread.low, mean: spread.mean, high: spread.high },
      }
      : nothing('lead', 'Not enough receipts',
        'needs two receipts on one supplier-material pairing before there is a spread'),

    def
      ? {
        key: 'defects', label: METRIC_LABEL.defects, value: pct(def.pct),
        sub: `across ${def.of} deliver${def.of === 1 ? 'y' : 'ies'}`,
        tone: def.pct <= 1 ? 'good' : def.pct <= 4 ? 'warn' : 'critical',
        measured: true, href: '/sourcing/compare',
        how: 'Σ rejected ÷ Σ received, over every receipt',
        chart: { kind: 'split', good: def.good, bad: def.bad },
      }
      : nothing('defects', 'Nothing received yet',
        'needs a receipt recording what was accepted and what was not'),

    ws.vendorItems.length > 0
      ? {
        key: 'flip', label: METRIC_LABEL.flip, value: String(flip.length),
        sub: flip.length === 0
          ? 'cheapest quote is cheapest everywhere'
          : `material${flip.length === 1 ? '' : 's'} to look at`,
        tone: flip.length === 0 ? 'good' : 'warn',
        measured: true, href: '/sourcing/compare',
        how: 'materials where the lowest rate and the lowest landed cost are different suppliers',
        // no material has two suppliers yet, so there is no whole to count
        // against — a lone grey pip would be a picture of nothing
        chart: comparable > 0
          ? { kind: 'pips', on: flip.length, of: Math.max(comparable, flip.length) }
          : undefined,
      }
      : nothing('flip', 'No rates on file',
        'needs two suppliers quoting one material before there is a comparison'),

    ws.vendorItems.length > 0
      ? {
        key: 'stale', label: METRIC_LABEL.stale, value: String(stale.length),
        sub: stale.length === 0 ? 'every price still holds' : 'ask for them again',
        tone: stale.length === 0 ? 'good' : 'critical',
        measured: true, href: '/sourcing/compare',
        how: 'rates whose quotation validity is earlier than today',
        chart: { kind: 'pips', on: stale.length, of: ws.vendorItems.length },
      }
      : nothing('stale', 'No rates on file',
        'needs an accepted price carrying the validity its quotation gave'),

    ws.items.length > 0
      ? {
        key: 'singleSource', label: METRIC_LABEL.singleSource,
        value: `${src.alone.length + src.none.length} of ${ws.items.length}`,
        sub: src.none.length > 0
          ? `${src.none.length} with no supplier at all`
          : 'only one supplier quotes them',
        tone: src.none.length > 0 ? 'critical' : src.alone.length > 0 ? 'warn' : 'good',
        measured: true, href: '/sourcing/materials',
        how: 'materials quoted by one supplier or none',
        chart: { kind: 'pips', on: src.alone.length + src.none.length, of: ws.items.length },
      }
      : nothing('singleSource', 'No materials yet',
        'needs a material on file before its suppliers can be counted'),

    con
      ? {
        key: 'concentration', label: METRIC_LABEL.concentration,
        value: pct(con.share), sub: `of ordering goes to ${nameOf(vendors, con.vendorId)}`,
        tone: con.share >= 70 ? 'critical' : con.share >= 50 ? 'warn' : 'good',
        measured: true, href: '/sourcing/orders',
        how: 'largest share of order value (qty × rate) held by one supplier, '
          + 'cancelled orders excluded. Ordered, not paid — this build holds no invoices',
        chart: { kind: 'ring', pct: con.share },
      }
      : nothing('concentration', 'Nothing ordered yet',
        'needs a purchase order with a quantity and a rate on it'),

    moves.length > 0
      ? {
        key: 'priceMoves', label: METRIC_LABEL.priceMoves,
        value: `${moves[0].pct > 0 ? '+' : ''}${Math.round(moves[0].pct * 10) / 10}%`,
        sub: `${nameOf(items, moves[0].itemId)} · ${nameOf(vendors, moves[0].vendorId)}`,
        tone: moves[0].pct > 5 ? 'critical' : moves[0].pct > 0 ? 'warn' : 'good',
        measured: true, href: '/sourcing/compare',
        how: 'biggest rate change in the last 90 days. A first rate is not a move',
        chart: { kind: 'moves', values: moves.slice(0, 8).map((m) => m.pct) },
      }
      : nothing('priceMoves', 'No price has moved',
        'a rate is logged when it changes — nothing has changed yet'),

    ws.orders.length > 0
      ? {
        key: 'outstanding', label: METRIC_LABEL.outstanding, value: money(out),
        sub: 'on orders not yet delivered',
        tone: 'neutral', measured: true, href: '/sourcing/orders',
        how: 'Σ qty × rate on orders that are neither delivered nor cancelled',
        chart: shares.length > 1 ? { kind: 'stack', parts: shares } : undefined,
      }
      : nothing('outstanding', 'Nothing ordered yet',
        'needs a purchase order that is neither delivered nor called off'),

    ...gateMetrics(ws, today, nothing),
    ...storeMetrics(ws, today, nothing),
  ]
}

/**
 * The store's figures.
 *
 * All at the last purchase price, ex-freight (§13-1), the one basis every
 * screen values stock at. FIFO and weighted average are not modelled, and the
 * working says so rather than implying otherwise.
 */
function storeMetrics(
  ws: Workspace, today: string,
  nothing: (key: MetricKey, value: string, how: string) => Metric,
): Metric[] {
  const rate = (itemId: string) => ws.items.find((i) => i.id === itemId)?.lastPurchaseRate ?? 0
  const lots = ws.stockLots.filter((l) => l.qty > 0 && isPhysical(l))
  const usable = coverLots(ws).filter((l) => l.usability === 'usable')
  const value = usable.reduce((a, l) => a + l.qty * rate(l.itemId), 0)
  const held = lots.filter((l) => l.usability !== 'usable')
  const heldValue = held.reduce((a, l) => a + l.qty * rate(l.itemId), 0)

  // the six materials worth most, as shares of the whole
  const byItem = new Map<string, number>()
  for (const l of usable) byItem.set(l.itemId, (byItem.get(l.itemId) ?? 0) + l.qty * rate(l.itemId))
  const parts = [...byItem.values()].filter((v) => v > 0).sort((a, b) => b - a).slice(0, 6)
    .map((v) => (value > 0 ? Math.round((v / value) * 1000) / 10 : 0))

  const rows = today ? lotRows(ws, today).filter((r) => !r.correction && r.lot.qty > 0) : []
  const due = rows.filter((r) => r.due)
  const dueValue = due.reduce((a, r) => a + r.value.value, 0)

  const clsOf = (itemId: string): ItemClass => ws.items.find((i) => i.id === itemId)?.itemClass ?? 'C'
  // a lot found on a count had no book to be right or wrong against, so it is not judged
  const counts = [...(ws.counts ?? [])].filter((c) => c.bookQty !== 0)
    .sort((a, b) => a.on.localeCompare(b.on) || a.id.localeCompare(b.id))
  const acc = recordAccuracy(counts.map((count) => ({ count, cls: clsOf(count.itemId) })), ws.policy)

  const month = (today || '').slice(0, 7)
  const monthLosses = month ? (ws.losses ?? []).filter((l) => l.on.slice(0, 7) === month) : []
  const net = netLossOf(ws, monthLosses)
  const gross = monthLosses.reduce((a, l) => a + l.qty * rate(l.itemId), 0)
  const scraps = month ? scrapRows(ws, month).filter((r) => r.issued > 0) : []
  const worst = scraps.sort((a, b) => (b.pct.value - b.target) - (a.pct.value - a.target))[0]
  const dio = daysInventoryOutstanding(today ? buildRows(bundleFor(ws, today), ws.policy) : [])
  const burn = ws.items.reduce((a, i) => a + i.avgDailyConsumption * i.lastPurchaseRate, 0)

  const remnants = ws.stockLots.filter((l) => isRemnant(l) && l.qty > 0)
  const remnantValue = remnants.reduce((a, l) => a + l.qty * rate(l.itemId), 0)
  const aged = today ? remnants.filter((l) => remnantAgeDays(l.on ?? today, today).value > ws.policy.remnantAgeDays) : []

  return [
    lots.length > 0 && value > 0
      ? {
        key: 'stockValue', label: METRIC_LABEL.stockValue, value: money(value),
        sub: `usable, across ${byItem.size} material${byItem.size === 1 ? '' : 's'}`,
        tone: 'neutral', measured: true, href: '/inventory/ledger',
        how: 'Σ usable qty × last purchase rate, ex-freight — remnants and held stock left out',
        chart: parts.length > 1 ? { kind: 'stack', parts } : undefined,
      }
      : lots.length > 0
        ? nothing('stockValue', 'No price yet',
          'needs a price for what is on the shelf — a supplier’s rate, or a receipt against an order')
        : nothing('stockValue', 'Nothing counted yet', 'needs stock counted onto the book'),

    rows.length > 0
      ? {
        key: 'unconfirmed', label: METRIC_LABEL.unconfirmed, value: money(dueValue),
        sub: due.length === 0 ? 'every lot counted within its cadence'
          : `${due.length} of ${rows.length} lots past their counting date`,
        tone: due.length === 0 ? 'good' : 'warn',
        measured: true, href: '/inventory/ledger',
        how: 'Σ value of lots whose last count or movement is older than their class’s counting cadence',
        chart: { kind: 'pips', on: due.length, of: rows.length },
      }
      : nothing('unconfirmed', 'Nothing counted yet', 'needs stock counted onto the book'),

    counts.length > 0
      ? {
        key: 'accuracy', label: METRIC_LABEL.accuracy, value: pct(acc.value),
        sub: `of ${counts.length} count${counts.length === 1 ? '' : 's'} inside tolerance`,
        tone: acc.value >= 95 ? 'good' : acc.value >= 85 ? 'warn' : 'critical',
        measured: true, href: '/inventory/ledger',
        how: 'counts inside their class tolerance ÷ counts taken',
        chart: {
          kind: 'dots',
          dots: counts.slice(-14).map((c) => !isCountOverTolerance(c, clsOf(c.itemId), ws.policy)),
        },
      }
      : nothing('accuracy', 'Nothing recounted yet',
        'needs a lot counted against the book — walk a rack'),

    lots.length > 0
      ? {
        key: 'heldStock', label: METRIC_LABEL.heldStock, value: money(heldValue),
        sub: held.length === 0 ? 'everything on the shelf is usable'
          : `${held.length} lot${held.length === 1 ? '' : 's'} on hold, damaged or expired`,
        tone: held.length === 0 ? 'good' : 'warn',
        measured: true, href: '/inventory/ledger',
        how: 'Σ qty × last purchase rate over lots that are not usable — on the premises, never cover',
        chart: held.length > 0 ? { kind: 'pips', on: held.length, of: lots.length } : undefined,
      }
      : nothing('heldStock', 'Nothing counted yet', 'needs stock counted onto the book'),

    monthLosses.length > 0
      ? {
        key: 'netLoss', label: METRIC_LABEL.netLoss, value: money(net.value),
        sub: `this month, on ${monthLosses.length} loss record${monthLosses.length === 1 ? '' : 's'}`,
        tone: net.value > 0 ? 'warn' : 'good', measured: true, href: '/inventory/wastage',
        how: 'Σ qty × last purchase rate − what the scrap fetched (the estimate, until it is sold)',
        chart: gross > 0 ? { kind: 'split', good: Math.max(0, gross - net.value), bad: net.value } : undefined,
      }
      : nothing('netLoss', 'No loss this month', 'a loss is recorded by a count, a write-off, wastage on a job or a jobworker'),

    worst
      ? {
        key: 'scrap', label: METRIC_LABEL.scrap, value: pct(worst.pct.value),
        sub: `${worst.item.name} · target ${worst.target}%`,
        tone: worst.over ? 'critical' : worst.pct.value > worst.target ? 'warn' : 'good',
        measured: true, href: '/inventory/wastage',
        how: 'floor scrap ÷ material issued this month, for the material furthest over its class target',
        chart: { kind: 'ring', pct: Math.min(100, worst.pct.value) },
      }
      : nothing('scrap', 'Nothing issued this month', 'needs material issued to a job, and wastage recorded against it'),

    burn > 0 && value > 0
      ? {
        key: 'dio', label: METRIC_LABEL.dio, value: `${dio.d.value} days`,
        sub: 'of usable stock at the rate it is used',
        tone: dio.d.value <= 30 ? 'good' : dio.d.value <= 60 ? 'warn' : 'critical',
        measured: true, href: '/inventory/ledger',
        how: 'Σ usable × last price ÷ Σ daily use × last price — raw material only, remnants and held stock out',
      }
      : nothing('dio', 'Not enough to say', 'needs usable stock with a price, and a daily use on its material'),

    remnants.length > 0
      ? {
        // a remnant of a material nobody has priced is still a remnant: counted, never "₹0"
        key: 'remnants', label: METRIC_LABEL.remnants,
        value: remnantValue > 0 ? money(remnantValue) : `${remnants.length} remnant${remnants.length === 1 ? '' : 's'}`,
        sub: aged.length === 0
          ? `${remnants.length} remnant${remnants.length === 1 ? '' : 's'}, none past ${ws.policy.remnantAgeDays} days`
          : `${aged.length} of ${remnants.length} past ${ws.policy.remnantAgeDays} days`,
        tone: aged.length === 0 ? 'neutral' : 'warn',
        measured: true, href: '/inventory/offcuts',
        how: 'Σ remnant qty × last purchase rate — on the book, never counted as cover',
        chart: { kind: 'pips', on: aged.length, of: remnants.length },
      }
      : nothing('remnants', 'No remnants yet', 'a remnant is made by a cut, or a short piece returned from a job'),
  ]
}

/**
 * The gate's four.
 *
 * Each is unmeasured until the thing it measures has happened at least once —
 * nothing at the gate ever, nothing inspected through it, no challan, no order
 * handed over under version control — and says what it is waiting for, the
 * same rule as every other tile.
 */
function gateMetrics(
  ws: Workspace, today: string,
  nothing: (key: MetricKey, value: string, how: string) => Metric,
): Metric[] {
  const receipts = ws.receipts ?? []
  const open = openReceipts(ws)
  const held = qcHeld(ws).value
  const overdue = open.filter((r) => days(r.receivedOn, today) > ws.policy.qcOverdueDays).length

  // inspected through the gate, not recorded as finished before it existed
  const gated = receipts.filter((r) => r.status === 'closed' && r.closedAt)
    .sort((a, b) => a.receivedOn.localeCompare(b.receivedOn))
  const inTime = gated.map((r) => days(r.receivedOn, r.closedAt!) <= ws.policy.inboundQcDays)
  const inTimePct = gated.length ? (inTime.filter(Boolean).length / gated.length) * 100 : 0

  const challans = ws.challans ?? []
  const out = challans.filter((c) => c.status === 'out')
  const atJw = atJobworkersValue(ws, today)

  const versioned = ws.orders.some((o) => (o.revisions?.length ?? 0) > 0)
  const unacked = unackedExposure(ws).value

  return [
    receipts.length > 0
      ? {
        key: 'qcHeld', label: METRIC_LABEL.qcHeld, value: money(held),
        sub: open.length === 0 ? 'nothing waiting to be inspected'
          : `${open.length} receipt${open.length === 1 ? '' : 's'} at the gate${
            overdue ? ` · ${overdue} past the window` : ''}`,
        tone: open.length === 0 ? 'good' : overdue > 0 ? 'critical' : 'warn',
        measured: true, href: '/inbound/receiving',
        how: 'Σ qty × last purchase rate over receipts not yet inspected (§13-1 basis)',
        chart: open.length > 0 ? { kind: 'pips', on: overdue, of: open.length } : undefined,
      }
      : nothing('qcHeld', 'Nothing has arrived yet',
        'needs goods recorded at the gate'),

    gated.length > 0
      ? {
        key: 'inspectedOnTime', label: METRIC_LABEL.inspectedOnTime, value: pct(inTimePct),
        sub: `of ${gated.length} inspection${gated.length === 1 ? '' : 's'} · within ${
          ws.policy.inboundQcDays} day${ws.policy.inboundQcDays === 1 ? '' : 's'}`,
        tone: inTimePct >= 90 ? 'good' : inTimePct >= 70 ? 'warn' : 'critical',
        measured: true, href: '/inbound/receiving',
        how: 'receipts closed within the inspection days your gate rules allow ÷ receipts closed',
        chart: { kind: 'dots', dots: inTime.slice(-14) },
      }
      : nothing('inspectedOnTime', 'Nothing inspected yet',
        'needs a receipt inspected and closed at the gate'),

    challans.length > 0
      ? {
        key: 'atJobworkers', label: METRIC_LABEL.atJobworkers, value: money(atJw),
        sub: out.length === 0 ? 'nothing out at the moment'
          : `on ${out.length} challan${out.length === 1 ? '' : 's'} out`,
        tone: atJw > ws.policy.jobworkerExposureCeiling ? 'warn' : 'neutral',
        measured: true, href: '/inventory/jobwork',
        how: 'what is still physically with each jobworker × the rate it left at — never counted as cover',
      }
      : nothing('atJobworkers', 'Nothing sent out',
        'needs a challan for material sent to a jobworker'),

    versioned
      ? {
        key: 'unacked', label: METRIC_LABEL.unacked, value: money(unacked),
        sub: unacked === 0 ? 'every change is confirmed' : 'on changes the supplier has not confirmed',
        tone: unacked === 0 ? 'good' : 'critical',
        measured: true, href: '/sourcing/orders',
        how: 'Σ |what we now want − what the supplier confirmed| × last purchase rate',
      }
      : nothing('unacked', 'No order handed over yet',
        'needs an order handed to its supplier, so there is a version they hold'),
  ]
}

const nothingOf = (key: MetricKey, value: string, how: string): Metric => ({
  key, label: METRIC_LABEL[key], value, sub: 'nothing to measure yet',
  tone: 'neutral', measured: false, how,
})

/**
 * The floor's figures.
 *
 * The line-runs-for figure is the domain's production cover over the owner's
 * own materials; the rest are sums over output booked and the plan on each
 * job, so each is unmeasured until something has been booked.
 */
function productionMetrics(
  ws: Workspace, today: string,
  nothing: (key: MetricKey, value: string, how: string) => Metric,
): Metric[] {
  const runs = lineRunsFor(ws)
  const watch = lineWatch(ws, today)
  const week = watch.filter((w) => w.inWeek)
  const stopping = stoppingThisWeek(watch)
  const halting = stopping.filter((w) => w.status === 'halted' || w.status === 'will_halt').length
  const running = jobPlanRows(ws, today).filter((r) => r.planned && !r.job.closedOn && r.target > 0)
  const made = running.reduce((a, r) => a + r.made, 0)
  const target = running.reduce((a, r) => a + r.target, 0)
  const month = today.slice(0, 7)
  const booked = (ws.outputs ?? []).filter((o) => o.on.slice(0, 7) === month)
  const good = booked.reduce((a, o) => a + o.good, 0)
  const bad = booked.reduce((a, o) => a + o.rejected, 0)
  const pct1 = (n: number) => `${Math.round(n * 10) / 10}%`
  const turn = meanTurnaround(ws, today)
  const causes = haltsByCause(ws, month, today)
  const downDays = causes.reduce((a, c) => a + c.days, 0)

  return [
    runs && Number.isFinite(runs.days.value)
      ? {
        key: 'lineRunsFor', label: METRIC_LABEL.lineRunsFor, value: `${Math.round(runs.days.value * 10) / 10} days`,
        sub: `${runs.item.name} runs out first, at ${runs.item.floorConsumptionPerDay || runs.item.avgDailyConsumption} ${runs.item.uom} a day`,
        tone: runs.days.value < 7 ? 'critical' : runs.days.value < 15 ? 'warn' : 'good',
        measured: true, href: '/production/line-watch',
        how: 'min over materials of usable stock ÷ used per day — the rate you gave for each material',
      }
      : nothing('lineRunsFor', 'Not enough to say', 'needs a material with stock counted and a daily use'),

    week.length > 0
      ? {
        key: 'jobsStopping', label: METRIC_LABEL.jobsStopping, value: String(stopping.length),
        sub: stopping.length === 0 ? `all ${week.length} of this week’s jobs will run`
          : `${halting} will halt · ${stopping.length - halting} at risk, of ${week.length}`,
        tone: halting > 0 ? 'critical' : stopping.length > 0 ? 'warn' : 'good',
        measured: true, href: '/production/line-watch',
        how: 'count of this week’s planned jobs that are halted, short of material, or at risk',
        chart: { kind: 'pips', on: stopping.length, of: week.length },
      }
      : nothing('jobsStopping', 'Nothing planned this week', 'needs a style planned with dates that fall in this week'),

    target > 0
      ? {
        key: 'attainment', label: METRIC_LABEL.attainment, value: pct1((made / target) * 100),
        sub: `${made} made of ${target} due by today, over ${running.length} running job${running.length === 1 ? '' : 's'}`,
        tone: made >= target * 0.95 ? 'good' : made >= target * 0.8 ? 'warn' : 'critical',
        measured: true, href: '/production/plan',
        how: 'Σ good pieces ÷ Σ target to date (pieces a day × working days since the start, never past the quantity)',
        chart: { kind: 'ring', pct: Math.min(100, (made / target) * 100) },
      }
      : nothing('attainment', 'Nothing due yet', 'needs a planned job that has started'),

    good + bad > 0
      ? {
        key: 'firstPass', label: METRIC_LABEL.firstPass, value: pct1((good / (good + bad)) * 100),
        sub: `${good} good, ${bad} rejected this month`,
        tone: bad / (good + bad) <= 0.02 ? 'good' : bad / (good + bad) <= 0.05 ? 'warn' : 'critical',
        measured: true, href: '/production/plan',
        how: 'good ÷ (good + rejected) over this month’s bookings',
        chart: { kind: 'split', good, bad },
      }
      : nothing('firstPass', 'Nothing booked this month', 'needs output booked on a job'),

    turn.floor !== null
      ? {
        key: 'floorDays', label: METRIC_LABEL.floorDays, value: `${turn.floor} days`,
        sub: `mean over ${turn.jobs} job${turn.jobs === 1 ? '' : 's'} closed in 90 days${turn.jobs > 1 && turn.slowest ? ` · slowest ${turn.slowest.job.no}` : ''}`,
        tone: 'neutral', measured: true, href: '/production/turnaround',
        how: 'mean(last output − first issue) over jobs closed in the last 90 days',
      }
      : nothing('floorDays', 'No job closed yet', 'needs a job with material issued, output booked, and closed'),

    turn.total !== null
      ? {
        key: 'rmToFg', label: METRIC_LABEL.rmToFg, value: `${turn.total} days`,
        sub: turn.wait !== null ? `${turn.wait} on the shelf + ${turn.floor} on the floor` : 'shelf and floor time',
        tone: 'neutral', measured: true, href: '/production/turnaround',
        how: 'mean(last output − the day the oldest lot it drew came onto the book), over jobs closed in 90 days',
      }
      : nothing('rmToFg', 'No job closed yet', 'needs a closed job whose material came in through the gate or a count'),

    (ws.halts ?? []).length > 0
      ? {
        key: 'haltDays', label: METRIC_LABEL.haltDays, value: `${downDays} day${downDays === 1 ? '' : 's'}`,
        sub: causes[0] ? `this month · most for ${HALT_WORD[causes[0].cause].toLowerCase()}` : 'this month',
        tone: downDays === 0 ? 'good' : downDays <= 2 ? 'warn' : 'critical',
        measured: true, href: '/production/line-watch?view=halts',
        how: 'Σ working days from each halt to the day before it resumed, the part that fell in this month',
        chart: causes.length > 1 ? { kind: 'stack', parts: causes.map((c) => Math.round((c.days / Math.max(1, downDays)) * 1000) / 10) } : undefined,
      }
      : nothing('haltDays', 'No halt recorded', 'a halt is recorded when the floor stops on a job'),
  ]
}

/**
 * The bay's figures.
 *
 * On time and in full, order to dock, freight per unit, the late share and
 * the value past its promise are the domain's own sums over the owner's
 * orders, notes and consignments; finished stock is each product's journal at
 * its cost to make. Each is unmeasured until the record behind it exists — a
 * consignment nobody confirmed is not on time and not late.
 */
function dispatchMetrics(
  ws: Workspace, today: string,
  nothing: (key: MetricKey, value: string, how: string) => Metric,
): Metric[] {
  const rules = dispatchRulesOf(ws)
  const orders = orderRows(ws, today)
  const notes = ws.dispatchNotes ?? []
  const cons = consignmentRows(ws, today)
  const landed = cons.filter((r) => r.delivered)
  const otif = otifOf(cons)
  const dock = orderToDock(ws)
  const past = overdueValue(orders.map((r) => asOrderRow(r.order, r.customer, notes.filter((n) => n.orderId === r.order.id), {
    value: r.value, pending: r.pending, ordered: r.ordered, despatched: r.dispatched, complete: r.complete, overdue: r.overdue,
  })))
  const overdueN = orders.filter((r) => r.overdue).length
  const products = ws.products ?? []
  const onShelf = products.map((p) => ({ p, qty: fgOnHand(ws, p.id) })).filter((x) => x.qty > 0)
  const shelfUnits = onShelf.reduce((a, x) => a + x.qty, 0)
  const unpriced = onShelf.filter((x) => !x.p.standardCost).length
  const shelfValue = onShelf.reduce((a, x) => a + x.qty * (x.p.standardCost ?? 0), 0)
  const billed = cons.filter((r) => r.consignment.freight !== undefined)
  const freight = freightUnitOf(billed)
  const month = today.slice(0, 7)
  const landedMonth = landed.filter((r) => r.consignment.deliveredOn!.slice(0, 7) === month)
  const lateMonth = landedMonth.filter((r) => !r.onTime)
  const out = notes.filter((n) => n.on.slice(0, 7) === month)
  const outUnits = out.reduce((a, n) => a + n.lines.reduce((b, l) => b + l.qty, 0), 0)
  const outValue = despatchedValue(out.map((n) => asNote(n, '')), (id) => {
    const p = productOf(ws, id)
    return p ? asFg(p) : undefined
  })
  const outUnpriced = out.some((n) => n.lines.some((l) => !productOf(ws, l.productId)?.standardCost))
  const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? '' : 's'}`

  return [
    landed.length > 0
      ? {
        key: 'otif', label: METRIC_LABEL.otif, value: pct(otif.value as number),
        sub: `${landed.filter((r) => r.onTime && r.inFull).length} of ${plural(landed.length, 'delivery')} · target ${rules.otifTargetPct}%`,
        tone: (otif.value as number) >= rules.otifTargetPct ? 'good' : (otif.value as number) >= rules.otifTargetPct - 10 ? 'warn' : 'critical',
        measured: true, href: '/dispatch/consignments',
        how: 'delivered by the promised day with everything ordered gone ÷ deliveries somebody confirmed; still in transit counts neither way',
        chart: { kind: 'dots', dots: landed.slice(0, 14).map((r) => r.onTime && r.inFull) },
      }
      : nothing('otif', 'Nothing delivered yet', 'needs a consignment somebody has confirmed as delivered'),

    notes.length > 0
      ? {
        key: 'orderToDock', label: METRIC_LABEL.orderToDock, value: `${dock.value} days`,
        sub: `mean over ${plural(notes.length, 'dispatch note')}`,
        tone: 'neutral', measured: true, href: '/dispatch/notes',
        how: 'mean(day the note was raised − day the order was taken), over every note',
      }
      : nothing('orderToDock', 'Nothing dispatched yet', 'needs a dispatch note against an order'),

    orders.length > 0
      ? {
        key: 'pastPromise', label: METRIC_LABEL.pastPromise, value: money(past.value as number),
        sub: overdueN === 0 ? 'every open order is inside its promise' : `${plural(overdueN, 'order')} past the promised day`,
        tone: overdueN === 0 ? 'good' : 'critical',
        measured: true, href: '/dispatch/orders',
        how: 'Σ order value × the share still to go, over open orders whose promised day has passed',
      }
      : nothing('pastPromise', 'No order on the book', 'needs a customer order'),

    (ws.fgMoves ?? []).length > 0
      ? unpriced === onShelf.length && onShelf.length > 0
        ? {
          key: 'fgValue', label: METRIC_LABEL.fgValue, value: `${shelfUnits} pcs`,
          sub: 'no cost to make on these products, so no value', tone: 'neutral', measured: true, href: '/production/products',
          how: 'Σ finished stock of each product — put in what one costs to make and this becomes rupees',
        }
        : {
          key: 'fgValue', label: METRIC_LABEL.fgValue, value: money(shelfValue),
          sub: `${shelfUnits} pieces of ${plural(onShelf.length, 'product')}${unpriced ? ` · ${unpriced} with no cost` : ''}`,
          tone: 'neutral', measured: true, href: '/production/products',
          how: 'Σ (output booked + counted + returned fit to sell − dispatched) × cost to make one, per product',
        }
      : nothing('fgValue', 'Nothing made yet', 'needs output booked on a job, or finished stock counted'),

    billed.length > 0
      ? {
        key: 'freightUnit', label: METRIC_LABEL.freightUnit, value: `₹${freight.value}`,
        sub: `over ${plural(billed.length, 'consignment')} with a freight bill`,
        tone: 'neutral', measured: true, href: '/dispatch/consignments',
        how: 'Σ freight billed ÷ Σ pieces on those consignments’ notes',
      }
      : nothing('freightUnit', 'No freight recorded', 'needs a consignment with its freight put in, or a carrier rate'),

    landedMonth.length > 0
      ? {
        key: 'carrierLate', label: METRIC_LABEL.carrierLate, value: pct((lateMonth.length / landedMonth.length) * 100),
        sub: `${lateMonth.length} of ${plural(landedMonth.length, 'delivery')} this month`,
        tone: lateMonth.length === 0 ? 'good' : lateMonth.length / landedMonth.length <= 0.1 ? 'warn' : 'critical',
        measured: true, href: '/dispatch/consignments?view=carriers',
        how: 'deliveries this month that landed after the promised day ÷ deliveries confirmed this month',
        chart: { kind: 'pips', on: lateMonth.length, of: landedMonth.length },
      }
      : nothing('carrierLate', 'Nothing delivered this month', 'needs a delivery confirmed this month'),

    out.length > 0
      ? outUnpriced && (outValue.value as number) === 0
        ? {
          key: 'dispatchedMonth', label: METRIC_LABEL.dispatchedMonth, value: `${outUnits} pcs`,
          sub: `on ${plural(out.length, 'note')} · no cost to make, so no value`, tone: 'neutral', measured: true, href: '/dispatch/notes',
          how: 'Σ pieces on this month’s dispatch notes',
        }
        : {
          key: 'dispatchedMonth', label: METRIC_LABEL.dispatchedMonth, value: money(outValue.value as number),
          sub: `${outUnits} pieces on ${plural(out.length, 'note')}${outUnpriced ? ' · some with no cost' : ''}`,
          tone: 'neutral', measured: true, href: '/dispatch/notes',
          how: 'Σ (pieces × cost to make one) over this month’s dispatch notes',
        }
      : nothing('dispatchedMonth', 'Nothing out this month', 'needs a dispatch note raised this month'),

    (ws.rmas ?? []).length > 0
      ? (() => {
        const rate = returnRate(ws).value as number
        const back = (ws.rmas ?? []).reduce((a, r) => a + r.qty, 0)
        const shipped = notes.reduce((a, n) => a + n.lines.reduce((b, l) => b + l.qty, 0), 0)
        const open = (ws.rmas ?? []).filter((r) => r.state === 'authorised').length
        return {
          key: 'returnRate' as const, label: METRIC_LABEL.returnRate, value: pct(rate),
          sub: `${back} of ${shipped} pieces shipped${open ? ` · ${plural(open, 'return')} still to come back` : ''}`,
          tone: (rate <= 1 ? 'good' : rate <= 3 ? 'warn' : 'critical') as MetricTone,
          measured: true, href: '/dispatch/returns',
          how: 'Σ pieces agreed to come back ÷ Σ pieces on dispatch notes — counted on authorisations, so one nobody chased still shows',
        }
      })()
      : nothing('returnRate', 'No return agreed', 'needs a return authorised against a dispatch note'),
  ]
}

/** Every figure a desk offers, in its own order. */
export function stageMetrics(ws: Workspace, today: string, stage: MetricStage = 'sourcing'): Metric[] {
  // the floor's figures run the whole Line watch, so only the floor's dashboard pays for them
  const all = stage === 'production' ? productionMetrics(ws, today, nothingOf)
    : stage === 'dispatch' ? dispatchMetrics(ws, today, nothingOf)
      : metricsFor(ws, today)
  return STAGE_METRICS[stage]
    .filter((k) => ws.cutting || !NEEDS_CUTTING.includes(k))
    .filter((k) => (ws.rmas ?? []).length > 0 || !NEEDS_RETURNS.includes(k))
    .map((k) => all.find((m) => m.key === k)!).filter(Boolean)
}

const storedPicks = (ws: Workspace, stage: MetricStage): string[] | undefined =>
  stage === 'inbound' ? ws.inboundMetricPicks
    : stage === 'inventory' ? ws.inventoryMetricPicks
      : stage === 'production' ? ws.productionMetricPicks
        : stage === 'dispatch' ? ws.dispatchMetricPicks
          : ws.metricPicks

/**
 * Figures that changed desks, and where from. One the owner kept on the old
 * desk follows them to the new one, rather than quietly disappearing from
 * both until they go looking for it in the picker.
 */
const MOVED: Partial<Record<MetricKey, { from: MetricStage; to: MetricStage }>> = {
  unacked: { from: 'inbound', to: 'sourcing' },
  atJobworkers: { from: 'inbound', to: 'inventory' },
}

/** Where a desk keeps its owner's choice. Absent is "nobody has chosen yet". */
export function picksOf(ws: Workspace, stage: MetricStage): MetricKey[] {
  const own = storedPicks(ws, stage)
  if (!own) return DEFAULTS_FOR[stage]
  const followed = (Object.keys(MOVED) as MetricKey[]).filter((k) => MOVED[k]!.to === stage
    && !own.includes(k) && (storedPicks(ws, MOVED[k]!.from) ?? []).includes(k))
  return [...own, ...followed] as MetricKey[]
}

/** The ones the owner keeps, in the order the desk shows them. */
export function pickedMetrics(ws: Workspace, today: string, stage: MetricStage = 'sourcing'): Metric[] {
  const picks = new Set<MetricKey>(picksOf(ws, stage))
  return stageMetrics(ws, today, stage).filter((m) => picks.has(m.key))
}
