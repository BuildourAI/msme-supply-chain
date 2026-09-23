/**
 * What is out of your hands.
 *
 * The queue is everything waiting on a person. This is its opposite: orders
 * handed over to a supplier, promised for a date that has not come yet, and
 * needing nothing from anybody until it does. They were invisible — not on the
 * queue, because there is nothing to decide, and not on a tile, because they
 * are a list rather than a figure — so the one thing an owner asks first in
 * the morning, "what is coming and when", had no answer on this screen.
 *
 * The two sides partition the open orders exactly, which is what lets them sit
 * beside each other without saying anything twice:
 *
 *   expectedOn <  today   → late            → the queue, worst band
 *   expectedOn == today   → due             → the queue, half-finished
 *   expectedOn >  today   → still coming    → here
 *
 * A draft is never here whatever its date, because a draft is not with anybody
 * — it is on your desk, and the queue asks you to hand it over.
 *
 * Grouped by supplier, the way the orders themselves are: one document per
 * supplier is the rule this build already holds, so one heading per supplier
 * is how the result reads back.
 */
import type { Vendor } from '@/lib/domain/types'
import { boardLines, verdictText, type BoardLine } from './board'
import { awaitingArrival } from './receipts'
import { orderGroups, orderRows } from './sourcing'
import type { Workspace } from './types'

export interface Flight {
  no: string
  /** what is on it, said short — the supplier is the heading above */
  what: string
  lines: number
  total: number
  expectedOn: string
  /** days from today to the date they gave; always 1 or more */
  daysAway: number
  /**
   * How much of the promised wait has gone, 0–100.
   *
   * Of the lead time THEY promised — ordered on the 1st for the 11th is 50%
   * on the 6th — so it is a picture of their promise running down rather than
   * a guess at where the lorry is. An order promised for the day it was placed
   * has no span to divide, so it reads as full.
   */
  progress: number
  state: 'confirmed' | 'shipped'
  /**
   * Said only when it is NOT in time: the worst verdict among its lines from
   * the inbound board — lands before the line stops but cannot be issued
   * before it does, or lands after. An order on time says nothing extra.
   */
  verdict?: { text: string; tone: 'warn' | 'critical' }
}

export interface Berth {
  vendorId: string
  vendor: Vendor | undefined
  orders: Flight[]
}

const DAY = 86400000
const days = (from: string, to: string) =>
  Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY)

/** Orders with a supplier and not yet due, soonest first, under their supplier. */
export function inFlight(ws: Workspace, today: string): Berth[] {
  const flights: { vendorId: string; vendor: Vendor | undefined; flight: Flight }[] = []
  const board = boardLines(ws, today)

  for (const g of orderGroups(orderRows(ws))) {
    if (g.state !== 'confirmed' && g.state !== 'shipped') continue
    if (g.expectedOn <= today) continue
    // arrived early and waiting at the gate is no longer on its way
    if (!awaitingArrival(ws, g.rows.map((r) => r.order))) continue

    const live = g.rows.filter((r) => r.order.state !== 'cancelled')
    if (live.length === 0) continue

    const first = live[0].item?.name ?? 'a material'
    const span = days(live[0].order.orderedOn, g.expectedOn)
    const gone = days(live[0].order.orderedOn, today)

    flights.push({
      vendorId: g.vendor?.id ?? '',
      vendor: g.vendor,
      flight: {
        no: g.no,
        what: live.length === 1 ? first : `${first} +${live.length - 1} more`,
        lines: live.length,
        total: g.total,
        expectedOn: g.expectedOn,
        daysAway: days(today, g.expectedOn),
        progress: span > 0 ? Math.min(Math.max((gone / span) * 100, 0), 100) : 100,
        state: g.state,
        verdict: worst(board.filter((l) => l.order.no === g.no)),
      },
    })
  }

  flights.sort((a, b) => a.flight.daysAway - b.flight.daysAway)

  const berths: Berth[] = []
  for (const f of flights) {
    const held = berths.find((x) => x.vendorId === f.vendorId)
    if (held) held.orders.push(f.flight)
    else berths.push({ vendorId: f.vendorId, vendor: f.vendor, orders: [f.flight] })
  }
  return berths
}

/** The worst of an order's lines, when any of them will not be in time. */
function worst(lines: BoardLine[]): Flight['verdict'] {
  const late = lines.filter((l) => l.verdict.value === 'late').sort((a, b) => b.lateBy - a.lateBy)[0]
  if (late) return { text: `lands ${verdictText(late)}`, tone: 'critical' }
  const tight = lines.find((l) => l.verdict.value === 'tight')
  if (tight) return { text: 'tight — not issuable in time', tone: 'warn' }
  return undefined
}

/** How many orders are out there, for the column's count. */
export const flightCount = (ws: Workspace, today: string): number =>
  inFlight(ws, today).reduce((a, b) => a + b.orders.length, 0)

/** "tomorrow", "in 6 days" — the one figure every card on that side carries. */
export const arrivesIn = (daysAway: number): string =>
  daysAway === 1 ? 'tomorrow' : `in ${daysAway} days`
