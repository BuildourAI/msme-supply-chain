/**
 * A job's plan: what it makes, how many, when, and at what pace.
 *
 * The plan sits on the job the store already knows — the style material is
 * issued against — so Production and Inventory are talking about one thing.
 * A job with no plan is still a job; the floor asks for one.
 *
 * The pace is pieces a working day. A target to date is that pace times the
 * working days already finished since the start — up to yesterday, because
 * today's pieces are booked at the end of today — never more than the
 * quantity. So a job is measured against what should have come off it by
 * now, and nothing is due on its first morning.
 */
import { addDays, daysBetween, parseDate } from '@/lib/domain/calc'
import { needsFor, productOf } from './products'
import type { FloorRules, Job, Output, Product, Workspace } from './types'

/** Monday to Saturday, a tenth behind counts, and the reasons a garment floor rejects a piece. */
export const DEFAULT_FLOOR: FloorRules = {
  workingDays: [1, 2, 3, 4, 5, 6],
  behindPct: 10,
  rejectReasons: ['Stitching', 'Measurement', 'Stain or mark', 'Damaged', 'Other'],
}

export const floorOf = (ws: Workspace): FloorRules => ws.floor ?? DEFAULT_FLOOR

export const isWorkingDay = (iso: string, floor: FloorRules): boolean =>
  floor.workingDays.includes(parseDate(iso).getUTCDay())

/** Working days from `from` to `to`, both counted. Nought when `to` is before `from`. */
export function workingDaysBetween(from: string, to: string, floor: FloorRules): number {
  const span = daysBetween(from, to)
  if (span < 0) return 0
  let n = 0
  for (let i = 0; i <= span; i++) if (isWorkingDay(addDays(from, i), floor)) n++
  return n
}

/** The working days of the week `today` falls in, Monday first. */
export function weekOf(today: string, floor: FloorRules): string[] {
  const dow = parseDate(today).getUTCDay()
  const monday = addDays(today, -((dow + 6) % 7))
  return Array.from({ length: 7 }, (_, i) => addDays(monday, i)).filter((d) => isWorkingDay(d, floor))
}

/** Pieces a working day that finish `qty` between two dates. */
export function defaultPerDay(qty: number, start: string, finish: string, floor: FloorRules): number {
  if (!(qty > 0)) return 0
  return Math.ceil(qty / Math.max(1, workingDaysBetween(start, finish, floor)))
}

export const isPlanned = (j: Job): boolean =>
  Boolean(j.productId && (j.qty ?? 0) > 0 && j.plannedStart && j.plannedFinish)

export const plannedJobs = (ws: Workspace): Job[] =>
  (ws.jobs ?? []).filter((j) => !j.closedOn && isPlanned(j))
    .sort((a, b) => (a.plannedStart ?? '').localeCompare(b.plannedStart ?? '')
      || a.no.localeCompare(b.no, undefined, { numeric: true }))

export const unplannedJobs = (ws: Workspace): Job[] =>
  (ws.jobs ?? []).filter((j) => !j.closedOn && !isPlanned(j))

export interface PlanInput {
  productId: string
  qty: number
  plannedStart: string
  plannedFinish: string
  perDay?: number
  /** what it needs; absent is worked out from the product */
  needs?: { itemId: string; qty: number }[]
}

export function planProblem(ws: Workspace, jobId: string, p: PlanInput): string | null {
  const job = (ws.jobs ?? []).find((j) => j.id === jobId)
  if (!job) return 'That job is not on the list.'
  if (job.closedOn) return `${job.no} is closed.`
  if (!productOf(ws, p.productId)) return 'Pick what it makes.'
  if (!Number.isInteger(p.qty) || p.qty <= 0) return 'Put in how many to make, a whole number.'
  if (!p.plannedStart || !p.plannedFinish) return 'Put in when it starts and when it should finish.'
  if (p.plannedFinish < p.plannedStart) return 'It cannot finish before it starts.'
  if (p.perDay !== undefined && (!Number.isFinite(p.perDay) || p.perDay <= 0)) return 'Pieces a day is a number above nought.'
  if (p.needs?.some((n) => !ws.items.some((i) => i.id === n.itemId) || !Number.isFinite(n.qty) || n.qty < 0)) {
    return 'A material it needs is not one of yours, or its quantity is not a number.'
  }
  return null
}

/** The plan written onto the job. Its needs come off the product unless they were adjusted. */
export function planJob(ws: Workspace, jobId: string, p: PlanInput): Workspace {
  if (planProblem(ws, jobId, p)) return ws
  const floor = floorOf(ws)
  return {
    ...ws,
    jobs: (ws.jobs ?? []).map((j) => (j.id !== jobId ? j : {
      ...j,
      productId: p.productId,
      qty: p.qty,
      plannedStart: p.plannedStart,
      plannedFinish: p.plannedFinish,
      perDay: p.perDay ?? defaultPerDay(p.qty, p.plannedStart, p.plannedFinish, floor),
      needs: (p.needs ?? needsFor(ws, p.productId, p.qty)).filter((n) => n.qty > 0),
      // a job the owner named nothing yet takes the product's name
      name: j.name ?? productOf(ws, p.productId)?.name,
    })),
  }
}

/** What should have come off the job by this morning: the pace times working days finished, never past the quantity. */
export function targetToDate(job: Job, today: string, floor: FloorRules): number {
  if (!isPlanned(job) || today <= job.plannedStart!) return 0
  const yesterday = addDays(today, -1)
  const to = yesterday < job.plannedFinish! ? yesterday : job.plannedFinish!
  const days = workingDaysBetween(job.plannedStart!, to, floor)
  return Math.min(job.qty!, Math.round((job.perDay ?? 0) * days))
}

export const outputsOf = (ws: Workspace, jobId: string): Output[] =>
  (ws.outputs ?? []).filter((o) => o.jobId === jobId)

/** Good pieces off a job so far. */
export const madeOn = (ws: Workspace, jobId: string): number =>
  outputsOf(ws, jobId).reduce((a, o) => a + o.good, 0)

export const rejectedOn = (ws: Workspace, jobId: string): number =>
  outputsOf(ws, jobId).reduce((a, o) => a + o.rejected, 0)

export type PlanState = 'unplanned' | 'not_started' | 'running' | 'behind' | 'late' | 'made' | 'closed'

export const PLAN_STATE_WORD: Record<PlanState, string> = {
  unplanned: 'No plan',
  not_started: 'Not started',
  running: 'Running',
  behind: 'Behind',
  late: 'Past its finish',
  made: 'Made',
  closed: 'Closed',
}

export interface JobPlanRow {
  job: Job
  product?: Product
  planned: boolean
  made: number
  rejected: number
  target: number
  /** good pieces against the target to date: positive is ahead */
  vsTarget: number
  /** good ÷ (good + rejected), when anything has come off */
  firstPass: number | null
  /** good ÷ planned quantity */
  attainment: number | null
  state: PlanState
}

export function jobPlanRow(ws: Workspace, job: Job, today: string): JobPlanRow {
  const floor = floorOf(ws)
  const made = madeOn(ws, job.id)
  const rejected = rejectedOn(ws, job.id)
  const target = targetToDate(job, today, floor)
  const planned = isPlanned(job)
  const pct = (a: number, b: number) => (b > 0 ? Math.round((a / b) * 1000) / 10 : null)
  const behindBy = target - made
  const state: PlanState = job.closedOn ? 'closed'
    : !planned ? 'unplanned'
      : made >= job.qty! ? 'made'
        : today > job.plannedFinish! ? 'late'
          : today < job.plannedStart! ? 'not_started'
            : target > 0 && behindBy > (floor.behindPct / 100) * target ? 'behind'
              : 'running'
  return {
    job,
    product: productOf(ws, job.productId),
    planned,
    made,
    rejected,
    target,
    vsTarget: made - target,
    firstPass: pct(made, made + rejected),
    attainment: planned ? pct(made, job.qty!) : null,
    state,
  }
}

/** Every job, open ones first — the ones that need a person nearest the top. */
export function jobPlanRows(ws: Workspace, today: string): JobPlanRow[] {
  const order: Record<PlanState, number> = { late: 0, behind: 1, unplanned: 2, running: 3, not_started: 4, made: 5, closed: 6 }
  return (ws.jobs ?? []).map((j) => jobPlanRow(ws, j, today))
    .sort((a, b) => order[a.state] - order[b.state]
      || (a.job.plannedStart ?? '9999').localeCompare(b.job.plannedStart ?? '9999')
      || a.job.no.localeCompare(b.job.no, undefined, { numeric: true }))
}
