/**
 * What material leaves the store against.
 *
 * A garment maker calls it a style, a machine shop a job, somebody making to
 * order an order — the owner says which, and what their numbers look like.
 * Every issue slip then names one, so every metre that left the store is
 * somebody's, and consumption per job is a sum rather than a guess.
 */
import { issueId } from './defaults'
import type { Job, JobNumbering, Workspace } from './types'

export const JOB_WORD: Record<JobNumbering['word'], { one: string; many: string }> = {
  job: { one: 'job', many: 'jobs' },
  style: { one: 'style', many: 'styles' },
  order: { one: 'order', many: 'orders' },
}

export const DEFAULT_PREFIX: Record<JobNumbering['word'], string> = {
  job: 'JOB', style: 'ST', order: 'ORD',
}

export const jobWord = (ws: Workspace) => JOB_WORD[ws.jobNumbering?.word ?? 'job']

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)
export const jobWordCap = (ws: Workspace) => {
  const w = jobWord(ws)
  return { one: cap(w.one), many: cap(w.many) }
}

const prefixOf = (ws: Workspace) =>
  (ws.jobNumbering?.prefix ?? DEFAULT_PREFIX[ws.jobNumbering?.word ?? 'job']).trim().toUpperCase()

/** The next number in the owner's own style — ST-4, JOB-13 — counting up from the highest. */
export function nextJobNo(ws: Workspace): string {
  const prefix = prefixOf(ws)
  const re = new RegExp(`^${prefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}-?(\\d+)$`, 'i')
  const highest = (ws.jobs ?? []).reduce((max, j) => {
    const m = re.exec(j.no)
    return m ? Math.max(max, Number(m[1])) : max
  }, 0)
  return `${prefix}-${highest + 1}`
}

export function setJobNumbering(ws: Workspace, n: JobNumbering): Workspace {
  return {
    ...ws,
    jobNumbering: { word: n.word, prefix: (n.prefix.trim() || DEFAULT_PREFIX[n.word]).toUpperCase() },
  }
}

export interface JobInput {
  no: string
  name?: string
  customer?: string
  openedOn: string
  note?: string
}

/** Why a job cannot be recorded as described, or null. */
export function jobProblem(ws: Workspace, j: JobInput, exceptId?: string): string | null {
  const word = jobWord(ws).one
  if (!j.no.trim()) return `Give the ${word} its number.`
  const clash = (ws.jobs ?? []).find((x) => x.no.trim().toLowerCase() === j.no.trim().toLowerCase())
  if (clash && clash.id !== exceptId) return `There is already a ${word} numbered ${clash.no}.`
  if (j.openedOn.length !== 10) return `Put in the day the ${word} opened.`
  return null
}

export function addJob(ws: Workspace, j: JobInput): [Workspace, string] {
  if (jobProblem(ws, j)) return [ws, '']
  const [w, id] = issueId(ws, 'JB')
  const job: Job = {
    id,
    no: j.no.trim(),
    name: j.name?.trim() || undefined,
    customer: j.customer?.trim() || undefined,
    openedOn: j.openedOn,
    note: j.note?.trim() || undefined,
  }
  return [{ ...w, jobs: [...(w.jobs ?? []), job] }, id]
}

export const openJobs = (ws: Workspace): Job[] => (ws.jobs ?? []).filter((j) => !j.closedOn)
