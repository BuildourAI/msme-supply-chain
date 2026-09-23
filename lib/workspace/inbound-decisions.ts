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
import { orderGroups, orderRows } from './sourcing'
import { sortDecisions, type Decision } from './decisions'
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

  return sortDecisions(out)
}

/** How many things are waiting at the gate — the Dashboard row's badge. */
export const inboundOpenCount = (ws: Workspace, today: string): number =>
  inboundDecisionsFor(ws, today).length
