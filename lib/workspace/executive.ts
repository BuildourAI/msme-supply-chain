/**
 * The owner's gist: the whole business in one look, on the Welcome page.
 *
 * Everything here is read off records the portal already holds — sales
 * orders, delivery challans, purchase orders and receipts, the stock book,
 * jobwork challans, the five desks' own work queues and figures. Nothing is
 * stored for it and nothing is typed in for it. What the portal does not
 * record — invoices, payments, cash — is not shown at all, rather than shown
 * as a number nobody can trace.
 *
 * Money is at the value the record carries: what a customer ordered or was
 * sent at the sales order's rate (before GST), what was bought at the purchase
 * order's price, stock at what was last paid for it, finished goods at what
 * they cost to make.
 *
 * `gist` is the one entry point. The sourcing, gate and store figures come
 * from a single `metricsFor`, and each desk's queue is built once, because the
 * Welcome page re-renders every time a set-up wizard below it saves.
 */
import { buildRows } from '@/lib/domain/derive'
import { addDays } from '@/lib/domain/calc'
import { money, num, shortDate } from '@/lib/domain/format'
import { bundleFor } from './bundle'
import { customerOf, dispatchRulesOf } from './customers'
import { decisionsFor, sortDecisions, type Decision } from './decisions'
import { dispatchDecisionsFor } from './dispatch-decisions'
import { handoff } from './dispatch-notes'
import { atJobworkersValue } from './inbound'
import { inboundDecisionsFor } from './inbound-decisions'
import { inventoryDecisionsFor } from './inventory-decisions'
import { coverLots, isPhysical } from './ledger'
import { HALT_WORD } from './linewatch'
import {
  METRIC_LABEL, metricsFor, nothingOf, picksOf, stageMetrics, stageMetricsFrom,
  type Metric, type MetricStage, type MetricTone,
} from './metrics'
import { jobPlanRows } from './plan'
import { productionDecisionsFor } from './production-decisions'
import { fgOnHand } from './products'
import { outstandingOn } from './receipts'
import { dispatchedOn } from './sales'
import type { CustomerOrder, Workspace } from './types'

/* ------------------------------------------------------------ small words -- */

/** ₹18.6 L · ₹1.2 Cr · ₹45,000 — one decimal is how an owner reads a headline. */
export function compact(n: number): string {
  if (Math.abs(n) >= 10_000_000) return `₹${(n / 10_000_000).toFixed(1)} Cr`
  if (Math.abs(n) >= 100_000) return `₹${(n / 100_000).toFixed(1)} L`
  return money(Math.round(n))
}

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`

/** The last n months as YYYY-MM, oldest first, ending with the month `today` is in. */
export function monthsBack(today: string, n: number): string[] {
  if (!today) return []
  let y = Number(today.slice(0, 4))
  let m = Number(today.slice(5, 7))
  const out: string[] = []
  for (let i = 0; i < n; i++) {
    out.unshift(`${y}-${String(m).padStart(2, '0')}`)
    m -= 1
    if (m === 0) { m = 12; y -= 1 }
  }
  return out
}

/** 'Sep' for 2026-09 */
export const monthWord = (ym: string): string => shortDate(`${ym}-01`).split(' ')[1]

/* ------------------------------------------------------------ when it opens -- */

/**
 * Whether there is anything to read yet. A company on its first day would see
 * sixteen zeroes and four empty charts, which teaches people to ignore the
 * page; the gist opens with the first record any desk writes.
 */
export function hasRecords(ws: Workspace): boolean {
  // an opening count writes stock onto the book as lots, not as count records
  return ws.orders.length > 0 || ws.receipts.length > 0 || ws.stockLots.length > 0 || ws.counts.length > 0 || ws.jobs.length > 0
    || ws.customerOrders.length > 0 || ws.dispatchNotes.length > 0 || ws.challans.length > 0 || ws.outputs.length > 0
}

/* -------------------------------------------------------------- the money -- */

/** What is still to go on one sales order, line by line, at its own rates. */
export function pendingValue(ws: Workspace, order: CustomerOrder): number {
  if (order.state !== 'open') return 0
  // what went against a product is taken off its lines in order
  const gone = new Map<string, number>()
  for (const l of order.lines) {
    if (!gone.has(l.productId)) gone.set(l.productId, dispatchedOn(ws, order.id, l.productId))
  }
  let value = 0
  for (const l of order.lines) {
    const left = gone.get(l.productId) ?? 0
    const sent = Math.min(l.qty, left)
    gone.set(l.productId, left - sent)
    value += (l.qty - sent) * l.rate
  }
  return Math.round(value * 100) / 100
}

export interface Money {
  /** still to dispatch on open sales orders */
  orderBook: number
  pastPromise: number
  openOrders: number
  pastOrders: number
  /** delivery challans this month, at selling value */
  dispatched: number
  dispatchedCount: number
  lastMonth: number
  /** handed over to suppliers and not yet in */
  onOrder: number
  onOrderCount: number
  landThisWeek: number
  /** the stock book */
  shelf: number
  held: number
  lots: number
  finished: number
  atJobworkers: number
  challansOut: number
}

export function moneyOf(ws: Workspace, today: string): Money {
  const month = today.slice(0, 7)
  const [prev] = monthsBack(today, 2)
  const open = ws.customerOrders.filter((o) => o.state === 'open')
    .map((o) => ({ o, left: pendingValue(ws, o) })).filter((x) => x.left > 0)
  const past = open.filter((x) => today && x.o.promisedDate < today)

  const valueOfNote = (id: string) => handoff(ws, id).taxable
  const thisMonth = ws.dispatchNotes.filter((n) => n.on.slice(0, 7) === month)
  const lastMonth = ws.dispatchNotes.filter((n) => n.on.slice(0, 7) === prev)

  const placed = ws.orders.filter((o) => o.state === 'confirmed' || o.state === 'shipped')
    .map((o) => ({ o, left: outstandingOn(ws, o) })).filter((x) => x.left > 0)
  const weekEnd = today ? addDays(today, 7) : ''

  const rate = (itemId: string) => ws.items.find((i) => i.id === itemId)?.lastPurchaseRate ?? 0
  const usable = coverLots(ws).filter((l) => l.qty > 0 && isPhysical(l) && l.usability === 'usable')
  const heldLots = ws.stockLots.filter((l) => l.qty > 0 && isPhysical(l) && l.usability !== 'usable')

  return {
    orderBook: open.reduce((a, x) => a + x.left, 0),
    pastPromise: past.reduce((a, x) => a + x.left, 0),
    openOrders: open.length,
    pastOrders: past.length,
    dispatched: thisMonth.reduce((a, n) => a + valueOfNote(n.id), 0),
    dispatchedCount: thisMonth.length,
    lastMonth: lastMonth.reduce((a, n) => a + valueOfNote(n.id), 0),
    onOrder: placed.reduce((a, x) => a + x.left * x.o.unitPrice, 0),
    // a purchase order is one number over several lines
    onOrderCount: new Set(placed.map((x) => x.o.no)).size,
    landThisWeek: new Set(placed.filter((x) => today && x.o.expectedOn >= today && x.o.expectedOn <= weekEnd)
      .map((x) => x.o.no)).size,
    shelf: usable.reduce((a, l) => a + l.qty * rate(l.itemId), 0),
    held: heldLots.reduce((a, l) => a + l.qty * rate(l.itemId), 0),
    lots: usable.length,
    finished: ws.products.reduce((a, p) => a + Math.max(0, fgOnHand(ws, p.id)) * (p.standardCost ?? 0), 0),
    atJobworkers: today ? atJobworkersValue(ws, today) : 0,
    challansOut: ws.challans.filter((c) => c.status === 'out').length,
  }
}

/** The five across the top, in the shape the desks' tiles already draw. */
export function headlines(ws: Workspace, today: string, m: Money = moneyOf(ws, today)): Metric[] {
  const tile = (key: Metric['key'], value: number, sub: string, tone: MetricTone, href: string, how: string): Metric => ({
    key, label: METRIC_LABEL[key], value: compact(value), sub, tone, measured: true, href, how,
  })
  const everPlaced = ws.orders.some((o) => o.state !== 'draft' && o.state !== 'cancelled')
  const everStock = ws.stockLots.some((l) => isPhysical(l))
  return [
    ws.customerOrders.length > 0
      ? tile('orderBook', m.orderBook,
        m.openOrders === 0 ? 'nothing left to send'
          : `${plural(m.openOrders, 'order')}${m.pastPromise > 0 ? ` · ${compact(m.pastPromise)} past the promise` : ''}`,
        m.pastPromise > 0 ? 'warn' : 'neutral', '/dispatch/orders',
        'Σ over open sales orders of what is still to go × the rate on the order, before GST')
      : nothingOf('orderBook', 'No orders yet', 'needs a sales order taken'),
    ws.dispatchNotes.length > 0
      ? tile('dispatchedValue', m.dispatched,
        `${plural(m.dispatchedCount, 'challan')} · ${monthWord(monthsBack(today, 2)[0] ?? today.slice(0, 7))} ${compact(m.lastMonth)}`,
        'neutral', '/dispatch/notes',
        'Σ this month’s delivery challans at the sales order’s rates, before GST')
      : nothingOf('dispatchedValue', 'Nothing sent yet', 'needs a delivery challan raised'),
    everPlaced
      ? tile('onOrder', m.onOrder,
        m.onOrderCount === 0 ? 'everything handed over has arrived'
          : `${plural(m.onOrderCount, 'order')} · ${m.landThisWeek} land this week`,
        'neutral', '/sourcing/orders',
        'Σ over purchase orders handed to suppliers of what is still to arrive × the order’s price')
      : nothingOf('onOrder', 'None handed over', 'needs a purchase order handed to its supplier'),
    everStock && m.shelf > 0
      ? tile('stockValue', m.shelf,
        `${plural(m.lots, 'lot')}${m.held > 0 ? ` · ${compact(m.held)} held back` : ''}`,
        'neutral', '/inventory/ledger',
        'Σ usable qty × last purchase rate — remnants and held stock left out')
      // counted but never bought: ₹0 would read as an empty shelf
      : everStock
        ? nothingOf('stockValue', 'No price yet',
          'needs a price for what is on the shelf — a supplier’s rate, or a receipt against an order')
        : nothingOf('stockValue', 'Not counted yet', 'needs stock counted onto the book'),
    ws.challans.length > 0
      ? tile('atJobworkers', m.atJobworkers,
        `${plural(m.challansOut, 'challan')} out · limit ${compact(ws.policy.jobworkerExposureCeiling)}`,
        m.atJobworkers > ws.policy.jobworkerExposureCeiling ? 'warn' : 'neutral', '/inventory/jobwork',
        'what is still physically with each jobworker × the rate it left at')
      : nothingOf('atJobworkers', 'Nothing sent out', 'needs a jobwork challan'),
  ]
}

/* ------------------------------------------------------------- the charts -- */

export interface MonthBar { month: string; label: string; value: number; count: number }

/** What left, month by month, at selling value. The current month is so far. */
export function dispatchedByMonth(ws: Workspace, today: string, n = 6): MonthBar[] {
  return monthsBack(today, n).map((month) => {
    const notes = ws.dispatchNotes.filter((x) => x.on.slice(0, 7) === month)
    return {
      month, label: monthWord(month), count: notes.length,
      value: Math.round(notes.reduce((a, x) => a + handoff(ws, x.id).taxable, 0)),
    }
  })
}

export interface Spend { basis: 'received' | 'ordered' | null; rows: { label: string; value: number }[]; total: number }

/**
 * This month's spend by material: what arrived at the price on its purchase
 * order. Before anything has arrived this month, what was ordered — and it
 * says which.
 */
export function spendByMaterial(ws: Workspace, today: string, top = 6): Spend {
  const month = today.slice(0, 7)
  const by = new Map<string, number>()
  for (const r of ws.receipts) {
    if (r.receivedOn.slice(0, 7) !== month || !r.orderId) continue
    const o = ws.orders.find((x) => x.id === r.orderId)
    if (!o) continue
    by.set(r.itemId, (by.get(r.itemId) ?? 0) + r.qty * o.unitPrice)
  }
  let basis: Spend['basis'] = by.size > 0 ? 'received' : null
  if (by.size === 0) {
    for (const o of ws.orders) {
      if (o.orderedOn.slice(0, 7) !== month || o.state === 'draft' || o.state === 'cancelled') continue
      by.set(o.itemId, (by.get(o.itemId) ?? 0) + o.qty * o.unitPrice)
    }
    if (by.size > 0) basis = 'ordered'
  }
  const name = (id: string) => ws.items.find((i) => i.id === id)?.name ?? 'Unknown material'
  const all = [...by.entries()].map(([id, value]) => ({ label: name(id), value: Math.round(value) }))
    .sort((a, b) => b.value - a.value || a.label.localeCompare(b.label))
  const rows = all.length > top + 1
    ? [...all.slice(0, top), { label: `Other (${all.length - top})`, value: all.slice(top).reduce((a, r) => a + r.value, 0) }]
    : all
  return { basis, rows, total: all.reduce((a, r) => a + r.value, 0) }
}

export interface Segment { key: string; label: string; value: number }

/** Everything the business owns or has committed to, in five places. */
export function moneySits(m: Money): Segment[] {
  return [
    { key: 'shelf', label: 'On the shelf', value: Math.round(m.shelf) },
    { key: 'held', label: 'Held back', value: Math.round(m.held) },
    { key: 'finished', label: 'Finished goods', value: Math.round(m.finished) },
    { key: 'jobworkers', label: 'At jobworkers', value: Math.round(m.atJobworkers) },
    { key: 'onOrder', label: 'On order', value: Math.round(m.onOrder) },
  ]
}

export interface Promise3 {
  past: { value: number; count: number }
  soon: { value: number; count: number }
  later: { value: number; count: number }
  /** the orders past their promise, earliest first, for the owner to name */
  late: { id: string; no: string; customer: string; promised: string; value: number }[]
}

/** What is still to go, by when it was promised: past, in the next seven days, later. */
export function ordersByPromise(ws: Workspace, today: string): Promise3 {
  const week = today ? addDays(today, 7) : ''
  const out: Promise3 = { past: { value: 0, count: 0 }, soon: { value: 0, count: 0 }, later: { value: 0, count: 0 }, late: [] }
  for (const o of ws.customerOrders) {
    const left = pendingValue(ws, o)
    if (left <= 0 || !today) continue
    const bucket = o.promisedDate < today ? out.past : o.promisedDate <= week ? out.soon : out.later
    bucket.value += left; bucket.count += 1
    if (o.promisedDate < today) {
      out.late.push({ id: o.id, no: o.no, customer: customerOf(ws, o.customerId)?.name ?? 'a customer', promised: o.promisedDate, value: left })
    }
  }
  out.late.sort((a, b) => a.promised.localeCompare(b.promised) || b.value - a.value)
  return out
}

/* ------------------------------------------------------------- needs you -- */

export const GIST_STAGES: { stage: MetricStage; label: string; icon: 'cart' | 'tray' | 'boxes' | 'factory' | 'truck' }[] = [
  { stage: 'sourcing', label: 'Sourcing', icon: 'cart' },
  { stage: 'inbound', label: 'Inbound', icon: 'tray' },
  { stage: 'inventory', label: 'Inventory', icon: 'boxes' },
  { stage: 'production', label: 'Production', icon: 'factory' },
  { stage: 'dispatch', label: 'Dispatch', icon: 'truck' },
]

export const dashboardOf = (stage: MetricStage) => `/${stage}/dashboard`

export interface Queue { stage: MetricStage; rows: Decision[] }

/**
 * Every desk's own queue, as its dashboard builds it. Sourcing's needs the
 * stock rows, or its at-risk band is missing and its count disagrees with the
 * badge on its rail.
 */
export function queuesOf(ws: Workspace, today: string, rows = today ? buildRows(bundleFor(ws, today), ws.policy) : []): Queue[] {
  return [
    { stage: 'sourcing', rows: decisionsFor(ws, today, rows) },
    { stage: 'inbound', rows: sortDecisions(inboundDecisionsFor(ws, today)) },
    { stage: 'inventory', rows: sortDecisions(inventoryDecisionsFor(ws, today)) },
    { stage: 'production', rows: sortDecisions(productionDecisionsFor(ws, today)) },
    { stage: 'dispatch', rows: sortDecisions(dispatchDecisionsFor(ws, today)) },
  ]
}

export interface NeedsYou {
  total: number
  stages: { stage: MetricStage; label: string; count: number; href: string }[]
  /** the heaviest across every desk: what stops the line, then what costs money, then what is half-done */
  top: { d: Decision; stage: MetricStage; label: string }[]
}

export function needsYou(queues: Queue[], n = 3): NeedsYou {
  const label = (s: MetricStage) => GIST_STAGES.find((x) => x.stage === s)!.label
  const tagged = queues.flatMap((q) => q.rows.map((d) => ({ d, stage: q.stage })))
  const order = sortDecisions(tagged.map((t) => t.d))
  const top = order.slice(0, n).map((d) => {
    const t = tagged.find((x) => x.d === d)!
    return { d, stage: t.stage, label: label(t.stage) }
  })
  return {
    total: tagged.length,
    stages: queues.map((q) => ({ stage: q.stage, label: label(q.stage), count: q.rows.length, href: dashboardOf(q.stage) })),
    top,
  }
}

/* ----------------------------------------------------------------- goals -- */

export type GoalState = 'on' | 'risk' | 'off' | 'none'

export interface Goal { key: string; label: string; detail: string; state: GoalState; href: string }

const verdict = (m?: Metric): GoalState =>
  !m || !m.measured ? 'none' : m.tone === 'good' ? 'on' : m.tone === 'warn' ? 'risk' : m.tone === 'critical' ? 'off' : 'on'

/**
 * Six checks, each against a rule the owner set on a desk, judged by the
 * figure that desk already shows. None is a benchmark this build made up.
 */
export function goals(ws: Workspace, today: string, figures: Metric[]): Goal[] {
  const f = (key: Metric['key']) => figures.find((m) => m.key === key)
  const otif = f('otif'), scrap = f('scrap'), acc = f('accuracy')
  const inspected = f('inspectedOnTime'), held = f('qcHeld')
  const ceiling = ws.policy.jobworkerExposureCeiling
  const atJw = today ? atJobworkersValue(ws, today) : 0

  const plans = today ? jobPlanRows(ws, today).filter((r) => r.planned && !r.job.closedOn && r.state !== 'made') : []
  const late = plans.filter((r) => r.state === 'late')
  const behind = plans.filter((r) => r.state === 'behind')
  const worst = [...late, ...behind][0]

  const inspectedState: GoalState = held?.measured && held.tone === 'critical' ? 'off' : verdict(inspected)

  return [
    {
      key: 'otif', label: 'Delivered on time, in full', href: '/dispatch/consignments',
      state: verdict(otif),
      detail: otif?.measured ? `${otif.value} · target ${dispatchRulesOf(ws).otifTargetPct}%` : 'nothing delivered to judge yet',
    },
    {
      key: 'scrap', label: 'Scrap within target', href: '/inventory/wastage',
      state: verdict(scrap),
      detail: scrap?.measured ? `${scrap.value} · ${scrap.sub}` : 'nothing issued this month to judge',
    },
    {
      key: 'accuracy', label: 'Stock book believable', href: '/inventory/ledger',
      state: verdict(acc),
      detail: acc?.measured ? `${acc.value} of counts inside tolerance` : 'nothing recounted yet',
    },
    {
      key: 'jobworkers', label: 'Jobworkers under the limit', href: '/inventory/jobwork',
      state: ws.challans.length === 0 ? 'none' : atJw <= ceiling ? 'on' : 'off',
      detail: ws.challans.length === 0 ? 'nothing sent out yet' : `${compact(atJw)} · limit ${compact(ceiling)}`,
    },
    {
      key: 'inspected', label: 'Inspected in time', href: '/inbound/receiving',
      state: inspectedState,
      detail: inspectedState === 'off' && held ? held.sub
        : inspected?.measured ? `${inspected.value} within ${plural(ws.policy.inboundQcDays, 'day')}`
          : 'nothing inspected yet',
    },
    {
      key: 'pace', label: 'Floor on pace', href: worst ? `/production/jobs?card=${worst.job.id}` : '/production/jobs',
      state: plans.length === 0 ? 'none' : late.length > 0 ? 'off' : behind.length > 0 ? 'risk' : 'on',
      detail: plans.length === 0 ? 'nothing planned to judge'
        : worst ? (worst.state === 'late'
          ? `${worst.job.no} is past its finish`
          : `${worst.job.no} is ${num(-worst.vsTarget, 0)} behind plan`)
          : `${plural(plans.length, 'job card')} on pace`,
    },
  ]
}

/* ------------------------------------------------------- recent activity -- */

export type ActivityKind = 'cart' | 'tray' | 'hash' | 'boxes' | 'share' | 'factory' | 'alert' | 'cash' | 'doc' | 'truck'

export interface Activity { on: string; kind: ActivityKind; what: string; who?: string; href: string; seq: number }

/**
 * The last things written, across every desk, read off the records
 * themselves — the portal keeps no separate log, so this cannot drift from
 * what happened.
 */
export function recentActivity(ws: Workspace, n = 8): Activity[] {
  const out: Activity[] = []
  let seq = 0
  const push = (a: Omit<Activity, 'seq'>) => out.push({ ...a, seq: seq++ })
  const item = (id: string) => ws.items.find((i) => i.id === id)
  const vendor = (id?: string) => ws.vendors.find((v) => v.id === id)?.name ?? 'a supplier'
  const job = (id: string) => ws.jobs.find((j) => j.id === id)

  const handed = new Map<string, { on: string; vendorId: string }>()
  for (const o of ws.orders) if (o.notifiedOn && !handed.has(o.no)) handed.set(o.no, { on: o.notifiedOn, vendorId: o.vendorId })
  for (const [no, h] of handed) push({ on: h.on, kind: 'cart', what: `${no} handed over to ${vendor(h.vendorId)}`, href: '/sourcing/orders' })

  for (const r of ws.receipts) {
    const it = item(r.itemId)
    push({
      on: r.receivedOn, kind: 'tray', href: '/inbound/receiving', who: r.inspector,
      what: `${num(r.qty, 3)} ${it?.uom ?? ''} ${it?.name ?? 'material'} ${r.challanId ? 'back from' : 'in from'} ${vendor(r.vendorId)}`,
    })
  }

  const counted = new Map<string, { on: string; rack?: string; lots: number; off: number; who: string }>()
  for (const c of ws.counts) {
    const k = `${c.on}|${c.rack ?? ''}`
    const e = counted.get(k) ?? { on: c.on, rack: c.rack, lots: 0, off: 0, who: c.counter }
    e.lots += 1
    if (c.bookQty !== 0 && c.countedQty !== c.bookQty) e.off += 1
    counted.set(k, e)
  }
  for (const e of counted.values()) {
    const rack = e.rack ? ws.racks.find((r) => r.id === e.rack)?.name ?? e.rack : undefined
    push({
      on: e.on, kind: 'hash', href: '/inventory/ledger', who: e.who,
      what: `${rack ? `Rack ${rack}` : 'Stock'} counted · ${plural(e.lots, 'lot')}${e.off ? ` · ${plural(e.off, 'difference')}` : ''}`,
    })
  }

  for (const s of ws.issues) {
    const qty = s.lines.reduce((a, l) => a + l.qty, 0)
    const it = item(s.lines[0]?.itemId ?? '')
    const j = job(s.jobId)
    push({
      on: s.on, kind: 'boxes', href: `/production/jobs?card=${s.jobId}`, who: s.actor,
      what: `${s.no} · ${num(qty, 3)} ${it?.uom ?? ''} ${s.kind === 'issue' ? 'issued to' : 'back from'} ${j?.no ?? 'a job card'}`,
    })
  }

  for (const c of ws.challans) {
    const it = item(c.itemId)
    push({
      on: c.sentOn, kind: 'share', href: '/inventory/jobwork',
      what: `${c.no} · ${num(c.qtySent, 3)} ${it?.uom ?? ''} ${it?.name ?? 'material'} to ${vendor(c.vendorId)}`,
    })
  }

  for (const o of ws.outputs) {
    push({
      on: o.on, kind: 'factory', href: `/production/jobs?card=${o.jobId}`, who: o.actor,
      what: `${num(o.good, 0)} good booked on ${job(o.jobId)?.no ?? 'a job card'}${o.rejected ? ` · ${num(o.rejected, 0)} rejected` : ''}`,
    })
  }

  for (const h of ws.halts) {
    push({ on: h.on, kind: 'alert', href: '/production/line-watch?view=halts', who: h.actor, what: `${job(h.jobId)?.no ?? 'A job card'} halted — ${HALT_WORD[h.cause].toLowerCase()}` })
  }

  for (const o of ws.customerOrders) {
    const value = o.lines.reduce((a, l) => a + l.qty * l.rate, 0)
    push({ on: o.takenOn, kind: 'cash', href: '/dispatch/orders', what: `${o.no} taken · ${customerOf(ws, o.customerId)?.name ?? 'a customer'} · ${compact(value)}` })
  }

  for (const n2 of ws.dispatchNotes) {
    const order = ws.customerOrders.find((o) => o.id === n2.orderId)
    push({
      on: n2.on, kind: 'doc', href: `/dispatch/notes?doc=${n2.id}`, who: n2.actor,
      what: `${n2.no} raised${order ? ` for ${order.no}` : ''} · ${customerOf(ws, n2.customerId)?.name ?? 'a customer'}`,
    })
  }

  for (const c of ws.consignments) {
    if (!c.deliveredOn) continue
    const note = ws.dispatchNotes.find((x) => x.id === c.noteId)
    push({
      on: c.deliveredOn, kind: 'truck', href: '/dispatch/consignments', who: c.confirmedBy,
      what: `${note?.no ?? 'A delivery challan'} delivered${note ? ` to ${customerOf(ws, note.customerId)?.name ?? 'the customer'}` : ''}`,
    })
  }

  // newest first; within a day, the one written last first
  return out.sort((a, b) => b.on.localeCompare(a.on) || b.seq - a.seq).slice(0, n)
}

/** 'today', 'yesterday', or '23 Sep' */
export function whenWord(on: string, today: string): string {
  if (on === today) return 'today'
  if (today && on === addDays(today, -1)) return 'yesterday'
  return shortDate(on)
}

/* ----------------------------------------------------------- stage cards -- */

export interface StageCard {
  stage: MetricStage
  label: string
  href: string
  /** the owner's own picks on that desk, first four */
  figures: Metric[]
  open: number
  work: { title: string; href: string }[]
}

export function stageCards(ws: Workspace, lists: Record<MetricStage, Metric[]>, queues: Queue[]): StageCard[] {
  return GIST_STAGES.map(({ stage, label }) => {
    const picks = new Set(picksOf(ws, stage))
    const q = queues.find((x) => x.stage === stage)?.rows ?? []
    return {
      stage, label, href: dashboardOf(stage),
      figures: lists[stage].filter((m) => picks.has(m.key)).slice(0, 4),
      open: q.length,
      work: q.slice(0, 3).map((d) => ({ title: d.title, href: d.href })),
    }
  })
}

/* ------------------------------------------------------------ the whole -- */

export interface Gist {
  headlines: Metric[]
  dispatched: MonthBar[]
  spend: Spend
  sits: Segment[]
  promise: Promise3
  needs: NeedsYou
  goals: Goal[]
  activity: Activity[]
  cards: StageCard[]
  /** stock is on the book, whether or not anything has priced it */
  counted: boolean
}

export function gist(ws: Workspace, today: string): Gist {
  const m = moneyOf(ws, today)
  const shared = metricsFor(ws, today)
  const lists: Record<MetricStage, Metric[]> = {
    sourcing: stageMetricsFrom(ws, 'sourcing', shared),
    inbound: stageMetricsFrom(ws, 'inbound', shared),
    inventory: stageMetricsFrom(ws, 'inventory', shared),
    production: stageMetrics(ws, today, 'production'),
    dispatch: stageMetrics(ws, today, 'dispatch'),
  }
  const queues = queuesOf(ws, today)
  return {
    headlines: headlines(ws, today, m),
    dispatched: dispatchedByMonth(ws, today),
    spend: spendByMaterial(ws, today),
    sits: moneySits(m),
    promise: ordersByPromise(ws, today),
    needs: needsYou(queues),
    goals: goals(ws, today, [...shared, ...lists.dispatch]),
    activity: recentActivity(ws),
    cards: stageCards(ws, lists, queues),
    counted: ws.stockLots.some((l) => isPhysical(l)),
  }
}
