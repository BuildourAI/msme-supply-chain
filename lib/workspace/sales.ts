/**
 * The order book: what customers ordered, what has gone, what is still to go.
 *
 * An order is a customer, a promised date and lines — a product, a quantity,
 * a rate — and a line can name the style making it. That link is what lets
 * the order book say a promise is at risk before the customer does: the
 * style's own Line watch status is the order's.
 *
 * Ordered, dispatched and pending are the domain's arithmetic
 * (`orderValue`, `pendingQty`) over the owner's records, so the order value
 * is always derived from its lines and never typed twice.
 */
import { addDays } from '@/lib/domain/calc'
import { orderValue, pendingQty } from '@/lib/domain/dispatch'
import type { Derived, SalesOrderLine } from '@/lib/domain/types'
import { customerOf, dispatchRulesOf } from './customers'
import { issueId } from './defaults'
import { addJob, nextJobNo } from './jobs'
import { lineWatch, WATCH_WORD, type WatchStatus } from './linewatch'
import { floorOf, isWorkingDay, madeOn, planJob } from './plan'
import { productOf } from './products'
import { nextNo } from './sourcing'
import type { CustomerOrder, Job, OrderLine, Product, Workspace, WsCustomer } from './types'

export const orderOf = (ws: Workspace, id?: string): CustomerOrder | undefined =>
  id ? (ws.customerOrders ?? []).find((o) => o.id === id) : undefined

export interface OrderLineInput { productId: string; qty: number; rate: number; jobId?: string }
export interface OrderInput {
  customerId: string
  takenOn: string
  promisedDate: string
  note?: string
  lines: OrderLineInput[]
}

/** What has gone out against an order, from its dispatch notes. */
export const dispatchedOn = (ws: Workspace, orderId: string, productId?: string): number =>
  (ws.dispatchNotes ?? []).filter((n) => n.orderId === orderId)
    .flatMap((n) => n.lines).filter((l) => !productId || l.productId === productId)
    .reduce((a, l) => a + l.qty, 0)

export function orderProblem(ws: Workspace, o: OrderInput, exceptId?: string): string | null {
  if (!customerOf(ws, o.customerId)) return 'Pick the customer.'
  if (!o.takenOn) return 'Put in the day it was taken.'
  if (!o.promisedDate) return 'Put in the day it was promised.'
  if (o.promisedDate < o.takenOn) return 'It cannot be promised before it was taken.'
  if (o.lines.length === 0) return 'Put at least one product on it.'
  for (const l of o.lines) {
    const p = productOf(ws, l.productId)
    if (!p) return 'Every line needs a product.'
    if (!Number.isInteger(l.qty) || l.qty <= 0) return `Put in how many ${p.name}, a whole number.`
    if (!Number.isFinite(l.rate) || l.rate < 0) return `Put in the rate for ${p.name} — nought if it is free.`
    if (l.jobId) {
      const job = (ws.jobs ?? []).find((j) => j.id === l.jobId)
      if (!job) return 'A style named on it is not on the list.'
      if (job.closedOn) return `${job.no} is closed.`
      if (job.productId && job.productId !== l.productId) return `${job.no} makes ${productOf(ws, job.productId)?.name ?? 'something else'}, not ${p.name}.`
    }
  }
  if (exceptId && dispatchedOn(ws, exceptId) > 0) return 'Something has gone out against it, so it can no longer be changed.'
  return null
}

const linesOf = (id: string, lines: OrderLineInput[]): OrderLine[] =>
  lines.map((l, i) => ({ id: `${id}/${i + 1}`, productId: l.productId, qty: l.qty, rate: Math.round(l.rate * 100) / 100, jobId: l.jobId || undefined }))

export function addOrder(ws: Workspace, o: OrderInput): [Workspace, string] {
  if (orderProblem(ws, o)) return [ws, '']
  const [w, id] = issueId(ws, 'SO')
  const order: CustomerOrder = {
    id, no: nextNo('SO', w.customerOrders ?? []), customerId: o.customerId, takenOn: o.takenOn,
    promisedDate: o.promisedDate, state: 'open', note: o.note?.trim() || undefined, lines: linesOf(id, o.lines),
  }
  return [{ ...w, customerOrders: [...(w.customerOrders ?? []), order] }, id]
}

/** Changed only while nothing has gone out against it. */
export function updateOrder(ws: Workspace, id: string, o: OrderInput): Workspace {
  if (!orderOf(ws, id) || orderProblem(ws, o, id)) return ws
  return {
    ...ws,
    customerOrders: (ws.customerOrders ?? []).map((x) => (x.id !== id ? x : {
      ...x, customerId: o.customerId, takenOn: o.takenOn, promisedDate: o.promisedDate,
      note: o.note?.trim() || undefined, lines: linesOf(id, o.lines),
    })),
  }
}

/** Cancelled: nothing more goes out against it. What already went stays on the book. */
export const cancelOrder = (ws: Workspace, id: string): Workspace =>
  ({ ...ws, customerOrders: (ws.customerOrders ?? []).map((o) => (o.id === id ? { ...o, state: 'cancelled' as const } : o)) })

export const reopenOrder = (ws: Workspace, id: string): Workspace =>
  ({ ...ws, customerOrders: (ws.customerOrders ?? []).map((o) => (o.id === id ? { ...o, state: 'open' as const } : o)) })

export function removeOrderProblem(ws: Workspace, id: string): string | null {
  return dispatchedOn(ws, id) > 0 ? 'Something has gone out against it. Cancel it instead — its record stays.' : null
}

export const removeOrder = (ws: Workspace, id: string): Workspace =>
  (removeOrderProblem(ws, id) ? ws : { ...ws, customerOrders: (ws.customerOrders ?? []).filter((o) => o.id !== id) })

/** The rate last agreed with this customer for this product — offered on the next order. */
export function lastRateFor(ws: Workspace, customerId: string, productId: string): number | undefined {
  const lines = [...(ws.customerOrders ?? [])].filter((o) => o.customerId === customerId)
    .sort((a, b) => b.takenOn.localeCompare(a.takenOn) || b.id.localeCompare(a.id))
    .flatMap((o) => o.lines).filter((l) => l.productId === productId)
  return lines[0]?.rate
}

/**
 * A style opened for an order line, and planned to finish two working days
 * before the promise — the floor's own time to pack and dispatch. The line
 * then names it, so the order sees the style's Line watch.
 */
export function openJobForOrder(ws: Workspace, orderId: string, lineId: string, today: string): [Workspace, string] {
  const order = orderOf(ws, orderId)
  const line = order?.lines.find((l) => l.id === lineId)
  const product = productOf(ws, line?.productId)
  if (!order || !line || !product || line.jobId) return [ws, '']
  const floor = floorOf(ws)
  let finish = order.promisedDate
  for (let back = 0; back < 2;) { finish = addDays(finish, -1); if (isWorkingDay(finish, floor)) back++ }
  if (finish < today) finish = today > order.promisedDate ? today : order.promisedDate
  const no = nextJobNo(ws)
  const [w1, jobId] = addJob(ws, { no, name: product.name, customer: customerOf(ws, order.customerId)?.name, openedOn: today })
  if (!jobId) return [ws, '']
  const w2 = planJob(w1, jobId, { productId: product.id, qty: line.qty, plannedStart: today, plannedFinish: finish })
  return [{
    ...w2,
    customerOrders: (w2.customerOrders ?? []).map((o) => (o.id !== orderId ? o
      : { ...o, lines: o.lines.map((l) => (l.id === lineId ? { ...l, jobId } : l)) })),
  }, jobId]
}

/* ------------------------------------------- what a style is made for -- */

/** A sales order line, with what it is for: the order, its customer, its product. */
export interface SalesLineRef {
  order: CustomerOrder
  line: OrderLine
  customer?: WsCustomer
  product?: Product
}

const refOf = (ws: Workspace, order: CustomerOrder, line: OrderLine): SalesLineRef =>
  ({ order, line, customer: customerOf(ws, order.customerId), product: productOf(ws, line.productId) })

/** "SO-3 · Bharat Panels · Slim-fit jeans × 500" */
export const salesLineLabel = (r: SalesLineRef): string =>
  `${r.order.no} · ${r.customer?.name ?? 'Unknown customer'} · ${r.product?.name ?? 'a product'} × ${r.line.qty}`

/** The sales order lines a style or job card is being made for — the lines whose "Made on" names it. */
export const linesMadeOn = (ws: Workspace, jobId: string): SalesLineRef[] =>
  (ws.customerOrders ?? []).flatMap((o) => o.lines.filter((l) => l.jobId === jobId).map((l) => refOf(ws, o, l)))

/**
 * Lines a style or job card can be made for: on an open order, with something
 * still to go out, made on nothing else yet — and of what it makes, once it
 * has been planned. The ones it is already made for are offered too.
 */
export function linkableLines(ws: Workspace, jobId?: string): SalesLineRef[] {
  const job = jobId ? (ws.jobs ?? []).find((j) => j.id === jobId) : undefined
  return (ws.customerOrders ?? []).filter((o) => o.state === 'open').flatMap((o) => o.lines
    .filter((l) => (l.jobId ? l.jobId === jobId : true))
    .filter((l) => !job?.productId || job.productId === l.productId)
    .filter((l) => (jobId !== undefined && l.jobId === jobId) || l.qty - dispatchedOn(ws, o.id, l.productId) > 0)
    .map((l) => refOf(ws, o, l)))
}

/** Why a style or job card cannot be made for that line, or null. Blank is "for stock". */
export function madeForProblem(ws: Workspace, jobId: string | undefined, lineId: string): string | null {
  if (!lineId) return null
  const ref = linkableLines(ws, jobId).find((r) => r.line.id === lineId)
  return ref ? null : 'Pick a line on an open sales order that nothing else is being made for.'
}

/**
 * Make a style or job card for a sales order line — the same link the line's
 * "Made on" sets — moving it off the line it was made for before, if any. A
 * style made for two orders keeps the other: only the line named in `from`
 * lets go.
 */
export function setMadeFor(ws: Workspace, jobId: string, from: string | undefined, to: string): Workspace {
  if (from === to || madeForProblem(ws, jobId, to)) return ws
  return {
    ...ws,
    customerOrders: (ws.customerOrders ?? []).map((o) => ({
      ...o,
      lines: o.lines.map((l) => (l.id === to ? { ...l, jobId }
        : l.id === from && l.jobId === jobId ? { ...l, jobId: undefined } : l)),
    })),
  }
}

/**
 * What a style or job card is for, in words: the sales order and customer it
 * is made on, or — for one opened before styles named their sales order —
 * whatever was typed. Blank is made for stock.
 */
export function madeForText(ws: Workspace, job: Job): string {
  const on = linesMadeOn(ws, job.id)
  if (on.length === 0) return job.customer ?? ''
  const first = `${on[0].order.no} · ${on[0].customer?.name ?? 'Unknown customer'}`
  return on.length === 1 ? first : `${first} + ${on.length - 1} more`
}

/* -------------------------------------------------------------- reading -- */

export type OrderStatus = 'not_out' | 'part' | 'full' | 'late' | 'cancelled'

export const ORDER_WORD: Record<OrderStatus, string> = {
  not_out: 'Not out yet',
  part: 'Part shipped',
  full: 'Dispatched in full',
  late: 'Past the promise',
  cancelled: 'Cancelled',
}

export interface OrderLineRow {
  line: OrderLine
  product?: Product
  dispatched: number
  job?: Job
  /** good pieces off the style making it */
  made?: number
}

export interface OrderRow {
  order: CustomerOrder
  customer?: WsCustomer
  lines: OrderLineRow[]
  ordered: number
  dispatched: number
  pending: Derived
  value: Derived
  complete: boolean
  /** promised date passed and not fully out */
  overdue: boolean
  status: OrderStatus
  /** good pieces made by the styles on it, where lines name one */
  made: number | null
  /** the worst of its styles, while anything is still to go */
  risk?: { jobId: string; jobNo: string; status: WatchStatus | 'finishes_late'; reason: string }
}

const RISK_RANK: Record<string, number> = { halted: 0, will_halt: 1, at_risk: 2, finishes_late: 3 }

export function orderRows(ws: Workspace, today: string): OrderRow[] {
  const watch = today ? lineWatch(ws, today) : []
  return [...(ws.customerOrders ?? [])]
    .sort((a, b) => a.promisedDate.localeCompare(b.promisedDate) || a.no.localeCompare(b.no, undefined, { numeric: true }))
    .map((order) => {
      const lines: OrderLineRow[] = order.lines.map((line) => {
        const job = line.jobId ? (ws.jobs ?? []).find((j) => j.id === line.jobId) : undefined
        return {
          line, job,
          product: productOf(ws, line.productId),
          dispatched: dispatchedOn(ws, order.id, line.productId),
          made: job ? madeOn(ws, job.id) : undefined,
        }
      })
      const ordered = order.lines.reduce((a, l) => a + l.qty, 0)
      const dispatched = dispatchedOn(ws, order.id)
      const complete = dispatched >= ordered
      const overdue = order.state === 'open' && !complete && !!today && order.promisedDate < today
      const status: OrderStatus = order.state === 'cancelled' ? 'cancelled'
        : complete ? 'full' : overdue ? 'late' : dispatched > 0 ? 'part' : 'not_out'
      const domainLines: SalesOrderLine[] = order.lines.map((l) => ({ id: l.id, soNo: order.no, fgId: l.productId, qty: l.qty, rate: l.rate }))
      const linked = lines.filter((l) => l.job)
      let risk: OrderRow['risk']
      if (order.state === 'open' && !complete) {
        for (const l of linked) {
          const w = watch.find((x) => x.job.id === l.job!.id)
          const cand = w && (w.status === 'halted' || w.status === 'will_halt' || w.status === 'at_risk')
            ? { jobId: l.job!.id, jobNo: l.job!.no, status: w.status, reason: w.reasons[0] ?? WATCH_WORD[w.status] }
            : l.job!.plannedFinish && l.job!.plannedFinish > order.promisedDate
              ? { jobId: l.job!.id, jobNo: l.job!.no, status: 'finishes_late' as const, reason: `${l.job!.no} is planned to finish after the promise` }
              : undefined
          if (cand && (!risk || RISK_RANK[cand.status] < RISK_RANK[risk.status])) risk = cand
        }
      }
      return {
        order, lines, ordered, dispatched, complete, overdue, status,
        customer: customerOf(ws, order.customerId),
        pending: pendingQty(order.no, ordered, dispatched, ''),
        value: orderValue(domainLines, order.no),
        made: linked.length ? linked.reduce((a, l) => a + Math.min(l.line.qty, l.made ?? 0), 0) : null,
        risk,
      }
    })
}

/** Open, with something still to go. */
export const openOrders = (ws: Workspace): CustomerOrder[] =>
  (ws.customerOrders ?? []).filter((o) => o.state === 'open' && dispatchedOn(ws, o.id) < o.lines.reduce((a, l) => a + l.qty, 0))

/** A new order's promise: today plus the rule's days. */
export const defaultPromise = (ws: Workspace, today: string): string => addDays(today, dispatchRulesOf(ws).promiseDays)
