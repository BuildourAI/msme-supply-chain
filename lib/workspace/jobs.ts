/**
 * What material leaves the store against.
 *
 * A garment maker calls it a style, a machine shop a job, somebody making to
 * order an order — the owner says which, and what their numbers look like.
 * Every issue slip then names one, so every metre that left the store is
 * somebody's, and consumption per job is a sum rather than a guess.
 */
import { issueId } from './defaults'
import { allocate, dropLots, newLot, post, postMany, reverse, usableOnHand } from './ledger'
import { nextNo } from './sourcing'
import type { IssueSlip, Job, JobNumbering, Workspace, WsLoss } from './types'

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

export function updateJob(ws: Workspace, id: string, j: JobInput): Workspace {
  if (jobProblem(ws, j, id)) return ws
  return {
    ...ws,
    jobs: (ws.jobs ?? []).map((x) => (x.id !== id ? x : {
      ...x,
      no: j.no.trim(),
      name: j.name?.trim() || undefined,
      customer: j.customer?.trim() || undefined,
      openedOn: j.openedOn,
      note: j.note?.trim() || undefined,
    })),
  }
}

/** Closed: nothing more is issued against it. Its slips and losses stay. */
export const closeJob = (ws: Workspace, id: string, on: string): Workspace => ({
  ...ws, jobs: (ws.jobs ?? []).map((j) => (j.id === id && !j.closedOn ? { ...j, closedOn: on } : j)),
})

export const reopenJob = (ws: Workspace, id: string): Workspace => ({
  ...ws, jobs: (ws.jobs ?? []).map((j) => (j.id === id ? { ...j, closedOn: undefined } : j)),
})

/** A job can go only while nothing has been issued, returned or lost against it. */
export function jobProblemToRemove(ws: Workspace, id: string): string | null {
  const slips = (ws.issues ?? []).filter((s) => s.jobId === id).length
  const lost = (ws.losses ?? []).filter((l) => l.jobId === id).length
  const cuts = (ws.cuts ?? []).filter((c) => c.jobId === id).length
  const booked = (ws.outputs ?? []).filter((o) => o.jobId === id).length
  const halts = (ws.halts ?? []).filter((h) => h.jobId === id).length
  const ordered = (ws.customerOrders ?? []).filter((o) => o.lines.some((l) => l.jobId === id)).length
  const sent = (ws.challans ?? []).filter((c) => c.jobId === id).length
  if (slips + lost + cuts + booked + halts + ordered + sent === 0) return null
  const parts = [
    slips ? `${slips} slip${slips === 1 ? '' : 's'}` : '',
    cuts ? `${cuts} cut${cuts === 1 ? '' : 's'}` : '',
    lost ? `${lost} loss record${lost === 1 ? '' : 's'}` : '',
    booked ? `${booked} output booking${booked === 1 ? '' : 's'}` : '',
    halts ? `${halts} halt${halts === 1 ? '' : 's'}` : '',
    ordered ? `${ordered} customer order${ordered === 1 ? '' : 's'}` : '',
    sent ? `${sent} challan${sent === 1 ? '' : 's'}` : '',
  ].filter(Boolean).join(', ')
  return `Material has moved against it (${parts}). Close it instead — its record stays.`
}

export const removeJob = (ws: Workspace, id: string): Workspace =>
  (jobProblemToRemove(ws, id) ? ws : { ...ws, jobs: (ws.jobs ?? []).filter((j) => j.id !== id) })

/* ------------------------------------------------------------- the slips -- */

const r3 = (n: number) => Math.round(n * 1000) / 1000

/** Losses that happened on a job — scrap on the floor, and the blade and the bin at a cut. */
const JOB_CAUSES = new Set(['process_scrap', 'cut_kerf', 'cut_offcut_scrap'])

/**
 * What a job has had of a material: issued, returned, wasted, and what that
 * leaves with it. A cut for the job counts too — what went on the table is
 * issued, its usable remnants came back to the store, its kerf and its scrap
 * were wasted — so what is left with the job is the parts it cut.
 */
export function onJob(ws: Workspace, jobId: string, itemId: string) {
  const slips = (ws.issues ?? []).filter((s) => s.jobId === jobId)
  const sum = (kind: IssueSlip['kind']) => slips.filter((s) => s.kind === kind)
    .flatMap((s) => s.lines).filter((l) => l.itemId === itemId).reduce((a, l) => a + l.qty, 0)
  const cuts = (ws.cuts ?? []).filter((c) => c.jobId === jobId && c.itemId === itemId)
  const cutNos = new Set(cuts.map((c) => c.cutNo))
  const cutIn = cuts.reduce((a, c) => a + c.inputQty, 0)
  const cutBack = (ws.moves ?? []).filter((m) => m.kind === 'offcut_in' && m.source === 'cut'
    && cutNos.has(m.sourceRef) && m.itemId === itemId).reduce((a, m) => a + m.qty, 0)
  const issued = r3(sum('issue') + cutIn)
  const returned = r3(sum('return') + cutBack)
  const wasted = r3((ws.losses ?? []).filter((l) => l.jobId === jobId && l.itemId === itemId
    && JOB_CAUSES.has(l.cause)).reduce((a, l) => a + l.qty, 0))
  return { issued, returned, wasted, withJob: r3(issued - returned - wasted) }
}

export interface IssueInput {
  jobId: string
  itemId: string
  qty: number
  on: string
  /** who took it from the store — the storeman issues, somebody takes */
  takenBy: string
  actor: string
  /** the one lot it comes off; absent takes the oldest first */
  lotId?: string
  note?: string
}

export function issueProblem(ws: Workspace, i: IssueInput): string | null {
  const job = (ws.jobs ?? []).find((j) => j.id === i.jobId)
  const word = jobWord(ws).one
  if (!job) return `Pick the ${word} it is for.`
  if (job.closedOn) return `${job.no} is closed — reopen it, or issue against another ${word}.`
  if (!ws.items.some((it) => it.id === i.itemId)) return 'Pick the material.'
  if (!Number.isFinite(i.qty) || i.qty <= 0) return 'Put in how much is going out.'
  if (i.on.length !== 10) return 'Put in the day it went out.'
  const have = usableOnHand(ws, i.itemId)
  if (i.qty > have + 1e-9) return `Only ${have} is usable on the shelf.`
  if (!allocate(ws, i.itemId, i.qty, { lotId: i.lotId })) {
    return i.lotId
      ? 'That lot does not have that much on it — pick another, or let it take the oldest first.'
      : 'The lots on the shelf do not add up to that much — count the material first.'
  }
  return null
}

/**
 * Material out of the store against a job.
 *
 * One slip, and one movement on every lot it came off — the oldest first,
 * unless somebody picked the lot. Each movement names the slip and the job,
 * so what a job used is a sum of lines rather than a figure somebody keeps.
 */
export function issueMaterial(ws: Workspace, i: IssueInput): [Workspace, string] {
  if (issueProblem(ws, i)) return [ws, '']
  const from = allocate(ws, i.itemId, i.qty, { lotId: i.lotId })!
  const [w0, id] = issueId(ws, 'IS')
  const no = nextNo('IS', w0.issues ?? [])
  const job = (ws.jobs ?? []).find((j) => j.id === i.jobId)!
  const [w1, moves] = postMany(w0, from.map((f) => ({
    lotId: f.lotId, itemId: i.itemId, on: i.on, kind: 'issue' as const, qty: -f.qty,
    source: 'job' as const, sourceRef: no, actor: i.actor, jobId: i.jobId,
    note: `to ${job.no}${i.takenBy.trim() ? `, taken by ${i.takenBy.trim()}` : ''}`,
  })))
  if (moves.length === 0) return [ws, '']
  const slip: IssueSlip = {
    id, no, kind: 'issue', jobId: i.jobId, on: i.on,
    takenBy: i.takenBy.trim() || i.actor, actor: i.actor, note: i.note?.trim() || undefined,
    lines: from.map((f) => ({ lotId: f.lotId, itemId: i.itemId, qty: f.qty })),
  }
  return [{ ...w1, issues: [...(w1.issues ?? []), slip] }, id]
}

export interface ReturnInput {
  jobId: string
  itemId: string
  qty: number
  on: string
  actor: string
  /** who brought it back */
  takenBy?: string
  /** back as short pieces rather than onto the lot it left */
  asRemnant?: boolean
  pieces?: number
  rack?: string
  /** the lot it goes back onto; absent is the last lot this job drew of it */
  lotId?: string
  note?: string
}

/** The last lot a job drew a material from, which is where a return most likely belongs. */
export function lastDrawnLot(ws: Workspace, jobId: string, itemId: string): string | undefined {
  return [...(ws.issues ?? [])].filter((s) => s.jobId === jobId && s.kind === 'issue')
    .sort((a, b) => b.on.localeCompare(a.on) || b.id.localeCompare(a.id))
    // the last line of the latest slip: the lot it finished on
    .flatMap((s) => [...s.lines].reverse().filter((l) => l.itemId === itemId))
    .map((l) => l.lotId)
    .find((lotId) => ws.stockLots.some((x) => x.id === lotId))
}

export function returnProblem(ws: Workspace, r: ReturnInput): string | null {
  const job = (ws.jobs ?? []).find((j) => j.id === r.jobId)
  if (!job) return `Pick the ${jobWord(ws).one} it comes back from.`
  if (!Number.isFinite(r.qty) || r.qty <= 0) return 'Put in how much is coming back.'
  const { withJob } = onJob(ws, r.jobId, r.itemId)
  if (r.qty > withJob + 1e-9) {
    return withJob > 0
      ? `${job.no} has only ${withJob} of it that is not already back or wasted.`
      : `${job.no} was never issued this material — nothing of it can come back.`
  }
  if (r.asRemnant) {
    if (r.pieces !== undefined && (!Number.isInteger(r.pieces) || r.pieces < 1)) return 'Put in how many pieces, a whole number.'
    return null
  }
  const lotId = r.lotId ?? lastDrawnLot(ws, r.jobId, r.itemId)
  if (!lotId || !ws.stockLots.some((l) => l.id === lotId)) return 'Pick the lot it goes back onto.'
  return null
}

/**
 * Material back into the store from a job.
 *
 * Onto the lot it left — the same roll, the same batch — or, when it comes
 * back as short pieces, as a remnant: a lot of its own on a rack, flagged,
 * on the book and never counted as cover. Either way it is a slip, and the
 * job's figures go down by it.
 */
export function returnToStore(ws: Workspace, r: ReturnInput): [Workspace, string] {
  if (returnProblem(ws, r)) return [ws, '']
  const job = (ws.jobs ?? []).find((j) => j.id === r.jobId)!
  const [w0, id] = issueId(ws, 'IS')
  const no = nextNo('IS', w0.issues ?? [])
  const note = `back from ${job.no}${r.note?.trim() ? ` — ${r.note.trim()}` : ''}`
  let w = w0
  let lotId = ''
  if (r.asRemnant) {
    ;[w, lotId] = newLot(w0, {
      itemId: r.itemId, batchNo: `REMNANT-${job.no}`, usability: 'usable',
      remnant: true, pieces: r.pieces, rack: r.rack || undefined, on: r.on,
    }, {
      on: r.on, kind: 'offcut_in', qty: r3(r.qty), source: 'job', sourceRef: no,
      actor: r.actor, jobId: r.jobId, note,
    })
    if (!lotId) return [ws, '']
  } else {
    lotId = r.lotId ?? lastDrawnLot(ws, r.jobId, r.itemId)!
    const [moved, moveId] = post(w0, {
      lotId, itemId: r.itemId, on: r.on, kind: 'issue', qty: r3(r.qty),
      source: 'job', sourceRef: no, actor: r.actor, jobId: r.jobId, note,
    })
    if (!moveId) return [ws, '']
    w = moved
  }
  const slip: IssueSlip = {
    id, no, kind: 'return', jobId: r.jobId, on: r.on,
    takenBy: r.takenBy?.trim() || r.actor, actor: r.actor, note: r.note?.trim() || undefined,
    lines: [{ lotId, itemId: r.itemId, qty: r3(r.qty) }],
  }
  return [{ ...w, issues: [...(w.issues ?? []), slip] }, id]
}

export interface WasteInput { jobId: string; itemId: string; qty: number; on: string; actor: string; note: string }

export function wasteProblem(ws: Workspace, x: WasteInput): string | null {
  const job = (ws.jobs ?? []).find((j) => j.id === x.jobId)
  if (!job) return `Pick the ${jobWord(ws).one} it was wasted on.`
  if (!Number.isFinite(x.qty) || x.qty <= 0) return 'Put in how much was wasted.'
  const { withJob } = onJob(ws, x.jobId, x.itemId)
  if (x.qty > withJob + 1e-9) return `${job.no} has only ${withJob} of it that is not already back or wasted.`
  if (x.note.trim().length < 3) return 'Say what happened — a mis-cut, a stain, end bits.'
  return null
}

/**
 * Wasted on the job: cut wrong, stained, end bits nobody can use.
 *
 * A loss with its cause and the job it happened on. No movement — the
 * material left the store on the issue slip and is not coming back; this says
 * what became of it, and what the scrap is worth if anything.
 */
export function wasteOnJob(ws: Workspace, x: WasteInput): [Workspace, string] {
  if (wasteProblem(ws, x)) return [ws, '']
  const job = (ws.jobs ?? []).find((j) => j.id === x.jobId)!
  const [w, id] = issueId(ws, 'LS')
  const loss: WsLoss = {
    id, on: x.on, itemId: x.itemId, qty: r3(x.qty), cause: 'process_scrap',
    source: 'job', sourceRef: job.no, workOrder: job.no, jobId: x.jobId,
    recoveryRate: ws.scrapRate?.[x.itemId] ?? 0, actor: x.actor, note: x.note.trim(),
  }
  return [{ ...w, losses: [...(w.losses ?? []), loss] }, id]
}

/** Why a slip cannot be taken back, or null — a remnant it made that has been used since. */
export function removeSlipProblem(ws: Workspace, slipId: string): string | null {
  const slip = (ws.issues ?? []).find((s) => s.id === slipId)
  if (!slip) return null
  if (slip.kind === 'return') {
    const made = (ws.moves ?? []).filter((m) => m.sourceRef === slip.no && m.kind === 'offcut_in').map((m) => m.lotId)
    const since = (ws.moves ?? []).filter((m) => made.includes(m.lotId) && m.sourceRef !== slip.no)
    if (since.length > 0) return 'The remnant it put back has been used since. Take that back first.'
  } else {
    // taking an issue back puts the stock back on its lots — which is only wrong if they are gone
    if (slip.lines.some((l) => !ws.stockLots.some((x) => x.id === l.lotId))) {
      return 'A lot it came off is no longer on the book.'
    }
  }
  return null
}

/** A slip taken back — mis-keyed. Every line it wrote comes off its lot; a remnant it made goes. */
export function removeSlip(ws: Workspace, slipId: string): Workspace {
  const slip = (ws.issues ?? []).find((s) => s.id === slipId)
  if (!slip || removeSlipProblem(ws, slipId)) return ws
  const made = (ws.moves ?? []).filter((m) => m.sourceRef === slip.no && m.kind === 'offcut_in').map((m) => m.lotId)
  const w = dropLots(
    reverse(ws, (m) => m.source === 'job' && m.sourceRef === slip.no),
    (l) => made.includes(l.id),
  )
  // remnant pieces it issued go back on the count, as well as the quantity
  const back = new Map<string, number>()
  for (const l of slip.lines) if (l.pieces) back.set(l.lotId, (back.get(l.lotId) ?? 0) + l.pieces)
  return {
    ...w,
    stockLots: back.size === 0 ? w.stockLots
      : w.stockLots.map((l) => (back.has(l.id) ? { ...l, pieces: (l.pieces ?? 0) + back.get(l.id)! } : l)),
    issues: (w.issues ?? []).filter((s) => s.id !== slipId),
  }
}

/* -------------------------------------------------------------- reading -- */

export interface JobMaterial {
  itemId: string
  name: string
  uom: string
  issued: number
  returned: number
  wasted: number
  /** issued less returned: what went into the job, waste included */
  used: number
  value: number
}

export interface JobRow {
  job: Job
  open: boolean
  materials: JobMaterial[]
  /** ₹ of what went into the job, at the last purchase price */
  consumption: number
  wastedValue: number
  slips: number
  lastOn?: string
}

export function jobRows(ws: Workspace): JobRow[] {
  return (ws.jobs ?? []).map((job) => {
    const slips = (ws.issues ?? []).filter((s) => s.jobId === job.id)
    const cuts = (ws.cuts ?? []).filter((c) => c.jobId === job.id)
    const itemIds = [...new Set([
      ...slips.flatMap((s) => s.lines.map((l) => l.itemId)),
      ...cuts.map((c) => c.itemId),
      ...(ws.losses ?? []).filter((l) => l.jobId === job.id).map((l) => l.itemId),
    ])]
    const materials = itemIds.map((itemId) => {
      const it = ws.items.find((i) => i.id === itemId)
      const f = onJob(ws, job.id, itemId)
      const used = r3(f.issued - f.returned)
      return {
        itemId, name: it?.name ?? 'Unknown material', uom: it?.uom ?? '',
        issued: f.issued, returned: f.returned, wasted: f.wasted, used,
        value: Math.round(used * (it?.lastPurchaseRate ?? 0) * 100) / 100,
      }
    })
    const rate = (id: string) => ws.items.find((i) => i.id === id)?.lastPurchaseRate ?? 0
    return {
      job,
      open: !job.closedOn,
      materials,
      consumption: Math.round(materials.reduce((a, m) => a + m.value, 0) * 100) / 100,
      wastedValue: Math.round(materials.reduce((a, m) => a + m.wasted * rate(m.itemId), 0) * 100) / 100,
      slips: slips.length,
      lastOn: [...slips.map((s) => s.on), ...cuts.map((c) => c.on)].sort().pop(),
    }
  }).sort((a, b) => Number(b.open) - Number(a.open) || b.job.openedOn.localeCompare(a.job.openedOn)
    || b.job.no.localeCompare(a.job.no, undefined, { numeric: true }))
}

export interface SlipRow {
  slip: IssueSlip
  job?: Job
  itemId: string
  item: string
  uom: string
  qty: number
  lots: { batch: string; rack?: string; qty: number }[]
  /** a return that came back as a remnant rather than onto its lot */
  remnant: boolean
}

export function slipRows(ws: Workspace): SlipRow[] {
  return [...(ws.issues ?? [])]
    .sort((a, b) => b.on.localeCompare(a.on) || b.id.localeCompare(a.id))
    .map((slip) => {
      const itemId = slip.lines[0]?.itemId ?? ''
      const it = ws.items.find((i) => i.id === itemId)
      const lots = slip.lines.map((l) => {
        const lot = ws.stockLots.find((x) => x.id === l.lotId)
        return {
          batch: lot?.batchNo ?? l.lotId,
          rack: lot?.rack ? (ws.racks ?? []).find((r) => r.id === lot.rack)?.name : undefined,
          qty: l.qty,
        }
      })
      return {
        slip,
        job: (ws.jobs ?? []).find((j) => j.id === slip.jobId),
        itemId, item: it?.name ?? 'Unknown material', uom: it?.uom ?? '',
        qty: r3(slip.lines.reduce((a, l) => a + l.qty, 0)),
        lots,
        remnant: slip.kind === 'return' && slip.lines.some((l) => ws.stockLots.find((x) => x.id === l.lotId)?.remnant),
      }
    })
}
