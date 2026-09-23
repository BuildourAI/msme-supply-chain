/**
 * Pieces off the floor.
 *
 * A booking is one job, one day: how many came off good and how many were
 * rejected, with why. The good ones are finished stock the moment they are
 * booked — one movement into the product's journal, against the job's
 * number — and the rejected ones never are. That is the whole of how finished
 * goods arrive: a balance is output booked, less what went out, plus what came
 * back fit to sell.
 *
 * A booking's movement carries the booking's own id, so taking a mis-keyed
 * booking back takes exactly its movement with it — and is refused once those
 * pieces have left, because finished stock never goes below nothing.
 */
import type { FgMovement } from '@/lib/domain/types'
import { issueId } from './defaults'
import { fgOnHand, productOf } from './products'
import type { Job, Output, Product, Workspace } from './types'

const r3 = (n: number) => Math.round(n * 1000) / 1000

export const fgMoveIdFor = (outputId: string) => `FGM-${outputId}`

export interface OutputInput {
  jobId: string
  on: string
  good: number
  rejected: number
  reason?: string
  actor: string
  note?: string
}

export function outputProblem(ws: Workspace, x: OutputInput, today = ''): string | null {
  const job = (ws.jobs ?? []).find((j) => j.id === x.jobId)
  if (!job) return 'Pick the job it came off.'
  if (job.closedOn) return `${job.no} is closed.`
  if (!productOf(ws, job.productId)) return `${job.no} has no product yet — plan it first, so the pieces know what they are.`
  if (!x.on) return 'Put in the day.'
  if (today && x.on > today) return 'That day has not happened yet.'
  const whole = (n: number) => Number.isInteger(n) && n >= 0
  if (!whole(x.good) || !whole(x.rejected)) return 'Good and rejected are whole numbers of pieces — nought where there were none.'
  if (x.good + x.rejected === 0) return 'Put in how many came off.'
  if (x.rejected > 0 && !x.reason?.trim()) return 'Say why they were rejected.'
  return null
}

/** One booking, and the good pieces into finished stock against the job. */
export function bookOutput(ws: Workspace, x: OutputInput, today = ''): [Workspace, string] {
  if (outputProblem(ws, x, today)) return [ws, '']
  const job = (ws.jobs ?? []).find((j) => j.id === x.jobId)!
  const [w, id] = issueId(ws, 'OP')
  const out: Output = {
    id, jobId: x.jobId, on: x.on, good: x.good, rejected: x.rejected,
    reason: x.rejected > 0 ? x.reason?.trim() : undefined, actor: x.actor, note: x.note?.trim() || undefined,
  }
  const moves: FgMovement[] = x.good > 0 ? [{
    id: fgMoveIdFor(id), fgId: job.productId!, on: x.on, kind: 'production', qty: x.good,
    sourceRef: job.no, actor: x.actor, note: `${x.good} good off ${job.no}`,
  }] : []
  return [{ ...w, outputs: [...(w.outputs ?? []), out], fgMoves: [...(w.fgMoves ?? []), ...moves] }, id]
}

/** Why a booking cannot be taken back: its good pieces have left the store since. */
export function removeOutputProblem(ws: Workspace, outputId: string): string | null {
  const out = (ws.outputs ?? []).find((o) => o.id === outputId)
  if (!out) return null
  const job = (ws.jobs ?? []).find((j) => j.id === out.jobId)
  if (!job?.productId || out.good === 0) return null
  const after = fgOnHand(ws, job.productId) - out.good
  if (after < -1e-9) return `${Math.min(out.good, -after)} of those pieces have been dispatched since. Take that note back first.`
  return null
}

export function removeOutput(ws: Workspace, outputId: string): Workspace {
  if (!(ws.outputs ?? []).some((o) => o.id === outputId) || removeOutputProblem(ws, outputId)) return ws
  return {
    ...ws,
    outputs: (ws.outputs ?? []).filter((o) => o.id !== outputId),
    fgMoves: (ws.fgMoves ?? []).filter((m) => m.id !== fgMoveIdFor(outputId)),
  }
}

/**
 * Finished stock counted onto the book — for what was on the shelf before the
 * floor was booking output, or to put the book right after a count. The
 * difference from the book is one movement against the count's date, never a
 * balance written over.
 */
export interface FinishedCount { productId: string; qty: number; on: string; actor: string }

export function countFinishedProblem(ws: Workspace, c: FinishedCount): string | null {
  if (!productOf(ws, c.productId)) return 'Pick the product.'
  if (!Number.isFinite(c.qty) || c.qty < 0) return 'Put in how many are on the shelf.'
  if (!c.on) return 'Put in the day it was counted.'
  if (r3(c.qty - fgOnHand(ws, c.productId)) === 0) return 'That is what the book already says.'
  return null
}

export function countFinished(ws: Workspace, c: FinishedCount): Workspace {
  if (countFinishedProblem(ws, c)) return ws
  const diff = r3(c.qty - fgOnHand(ws, c.productId))
  const [w, id] = issueId(ws, 'FGM')
  const move: FgMovement = {
    id, fgId: c.productId, on: c.on, kind: 'opening', qty: diff, sourceRef: `COUNT-${c.on}`,
    actor: c.actor, note: `counted ${c.qty} on the shelf`,
  }
  return { ...w, fgMoves: [...(w.fgMoves ?? []), move] }
}

export interface OutputRow { output: Output; job?: Job; product?: Product }

export function outputRows(ws: Workspace): OutputRow[] {
  return [...(ws.outputs ?? [])]
    .sort((a, b) => b.on.localeCompare(a.on) || b.id.localeCompare(a.id))
    .map((output) => {
      const job = (ws.jobs ?? []).find((j) => j.id === output.jobId)
      return { output, job, product: productOf(ws, job?.productId) }
    })
}

/** The last day anything was booked on a job. */
export const lastBookedOn = (ws: Workspace, jobId: string): string | undefined =>
  (ws.outputs ?? []).filter((o) => o.jobId === jobId).map((o) => o.on).sort().pop()
