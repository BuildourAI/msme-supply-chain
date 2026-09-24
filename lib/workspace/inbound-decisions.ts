/**
 * Everything at the gate waiting on a person.
 *
 * The same `Decision` shape the sourcing queue uses, drawn by the same `Queue`,
 * so the two desks read alike — but a different list. Sourcing's queue is
 * about suppliers, prices and what the supplier has not confirmed; this one
 * is about material: what is due, what is waiting to be inspected, a rejection
 * out of pattern, what is out at a jobworker past its date. Nothing is on
 * both. An order due for delivery is here, because recording what arrived is
 * the gate's job; a change the supplier has not confirmed is sourcing's,
 * because the answer is a word with the supplier, never anything at the gate.
 *
 * Pure. Later phases add kinds to the same list rather than new screens.
 */
import { money, num } from '@/lib/domain/format'
import { orderGroups, orderRows } from './sourcing'
import { sortDecisions, type Decision } from './decisions'
import { challanRows, jobworkerHoldings, receiptRow, spikeOf } from './inbound'
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
   * Material out at jobworkers. Past its date it is the worst band — the line
   * may be waiting on it — and the answer is a chase, or booking in what came
   * back. Once a challan is settling with material neither back nor explained,
   * somebody has to close it against a reason. And a jobworker holding more
   * than the ceiling the owner set is money sitting in somebody else's shed.
   */
  for (const r of challanRows(ws, today)) {
    if (r.challan.status !== 'out') continue
    const who = r.vendor?.name ?? 'Unknown jobworker'
    const what = r.item?.name ?? 'Unknown material'
    if (r.overdue) {
      const late = r.late.value
      const out_ = Math.round((r.challan.qtySent - r.acct.returned.value - r.acct.inQc.value) * 1000) / 1000
      out.push({
        id: `challan-overdue:${r.challan.id}`,
        band: 'stops',
        kind: 'challan-overdue',
        title: `${r.challan.no} · ${who}`,
        detail: `${num(out_, 3)} ${r.uom} of ${what} ${late} day${late === 1 ? '' : 's'} past the date they promised`,
        act: 'chase',
        actLabel: 'Chase them',
        alt: { act: 'return', label: 'It came back' },
        href: '/inbound/jobwork',
        refs: { challanId: r.challan.id, vendorId: r.challan.vendorId, itemId: r.challan.itemId },
        weight: 500 + late,
      })
    }
    if (r.acct.settling && r.acct.unaccounted.value > 0 && r.atGate.length === 0) {
      out.push({
        id: `challan-unaccounted:${r.challan.id}`,
        band: 'costs',
        kind: 'challan-unaccounted',
        title: `${r.challan.no} · ${who}`,
        detail: `${num(r.acct.unaccounted.value, 3)} ${r.uom} of ${what} neither back nor explained — ${money(r.valueLost.value)}`,
        act: 'close-challan',
        actLabel: 'Settle it',
        href: '/inbound/jobwork',
        refs: { challanId: r.challan.id, vendorId: r.challan.vendorId, itemId: r.challan.itemId },
        weight: 250 + Math.min(199, Math.round(r.valueLost.value / 1000)),
      })
    }
  }
  for (const h of jobworkerHoldings(ws, today)) {
    if (!h.over) continue
    out.push({
      id: `over-ceiling:${h.vendor.id}`,
      band: 'costs',
      kind: 'over-ceiling',
      title: h.vendor.name,
      detail: `holding ${money(h.held.value)} of your material — the most you allow one jobworker is ${money(ws.policy.jobworkerExposureCeiling)}`,
      act: 'open',
      actLabel: 'Look at it',
      href: '/inbound/jobwork',
      refs: { vendorId: h.vendor.id },
      weight: 180 + Math.min(99, Math.round((h.held.value - ws.policy.jobworkerExposureCeiling) / 10000)),
    })
  }

  return sortDecisions(out)
}

/** How many things are waiting at the gate — the Dashboard row's badge. */
export const inboundOpenCount = (ws: Workspace, today: string): number =>
  inboundDecisionsFor(ws, today).length
