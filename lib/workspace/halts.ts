/**
 * When the floor stopped, and why.
 *
 * Line watch says which jobs WILL stop for want of material. This is the
 * other half: a person saying a job HAS stopped — no operators, a machine
 * down, the power out, a quality hold — and when it started again. A month of
 * these is the answer to "why are we always behind?", by cause rather than by
 * impression.
 *
 * Days down are working days, from the day it stopped to the day before it
 * resumed; a halt still open counts today as well.
 */
import { addDays } from '@/lib/domain/calc'
import { issueId } from './defaults'
import { openHaltOf } from './linewatch'
import { floorOf, isPlanned, workingDaysBetween } from './plan'
import { productOf } from './products'
import type { Halt, HaltCause, Job, Product, Workspace } from './types'

export const HALT_CAUSES: HaltCause[] = ['material', 'machine', 'manpower', 'power', 'quality', 'jobworker', 'other']

export interface HaltInput { jobId: string; on: string; cause: HaltCause; note?: string; actor: string }

export function haltProblem(ws: Workspace, h: HaltInput, today: string): string | null {
  const job = (ws.jobs ?? []).find((j) => j.id === h.jobId)
  if (!job) return 'Pick the job that stopped.'
  if (job.closedOn) return `${job.no} is closed.`
  if (!isPlanned(job)) return `${job.no} has no plan — plan it first.`
  if (openHaltOf(ws, h.jobId)) return `${job.no} is already halted. Say it resumed first.`
  if (!h.on) return 'Put in the day it stopped.'
  if (h.on > today) return 'That day has not happened yet.'
  if (!HALT_CAUSES.includes(h.cause)) return 'Say why it stopped.'
  if (h.cause === 'other' && (h.note ?? '').trim().length < 3) return 'Say what it was.'
  return null
}

export function recordHalt(ws: Workspace, h: HaltInput, today: string): [Workspace, string] {
  if (haltProblem(ws, h, today)) return [ws, '']
  const [w, id] = issueId(ws, 'HL')
  const halt: Halt = { id, jobId: h.jobId, on: h.on, cause: h.cause, note: h.note?.trim() || undefined, actor: h.actor }
  return [{ ...w, halts: [...(w.halts ?? []), halt] }, id]
}

export function resumeProblem(ws: Workspace, haltId: string, on: string, today: string): string | null {
  const h = (ws.halts ?? []).find((x) => x.id === haltId)
  if (!h) return 'That halt is not on the log.'
  if (h.resumedOn) return 'It has already resumed.'
  if (!on) return 'Put in the day it started again.'
  if (on < h.on) return 'It cannot start again before it stopped.'
  if (on > today) return 'That day has not happened yet.'
  return null
}

export function resumeHalt(ws: Workspace, haltId: string, on: string, today: string): Workspace {
  if (resumeProblem(ws, haltId, on, today)) return ws
  return { ...ws, halts: (ws.halts ?? []).map((h) => (h.id === haltId ? { ...h, resumedOn: on } : h)) }
}

/** A halt taken back — mis-keyed. Nothing else hangs off it. */
export const removeHalt = (ws: Workspace, haltId: string): Workspace =>
  ({ ...ws, halts: (ws.halts ?? []).filter((h) => h.id !== haltId) })

/** Working days lost: from the day it stopped to the day before it resumed; an open halt counts today. */
export function daysDown(ws: Workspace, h: Halt, today: string): number {
  const end = h.resumedOn ?? addDays(today, 1)
  return workingDaysBetween(h.on, addDays(end, -1), floorOf(ws))
}

export interface HaltRow { halt: Halt; job?: Job; product?: Product; days: number; open: boolean }

/** Open halts first, then newest. */
export function haltRows(ws: Workspace, today: string): HaltRow[] {
  return [...(ws.halts ?? [])]
    .sort((a, b) => Number(!a.resumedOn) === Number(!b.resumedOn)
      ? b.on.localeCompare(a.on) || b.id.localeCompare(a.id)
      : Number(!b.resumedOn) - Number(!a.resumedOn))
    .map((halt) => {
      const job = (ws.jobs ?? []).find((j) => j.id === halt.jobId)
      return { halt, job, product: productOf(ws, job?.productId), days: daysDown(ws, halt, today), open: !halt.resumedOn }
    })
}

/**
 * Days down by cause over a month — counting the part of each halt that fell
 * in the month, so a halt that ran across the first of the month is split.
 */
export function haltsByCause(ws: Workspace, month: string, today: string): { cause: HaltCause; halts: number; days: number }[] {
  const floor = floorOf(ws)
  const first = `${month}-01`
  const last = addDays(addDays(first, 32).slice(0, 7) + '-01', -1)
  const out = new Map<HaltCause, { halts: number; days: number }>()
  for (const h of ws.halts ?? []) {
    const end = addDays(h.resumedOn ?? addDays(today, 1), -1)
    const from = h.on > first ? h.on : first
    const to = end < last ? end : last
    // a halt that began this month counts as one even when it cost no whole day
    if (to < from && h.on.slice(0, 7) !== month) continue
    const days = to < from ? 0 : workingDaysBetween(from, to, floor)
    const c = out.get(h.cause) ?? { halts: 0, days: 0 }
    out.set(h.cause, { halts: c.halts + 1, days: c.days + days })
  }
  return [...out.entries()].map(([cause, v]) => ({ cause, ...v })).sort((a, b) => b.days - a.days)
}
