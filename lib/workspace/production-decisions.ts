/**
 * The floor's work queue.
 *
 * Same shape as the other desks' — a band, a sentence naming the job, one
 * button — so the dashboard reads the same in every stage. The questions are
 * the owner's on a Monday morning: which job is stopped, which will stop
 * before it gets going, which is falling behind, and which nobody has
 * planned.
 *
 * Pure, and empty without a date.
 */
import { daysBetween } from '@/lib/domain/calc'
import { num, shortDate } from '@/lib/domain/format'
import { sortDecisions, type Decision } from './decisions'
import { HALT_WORD, lineWatch, type JobWatch } from './linewatch'
import { jobPlanRows } from './plan'
import { productsWanting } from './products'
import type { Workspace } from './types'

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`

/** Keys the owner's "noted" answers are kept under, so a card comes back only when its facts change. */
export const shortNotedKey = (jobId: string) => `production.shortNoted.${jobId}`
export const riskNotedKey = (jobId: string) => `production.riskNoted.${jobId}`
export const behindNotedKey = (jobId: string, day: string) => `production.behindNoted.${jobId}.${day}`

/** What a will-halt card is about: which materials, and how short. Noted, it returns only when this changes. */
const shortSig = (w: JobWatch) => w.needs.filter((n) => n.short > 0).map((n) => `${n.itemId}:${n.short}`).join('|')

/**
 * "Noted" on a floor card: kept against the facts the card showed, so the
 * same card does not come back tomorrow — and a different shortfall, or a
 * different reason, does.
 */
export function noteProduction(ws: Workspace, d: Decision, today: string): Workspace {
  const jobId = d.refs.jobId
  if (!jobId) return ws
  const set = (k: string, v: unknown): Workspace => ({ ...ws, drafts: { ...ws.drafts, [k]: v } })
  if (d.kind === 'job-behind') return set(behindNotedKey(jobId, today), true)
  const w = lineWatch(ws, today).find((x) => x.job.id === jobId)
  if (!w) return ws
  if (d.kind === 'job-will-halt') return set(shortNotedKey(jobId), shortSig(w))
  if (d.kind === 'job-at-risk') return set(riskNotedKey(jobId), w.stockReasons.join('|'))
  return ws
}

export function productionDecisionsFor(ws: Workspace, today: string): Decision[] {
  if (!today) return []
  const out: Decision[] = []
  const watch = lineWatch(ws, today)
  const rate = (itemId: string) => ws.items.find((i) => i.id === itemId)?.lastPurchaseRate ?? 0

  for (const w of watch) {
    const { job } = w
    const what = `${job.no}${w.product ? ` (${w.product.name})` : ''}`

    /* Stopped, now. The only card that is about the present rather than the plan. */
    if (w.halt) {
      const days = Math.max(0, daysBetween(w.halt.on, today))
      out.push({
        id: `job-halted:${job.id}`,
        band: 'stops',
        kind: 'job-halted',
        title: `${what} has been halted since ${shortDate(w.halt.on)}`,
        detail: `${HALT_WORD[w.halt.cause]}${w.halt.note ? ` — ${w.halt.note}` : ''}. ${plural(days, 'day')} down so far; ${
          w.made} of ${job.qty} made.`,
        act: 'resume',
        actLabel: 'It has resumed',
        alt: { act: 'open', label: 'See Line watch' },
        href: '/production/line-watch',
        refs: { jobId: job.id, haltId: w.halt.id },
        weight: 1000 + days,
      })
    }

    /* Will halt: short of something nothing on its way covers. */
    const shorts = w.needs.filter((n) => n.short > 0)
    if (shorts.length > 0 && ws.drafts[shortNotedKey(job.id)] !== shortSig(w)) {
      const first = shorts[0]
      const value = shorts.reduce((a, n) => a + n.short * rate(n.itemId), 0)
      const starts = job.plannedStart! > today ? `starts ${shortDate(job.plannedStart!)}` : 'is running'
      out.push({
        id: `job-will-halt:${job.id}`,
        band: 'stops',
        kind: 'job-will-halt',
        title: `${what} ${starts} and will halt — ${first.item?.name ?? 'a material'} is ${num(first.short, 3)} ${first.uom} short`,
        detail: `${shorts.length > 1 ? `And ${plural(shorts.length - 1, 'more material')} short. ` : ''}Nothing due in covers it before ${
          shortDate(job.plannedFinish!)}. ${value > 0 ? `About ₹${Math.round(value).toLocaleString('en-IN')} to buy.` : ''}`.trim(),
        act: 'open',
        actLabel: 'Order it',
        alt: { act: 'keep', label: 'Noted' },
        href: '/sourcing/orders',
        refs: { jobId: job.id, itemId: first.itemId },
        weight: 500 + value / 1000,
      })
    }

    /* At risk from material: covered only by what is not here yet, or held by a late jobworker. */
    const risk = shorts.length === 0 ? w.stockReasons : []
    const riskSig = risk.join('|')
    if (risk.length > 0 && ws.drafts[riskNotedKey(job.id)] !== riskSig) {
      const late = risk.some((r) => /past its date/.test(r))
      out.push({
        id: `job-at-risk:${job.id}`,
        band: 'costs',
        kind: 'job-at-risk',
        title: `${what} depends on material not in yet`,
        detail: risk.slice(0, 2).join('. ') + (risk.length > 2 ? `. And ${risk.length - 2} more.` : '.'),
        act: 'open',
        actLabel: late ? 'Chase the jobworker' : 'See what is due',
        alt: { act: 'keep', label: 'Noted' },
        href: late ? '/inventory/jobwork' : '/inbound/due',
        refs: { jobId: job.id },
        weight: late ? 200 : 100,
      })
    }
  }

  /* Pace: behind the daily target, or past the finish. */
  for (const r of jobPlanRows(ws, today)) {
    const what = `${r.job.no}${r.product ? ` (${r.product.name})` : ''}`
    if (r.state === 'behind' && ws.drafts[behindNotedKey(r.job.id, today)] !== true) {
      out.push({
        id: `job-behind:${r.job.id}`,
        band: 'costs',
        kind: 'job-behind',
        title: r.made === 0
          ? `Nothing booked on ${what} yet`
          : `${what} is ${num(-r.vsTarget, 0)} behind plan`,
        detail: `${r.made} made against ${r.target} due by today, at ${r.job.perDay} a day; ${r.job.qty} by ${shortDate(r.job.plannedFinish!)}.`,
        act: 'output',
        actLabel: 'Book output',
        alt: { act: 'keep', label: 'Noted for today' },
        href: '/production/plan',
        refs: { jobId: r.job.id },
        weight: -r.vsTarget,
      })
    }
    if (r.state === 'late') {
      const days = daysBetween(r.job.plannedFinish!, today)
      out.push({
        id: `job-late:${r.job.id}`,
        band: 'costs',
        kind: 'job-late',
        title: `${what} was due to finish ${shortDate(r.job.plannedFinish!)}`,
        detail: `${r.made} of ${r.job.qty} made, ${plural(days, 'day')} past the plan. Give it a new finish, or close it if what was made is all there will be.`,
        act: 'plan',
        actLabel: 'Re-plan it',
        alt: { act: 'close', label: 'Close it' },
        href: '/production/plan',
        refs: { jobId: r.job.id },
        weight: days,
      })
    }
  }

  /* Open jobs nobody has planned: the floor cannot judge what it has not been told. */
  const unplanned = jobPlanRows(ws, today).filter((r) => r.state === 'unplanned')
  if (unplanned.length > 0) {
    const first = unplanned[0].job
    out.push({
      id: 'no-plan',
      band: 'unfinished',
      kind: 'no-plan',
      title: unplanned.length === 1 ? `${first.no} is open with no plan` : `${plural(unplanned.length, 'job')} open with no plan`,
      detail: 'Say what each makes, how many and when. Until then Line watch cannot tell whether the store can feed it.',
      act: 'plan',
      actLabel: unplanned.length === 1 ? `Plan ${first.no}` : 'Plan the first',
      alt: unplanned.length > 1 ? { act: 'open', label: 'See them all' } : undefined,
      href: '/production/plan',
      refs: { jobId: first.id },
      weight: unplanned.length,
    })
  }

  /* Products with no quantities: a plan on them needs nothing, which is never true. */
  const wanting = productsWanting(ws)
  if (wanting.length > 0) {
    out.push({
      id: 'no-bom',
      band: 'unfinished',
      kind: 'no-bom',
      title: wanting.length === 1
        ? `${wanting[0].name} has no quantities on its material list`
        : `${plural(wanting.length, 'product')} have no quantities on their material lists`,
      detail: 'How much of each material goes into one. Without it a style of that product looks as if it needs nothing.',
      act: 'open',
      actLabel: 'Fill them in',
      href: '/production/products',
      refs: { productId: wanting[0].id },
      weight: wanting.length,
    })
  }

  return sortDecisions(out)
}

export const productionOpenCount = (ws: Workspace, today: string): number =>
  productionDecisionsFor(ws, today).length
