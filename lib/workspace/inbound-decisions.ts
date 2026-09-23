/**
 * Everything at the gate waiting on a person.
 *
 * The same `Decision` shape the sourcing queue uses, drawn by the same `Queue`,
 * so the two desks read alike — but a different list. Sourcing's queue is
 * about suppliers and prices; this one is about material: what is due, what is
 * waiting to be inspected, what the supplier has not confirmed, what is out at
 * a jobworker past its date. Nothing is on both. The one kind that used to be —
 * an order due for delivery — moved here, because recording what arrived is
 * the gate's job, and asking for it on both screens counted one lorry twice.
 *
 * Pure. Later phases add kinds to the same list rather than new screens.
 */
import { money, num, shortDate } from '@/lib/domain/format'
import { boardLines, verdictText } from './board'
import { syncOrders } from './orders'
import { orderGroups, orderRows } from './sourcing'
import { sortDecisions, type Decision } from './decisions'
import { receiptRow, spikeOf } from './inbound'
import { awaitingArrival, closedReceipts, openReceipts } from './receipts'
import type { Workspace } from './types'

const daysBetween = (from: string, to: string) =>
  Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86400000)

export function inboundDecisionsFor(ws: Workspace, today: string): Decision[] {
  // no date, no arithmetic — the command palette asks for rows, not for alarms
  if (!today) return []
  const out: Decision[] = []

  /*
   * Due at the gate. Handed over to the supplier, promised for today or
   * earlier, and not all of it here. A late one is here too, not only on the
   * sourcing queue: chasing is sourcing's job, but when the lorry turns up it
   * is still the gate that has to say what came off it.
   */
  for (const g of orderGroups(orderRows(ws))) {
    const out_ = g.state === 'confirmed' || g.state === 'shipped'
    if (!out_ || g.expectedOn > today) continue
    // all of it is at the gate already — the question now is inspection
    if (!awaitingArrival(ws, g.rows.map((r) => r.order))) continue
    const late = daysBetween(g.expectedOn, today)
    out.push({
      id: `to-receive:${g.no}`,
      band: 'unfinished',
      kind: 'to-receive',
      title: `${g.no} · ${g.vendor?.name ?? 'Unknown supplier'}`,
      detail: late > 0
        ? `${late} day${late === 1 ? '' : 's'} past their date — say what came when it lands`
        : 'due today — say what came',
      act: 'arrive',
      actLabel: 'Goods arrived',
      href: '/inbound/receiving',
      refs: { orderNo: g.no, vendorId: g.vendor?.id },
      weight: 75 + late,
    })
  }

  /*
   * At the gate, waiting on inspection. Past the window it is the worst band:
   * material that has been paid for is standing where nobody can issue it,
   * and a line may be about to stop for want of what is sitting by the door.
   */
  for (const r of openReceipts(ws)) {
    const row = receiptRow(ws, r, today)
    const what = `${num(r.qty, 3)} ${row.item?.uom ?? ''}`.trim()
    const days = row.age.value
    const overdue = row.state === 'overdue'
    out.push({
      id: `${overdue ? 'qc-overdue' : 'at-gate'}:${r.id}`,
      band: overdue ? 'stops' : 'unfinished',
      kind: overdue ? 'qc-overdue' : 'at-gate',
      title: `${row.item?.name ?? 'Unknown material'} · ${row.vendor?.name ?? 'Unknown supplier'}`,
      detail: overdue
        ? `${what} past the QC window — ${days} days at the gate, not usable`
        : days === 0 ? `${what} arrived today — not usable until inspected`
          : `${what} at the gate ${days} day${days === 1 ? '' : 's'} — not usable until inspected`,
      act: 'inspect',
      actLabel: row.checks.length === 0 ? 'Close it' : 'Inspect',
      href: '/inbound/receiving',
      refs: { receiptId: r.id, vendorId: r.vendorId, itemId: r.itemId },
      weight: (overdue ? 600 : 100) + days,
    })
  }

  /*
   * A delivery rejected well beyond the supplier's own record. One bad batch
   * happens; this is the multiple the owner set for "a pattern". Asked once:
   * "noted" is a real answer and it sticks.
   */
  for (const r of closedReceipts(ws)) {
    if (!r.closedAt || daysBetween(r.closedAt, today) > 30) continue
    if (ws.drafts[`inbound.spikeNoted.${r.id}`] === true) continue
    const s_ = spikeOf(ws, r)
    if (!s_.spike) continue
    const item = ws.items.find((i) => i.id === r.itemId)
    const vendor = ws.vendors.find((v) => v.id === r.vendorId)
    out.push({
      id: `spike:${r.id}`,
      band: 'costs',
      kind: 'spike',
      title: `${vendor?.name ?? 'Unknown supplier'} · ${item?.name ?? 'Unknown material'}`,
      detail: `${num(s_.thisPct, 1)}% rejected on ${r.id}, against ${num(s_.trailingPct, 1)}% before it`,
      act: 'open',
      actLabel: 'Look at it',
      alt: { act: 'keep', label: 'Noted' },
      href: '/inbound/receiving',
      refs: { receiptId: r.id, vendorId: r.vendorId, itemId: r.itemId },
      weight: 200 + Math.round(s_.thisPct),
    })
  }

  /*
   * Order changes and the supplier's confirmation of them. A change nobody
   * has told the supplier about costs money every day it sits: they are
   * making the old quantity, and cover is counted on the old quantity. A
   * notice unanswered past the days the gate rules allow costs too; inside
   * them, it is only half-finished — somebody has to record the reply.
   */
  for (const g of syncOrders(ws, today)) {
    const vendor = g.vendor?.name ?? 'Unknown supplier'
    const moved = g.lines.filter((l) => l.state !== 'acknowledged')
    const one = moved[0]
    if (!one) continue
    const what = moved.length === 1
      ? `${one.item?.name ?? 'a material'} now ${num(one.need.value, 3)} ${one.uom}, they are making ${num(one.making.value, 3)}`
      : `${moved.length} lines changed`
    if (g.state === 'not_told') {
      out.push({
        id: `not-told:${g.no}`,
        band: 'costs',
        kind: 'not-told',
        title: `${g.no} · ${vendor}`,
        detail: `changed, supplier not told — ${what}`
          + (g.exposure > 0 ? ` · ${money(g.exposure)} riding on it` : ''),
        act: 'notice',
        actLabel: 'Send the change',
        href: '/inbound/orders',
        refs: { orderNo: g.no, vendorId: g.vendor?.id },
        weight: 300 + Math.min(199, Math.round(g.exposure / 1000)),
      })
      continue
    }
    if (g.state === 'awaiting_ack') {
      const days = Math.max(...moved.map((l) => l.awaiting.value))
      const overdue = moved.some((l) => l.chaseOverdue)
      out.push({
        id: `awaiting-ack:${g.no}`,
        band: overdue ? 'costs' : 'unfinished',
        kind: 'awaiting-ack',
        title: `${g.no} · ${vendor}`,
        detail: `change sent ${days === 0 ? 'today' : `${days} day${days === 1 ? '' : 's'} ago`}, not confirmed — ${what}`,
        act: 'ack',
        actLabel: 'They confirmed',
        alt: { act: 'notice', label: 'Send it again' },
        href: '/inbound/orders',
        refs: { orderNo: g.no, vendorId: g.vendor?.id },
        weight: (overdue ? 250 : 90) + days,
      })
    }
  }

  /*
   * A line that keeps moving. The supplier re-plans every time, and prices it
   * in next quarter; the fix is upstream of purchasing. "Noted" sticks until
   * the line moves again.
   */
  for (const g of syncOrders(ws, today)) {
    for (const l of g.lines) {
      if (!l.whipsawed) continue
      const key = `inbound.churnNoted.${l.order.id}.${l.sync.revisions.length}`
      if (ws.drafts[key] === true) continue
      out.push({
        id: `churn:${l.order.id}`,
        band: 'costs',
        kind: 'churn',
        title: `${g.no} · ${l.item?.name ?? 'Unknown material'}`,
        detail: `changed ${l.churn.value} times in 30 days — the gate rules allow ${ws.policy.poChurnLimit}`,
        act: 'open',
        actLabel: 'Look at it',
        alt: { act: 'keep', label: 'Noted' },
        href: '/inbound/orders',
        refs: { orderNo: g.no, orderId: l.order.id, vendorId: g.vendor?.id, itemId: l.order.itemId },
        weight: 150 + l.churn.value,
      })
    }
  }

  /*
   * What will not be here in time. Covered on quantity is not covered: an
   * order that lands after the line stops, or lands and cannot be inspected
   * before it does, stops the line all the same. The answer is to hurry the
   * order already placed, not to place a second one.
   */
  for (const l of boardLines(ws, today)) {
    const v = l.verdict.value
    if (v !== 'late' && v !== 'tight') continue
    out.push({
      id: `lands-late:${l.order.id}`,
      band: 'stops',
      kind: 'lands-late',
      title: `${l.order.no} · ${l.item?.name ?? 'Unknown material'}`,
      detail: v === 'late'
        ? `lands ${verdictText(l)}: line stops ${shortDate(l.stops!)}, arrives ${shortDate(l.arrives)}`
        : `tight: line stops ${shortDate(l.stops!)}, issuable ${shortDate(l.issuable)}`,
      act: 'open',
      actLabel: 'Look at it',
      alt: { act: 'chase', label: 'Ask them to hurry' },
      href: '/inbound/orders',
      refs: { orderNo: l.order.no, orderId: l.order.id, vendorId: l.order.vendorId, itemId: l.order.itemId },
      weight: 700 + l.lateBy,
    })
  }

  return sortDecisions(out)
}

/** How many things are waiting at the gate — the Dashboard row's badge. */
export const inboundOpenCount = (ws: Workspace, today: string): number =>
  inboundDecisionsFor(ws, today).length
