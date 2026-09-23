/**
 * How long raw material takes to become a finished product.
 *
 * Two halves, because they are two different problems with two different
 * fixes. The wait is from the day the material came onto the book — the
 * receipt closed at the gate, or the day it was counted in — to the day the
 * first of it was issued to the job: stock sitting on a shelf. The floor time
 * is from that first issue to the last output booked: the job itself. Raw
 * material to finished product is the two added.
 *
 * Every date is one the records already hold — slips, cuts, lots, output —
 * so nothing here is typed; a job with no issue or no output simply has no
 * figure yet, and says so.
 */
import { addDays, daysBetween } from '@/lib/domain/calc'
import { productOf } from './products'
import type { Job, Product, Workspace } from './types'

export interface Turnaround {
  job: Job
  product?: Product
  /** the earliest day any lot it drew from came onto the book */
  receivedOn?: string
  firstIssue?: string
  lastOutput?: string
  /** days on the shelf before the job took any of it */
  wait: number | null
  /** days from first issue to last output */
  floor: number | null
  /** raw material to finished product */
  total: number | null
}

export function turnaroundOf(ws: Workspace, job: Job): Turnaround {
  const slips = (ws.issues ?? []).filter((s) => s.jobId === job.id && s.kind === 'issue')
  const cuts = (ws.cuts ?? []).filter((c) => c.jobId === job.id)
  const issued = [...slips.map((s) => s.on), ...cuts.map((c) => c.on)].sort()
  const lotIds = new Set([...slips.flatMap((s) => s.lines.map((l) => l.lotId)), ...cuts.map((c) => c.lotId)])
  const received = ws.stockLots.filter((l) => lotIds.has(l.id) && l.on).map((l) => l.on!).sort()
  const outputs = (ws.outputs ?? []).filter((o) => o.jobId === job.id).map((o) => o.on).sort()
  const receivedOn = received[0]
  const firstIssue = issued[0]
  const lastOutput = outputs[outputs.length - 1]
  const span = (a?: string, b?: string) => (a && b ? Math.max(0, daysBetween(a, b)) : null)
  return {
    job, product: productOf(ws, job.productId), receivedOn, firstIssue, lastOutput,
    wait: span(receivedOn, firstIssue),
    floor: span(firstIssue, lastOutput),
    total: span(receivedOn, lastOutput),
  }
}

/** Every job that has had material issued or output booked, the most recent first. */
export function turnaroundRows(ws: Workspace): Turnaround[] {
  return (ws.jobs ?? []).map((j) => turnaroundOf(ws, j))
    .filter((t) => t.firstIssue || t.lastOutput)
    .sort((a, b) => (b.lastOutput ?? b.firstIssue ?? '').localeCompare(a.lastOutput ?? a.firstIssue ?? '')
      || b.job.no.localeCompare(a.job.no, undefined, { numeric: true }))
}

export interface TurnaroundSummary {
  /** jobs closed in the window with both ends known */
  jobs: number
  wait: number | null
  floor: number | null
  total: number | null
  slowest?: Turnaround
}

/**
 * The means over jobs closed in the last `days` — a closed job is one whose
 * figures will not change. Each mean is over the jobs that have that figure.
 */
export function meanTurnaround(ws: Workspace, today: string, days = 90): TurnaroundSummary {
  const since = addDays(today, -days)
  const closed = (ws.jobs ?? []).filter((j) => j.closedOn && j.closedOn >= since && j.closedOn <= today)
    .map((j) => turnaroundOf(ws, j))
    .filter((t) => t.floor !== null)
  const mean = (xs: (number | null)[]) => {
    const v = xs.filter((x): x is number => x !== null)
    return v.length ? Math.round((v.reduce((a, x) => a + x, 0) / v.length) * 10) / 10 : null
  }
  const slowest = [...closed].sort((a, b) => (b.total ?? b.floor ?? 0) - (a.total ?? a.floor ?? 0))[0]
  return {
    jobs: closed.length,
    wait: mean(closed.map((t) => t.wait)),
    floor: mean(closed.map((t) => t.floor)),
    total: mean(closed.map((t) => t.total)),
    slowest,
  }
}
