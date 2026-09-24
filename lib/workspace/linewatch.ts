/**
 * Line watch, on the owner's own floor.
 *
 * The sample's Line Watch asks whether each material lasts as long as the
 * jobs that need it. The owner's floor can be asked a sharper question,
 * because a job here has a product, a quantity and dates: does the store hold
 * what it still needs, once the jobs that start before it have taken theirs?
 *
 * Jobs take from the store in the order they start. What a job still needs is
 * its need less what has already gone to it (issued less returned, from the
 * store's own slips and cuts). What the store cannot cover may still be on its
 * way — an order due in, material due back from a jobworker — and those are
 * claimed in date order too, so two jobs never count the same delivery. A
 * return from a jobworker that went out for one job is that job's: it claims
 * it first, and no other job counts on it.
 *
 *   halted      somebody recorded that the floor stopped on it, and it has not resumed
 *   will_halt   something it still needs is not in the store and nothing due in covers it
 *   at_risk     it is covered only by something not yet here, a jobworker holding
 *               what it needs is past due, or it is behind its daily target
 *   will_run    everything it still needs is on the shelf
 *   made        its quantity has come off; it needs nothing more
 *
 * The domain's words are used for the three it shares (`STATUS_LABEL`), and
 * the "line runs for" figure is the domain's own production cover.
 */
import { productionCoverDays } from '@/lib/domain/calc'
import { STATUS_LABEL, num, shortDate } from '@/lib/domain/format'
import type { Derived, Item } from '@/lib/domain/types'
import { challanRow } from './inbound'
import { stillExpected } from './due'
import { onJob } from './jobs'
import { usableOnHand } from './ledger'
import { ackedDate, ackedQty } from './orders'
import { floorOf, jobPlanRow, plannedJobs, weekOf } from './plan'
import { productOf } from './products'
import { receivedAgainst } from './receipts'
import type { Halt, Job, Product, Workspace } from './types'

const r3 = (n: number) => Math.round(n * 1000) / 1000

export type WatchStatus = 'halted' | 'will_halt' | 'at_risk' | 'will_run' | 'made'

export const WATCH_WORD: Record<WatchStatus, string> = {
  halted: 'Halted',
  will_halt: STATUS_LABEL.will_halt,
  at_risk: STATUS_LABEL.at_risk,
  will_run: STATUS_LABEL.will_run,
  made: 'Made',
}

export const WATCH_TONE: Record<WatchStatus, 'critical' | 'warn' | 'good' | 'neutral'> = {
  halted: 'critical', will_halt: 'critical', at_risk: 'warn', will_run: 'good', made: 'neutral',
}

/** Something on its way that a job could be waiting for. */
export interface Incoming {
  itemId: string
  on: string
  qty: number
  /** "PO-4 from Arvind Mills", "back from Shree Wash on JW-2" */
  what: string
  /** a jobworker return already past its date */
  late: boolean
  /** a jobworker return sent out for one job: that job's, and no other's */
  jobId?: string
}

/** What is on its way, per material, earliest first. */
export function incomingOf(ws: Workspace, today: string): Incoming[] {
  const vendorName = (id: string) => ws.vendors.find((v) => v.id === id)?.name ?? 'the supplier'
  const fromOrders: Incoming[] = ws.orders
    .filter((o) => o.state === 'confirmed' || o.state === 'shipped')
    .map((o) => ({ o, left: r3(Math.max(0, ackedQty(o) - receivedAgainst(ws, o.id))) }))
    .filter(({ left }) => left > 0)
    .map(({ o, left }) => ({
      itemId: o.itemId, on: ackedDate(o), qty: left, what: `${o.no} from ${vendorName(o.vendorId)}`, late: false,
    }))
  const fromJobworkers: Incoming[] = (ws.challans ?? [])
    .filter((c) => c.status === 'out')
    .map((c) => {
      const left = stillExpected(challanRow(ws, c, today))
      return {
        itemId: c.itemId, on: c.dueBack, qty: left,
        what: `back from ${vendorName(c.vendorId)} on ${c.no}`, late: c.dueBack < today,
        jobId: c.jobId,
      }
    })
    .filter((x) => x.qty > 0)
  return [...fromOrders, ...fromJobworkers].sort((a, b) => a.on.localeCompare(b.on) || a.what.localeCompare(b.what))
}

export interface NeedRow {
  itemId: string
  item?: Item
  uom: string
  /** the job's whole need of it */
  need: number
  /** already gone to the job: issued less returned */
  gone: number
  /** what it still needs from the store */
  still: number
  /** taken from what is on the shelf, after earlier jobs took theirs */
  fromShelf: number
  /** covered by something on its way, and what */
  claims: { what: string; on: string; qty: number; late: boolean }[]
  /** covered by nothing */
  short: number
}

export interface JobWatch {
  job: Job
  product?: Product
  status: WatchStatus
  /** the reasons in words, most serious first */
  reasons: string[]
  /** of those, the ones about material: short, not in yet, or with a late jobworker */
  stockReasons: string[]
  /** and the ones about pace: behind the daily target, or past the finish */
  paceReasons: string[]
  needs: NeedRow[]
  halt?: Halt
  /** pieces behind the target to date (0 when on or ahead) */
  behind: number
  made: number
  /** runs at some point in the week `today` falls in */
  inWeek: boolean
}

const RANK: Record<WatchStatus, number> = { halted: 0, will_halt: 1, at_risk: 2, will_run: 3, made: 4 }

/** The open halt on a job, if the floor is stopped on it now. */
export const openHaltOf = (ws: Workspace, jobId: string): Halt | undefined =>
  (ws.halts ?? []).find((h) => h.jobId === jobId && !h.resumedOn)

/**
 * Every planned, open job, in the order it starts, with what it will do. Jobs
 * with no plan are not here — they are a card of their own, because a job
 * nobody has said the size of cannot be judged.
 */
export function lineWatch(ws: Workspace, today: string): JobWatch[] {
  if (!today) return []
  const floor = floorOf(ws)
  const week = weekOf(today, floor)
  const weekFrom = week[0] ?? today
  const weekTo = week[week.length - 1] ?? today
  const shelf = new Map<string, number>()
  const shelfOf = (itemId: string) => {
    if (!shelf.has(itemId)) shelf.set(itemId, Math.max(0, usableOnHand(ws, itemId)))
    return shelf.get(itemId)!
  }
  const incoming = incomingOf(ws, today).map((x) => ({ ...x, left: x.qty }))

  return plannedJobs(ws).map((job): JobWatch => {
    const product = productOf(ws, job.productId)
    const plan = jobPlanRow(ws, job, today)
    const inWeek = job.plannedStart! <= weekTo && job.plannedFinish! >= weekFrom
    const halt = openHaltOf(ws, job.id)
    const base = { job, product, halt, made: plan.made, inWeek, behind: Math.max(0, -plan.vsTarget) }
    if (plan.state === 'made') return { ...base, status: 'made', reasons: [], stockReasons: [], paceReasons: [], needs: [] }

    // what arrives by the day the job needs it counts as on time; by its finish, as late but coming
    const needBy = job.plannedStart! > today ? job.plannedStart! : today
    const needs: NeedRow[] = (job.needs ?? []).map((n) => {
      const item = ws.items.find((i) => i.id === n.itemId)
      const f = onJob(ws, job.id, n.itemId)
      const gone = r3(Math.max(0, f.issued - f.returned))
      const still = r3(Math.max(0, n.qty - gone))
      const fromShelf = r3(Math.min(shelfOf(n.itemId), still))
      shelf.set(n.itemId, r3(shelfOf(n.itemId) - fromShelf))
      let rest = r3(still - fromShelf)
      const claims: NeedRow['claims'] = []
      const claim = (x: typeof incoming[number]) => {
        const take = r3(Math.min(x.left, rest))
        x.left = r3(x.left - take)
        rest = r3(rest - take)
        claims.push({ what: x.what, on: x.on, qty: take, late: x.late || x.on > needBy })
      }
      /*
       * What went out to a jobworker for this job comes back to it first,
       * whatever its date; a return sent for another job is that job's and
       * never counted here. Then everything else, in date order.
       */
      for (const x of incoming) {
        if (rest <= 0) break
        if (x.jobId !== job.id || x.itemId !== n.itemId || x.left <= 0 || x.on > job.plannedFinish!) continue
        claim(x)
      }
      for (const x of incoming) {
        if (rest <= 0) break
        if (x.jobId || x.itemId !== n.itemId || x.left <= 0 || x.on > job.plannedFinish!) continue
        claim(x)
      }
      return { itemId: n.itemId, item, uom: item?.uom ?? '', need: n.qty, gone, still, fromShelf, claims, short: rest }
    })

    const haltReasons: string[] = []
    const reasons: string[] = []
    const paceReasons: string[] = []
    let status: WatchStatus = 'will_run'
    const worse = (s: WatchStatus) => { if (RANK[s] < RANK[status]) status = s }

    if (halt) {
      worse('halted')
      haltReasons.push(`Stopped since ${shortDate(halt.on)} — ${HALT_WORD[halt.cause].toLowerCase()}${halt.note ? `: ${halt.note}` : ''}`)
    }
    for (const n of needs) {
      const name = n.item?.name ?? 'A material'
      if (n.short > 0) {
        worse('will_halt')
        reasons.push(`${name} short by ${num(n.short, 3)} ${n.uom}; nothing due in before ${shortDate(job.plannedFinish!)}`)
      }
      for (const c of n.claims) {
        worse('at_risk')
        reasons.push(c.on > needBy
          ? `${num(c.qty, 3)} ${n.uom} of ${name} arrives ${shortDate(c.on)}, after it is needed — ${c.what}`
          : c.late
            ? `${num(c.qty, 3)} ${n.uom} of ${name} is ${c.what}, and past its date`
            : `${num(c.qty, 3)} ${n.uom} of ${name} is not in yet — ${c.what}, due ${shortDate(c.on)}`)
      }
    }
    // a jobworker late with something this job still needs, even if the shelf covers it today
    for (const x of incoming) {
      if (!x.late) continue // only a jobworker's return is ever late here
      if (x.jobId && x.jobId !== job.id) continue // another job's, not this one's to wait on
      const n = needs.find((m) => m.itemId === x.itemId && m.still > 0)
      if (!n || n.claims.some((c) => c.what === x.what)) continue
      worse('at_risk')
      reasons.push(`${n.item?.name ?? 'A material'} it needs is ${x.what}, past its date`)
    }
    if (plan.state === 'behind') {
      worse('at_risk')
      paceReasons.push(plan.made === 0
        ? `Nothing booked yet — ${plan.target} should have come off by now`
        : `${num(-plan.vsTarget, 0)} behind the target to date (${plan.made} of ${plan.target})`)
    }
    if (plan.state === 'late') {
      worse('at_risk')
      paceReasons.push(`Past its finish on ${shortDate(job.plannedFinish!)} — ${plan.made} of ${job.qty} made`)
    }
    return {
      ...base, status, needs,
      reasons: [...haltReasons, ...reasons, ...paceReasons],
      stockReasons: reasons,
      paceReasons,
    }
  })
}

export const HALT_WORD: Record<Halt['cause'], string> = {
  material: 'No material',
  machine: 'Machine down',
  manpower: 'No operators',
  power: 'No power',
  quality: 'Quality hold',
  jobworker: 'Waiting on a jobworker',
  other: 'Other',
}

/** The week's jobs that will not run as planned: halted, will halt, or at risk. */
export const stoppingThisWeek = (watch: JobWatch[]): JobWatch[] =>
  watch.filter((w) => w.inWeek && (w.status === 'halted' || w.status === 'will_halt' || w.status === 'at_risk'))

/**
 * How long the line can run on the tightest material, at the rate the owner
 * gave for it — the domain's production cover, over every material with a
 * daily use. Null when no material has one.
 */
export function lineRunsFor(ws: Workspace): { days: Derived; item: Item } | null {
  let best: { days: Derived; item: Item } | null = null
  for (const item of ws.items) {
    const perDay = item.floorConsumptionPerDay || item.avgDailyConsumption
    if (!(perDay > 0)) continue
    const days = productionCoverDays(Math.max(0, usableOnHand(ws, item.id)), perDay, item.uom)
    if (!best || days.value < best.days.value) best = { days, item }
  }
  return best
}
