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
import type { Item, Vendor } from '@/lib/domain/types'
import { receiptsFor } from './receipts'
import { expired } from './sourcing'
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

/**
 * What a new owner sees before they have chosen.
 *
 * Six, not nine. The three left out — concentration, price moves, single
 * sourcing — are the ones you look at once a quarter, and a dashboard that
 * opens with everything on it is one nobody reads.
 */
export const DEFAULT_PICKS: MetricKey[] = [
  'onTime', 'lead', 'defects', 'flip', 'stale', 'outstanding',
]

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
  const rs = ws.receipts ?? []
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

  const nothing = (key: MetricKey, value: string, how: string): Metric => ({
    key, label: METRIC_LABEL[key], value, sub: 'nothing to measure yet',
    tone: 'neutral', measured: false, how,
  })

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
  ]
}

/** The ones the owner keeps, in the order this file declares them. */
export function pickedMetrics(ws: Workspace, today: string): Metric[] {
  const picks = new Set<MetricKey>((ws.metricPicks ?? DEFAULT_PICKS) as MetricKey[])
  return metricsFor(ws, today).filter((m) => picks.has(m.key))
}
