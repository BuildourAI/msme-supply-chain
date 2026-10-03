/**
 * Where a record has got to, as a row of steps — the picture an owner reads
 * before the table.
 *
 * A step is something that happened to the goods, on a day: an order taken,
 * made, dispatched, delivered. The paper is not a step — a delivery challan
 * or a job card is a chip under the step it records. The record's own number
 * is never a chip: the strip is always drawn under that number. Moving between two
 * steps can say something too: "on the road" is the line between Dispatched
 * and Delivered, with how long it has been there.
 *
 * Four journeys, one shape:
 *   - a sales order: taken → job card → made → dispatched → delivered
 *   - a purchase order: handed over → they confirmed → at the gate → checked → on the shelf
 *   - a job card: opened → material issued → made → closed
 *   - material out for jobwork: sent out → with the jobworker → back at the gate → back on the shelf → settled
 *
 * A step part-way carries how much (a ring on the screen). A step the record
 * never needed — a job card for an order sent from stock, the supplier's
 * reply to an order they simply delivered — is skipped, not left undone. The
 * first step neither done nor skipped is where it is now, and anything late
 * says so on that step: lateness belongs to what is holding it up.
 *
 * Everything here is read off the records; nothing is stored.
 */
import { daysBetween } from '@/lib/domain/calc'
import { num, shortDate } from '@/lib/domain/format'
import { consignmentOf } from './consignments'
import { challanRow } from './inbound'
import { linesMadeOn } from './sales'
import { madeOn, outputsOf, rejectedOn } from './plan'
import { fgOnHand, productOf } from './products'
import { isOpen } from './receipts'
import type { OrderGroup } from './sourcing'
import type { Challan, CustomerOrder, DispatchNote, Job, PurchaseOrder, Workspace, WsConsignment } from './types'

/* ---------------------------------------------------------------- shape -- */

export type StepState = 'done' | 'part' | 'now' | 'next' | 'skip'
export type StepIcon = 'doc' | 'factory' | 'boxes' | 'truck' | 'hand' | 'check' | 'tray' | 'scale' | 'share'
export type DocKind = 'job' | 'note' | 'receipt' | 'slip'

/** A paper under a step: its number, and what it is so the screen can open it. */
export interface JourneyDoc { kind: DocKind; id: string; label: string }

export interface JourneyStep {
  key: string
  label: string
  icon: StepIcon
  state: StepState
  /** where the record is now — the first step neither done nor skipped */
  current?: boolean
  /** how much of it, while part-way */
  pct?: number
  /** the day it happened, or the last day something happened on it */
  on?: string
  sub?: string
  /** the sub is a warning — arrived after the promise */
  warn?: boolean
  docs?: JourneyDoc[]
  /** "3 days past the promise", only ever on the current step */
  late?: string
}

/** Words on the line between two steps — "9 days on the road · 7d late". */
export interface JourneyLine { text: string; late?: boolean }

export interface Journey<A = never> {
  steps: JourneyStep[]
  /** between step i and step i + 1; one fewer than the steps */
  between: (JourneyLine | null)[]
  /** days past its promise, while it is still short; 0 otherwise */
  late: number
  /** the words for it, as said on the current step */
  lateText?: string
  /** the same, short enough for a phone row — "3 days late", "9 days at the gate" */
  lateShort?: string
  /** nothing left to happen */
  done: boolean
  cancelled?: boolean
  /** where it is, as one key for the filter — the step holding it, or done */
  where: string
  /** the where, in a few words — "Made 87%", "Not here yet" */
  word: string
  /** the one thing to do next, when the screen can do it */
  act?: A
}

const pctOf = (part: number, whole: number): number =>
  whole <= 0 ? 0 : Math.max(0, Math.min(100, Math.round((part / whole) * 100)))
const stateOf = (part: number, whole: number): StepState =>
  whole > 0 && part >= whole ? 'done' : part > 0 ? 'part' : 'next'
const plural = (n: number, one: string, many = `${one}s`) => `${num(n, 0)} ${n === 1 ? one : many}`
const latest = (days: (string | undefined)[]): string | undefined =>
  days.filter((d): d is string => Boolean(d)).sort().pop()
const earliest = (days: (string | undefined)[]): string | undefined =>
  days.filter((d): d is string => Boolean(d)).sort()[0]
const qtyText = (n: number) => num(n, Number.isInteger(n) ? 0 : 3)

/**
 * The first step neither done nor skipped is where it is; a step not started
 * there becomes "now". Everything after it stays as it is — a later step can
 * be part-way (dispatched 200 while still making the rest) without being
 * where the order is held up.
 */
function settle(steps: JourneyStep[]): JourneyStep | undefined {
  const at = steps.find((s) => s.state !== 'done' && s.state !== 'skip')
  if (!at) return undefined
  at.current = true
  if (at.state === 'next') at.state = 'now'
  return at
}

/** Lateness goes on the step holding it up. */
function lateOn<J extends Journey<unknown>>(j: J, days: number, text: string, short?: string): J {
  if (days <= 0) return j
  const at = j.steps.find((s) => s.current)
  if (at) at.late = text
  return { ...j, late: days, lateText: text, lateShort: short ?? `${plural(days, 'day')} late` }
}

/** "Made 87%" while a step is part-way, else the step's own word for waiting on it. */
const wordAt = (at: JourneyStep, waiting: string) => (at.state === 'part' ? `${at.label} ${at.pct}%` : waiting)

/** A filter's choice, and whether a journey is one it picked. "late" cuts across every place. */
export interface WhereOption { value: string; label: string }
export const matchesPick = (j: Journey<unknown>, pick: string, alias: Record<string, string[]> = {}): boolean =>
  !pick || (pick === 'late' ? j.late > 0 : (alias[pick] ?? [pick]).includes(j.where))

/* ---------------------------------------------------------- sales order -- */

export type OrderAct =
  | { kind: 'job'; label: string; lineId: string }
  | { kind: 'card'; label: string; jobId: string }
  | { kind: 'output'; label: string; jobId: string }
  | { kind: 'dispatch'; label: string }
  | { kind: 'book'; label: string; noteId: string }
  | { kind: 'deliver'; label: string; consignmentId: string }

/** Where a sales order is, in one word for the filter: the step holding it. */
export type OrderWhere = 'job' | 'made' | 'dispatched' | 'road' | 'delivered' | 'cancelled'

/** The filter's choices, in the order an order goes through them. "late" cuts across all. */
export const WHERE_OPTIONS: { value: 'late' | Exclude<OrderWhere, 'cancelled'>; label: string }[] = [
  { value: 'late', label: 'Past the promise' },
  { value: 'job', label: 'Needs a job card' },
  { value: 'made', label: 'Being made' },
  { value: 'dispatched', label: 'Ready to dispatch' },
  { value: 'road', label: 'On the road' },
  { value: 'delivered', label: 'Delivered' },
]

/** One delivery challan against the order, and what became of it. */
export interface OrderPaper {
  note: DispatchNote
  qty: number
  consignment?: WsConsignment
  carrier?: string
  state: 'delivered' | 'road' | 'unbooked'
  /** days between leaving and arriving, or leaving and today */
  days: number
  /** on the road past the day the carrier promised, or raised before today with no carrier */
  late: boolean
}

/** A line of the order: what is made of it, gone and still to go. */
export interface OrderLineFigures {
  lineId: string
  productId: string
  product?: string
  job?: Job
  qty: number
  rate: number
  /** good pieces off its job card, or what went from stock; null when nothing says */
  made: number | null
  sent: number
  still: number
}

export interface OrderJourney extends Journey<OrderAct> {
  where: OrderWhere
  /** the where, in a few words — "Made 87%", "Needs a job card", "On the road" */
  word: string
  qty: number
  value: number
  lines: OrderLineFigures[]
  papers: OrderPaper[]
}

export function orderPapers(ws: Workspace, order: CustomerOrder, today: string): OrderPaper[] {
  return (ws.dispatchNotes ?? []).filter((n) => n.orderId === order.id)
    .sort((a, b) => a.on.localeCompare(b.on) || a.no.localeCompare(b.no, undefined, { numeric: true }))
    .map((note) => {
      const c = consignmentOf(ws, note.id)
      const qty = note.lines.reduce((a, l) => a + l.qty, 0)
      const carrier = c ? (ws.carriers ?? []).find((x) => x.id === c.carrierId)?.name : undefined
      if (!c) return { note, qty, state: 'unbooked' as const, days: Math.max(0, daysBetween(note.on, today)), late: note.on < today }
      if (c.deliveredOn) {
        return { note, qty, consignment: c, carrier, state: 'delivered' as const, days: Math.max(0, daysBetween(note.on, c.deliveredOn)), late: c.deliveredOn > c.promisedDate }
      }
      return { note, qty, consignment: c, carrier, state: 'road' as const, days: Math.max(0, daysBetween(note.on, today)), late: today > c.promisedDate }
    })
}

/**
 * Each line's figures. What has gone of a product is shared out over the
 * lines that ask for it, in order — two lines of the same jeans are one
 * pile on the shelf.
 */
function lineFigures(ws: Workspace, order: CustomerOrder, papers: OrderPaper[]): OrderLineFigures[] {
  const gone = new Map<string, number>()
  for (const p of papers) for (const l of p.note.lines) gone.set(l.productId, (gone.get(l.productId) ?? 0) + l.qty)
  return order.lines.map((l) => {
    const left = gone.get(l.productId) ?? 0
    const sent = Math.min(l.qty, left)
    gone.set(l.productId, left - sent)
    const job = l.jobId ? (ws.jobs ?? []).find((j) => j.id === l.jobId) : undefined
    const made = job ? Math.max(Math.min(l.qty, madeOn(ws, job.id)), sent) : sent > 0 ? sent : null
    return {
      lineId: l.id, productId: l.productId, product: productOf(ws, l.productId)?.name, job,
      qty: l.qty, rate: l.rate, made, sent, still: Math.max(0, l.qty - sent),
    }
  })
}

export function orderJourney(ws: Workspace, order: CustomerOrder, today: string): OrderJourney {
  const papers = orderPapers(ws, order, today)
  const lines = lineFigures(ws, order, papers)
  const qty = lines.reduce((a, l) => a + l.qty, 0)
  const value = Math.round(order.lines.reduce((a, l) => a + l.qty * l.rate, 0) * 100) / 100
  const sent = lines.reduce((a, l) => a + l.sent, 0)
  const delivered = papers.filter((p) => p.state === 'delivered').reduce((a, p) => a + p.qty, 0)
  const jobs = [...new Map(lines.filter((l) => l.job).map((l) => [l.job!.id, l.job!])).values()]

  /*
   * A line with no job card wants one — unless it has all gone, or the shelf
   * already holds what it still needs, in which case it goes from stock and
   * the job card and making are steps it never needed.
   */
  const wantsJob = lines.filter((l) => !l.job && l.still > 0 && fgOnHand(ws, l.productId) < l.still)
  const fromStock = lines.filter((l) => !l.job && !wantsJob.includes(l))
  const allStock = jobs.length === 0 && wantsJob.length === 0

  const what = lines.length === 1
    ? `${num(qty, 0)} ${lines[0].product ?? 'pieces'}`
    : `${plural(lines.length, 'line')} · ${num(qty, 0)} in all`

  // the order's own number heads its row wherever the strip is drawn, so it is not a chip
  const taken: JourneyStep = { key: 'taken', label: 'Taken', icon: 'doc', state: 'done', on: order.takenOn, sub: what }

  const plannedText = (j: Job) => (j.plannedStart && j.plannedFinish
    ? `planned ${shortDate(j.plannedStart)} – ${shortDate(j.plannedFinish)}` : 'not planned yet')
  const jobDocs = jobs.map((j) => ({ kind: 'job' as const, id: j.id, label: j.no }))
  const jobStep: JourneyStep = allStock
    ? { key: 'job', label: 'Job card', icon: 'factory', state: 'skip', sub: 'from stock' }
    : wantsJob.length > 0
      ? {
        key: 'job', label: 'Job card', icon: 'factory', state: 'next',
        sub: jobs.length === 0 ? 'none opened yet' : `${plural(wantsJob.length, 'line')} still without one`,
        docs: jobDocs,
      }
      : {
        key: 'job', label: 'Job card', icon: 'factory', state: 'done', on: earliest(jobs.map((j) => j.openedOn)),
        sub: jobs.length === 1 ? plannedText(jobs[0]) : `${jobs.length} job cards${fromStock.length ? ' · rest from stock' : ''}`,
        docs: jobDocs,
      }

  const made = lines.reduce((a, l) => a + (l.made ?? 0), 0)
  const rejected = jobs.reduce((a, j) => a + rejectedOn(ws, j.id), 0)
  const madeStep: JourneyStep = allStock
    ? { key: 'made', label: 'Made', icon: 'boxes', state: 'skip', sub: 'already on the shelf' }
    : {
      key: 'made', label: 'Made', icon: 'boxes', state: stateOf(made, qty), pct: pctOf(made, qty),
      on: latest(jobs.flatMap((j) => outputsOf(ws, j.id).map((o) => o.on))),
      // nothing to count against until a job card is making it
      sub: jobs.length > 0 || made > 0 ? `${num(made, 0)} of ${num(qty, 0)}${rejected > 0 ? ` · ${num(rejected, 0)} rejected` : ''}` : undefined,
    }

  const dispatched: JourneyStep = {
    key: 'dispatched', label: 'Dispatched', icon: 'truck', state: stateOf(sent, qty), pct: pctOf(sent, qty),
    on: latest(papers.map((p) => p.note.on)),
    sub: sent > 0 ? `${num(sent, 0)} of ${num(qty, 0)}` : undefined,
    docs: papers.map((p) => ({ kind: 'note' as const, id: p.note.id, label: p.note.no })),
  }

  const road = papers.filter((p) => p.state === 'road')
  const roadQty = road.reduce((a, p) => a + p.qty, 0)
  const carriers = [...new Set(road.map((p) => p.carrier).filter(Boolean))]
  const deliveredStep: JourneyStep = {
    key: 'delivered', label: 'Delivered', icon: 'hand', state: stateOf(delivered, qty), pct: pctOf(delivered, qty),
    on: latest(papers.map((p) => p.consignment?.deliveredOn)),
    sub: roadQty > 0
      ? `${num(roadQty, 0)} with ${carriers.length === 1 ? carriers[0] : 'carriers'}`
      : delivered > 0 ? `${num(delivered, 0)} of ${num(qty, 0)}` : undefined,
  }

  const steps = [taken, jobStep, madeStep, dispatched, deliveredStep]
  const between: (JourneyLine | null)[] = [null, null, null, null]
  // on the road is the line between dispatched and delivered, never a step
  const unbooked = papers.filter((p) => p.state === 'unbooked')
  if (unbooked.length > 0) {
    between[3] = { text: unbooked.length === 1 ? 'no carrier booked' : `${unbooked.length} with no carrier booked`, late: unbooked.some((p) => p.late) }
  } else if (road.length > 0) {
    const worst = [...road].sort((a, b) => b.days - a.days)[0]
    const over = daysBetween(worst.consignment!.promisedDate, today)
    const gone = worst.days === 0 ? 'left today' : `${plural(worst.days, 'day')} on the road`
    between[3] = { text: `${gone}${over > 0 ? ` · ${over}d late` : ''}`, late: over > 0 }
  } else if (papers.length > 0 && papers.every((p) => p.state === 'delivered')) {
    const longest = Math.max(...papers.map((p) => p.days))
    between[3] = { text: longest === 0 ? 'delivered the same day' : `${plural(longest, 'day')} on the road` }
  }

  const cancelled = order.state === 'cancelled'
  const at = cancelled ? undefined : settle(steps)
  let j: OrderJourney = {
    steps, between, late: 0, done: !at && !cancelled, cancelled, qty, value, lines, papers,
    where: cancelled ? 'cancelled' : !at ? 'delivered' : at.key === 'delivered' ? 'road' : at.key as OrderWhere,
    word: '',
  }
  if (!cancelled && at) {
    j.act = orderAct(ws, at.key, lines, wantsJob, papers)
    const over = daysBetween(order.promisedDate, today)
    j = lateOn(j, delivered < qty ? over : 0, `${plural(over, 'day')} past the promise`)
  }
  j.word = cancelled ? 'Cancelled'
    : !at ? 'Delivered'
      : at.state === 'part' ? `${at.label} ${at.pct}%`
        : at.key === 'job' ? 'Needs a job card'
          : at.key === 'made' ? 'Being made'
            : at.key === 'dispatched' ? 'Ready to dispatch'
              : 'On the road'
  return j
}

function orderAct(
  ws: Workspace, at: string, lines: OrderLineFigures[], wantsJob: OrderLineFigures[], papers: OrderPaper[],
): OrderAct | undefined {
  if (at === 'job' && wantsJob[0]) return { kind: 'job', label: 'Open a job card', lineId: wantsJob[0].lineId }
  if (at === 'made') {
    const short = lines.find((l) => l.job && !l.job.closedOn && (l.made ?? 0) < l.qty)?.job
    if (!short) return undefined
    return short.productId && short.qty && short.plannedStart
      ? { kind: 'output', label: 'Book output', jobId: short.id }
      : { kind: 'card', label: `Plan ${short.no}`, jobId: short.id }
  }
  if (at === 'dispatched') return { kind: 'dispatch', label: 'Dispatch' }
  if (at === 'delivered') {
    const unbooked = papers.find((p) => p.state === 'unbooked')
    if (unbooked) return { kind: 'book', label: 'Book the carrier', noteId: unbooked.note.id }
    const road = papers.find((p) => p.state === 'road')
    if (road?.consignment) return { kind: 'deliver', label: 'Mark delivered', consignmentId: road.consignment.id }
  }
  return undefined
}

/** Whether an order is one the "Where it is" filter picked. */
export const matchesWhere = (j: OrderJourney, pick: string): boolean => matchesPick(j, pick)

/** The list, the way it is read: what is late first, then what is due this week, then later. */
export interface OrderBoard<T> {
  late: T[]
  soon: T[]
  later: T[]
  /** delivered or cancelled — folded away under one line */
  over: T[]
}

export function orderBoard<T extends { order: CustomerOrder }>(
  rows: T[], journeyOf: (r: T) => OrderJourney, today: string,
): OrderBoard<T> {
  const open = rows.filter((r) => { const j = journeyOf(r); return !j.done && !j.cancelled })
  const byPromise = (a: T, b: T) => a.order.promisedDate.localeCompare(b.order.promisedDate)
    || a.order.no.localeCompare(b.order.no, undefined, { numeric: true })
  const late = open.filter((r) => journeyOf(r).late > 0)
    .sort((a, b) => journeyOf(b).late - journeyOf(a).late || byPromise(a, b))
  const onTime = open.filter((r) => journeyOf(r).late === 0)
  const soon = onTime.filter((r) => daysBetween(today, r.order.promisedDate) <= 7).sort(byPromise)
  const later = onTime.filter((r) => daysBetween(today, r.order.promisedDate) > 7).sort(byPromise)
  const lastDay = (r: T) => journeyOf(r).steps[4].on ?? r.order.promisedDate
  const over = rows.filter((r) => !open.includes(r))
    .sort((a, b) => lastDay(b).localeCompare(lastDay(a)) || byPromise(b, a))
  return { late, soon, later, over }
}

/* ------------------------------------------------------- purchase order -- */

/**
 * A purchase order — every line on one number, since an order is one piece
 * of paper with one supplier. Received, checked and accepted are summed over
 * its lines against what was ordered.
 */
export type PurchaseAct =
  | { kind: 'paper'; label: string }
  | { kind: 'receive'; label: string; orderId: string }
  | { kind: 'inspect'; label: string; receiptId: string }

/** Where a purchase order is. A short delivery waiting on the rest is still "not here yet". */
export const PURCHASE_WHERE: WhereOption[] = [
  { value: 'late', label: 'Late' },
  { value: 'handed', label: 'Not handed over' },
  { value: 'gate', label: 'Not here yet' },
  { value: 'checked', label: 'At the gate' },
  { value: 'done', label: 'Received' },
]

export function purchaseJourney(ws: Workspace, group: OrderGroup, today: string): Journey<PurchaseAct> {
  const orders = group.rows.map((r) => r.order)
  const ids = new Set(orders.map((o) => o.id))
  const receipts = (ws.receipts ?? []).filter((r) => r.orderId && ids.has(r.orderId))
    .sort((a, b) => a.receivedOn.localeCompare(b.receivedOn))
  const ordered = orders.reduce((a, o) => a + o.qty, 0)
  const received = receipts.reduce((a, r) => a + r.qty, 0)
  const closed = receipts.filter((r) => !isOpen(r))
  const checked = closed.reduce((a, r) => a + r.qty, 0)
  const accepted = closed.reduce((a, r) => a + r.accepted, 0)
  const rejected = closed.reduce((a, r) => a + r.rejected, 0)
  const waiting = receipts.filter(isOpen)
  const uoms = [...new Set(orders.map((o) => ws.items.find((i) => i.id === o.itemId)?.uom).filter(Boolean))]
  const uom = uoms.length === 1 ? ` ${uoms[0]}` : ''

  const handedOn = earliest(orders.map((o) => o.notifiedOn))
  const handed = Boolean(handedOn) || group.state !== 'draft'
  /*
   * Confirmed the way the order's own sync block reads it: an order recorded
   * as already placed, with no versions behind it, was confirmed when it was
   * placed; one handed over through the document is confirmed once they have
   * said yes to its latest version.
   */
  const live = orders.filter((o) => o.state !== 'cancelled' && o.state !== 'draft')
  const byHand = (o: PurchaseOrder) => !o.revisions || o.revisions.length === 0
  const confirmedOn = (o: PurchaseOrder) => (byHand(o) ? o.orderedOn
    : o.ackedOn && (o.ackedVersion ?? 1) >= (o.notifiedVersion ?? 1) ? o.ackedOn : undefined)
  const allConfirmed = live.length > 0 && live.every((o) => confirmedOn(o))
  const ackedOn = allConfirmed ? latest(live.map(confirmedOn)) : undefined
  const ackWord = live.every(byHand) ? 'recorded as placed' : live.find((o) => o.ackRef)?.ackRef ?? 'confirmed'
  const olderAck = !allConfirmed && live.some((o) => o.ackedOn)
  // changed on our side since it was last handed over: the supplier is working to the old page
  const unsent = live.some((o) => !byHand(o) && (o.revisions?.length ?? 0) > (o.notifiedVersion ?? 1))
  const expectedOn = group.expectedOn
  const firstIn = receipts[0]?.receivedOn
  const arrivedLate = firstIn ? daysBetween(expectedOn, firstIn) : 0
  const delivered = group.state === 'delivered'

  const steps: JourneyStep[] = [
    {
      key: 'handed', label: 'Handed over', icon: 'doc', state: handed ? 'done' : 'next', on: handedOn,
      sub: !handed ? `drafted ${shortDate(orders[0].orderedOn)}` : unsent ? 'a change not sent yet' : `to ${group.vendor?.name ?? 'the supplier'}`,
      warn: handed && unsent,
    },
    {
      key: 'confirmed', label: 'They confirmed', icon: 'check',
      state: ackedOn ? 'done' : handed ? 'skip' : 'next', on: ackedOn,
      sub: ackedOn ? ackWord : !handed ? undefined
        : olderAck ? 'not the latest change' : received > 0 ? 'never — came anyway' : 'no reply yet',
    },
    {
      key: 'gate', label: 'At the gate', icon: 'tray',
      state: delivered ? 'done' : stateOf(received, ordered), pct: pctOf(received, ordered),
      on: latest(receipts.map((r) => r.receivedOn)),
      // once handed over, the line before it says when it was promised
      sub: received === 0 ? (handed ? undefined : `due ${shortDate(expectedOn)}`)
        : arrivedLate > 0 ? `${plural(arrivedLate, 'day')} after the promise`
          : arrivedLate < 0 ? `${plural(-arrivedLate, 'day')} early` : 'on the promised day',
      warn: received > 0 && arrivedLate > 0,
      docs: receipts.slice(0, 3).map((r) => ({ kind: 'receipt' as const, id: r.id, label: r.id })),
    },
    {
      key: 'checked', label: 'Checked', icon: 'scale',
      state: received > 0 && waiting.length === 0 && (delivered || received >= ordered) ? 'done' : stateOf(checked, ordered),
      pct: pctOf(checked, ordered),
      on: latest(closed.map((r) => r.closedAt ?? r.receivedOn)),
      sub: closed.length > 0 ? `${qtyText(accepted)} accepted${rejected > 0 ? ` · ${qtyText(rejected)} rejected` : ''}`
        : waiting.length > 0 ? 'waiting at the gate' : undefined,
    },
    {
      key: 'shelf', label: 'On the shelf', icon: 'boxes', state: 'next', pct: pctOf(accepted, ordered),
      sub: accepted > 0 ? `${qtyText(accepted)}${uom}` : undefined,
    },
  ]
  // on the shelf once everything that came has been checked and some of it taken in
  steps[4].state = steps[3].state === 'done' && accepted > 0 ? 'done' : accepted > 0 ? 'part' : 'next'

  const between: (JourneyLine | null)[] = [null, null, null, null]
  const cancelled = group.state === 'cancelled'
  const at = cancelled ? undefined : settle(steps)
  const where = cancelled ? 'cancelled' : !at ? 'done' : at.key === 'shelf' ? 'checked' : at.key
  let j: Journey<PurchaseAct> = {
    steps, between, late: 0, done: !at && !cancelled, cancelled, where,
    word: cancelled ? 'Cancelled' : !at ? 'Received'
      : at.key === 'handed' ? 'Not handed over'
        : at.key === 'gate' ? wordAt(at, 'Not here yet')
          : at.key === 'checked' ? wordAt(at, 'At the gate') : wordAt(at, 'Checked'),
  }
  if (cancelled || !at) return j

  // the next thing: hand it over, record what came (on the first line still short), or check what is waiting
  const short = orders.find((o) => o.state !== 'cancelled' && o.qty - receipts.filter((r) => r.orderId === o.id).reduce((a, r) => a + r.qty, 0) > 0)
  j.act = at.key === 'handed' ? { kind: 'paper', label: 'Make the document' }
    : waiting.length > 0 && (at.key === 'checked' || at.key === 'shelf') ? { kind: 'inspect', label: 'Check it', receiptId: waiting[0].id }
      : short && at.key === 'gate' ? { kind: 'receive', label: 'Record what arrived', orderId: short.id }
        : undefined

  const over = daysBetween(expectedOn, today)
  if (handed && received === 0) {
    between[1] = { text: `promised ${shortDate(expectedOn)}${over > 0 ? ` · ${over}d late` : ''}`, late: over > 0 }
  }
  if (received < ordered && !delivered) {
    j = lateOn(j, over, `${plural(over, 'day')} past the promise`)
  } else if (at.key === 'checked' && waiting.length > 0) {
    // a lorry checked late is the gate's lateness, against the owner's own rule
    const waited = daysBetween(waiting[0].receivedOn, today)
    const rule = ws.policy.inboundQcDays
    j = lateOn(j, waited > rule ? waited - rule : 0, `${plural(waited, 'day')} at the gate — your rule is ${rule}`, `${plural(waited, 'day')} at the gate`)
  }
  return j
}

/**
 * The purchase orders, the way they are read: what is late first, most late
 * at the top; then what is still on your desk; then what is due this week,
 * then later. Received and cancelled fold away.
 */
export function purchaseBoard<T extends { no: string; expectedOn: string }>(
  groups: T[], journeyOf: (g: T) => Journey<unknown>, today: string,
) {
  const open = groups.filter((g) => { const j = journeyOf(g); return !j.done && !j.cancelled })
  const byDue = (a: T, b: T) => a.expectedOn.localeCompare(b.expectedOn) || a.no.localeCompare(b.no, undefined, { numeric: true })
  const late = open.filter((g) => journeyOf(g).late > 0).sort((a, b) => journeyOf(b).late - journeyOf(a).late || byDue(a, b))
  const rest = open.filter((g) => journeyOf(g).late === 0)
  const desk = rest.filter((g) => journeyOf(g).where === 'handed').sort(byDue)
  const out = rest.filter((g) => journeyOf(g).where !== 'handed')
  const soon = out.filter((g) => daysBetween(today, g.expectedOn) <= 7).sort(byDue)
  const later = out.filter((g) => daysBetween(today, g.expectedOn) > 7).sort(byDue)
  const over = groups.filter((g) => !open.includes(g)).sort((a, b) => byDue(b, a))
  return { late, desk, soon, later, over }
}

/* -------------------------------------------------------------- job card -- */

export type JobAct =
  | { kind: 'plan'; label: string }
  | { kind: 'issue'; label: string }
  | { kind: 'output'; label: string }
  | { kind: 'close'; label: string }

export const JOB_WHERE: WhereOption[] = [
  { value: 'late', label: 'Past its finish' },
  { value: 'plan', label: 'Needs a plan' },
  { value: 'issued', label: 'Waiting for material' },
  { value: 'made', label: 'Being made' },
  { value: 'closed', label: 'Made — to close' },
  { value: 'done', label: 'Closed' },
]

export function jobJourney(ws: Workspace, job: Job, today: string): Journey<JobAct> {
  const made = madeOn(ws, job.id)
  const rejected = rejectedOn(ws, job.id)
  const slips = (ws.issues ?? []).filter((s) => s.jobId === job.id && s.kind === 'issue')
    .sort((a, b) => a.on.localeCompare(b.on))
  const forOrder = linesMadeOn(ws, job.id)[0]?.order
  const planned = Boolean(job.qty && job.plannedStart && job.plannedFinish)
  const plan = planned ? `planned ${shortDate(job.plannedStart!)} – ${shortDate(job.plannedFinish!)}` : 'not planned yet'

  const steps: JourneyStep[] = [
    {
      key: 'opened', label: 'Opened', icon: 'doc', state: 'done', on: job.openedOn,
      // its own number is the card's title wherever this is drawn, so it is not a chip
      sub: `${forOrder ? `for ${forOrder.no}` : 'for stock'} · ${plan}`,
    },
    {
      key: 'issued', label: 'Material issued', icon: 'tray',
      state: slips.length > 0 ? 'done' : made > 0 ? 'skip' : 'next', on: slips[0]?.on,
      sub: slips.length > 0 ? plural(slips.length, 'slip') : made > 0 ? 'none on a slip' : undefined,
      docs: slips.slice(0, 2).map((s) => ({ kind: 'slip' as const, id: s.id, label: s.no })),
    },
    {
      key: 'made', label: 'Made', icon: 'boxes',
      state: planned ? stateOf(made, job.qty!) : made > 0 ? 'part' : 'next',
      pct: planned ? pctOf(made, job.qty!) : undefined,
      on: latest(outputsOf(ws, job.id).map((o) => o.on)),
      sub: planned ? `${num(made, 0)} of ${num(job.qty!, 0)}${rejected > 0 ? ` · ${num(rejected, 0)} rejected` : ''}`
        : made > 0 ? `${num(made, 0)} so far` : undefined,
    },
    { key: 'closed', label: 'Closed', icon: 'check', state: job.closedOn ? 'done' : 'next', on: job.closedOn },
  ]
  // once closed it is over, whatever was made; until then nothing after it is done
  if (job.closedOn) for (const s of steps) if (s.state !== 'done') s.state = 'skip'
  const at = settle(steps)
  /*
   * A card nobody has planned needs its plan before anything else: Line watch
   * cannot judge it, and its material list comes from the plan.
   */
  const needsPlan = Boolean(at) && !planned && at!.key !== 'closed'
  const where = !at ? 'done' : needsPlan ? 'plan' : at.key
  let j: Journey<JobAct> = {
    steps, between: [null, null, null], late: 0, done: !at, where,
    word: !at ? 'Closed' : needsPlan ? 'Needs a plan'
      : at.key === 'issued' ? 'Waiting for material'
        : at.key === 'made' ? wordAt(at, 'Being made') : 'Made — to close',
    act: !at ? undefined : needsPlan ? { kind: 'plan', label: 'Plan it' }
      : at.key === 'issued' ? { kind: 'issue', label: 'Issue material' }
        : at.key === 'made' ? { kind: 'output', label: 'Book output' } : { kind: 'close', label: 'Close it' },
  }
  if (at && planned && made < job.qty!) {
    const over = daysBetween(job.plannedFinish!, today)
    j = lateOn(j, over, `${plural(over, 'day')} past its finish`)
  }
  return j
}

/**
 * The job cards, the way the floor reads them: past its finish first, most
 * late at the top; then behind the plan; then on track; then the ones nobody
 * has planned. Closed cards fold away. `behind` is the plan's own verdict.
 */
export function jobBoard<T extends { job: Job }>(
  rows: T[], journeyOf: (r: T) => Journey<unknown>, behind: (r: T) => boolean,
) {
  const open = rows.filter((r) => !journeyOf(r).done)
  const byFinish = (a: T, b: T) => (a.job.plannedFinish ?? '9999').localeCompare(b.job.plannedFinish ?? '9999')
    || a.job.no.localeCompare(b.job.no, undefined, { numeric: true })
  const late = open.filter((r) => journeyOf(r).late > 0).sort((a, b) => journeyOf(b).late - journeyOf(a).late || byFinish(a, b))
  const rest = open.filter((r) => journeyOf(r).late === 0)
  const unplanned = rest.filter((r) => journeyOf(r).where === 'plan').sort((a, b) => a.job.openedOn.localeCompare(b.job.openedOn))
  const planned = rest.filter((r) => journeyOf(r).where !== 'plan')
  const slow = planned.filter(behind).sort(byFinish)
  const track = planned.filter((r) => !behind(r)).sort(byFinish)
  const over = rows.filter((r) => journeyOf(r).done).sort((a, b) => (b.job.closedOn ?? '').localeCompare(a.job.closedOn ?? ''))
  return { late, behind: slow, track, unplanned, over }
}

/* --------------------------------------------------------------- jobwork -- */

export type JobworkAct =
  | { kind: 'return'; label: string }
  | { kind: 'inspect'; label: string; receiptId: string }
  | { kind: 'close'; label: string }

export function jobworkJourney(ws: Workspace, c: Challan, today: string): Journey<JobworkAct> {
  const r = challanRow(ws, c, today)
  const who = r.vendor?.name ?? 'the jobworker'
  const back = r.acct.returned.value + r.acct.inQc.value
  const expected = r.expected.value
  const returns = (ws.receipts ?? []).filter((g) => g.challanId === c.id)
    .sort((a, b) => a.receivedOn.localeCompare(b.receivedOn))
  const settled = c.status === 'closed'

  const steps: JourneyStep[] = [
    {
      key: 'sent', label: 'Sent out', icon: 'share', state: 'done', on: c.sentOn,
      sub: `${qtyText(c.qtySent)} ${r.uom}${c.process ? ` · ${c.process}` : ''}`,
    },
    {
      key: 'with', label: `With ${who}`, icon: 'factory', state: back > 0 || settled ? 'done' : 'next',
      sub: `due back ${shortDate(c.dueBack)}${c.extensions?.length ? ` · moved ${plural(c.extensions.length, 'time')}` : ''}`,
    },
    {
      key: 'gate', label: 'Back at the gate', icon: 'tray', state: stateOf(back, expected), pct: pctOf(back, expected),
      on: latest(returns.map((g) => g.receivedOn)),
      sub: back > 0 ? `${qtyText(back)} of ${qtyText(expected)} ${r.uom}` : undefined,
      docs: returns.slice(0, 3).map((g) => ({ kind: 'receipt' as const, id: g.id, label: g.id })),
    },
    {
      key: 'shelf', label: 'Back on the shelf', icon: 'boxes',
      state: stateOf(r.acct.returned.value, expected), pct: pctOf(r.acct.returned.value, expected),
      sub: r.acct.returned.value > 0 ? `${qtyText(r.acct.returned.value)} ${r.uom}` : undefined,
    },
    {
      key: 'settled', label: 'Settled', icon: 'check', state: settled ? 'done' : 'next', on: c.closedOn,
      sub: settled ? (c.writtenOff ? `${qtyText(c.writtenOff)} ${r.uom} written off` : c.closeReason) : undefined,
    },
  ]
  // settled closes it: whatever did not come back was written off, not waited for
  if (settled) for (const s of steps) if (s.state !== 'done') s.state = 'skip'
  const at = settle(steps)
  const between: (JourneyLine | null)[] = [null, null, null, null]
  const where = !at ? 'done' : at.key
  let j: Journey<JobworkAct> = {
    steps, between, late: 0, done: !at, where,
    word: !at ? 'Settled' : at.key === 'with' ? 'With the jobworker'
      : at.key === 'gate' ? wordAt(at, 'Coming back')
        : at.key === 'shelf' ? wordAt(at, 'At the gate') : 'To settle',
  }
  if (!at) return j
  // what came back waits at the gate to be inspected before anything else
  j.act = r.atGate.length > 0 ? { kind: 'inspect', label: 'Inspect', receiptId: r.atGate[0].id }
    : at.key === 'with' || at.key === 'gate' ? { kind: 'return', label: 'It came back' }
      : { kind: 'close', label: 'Close it' }
  const over = daysBetween(c.dueBack, today)
  if (back < expected) j = lateOn(j, over, `${plural(over, 'day')} past due back`)
  return j
}

export const JOBWORK_WHERE: WhereOption[] = [
  { value: 'late', label: 'Past due back' },
  { value: 'with', label: 'With the jobworker' },
  { value: 'gate', label: 'Coming back' },
  { value: 'shelf', label: 'At the gate' },
  { value: 'settled', label: 'To settle' },
]

/** Material out, the way it is chased: past due back first, then due this week, then later. */
export function jobworkBoard<T extends { challan: Challan }>(
  rows: T[], journeyOf: (r: T) => Journey<unknown>, today: string,
) {
  const open = rows.filter((r) => !journeyOf(r).done)
  const byDue = (a: T, b: T) => a.challan.dueBack.localeCompare(b.challan.dueBack)
    || a.challan.no.localeCompare(b.challan.no, undefined, { numeric: true })
  const late = open.filter((r) => journeyOf(r).late > 0).sort((a, b) => journeyOf(b).late - journeyOf(a).late || byDue(a, b))
  const rest = open.filter((r) => journeyOf(r).late === 0)
  const soon = rest.filter((r) => daysBetween(today, r.challan.dueBack) <= 7).sort(byDue)
  const later = rest.filter((r) => daysBetween(today, r.challan.dueBack) > 7).sort(byDue)
  return { late, soon, later }
}
