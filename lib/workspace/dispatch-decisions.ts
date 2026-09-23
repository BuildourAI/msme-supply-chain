/**
 * The shipping bay's work queue.
 *
 * The owner's questions about customers, in the order they cost: which
 * promise has already passed, which is about to be missed because the style
 * making it will halt, which is due in days with not enough on the shelf,
 * and which order has nobody making it at all.
 *
 * Finished stock is shared out to open orders in the order they were
 * promised, so two orders are never both told the same pieces are theirs.
 */
import { addDays, daysBetween } from '@/lib/domain/calc'
import { shortDate } from '@/lib/domain/format'
import { carriersThisMonth, chasedKey, consignmentOf, consignmentRows } from './consignments'
import { customerOf } from './customers'
import { sortDecisions, type Decision } from './decisions'
import { handoff } from './dispatch-notes'
import { jobWord } from './jobs'
import { WATCH_WORD } from './linewatch'
import { fgOnHand, productOf } from './products'
import { orderOf, orderRows, type OrderRow } from './sales'
import type { Workspace } from './types'

const money = (n: number) => `₹${Math.round(n).toLocaleString('en-IN')}`

export const riskNotedKey = (orderId: string) => `dispatch.riskNoted.${orderId}`
export const shortNotedKey = (orderId: string) => `dispatch.shortNoted.${orderId}`
export const noCarrierKey = (noteId: string) => `dispatch.noCarrier.${noteId}`
export const ewayKey = (noteId: string) => `dispatch.eway.${noteId}`
export const carrierKey = (carrierId: string, month: string) => `dispatch.carrier.${carrierId}.${month}`

/** A carrier is worth a word when two deliveries this month were late, or a third of them. */
const carrierIsLate = (delivered: number, late: number) => late >= 2 || (delivered >= 3 && late / delivered > 1 / 3)

/** How far ahead an order counts as due: a promise within this many days with too little ready is a card. */
export const DUE_SOON_DAYS = 3

export interface LineCover { orderId: string; lineId: string; productId: string; need: number; fromStock: number; short: number }

/** Finished stock shared out to what open orders still need, earliest promise first. */
export function coverFromStock(ws: Workspace, rows: OrderRow[]): LineCover[] {
  const avail = new Map<string, number>()
  const out: LineCover[] = []
  for (const r of rows.filter((x) => x.order.state === 'open' && !x.complete)) {
    r.lines.forEach((l, i) => {
      const pid = l.line.productId
      if (!avail.has(pid)) avail.set(pid, Math.max(0, fgOnHand(ws, pid)))
      // what has gone of this product on this order is taken off its lines in order
      const already = r.lines.slice(0, i).filter((x) => x.line.productId === pid).reduce((a, x) => a + x.line.qty, 0)
      const need = Math.max(0, l.line.qty - Math.max(0, l.dispatched - already))
      const fromStock = Math.min(avail.get(pid)!, need)
      avail.set(pid, avail.get(pid)! - fromStock)
      out.push({ orderId: r.order.id, lineId: l.line.id, productId: pid, need, fromStock, short: need - fromStock })
    })
  }
  return out
}

const riskSig = (r: OrderRow) => (r.risk ? `${r.risk.jobId}:${r.risk.status}:${r.risk.reason}` : '')

export function dispatchDecisionsFor(ws: Workspace, today: string): Decision[] {
  if (!today) return []
  const out: Decision[] = []
  const rows = orderRows(ws, today)
  const cover = coverFromStock(ws, rows)
  const soon = addDays(today, DUE_SOON_DAYS)
  const word = jobWord(ws).one

  for (const r of rows) {
    if (r.order.state !== 'open' || r.complete) continue
    const who = r.customer?.name ?? 'a customer'
    const pending = r.pending.value

    /* Past the promise: the only card about something already broken. */
    if (r.overdue) {
      const share = r.value.value * (pending / Math.max(1, r.ordered))
      out.push({
        id: `order-late:${r.order.id}`,
        band: 'stops',
        kind: 'order-late',
        title: `${r.order.no} for ${who} was promised ${shortDate(r.order.promisedDate)} and ${r.dispatched > 0 ? 'is only part shipped' : 'is not out'}`,
        detail: `${pending} of ${r.ordered} still to go${share > 0 ? `, worth ${money(share)}` : ''}.`,
        act: 'dispatch',
        actLabel: 'Dispatch it',
        href: '/dispatch/orders',
        refs: { orderId: r.order.id },
        weight: 1000 + share / 1000,
      })
    }

    /* At risk: the style making it will not run as planned, or finishes after the promise. */
    if (r.risk && ws.drafts[riskNotedKey(r.order.id)] !== riskSig(r)) {
      const what = r.risk.status === 'finishes_late' ? 'finishes after the promise' : WATCH_WORD[r.risk.status].toLowerCase()
      out.push({
        id: `order-at-risk:${r.order.id}`,
        band: r.risk.status === 'halted' || r.risk.status === 'will_halt' ? 'stops' : 'costs',
        kind: 'order-at-risk',
        title: `${r.order.no} for ${who}, due ${shortDate(r.order.promisedDate)}, is at risk — ${r.risk.jobNo} ${what}`,
        detail: `${r.risk.reason}.`,
        act: 'open',
        actLabel: `See the ${word}`,
        alt: { act: 'keep', label: 'Noted' },
        href: '/production/line-watch',
        refs: { orderId: r.order.id, jobId: r.risk.jobId },
        weight: 500,
      })
    }

    /* Due in days, too little on the shelf; or nobody is making it at all. */
    for (const c of cover.filter((x) => x.orderId === r.order.id && x.short > 0)) {
      const line = r.lines.find((l) => l.line.id === c.lineId)!
      const product = productOf(ws, c.productId)
      const name = product?.name ?? 'a product'
      if (!line.job) {
        out.push({
          id: `order-no-style:${c.lineId}`,
          band: r.order.promisedDate <= soon ? 'stops' : 'unfinished',
          kind: 'order-no-style',
          title: `Nobody is making the ${c.short} ${name} ${r.order.no} still needs`,
          detail: `${c.fromStock ? `${c.fromStock} are on the shelf for it; ` : ''}promised to ${who} for ${shortDate(r.order.promisedDate)}. Open a ${word} for it and the floor plans it, finishing before the promise.`,
          act: 'plan',
          actLabel: `Open a ${word} for it`,
          href: '/dispatch/orders',
          refs: { orderId: r.order.id, lineId: c.lineId, productId: c.productId },
          weight: c.short,
        })
      } else if (r.order.promisedDate <= soon && !r.overdue) {
        const sig = `${c.lineId}:${c.fromStock}:${c.need}`
        if (ws.drafts[shortNotedKey(r.order.id)] === sig) continue
        out.push({
          id: `order-short-stock:${c.lineId}`,
          band: 'costs',
          kind: 'order-short-stock',
          title: `${r.order.no} is due ${shortDate(r.order.promisedDate)} and ${c.fromStock} of ${c.need} ${name} are ready`,
          detail: `${line.job.no} is making them — ${line.made ?? 0} made so far. What is on the shelf is shared out to the earliest promise first.`,
          act: 'open',
          actLabel: 'See the plan',
          alt: { act: 'keep', label: 'Noted' },
          href: '/production/plan',
          refs: { orderId: r.order.id, lineId: c.lineId, jobId: line.job.id },
          weight: c.short,
        })
      }
    }
  }
  /* Notes that left with nobody saying who took them, or that need an e-way bill. */
  for (const note of ws.dispatchNotes ?? []) {
    const c = consignmentOf(ws, note.id)
    const who = customerOf(ws, note.customerId)?.name ?? 'the customer'
    const order = orderOf(ws, note.orderId)
    if (!c && !ws.drafts[noCarrierKey(note.id)]) {
      const days = Math.max(0, daysBetween(note.on, today))
      out.push({
        id: `note-no-carrier:${note.id}`,
        band: 'unfinished',
        kind: 'note-no-carrier',
        title: `${note.no} to ${who} has no carrier or docket number`,
        detail: `It ${days === 0 ? 'went today' : `left ${shortDate(note.on)}`}${order ? ` against ${order.no}` : ''}. Without a carrier and a promised day, nobody can say whether it arrived on time.`,
        act: 'book',
        actLabel: 'Book with a carrier',
        alt: { act: 'keep', label: 'Collected by them' },
        href: '/dispatch/notes',
        refs: { noteId: note.id, orderId: note.orderId },
        weight: 10 + days,
      })
    }
    const h = handoff(ws, note.id)
    if (h.ewayNeeded && !c?.deliveredOn && !ws.drafts[ewayKey(note.id)]) {
      out.push({
        id: `note-eway:${note.id}`,
        band: 'costs',
        kind: 'note-eway',
        title: `${note.no} is worth ₹${Math.round(h.taxable).toLocaleString('en-IN')} — an e-way bill is needed before it moves`,
        detail: `At or over your ₹${h.threshold.toLocaleString('en-IN')} threshold${h.supply === 'inter' ? ', and it crosses a state line' : ''}. The e-way bill is made on the GST portal; the challan carries the values it asks for.`,
        act: 'keep',
        actLabel: 'E-way bill made',
        alt: { act: 'open', label: 'See the challan' },
        href: `/dispatch/notes?doc=${note.id}`,
        refs: { noteId: note.id, orderId: note.orderId },
        weight: 100 + h.taxable / 10000,
      })
    }
  }
  /* On the road: due today or past the day the customer was given, and nobody has said it arrived. */
  const cons = consignmentRows(ws, today)
  for (const r of cons.filter((x) => !x.delivered && x.consignment.promisedDate <= today)) {
    const who = r.customer?.name ?? 'the customer'
    const late = daysBetween(r.consignment.promisedDate, today)
    const chased = ws.drafts[chasedKey(r.consignment.id)] as string | undefined
    out.push({
      id: `delivery-due:${r.consignment.id}`,
      band: late > 0 ? 'costs' : 'unfinished',
      kind: 'delivery-due',
      title: late > 0
        ? `${r.note.no} to ${who} was promised ${shortDate(r.consignment.promisedDate)} and nobody has confirmed delivery`
        : `${r.note.no} to ${who} is due today — has it arrived?`,
      detail: `With ${r.carrier?.name ?? 'the carrier'}${r.consignment.lrNo ? `, docket ${r.consignment.lrNo}` : ''}, left ${shortDate(r.note.on)}.${chased ? ` You chased them ${chased === today ? 'today' : shortDate(chased)}.` : ''} On time and in full counts it only once somebody says it landed.`,
      act: 'delivered',
      actLabel: 'Delivered',
      alt: { act: 'chase', label: 'Chase' },
      href: '/dispatch/consignments',
      refs: { consignmentId: r.consignment.id, noteId: r.note.id, carrierId: r.consignment.carrierId },
      weight: 50 + late,
    })
  }

  /* A carrier who keeps landing late this month. */
  const month = today.slice(0, 7)
  for (const c of carriersThisMonth(ws, today, cons)) {
    if (!carrierIsLate(c.delivered, c.late)) continue
    if (ws.drafts[carrierKey(c.carrier.id, month)] === c.late) continue
    out.push({
      id: `carrier-late:${c.carrier.id}`,
      band: 'costs',
      kind: 'carrier-late',
      title: `${c.carrier.name} delivered ${c.late} of ${c.delivered} late this month, ${c.behind} day${c.behind === 1 ? '' : 's'} behind on average`,
      detail: 'Each of those is a promise to a customer the bay kept and the carrier did not. Worth a word with them, or a different carrier on the lanes they miss.',
      act: 'keep',
      actLabel: 'Noted',
      alt: { act: 'open', label: 'See by carrier' },
      href: '/dispatch/consignments?view=carriers',
      refs: { carrierId: c.carrier.id },
      weight: 20 + c.late,
    })
  }
  return sortDecisions(out)
}

/** "Noted" on a bay card, kept against what it showed so it returns only when that changes. */
export function noteDispatch(ws: Workspace, d: Decision, today: string): Workspace {
  const set = (k: string, v: unknown): Workspace => ({ ...ws, drafts: { ...ws.drafts, [k]: v } })
  if (d.kind === 'note-no-carrier' && d.refs.noteId) return set(noCarrierKey(d.refs.noteId), true)
  if (d.kind === 'note-eway' && d.refs.noteId) return set(ewayKey(d.refs.noteId), true)
  if (d.kind === 'carrier-late' && d.refs.carrierId) {
    const c = carriersThisMonth(ws, today).find((x) => x.carrier.id === d.refs.carrierId)
    return c ? set(carrierKey(c.carrier.id, today.slice(0, 7)), c.late) : ws
  }
  const orderId = d.refs.orderId
  if (!orderId) return ws
  const rows = orderRows(ws, today)
  const r = rows.find((x) => x.order.id === orderId)
  if (!r) return ws
  if (d.kind === 'order-at-risk') return set(riskNotedKey(orderId), riskSig(r))
  if (d.kind === 'order-short-stock') {
    const c = coverFromStock(ws, rows).find((x) => x.lineId === d.refs.lineId)
    return c ? set(shortNotedKey(orderId), `${c.lineId}:${c.fromStock}:${c.need}`) : ws
  }
  return ws
}

export const dispatchOpenCount = (ws: Workspace, today: string): number =>
  dispatchDecisionsFor(ws, today).length
