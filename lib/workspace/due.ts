/**
 * What the gate should expect.
 *
 * Two kinds of lorry stop at the gate: an order a supplier is sending, and
 * material coming back from a jobworker. Changing an order is sourcing's and
 * chasing a jobworker is the store's; the gate only needs to know what is
 * coming, and when, so it can say what came off the lorry when it does.
 *
 * Orders are the inbound board's lines — at the quantity and date the
 * supplier confirmed. A return is what should still come back on a challan:
 * what they were sent, at the yield agreed, less what is back or at the gate.
 *
 * Pure.
 */
import { challanRows, type ChallanRow } from './inbound'
import { boardLines } from './board'
import type { Workspace } from './types'

const r3 = (n: number) => Math.round(n * 1000) / 1000

/** What should still come back on a challan: expected at the agreed yield, less what is back or at the gate. */
export const stillExpected = (row: ChallanRow): number =>
  r3(Math.max(0, row.expected.value - row.acct.returned.value - row.acct.inQc.value))

export interface DueBack {
  row: ChallanRow
  /** what should still come back */
  left: number
  /** the day they promised it back has passed */
  overdue: boolean
}

/** Challans out with something still to come back, soonest due first. */
export function dueBackRows(ws: Workspace, today: string): DueBack[] {
  return challanRows(ws, today)
    .filter((r) => r.challan.status === 'out')
    .map((row) => ({ row, left: stillExpected(row), overdue: !!today && row.challan.dueBack < today }))
    .filter((d) => d.left > 0)
    .sort((a, b) => a.row.challan.dueBack.localeCompare(b.row.challan.dueBack)
      || a.row.challan.no.localeCompare(b.row.challan.no, undefined, { numeric: true }))
}

/**
 * The gate's badge: lines due today or earlier and not here yet.
 *
 * Counts lines, the rows the Due in screen shows — unlike the dashboard's
 * "goods arrived" card, which counts documents, one per order. With no date
 * there is nothing to count.
 */
export function dueInCount(ws: Workspace, today: string): number {
  if (!today) return 0
  const orders = boardLines(ws, today).filter((l) => l.promised <= today).length
  const back = dueBackRows(ws, today).filter((d) => d.row.challan.dueBack <= today).length
  return orders + back
}
