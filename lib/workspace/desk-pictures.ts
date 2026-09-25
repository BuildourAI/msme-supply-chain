/**
 * What each desk's dashboard draws, read off the records.
 *
 * Every function here is a picture's data and nothing else: the queue on the
 * right of a dashboard is still `*DecisionsFor`, the tiles are still the
 * owner's own figures. A picture shows the same records a second way — the
 * orders as spans on a calendar, the suppliers as a dot per delivery, the job
 * cards against their plan — so what it says can never disagree with the rows
 * behind it.
 *
 * Status is said in three words and nothing else: critical when something is
 * late or short, warn when it wants watching, good when it is fine, and none
 * when there is nothing to judge.
 */
import { addDays, daysBetween } from '@/lib/domain/calc'
import { shortDate } from '@/lib/domain/format'
import { consignmentRows } from './consignments'
import { customerOf } from './customers'
import { pendingOf } from './dispatch-notes'
import {
  monthWord, monthsBack, pendingValue, recentActivity, stockCover, type Activity, type ActivityKind, type CoverState,
} from './executive'
import { JOBWORKER } from './jobwork'
import { coverLots, isPhysical, lotRows, usableOnHand } from './ledger'
import { netLossOf, scrapRows } from './losses'
import type { MetricStage } from './metrics'
import { floorOf, jobPlanRows, targetToDate, type PlanState } from './plan'
import { fgOnHand, productOf } from './products'
import { isOpen, outstandingOn } from './receipts'
import { dispatchedOn } from './sales'
import type { Workspace } from './types'

export type Status = 'critical' | 'warn' | 'good' | 'none'

/* ---------------------------------------------------------------- recent -- */

const STAGE_KINDS: Record<MetricStage, ActivityKind[]> = {
  sourcing: ['cart', 'tray'],
  inbound: ['tray'],
  inventory: ['hash', 'boxes', 'share'],
  production: ['factory', 'alert', 'boxes'],
  dispatch: ['cash', 'doc', 'truck'],
}

/** The last few things written on one desk, newest first. */
export function recentFor(ws: Workspace, stage: MetricStage, n = 5): Activity[] {
  const kinds = new Set(STAGE_KINDS[stage])
  return recentActivity(ws, 400).filter((a) => kinds.has(a.kind)).slice(0, n)
}

/* --------------------------------------------------------------- landing -- */

export interface Landing { key: string; kind: 'order' | 'gate' | 'jobwork'; what: string; qty: string; note?: string; status: Status; href: string; title: string }
export interface LandingDay { date: string; items: Landing[] }

const qtyOf = (n: number, uom: string) => `${Math.round(n * 1000) / 1000 >= 1000 ? Math.round(n).toLocaleString('en-IN') : Math.round(n * 1000) / 1000} ${uom}`.trim()

/**
 * What lands on each of the next days: purchase orders on the day the supplier
 * promised, jobwork due back, and — on today — what is already at the gate and
 * what is late. A late order is not put on the day it was due; it is put on
 * today, in red, because today is when it is a problem.
 */
export function landing(ws: Workspace, today: string, n = 10): LandingDay[] {
  if (!today) return []
  const days = Array.from({ length: n }, (_, k) => addDays(today, k))
  const out: LandingDay[] = days.map((date) => ({ date, items: [] }))
  const at = (date: string) => out.find((d) => d.date === date)
  const item = (id: string) => ws.items.find((i) => i.id === id)
  const vendor = (id: string) => ws.vendors.find((v) => v.id === id)?.name ?? 'a supplier'

  for (const r of ws.receipts.filter(isOpen)) {
    const it = item(r.itemId)
    const waited = daysBetween(r.receivedOn, today)
    at(today)!.items.push({
      key: `gate:${r.id}`, kind: 'gate', what: it?.name.split(' ')[0] ?? 'Goods', qty: qtyOf(r.qty, it?.uom ?? ''),
      note: 'at gate', status: waited > ws.policy.inboundQcDays ? 'critical' : 'warn', href: '/inbound/receiving',
      title: `${qtyOf(r.qty, it?.uom ?? '')} ${it?.name ?? ''} from ${vendor(r.vendorId)} — at the gate ${waited === 0 ? 'since today' : `${waited} day${waited === 1 ? '' : 's'}`}`,
    })
  }
  for (const o of ws.orders) {
    if (o.state !== 'confirmed' && o.state !== 'shipped') continue
    const left = outstandingOn(ws, o)
    if (left <= 0) continue
    const it = item(o.itemId)
    const late = o.expectedOn < today
    const day = late ? today : o.expectedOn
    const cell = at(day)
    if (!cell) continue
    const lateBy = late ? daysBetween(o.expectedOn, today) : 0
    cell.items.push({
      key: `po:${o.id}`, kind: 'order', what: it?.name.split(' ')[0] ?? o.no, qty: qtyOf(left, it?.uom ?? ''),
      note: late ? `${lateBy}d late` : undefined, status: late ? 'critical' : 'none', href: '/sourcing/orders',
      title: `${o.no} · ${vendor(o.vendorId)} · ${qtyOf(left, it?.uom ?? '')} ${it?.name ?? ''} ${late ? `was due ${o.expectedOn}` : `due ${o.expectedOn}`}`,
    })
  }
  for (const c of ws.challans ?? []) {
    if (c.status !== 'out') continue
    const late = c.dueBack < today
    const cell = at(late ? today : c.dueBack)
    if (!cell) continue
    const it = item(c.itemId)
    cell.items.push({
      key: `jw:${c.id}`, kind: 'jobwork', what: c.no, qty: vendor(c.vendorId).split(' ')[0],
      note: late ? `${daysBetween(c.dueBack, today)}d late` : 'due back', status: late ? 'critical' : 'none', href: '/inventory/jobwork',
      title: `${c.no} · ${it?.name ?? ''} back from ${vendor(c.vendorId)} ${late ? `was due ${c.dueBack}` : `due ${c.dueBack}`}`,
    })
  }
  return out
}

/* ============================================================== SOURCING == */

export interface OrderSpan {
  key: string; no: string; vendor: string; from: string; to: string
  /** when it all came in; absent while anything is still to come */
  receivedOn?: string
  value: number; status: Status; lateDays: number; open: boolean
}

/**
 * Purchase orders as spans from the day they were placed to the day promised:
 * every one still open, then the ones that came in over the last month —
 * green on time, red late, the red run showing how late.
 */
export function orderSpans(ws: Workspace, today: string, n = 7): OrderSpan[] {
  const byNo = new Map<string, typeof ws.orders>()
  for (const o of ws.orders) {
    if (o.state === 'draft' || o.state === 'cancelled') continue
    byNo.set(o.no, [...(byNo.get(o.no) ?? []), o])
  }
  const spans: OrderSpan[] = []
  for (const [no, lines] of byNo) {
    const open = lines.some((o) => outstandingOn(ws, o) > 0)
    const got = ws.receipts.filter((r) => lines.some((o) => o.id === r.orderId)).map((r) => r.receivedOn).sort()
    const from = lines.map((o) => o.orderedOn).sort()[0]
    const to = lines.map((o) => o.expectedOn).sort().reverse()[0]
    const receivedOn = open ? undefined : got[got.length - 1]
    if (!open && (!receivedOn || (today && daysBetween(receivedOn, today) > 35))) continue
    const lateDays = open ? (today > to ? daysBetween(to, today) : 0) : receivedOn! > to ? daysBetween(to, receivedOn!) : 0
    spans.push({
      key: no, no, vendor: ws.vendors.find((v) => v.id === lines[0].vendorId)?.name ?? 'a supplier', from, to, receivedOn,
      value: Math.round(lines.reduce((a, o) => a + (open ? outstandingOn(ws, o) : o.qty) * o.unitPrice, 0)),
      status: lateDays > 0 ? 'critical' : open ? 'none' : 'good', lateDays, open,
    })
  }
  return spans.sort((a, b) => Number(b.open) - Number(a.open) || (a.open ? a.to.localeCompare(b.to) : b.from.localeCompare(a.from)))
    .slice(0, n)
    .sort((a, b) => a.from.localeCompare(b.from) || a.no.localeCompare(b.no, undefined, { numeric: true }))
}

export interface SupplierScore { vendorId: string; name: string; deliveries: boolean[]; onTimePct: number; rejectedPct: number | null; lead: number | null }

/**
 * Each supplier's last deliveries, oldest first — on the promised day or not —
 * with the share rejected at the gate and how long an order really takes.
 */
export function supplierScores(ws: Workspace, n = 5): SupplierScore[] {
  const out: SupplierScore[] = []
  for (const v of ws.vendors) {
    if (ws.vendorType?.[v.id] === JOBWORKER) continue
    const rs = ws.receipts.filter((r) => r.vendorId === v.id && r.orderId && !r.challanId).sort((a, b) => a.receivedOn.localeCompare(b.receivedOn))
    if (rs.length === 0) continue
    const deliveries = rs.slice(-6).map((r) => {
      const o = ws.orders.find((x) => x.id === r.orderId)
      return !o || r.receivedOn <= o.expectedOn
    })
    const closed = rs.filter((r) => !isOpen(r))
    const got = closed.reduce((a, r) => a + r.qty, 0)
    const leads = rs.slice(-6).map((r) => daysBetween(r.orderedOn, r.receivedOn)).filter((d) => d >= 0)
    out.push({
      vendorId: v.id, name: v.name, deliveries,
      onTimePct: Math.round((deliveries.filter(Boolean).length / deliveries.length) * 100),
      rejectedPct: got > 0 ? Math.round((closed.reduce((a, r) => a + r.rejected, 0) / got) * 1000) / 10 : null,
      lead: leads.length ? Math.round(leads.reduce((a, d) => a + d, 0) / leads.length) : null,
    })
  }
  return out.sort((a, b) => b.deliveries.length - a.deliveries.length || a.name.localeCompare(b.name)).slice(0, n)
}

/** What arrived each month, at the price on its purchase order. */
export function receivedByMonth(ws: Workspace, today: string, n = 6): { month: string; label: string; value: number; count: number }[] {
  return monthsBack(today, n).map((month) => {
    const rs = ws.receipts.filter((r) => r.receivedOn.slice(0, 7) === month && r.orderId)
    return {
      month, label: monthWord(month), count: rs.length,
      value: Math.round(rs.reduce((a, r) => a + r.qty * (ws.orders.find((o) => o.id === r.orderId)?.unitPrice ?? 0), 0)),
    }
  })
}

export interface MaterialCard {
  id: string; name: string; uom: string
  days: number | null; lead: number | null; state: CoverState | null
  supplier?: string; rate?: number
  /** the next thing coming for it — an order on its way, or goods at the gate */
  incoming?: { qty: number; on: string; kind: 'order' | 'gate' }
}

/** Each material: how long the shelf lasts, who supplies it, and what is coming. */
export function materialCards(ws: Workspace, today: string, n = 5): MaterialCard[] {
  const cover = new Map(stockCover(ws, ws.items.length).map((c) => [c.id, c]))
  const rank: Record<string, number> = { short: 0, tight: 1, ok: 2 }
  return ws.items.map((it) => {
    const c = cover.get(it.id)
    const quotes = ws.vendorItems.filter((q) => q.itemId === it.id).sort((a, b) => a.rate - b.rate)
    const gate = ws.receipts.filter((r) => isOpen(r) && r.itemId === it.id)
    const coming = ws.orders.filter((o) => o.itemId === it.id && (o.state === 'confirmed' || o.state === 'shipped') && outstandingOn(ws, o) > 0)
      .sort((a, b) => a.expectedOn.localeCompare(b.expectedOn))
    const incoming = gate.length
      ? { qty: gate.reduce((a, r) => a + r.qty, 0), on: today, kind: 'gate' as const }
      : coming.length ? { qty: outstandingOn(ws, coming[0]), on: coming[0].expectedOn, kind: 'order' as const } : undefined
    return {
      id: it.id, name: it.name, uom: it.uom,
      days: c?.days ?? null, lead: c?.lead ?? null, state: c?.state ?? null,
      supplier: quotes[0] ? ws.vendors.find((v) => v.id === quotes[0].vendorId)?.name : undefined,
      rate: quotes[0]?.rate ?? (it.lastPurchaseRate || undefined),
      incoming,
    }
  }).sort((a, b) => (a.state ? rank[a.state] : 3) - (b.state ? rank[b.state] : 3) || (a.days ?? 1e9) - (b.days ?? 1e9) || a.name.localeCompare(b.name))
    .slice(0, n)
}

/* =============================================================== INBOUND == */

export interface GateWait { id: string; what: string; vendor: string; qty: string; days: number; status: Status }

/**
 * What is at the gate now and how long it has waited, against the inspection
 * window the owner set — and how many this month were closed the day they came.
 */
export function gateWaits(ws: Workspace, today: string): { waiting: GateWait[]; sameDay: number; closed: number; within: number; overdue: number } {
  const within = ws.policy.inboundQcDays, overdue = ws.policy.qcOverdueDays
  const waiting = ws.receipts.filter(isOpen).map((r) => {
    const it = ws.items.find((i) => i.id === r.itemId)
    const days = today ? Math.max(0, daysBetween(r.receivedOn, today)) : 0
    return {
      id: r.id, what: it?.name ?? 'Goods', vendor: ws.vendors.find((v) => v.id === r.vendorId)?.name ?? 'a supplier',
      qty: qtyOf(r.qty, it?.uom ?? ''), days, status: (days > overdue ? 'critical' : days > within ? 'warn' : 'good') as Status,
    }
  }).sort((a, b) => b.days - a.days)
  const month = today.slice(0, 7)
  const closed = ws.receipts.filter((r) => !isOpen(r) && r.receivedOn.slice(0, 7) === month)
  return { waiting, closed: closed.length, sameDay: closed.length, within, overdue }
}

/** The last deliveries against the day promised: 0 on the day, positive late, negative early. */
export function punctuality(ws: Workspace, n = 6): { key: string; no: string; vendor: string; lateDays: number }[] {
  return ws.receipts.filter((r) => r.orderId && !r.challanId)
    .sort((a, b) => b.receivedOn.localeCompare(a.receivedOn) || b.id.localeCompare(a.id))
    .slice(0, n)
    .map((r) => {
      const o = ws.orders.find((x) => x.id === r.orderId)
      return {
        key: r.id, no: o?.no ?? r.id, vendor: ws.vendors.find((v) => v.id === r.vendorId)?.name ?? 'a supplier',
        lateDays: o ? daysBetween(o.expectedOn, r.receivedOn) : 0,
      }
    })
    .reverse()
}

/** This month at the gate, per material: what was accepted, rejected, and what still waits. */
export function acceptance(ws: Workspace, today: string): { id: string; name: string; uom: string; accepted: number; rejected: number; waiting: number }[] {
  const month = today.slice(0, 7)
  const out = new Map<string, { id: string; name: string; uom: string; accepted: number; rejected: number; waiting: number }>()
  for (const r of ws.receipts) {
    if (r.receivedOn.slice(0, 7) !== month) continue
    const it = ws.items.find((i) => i.id === r.itemId)
    const e = out.get(r.itemId) ?? { id: r.itemId, name: it?.name ?? 'Material', uom: it?.uom ?? '', accepted: 0, rejected: 0, waiting: 0 }
    if (isOpen(r)) e.waiting += r.qty
    else { e.accepted += r.accepted; e.rejected += r.rejected }
    out.set(r.itemId, e)
  }
  return [...out.values()].sort((a, b) => (b.accepted + b.rejected + b.waiting) - (a.accepted + a.rejected + a.waiting))
}

export interface ReceiptCard { id: string; what: string; vendor: string; on: string; qty: string; acceptedPct: number | null; days: number; late: boolean; open: boolean }

/** The last few things through the gate, newest first. */
export function lastReceipts(ws: Workspace, today: string, n = 5): ReceiptCard[] {
  return [...ws.receipts].sort((a, b) => b.receivedOn.localeCompare(a.receivedOn) || b.id.localeCompare(a.id)).slice(0, n).map((r) => {
    const it = ws.items.find((i) => i.id === r.itemId)
    const o = ws.orders.find((x) => x.id === r.orderId)
    const open = isOpen(r)
    return {
      id: r.id, what: it?.name ?? 'Goods', vendor: ws.vendors.find((v) => v.id === r.vendorId)?.name ?? 'a supplier', on: r.receivedOn,
      qty: qtyOf(open ? r.qty : r.accepted, it?.uom ?? ''),
      acceptedPct: open || r.qty === 0 ? null : r.accepted / r.qty,
      days: today ? Math.max(0, daysBetween(r.receivedOn, today)) : 0,
      late: !!o && r.receivedOn > o.expectedOn, open,
    }
  })
}

/* ============================================================= INVENTORY == */

const rateOf = (ws: Workspace, itemId: string) => ws.items.find((i) => i.id === itemId)?.lastPurchaseRate ?? 0

/** What the usable shelf is worth, material by material. */
export function shelfByMaterial(ws: Workspace): { id: string; name: string; value: number }[] {
  const lots = coverLots(ws).filter((l) => l.qty > 0 && isPhysical(l) && l.usability === 'usable')
  return ws.items.map((it) => ({
    id: it.id, name: it.name,
    value: Math.round(lots.filter((l) => l.itemId === it.id).reduce((a, l) => a + l.qty * rateOf(ws, it.id), 0)),
  })).filter((r) => r.value > 0).sort((a, b) => b.value - a.value)
}

/** Every lot on the book, per material: counted within its class's cadence, or past it. */
export function countState(ws: Workspace, today: string): { id: string; name: string; lots: boolean[] }[] {
  const rows = today ? lotRows(ws, today).filter((r) => r.lot.qty > 0) : []
  const by = new Map<string, { id: string; name: string; lots: boolean[] }>()
  for (const r of rows) {
    const e = by.get(r.lot.itemId) ?? { id: r.lot.itemId, name: r.item?.name ?? 'Material', lots: [] }
    e.lots.push(!r.due)
    by.set(r.lot.itemId, e)
  }
  return [...by.values()].sort((a, b) => a.lots.filter(Boolean).length / a.lots.length - b.lots.filter(Boolean).length / b.lots.length || a.name.localeCompare(b.name))
}

/** This month's loss, and scrap per material against its target. */
export function lossPicture(ws: Workspace, today: string): { net: number; scrap: { id: string; name: string; pct: number; target: number; lost: number }[]; reasons: { what: string; value: number }[] } {
  const month = today.slice(0, 7)
  const losses = (ws.losses ?? []).filter((l) => l.on.slice(0, 7) === month)
  const reasons = losses.map((l) => ({
    what: `${Math.round(l.qty * 1000) / 1000} ${ws.items.find((i) => i.id === l.itemId)?.uom ?? ''} ${ws.items.find((i) => i.id === l.itemId)?.name ?? ''}${l.note ? ` — ${l.note}` : ''}`.trim(),
    value: Math.round(l.qty * rateOf(ws, l.itemId)),
  })).sort((a, b) => b.value - a.value)
  return {
    net: Math.round(netLossOf(ws, losses).value),
    scrap: (month ? scrapRows(ws, month) : []).filter((r) => r.issued > 0)
      .map((r) => ({ id: r.item.id, name: r.item.name, pct: r.pct.value, target: r.target, lost: r.lost }))
      .sort((a, b) => (b.pct - b.target) - (a.pct - a.target)),
    reasons,
  }
}

export interface StockCard {
  id: string; name: string; uom: string; usable: number; value: number; lots: number
  atJobworker: number; held: number; due: number
  incoming?: { qty: number; on: string; kind: 'order' | 'gate' }
}

/** Each material on the shelf: how much, worth what, where the rest of it is, and whether it is due a count. */
export function stockCards(ws: Workspace, today: string, n = 5): StockCard[] {
  const rows = today ? lotRows(ws, today) : []
  const coming = new Map(materialCards(ws, today, ws.items.length).map((m) => [m.id, m.incoming]))
  return ws.items.map((it) => {
    const mine = rows.filter((r) => r.lot.itemId === it.id && r.lot.qty > 0)
    const held = ws.stockLots.filter((l) => l.itemId === it.id && l.qty > 0 && isPhysical(l) && l.usability !== 'usable').reduce((a, l) => a + l.qty, 0)
    const out = (ws.challans ?? []).filter((c) => c.itemId === it.id && c.status === 'out').reduce((a, c) => a + c.qtySent, 0)
    const usable = Math.max(0, usableOnHand(ws, it.id))
    return {
      id: it.id, name: it.name, uom: it.uom, usable, value: Math.round(usable * rateOf(ws, it.id)),
      lots: mine.length, atJobworker: out, held, due: mine.filter((r) => r.due).length, incoming: coming.get(it.id),
    }
  }).sort((a, b) => b.value - a.value || a.name.localeCompare(b.name)).slice(0, n)
}

/* ============================================================ PRODUCTION == */

export interface JobSpan {
  key: string; id: string; no: string; product: string; so?: string
  from: string; to: string; made: number; qty: number; state: PlanState
  halts: { from: string; to: string }[]
}

/** Every open, planned job card from its planned start to finish, with what is made and where it stood still. */
export function jobSpans(ws: Workspace, today: string, n = 5): JobSpan[] {
  if (!today) return []
  return jobPlanRows(ws, today).filter((r) => r.planned && !r.job.closedOn && r.state !== 'made').slice(0, n).map((r) => {
    const so = ws.customerOrders.find((o) => o.lines.some((l) => l.jobId === r.job.id))
    return {
      key: r.job.id, id: r.job.id, no: r.job.no, product: r.product?.name ?? r.job.name ?? '', so: so?.no,
      from: r.job.plannedStart!, to: r.job.plannedFinish!, made: r.made, qty: r.job.qty!, state: r.state,
      halts: (ws.halts ?? []).filter((h) => h.jobId === r.job.id && h.on <= today)
        .map((h) => ({ from: h.on, to: h.resumedOn && h.resumedOn < today ? h.resumedOn : today })),
    }
  })
}

/**
 * What came off the floor each of the last weeks, against what the plan said
 * should — the target being every running card's own day-by-day target.
 */
export function madeByWeek(ws: Workspace, today: string, weeks = 4): { label: string; from: string; good: number; rejected: number; target: number }[] {
  if (!today) return []
  const floor = floorOf(ws)
  const out = []
  for (let k = weeks - 1; k >= 0; k--) {
    const from = addDays(today, -7 * k - 6), to = addDays(today, -7 * k)
    const outs = (ws.outputs ?? []).filter((o) => o.on >= from && o.on <= to)
    const target = (ws.jobs ?? []).reduce((a, j) => a + Math.max(0, targetToDate(j, addDays(to, 1), floor) - targetToDate(j, from, floor)), 0)
    out.push({
      label: shortDate(from), from,
      good: outs.reduce((a, o) => a + o.good, 0), rejected: outs.reduce((a, o) => a + o.rejected, 0), target: Math.round(target),
    })
  }
  return out
}

/** This month, per job card: good pieces and rejected ones. */
export function firstPassByJob(ws: Workspace, today: string, n = 4): { no: string; good: number; rejected: number }[] {
  const month = today.slice(0, 7)
  const by = new Map<string, { no: string; good: number; rejected: number }>()
  for (const o of ws.outputs ?? []) {
    if (o.on.slice(0, 7) !== month) continue
    const j = (ws.jobs ?? []).find((x) => x.id === o.jobId)
    const e = by.get(o.jobId) ?? { no: j?.no ?? 'Job card', good: 0, rejected: 0 }
    e.good += o.good; e.rejected += o.rejected
    by.set(o.jobId, e)
  }
  return [...by.values()].sort((a, b) => b.good + b.rejected - (a.good + a.rejected)).slice(0, n)
}

export interface JobCardPic { id: string; no: string; product: string; so?: string; made: number; qty: number | null; state: PlanState; to?: string; from?: string; gap: number }

/** The open job cards, the ones needing a person first. */
export function jobCardsPic(ws: Workspace, today: string, n = 4): JobCardPic[] {
  if (!today) return []
  return jobPlanRows(ws, today).filter((r) => r.state !== 'closed').slice(0, n).map((r) => ({
    id: r.job.id, no: r.job.no, product: r.product?.name ?? r.job.name ?? '',
    so: ws.customerOrders.find((o) => o.lines.some((l) => l.jobId === r.job.id))?.no,
    made: r.made, qty: r.planned ? r.job.qty ?? null : null, state: r.state,
    from: r.job.plannedStart, to: r.job.plannedFinish, gap: Math.max(0, -r.vsTarget),
  }))
}

/* ============================================================== DISPATCH == */

export interface RoadRow { key: string; no: string; customer: string; carrier?: string; left: string; due?: string; delivered?: string; progress: number; status: Status; word: string }

/**
 * Challans between the bay and the customer: on the road with how far along
 * the promised days they are, not booked with anybody, and the last delivered.
 */
export function roadRows(ws: Workspace, today: string, n = 4): RoadRow[] {
  const rows = today ? consignmentRows(ws, today) : []
  const booked = new Set(rows.map((r) => r.note.id))
  const who = (id: string) => customerOf(ws, id)?.name ?? 'a customer'
  const live: RoadRow[] = rows.filter((r) => !r.delivered).map((r) => {
    const span = Math.max(1, daysBetween(r.note.on, r.consignment.promisedDate))
    return {
      key: r.consignment.id, no: r.note.no, customer: who(r.note.customerId), carrier: r.carrier?.name, left: r.note.on,
      due: r.consignment.promisedDate, progress: Math.min(1, Math.max(0.05, daysBetween(r.note.on, today) / span)),
      status: r.late ? 'critical' as Status : 'none' as Status,
      word: r.late ? `${daysBetween(r.consignment.promisedDate, today)}d late` : today >= r.consignment.promisedDate ? 'due today' : `due ${r.consignment.promisedDate}`,
    }
  })
  const unbooked: RoadRow[] = (ws.dispatchNotes ?? []).filter((d) => !booked.has(d.id) && today && daysBetween(d.on, today) <= 30).map((d) => ({
    key: `nb:${d.id}`, no: d.no, customer: who(d.customerId), left: d.on, progress: 0, status: 'warn' as Status, word: 'no carrier booked',
  }))
  const done: RoadRow[] = rows.filter((r) => r.delivered).sort((a, b) => (b.consignment.deliveredOn ?? '').localeCompare(a.consignment.deliveredOn ?? ''))
    .slice(0, 2).map((r) => ({
      key: r.consignment.id, no: r.note.no, customer: who(r.note.customerId), carrier: r.carrier?.name, left: r.note.on,
      due: r.consignment.promisedDate, delivered: r.consignment.deliveredOn, progress: 1,
      status: r.onTime ? 'good' as Status : 'critical' as Status, word: `delivered ${r.consignment.deliveredOn}`,
    }))
  return [...live, ...unbooked, ...done].slice(0, n)
}

/** Each customer's last deliveries — on time and in full, or not — and the share that were. */
export function customerScores(ws: Workspace, today: string, n = 5): { id: string; name: string; dots: boolean[]; pct: number }[] {
  const rows = today ? consignmentRows(ws, today).filter((r) => r.delivered) : []
  const by = new Map<string, { id: string; name: string; dots: { on: string; ok: boolean }[] }>()
  for (const r of rows) {
    const id = r.note.customerId
    const e = by.get(id) ?? { id, name: customerOf(ws, id)?.name ?? 'A customer', dots: [] }
    e.dots.push({ on: r.consignment.deliveredOn ?? r.note.on, ok: r.onTime && r.inFull })
    by.set(id, e)
  }
  return [...by.values()].map((e) => {
    const dots = e.dots.sort((a, b) => a.on.localeCompare(b.on)).slice(-6).map((d) => d.ok)
    return { id: e.id, name: e.name, dots, pct: Math.round((e.dots.filter((d) => d.ok).length / e.dots.length) * 100) }
  }).sort((a, b) => b.dots.length - a.dots.length || a.name.localeCompare(b.name)).slice(0, n)
}

/** Per product: what is ready on the shelf against what open orders still want. */
export function shelfVsPromised(ws: Workspace): { id: string; name: string; onShelf: number; promised: number }[] {
  return (ws.products ?? []).map((p) => ({
    id: p.id, name: p.name, onShelf: Math.max(0, fgOnHand(ws, p.id)),
    promised: ws.customerOrders.filter((o) => o.state === 'open').reduce((a, o) => a + pendingOf(ws, o, p.id), 0),
  })).filter((r) => r.onShelf > 0 || r.promised > 0).sort((a, b) => b.promised - a.promised)
}

export interface OrderCard { id: string; no: string; customer: string; sent: number; ordered: number; promised: string; left: number; zone: 'past' | 'soon' | 'later'; noJob: boolean }

/** Every open sales order: how much has gone, and when it was promised — the earliest promise first. */
export function orderCards(ws: Workspace, today: string, n = 5): OrderCard[] {
  const week = today ? addDays(today, 7) : ''
  return ws.customerOrders.filter((o) => o.state === 'open' && pendingValue(ws, o) > 0).map((o) => {
    const ordered = o.lines.reduce((a, l) => a + l.qty, 0)
    const sent = o.lines.reduce((a, l) => a + Math.min(l.qty, dispatchedOn(ws, o.id, l.productId)), 0)
    return {
      id: o.id, no: o.no, customer: customerOf(ws, o.customerId)?.name ?? 'a customer', sent, ordered, promised: o.promisedDate,
      left: pendingValue(ws, o), zone: (o.promisedDate < today ? 'past' : o.promisedDate <= week ? 'soon' : 'later') as OrderCard['zone'],
      noJob: o.lines.some((l) => !l.jobId && pendingOf(ws, o, l.productId) > fgOnHand(ws, l.productId)),
    }
  }).sort((a, b) => a.promised.localeCompare(b.promised) || a.no.localeCompare(b.no, undefined, { numeric: true })).slice(0, n)
}

export { productOf }
