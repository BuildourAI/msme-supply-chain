/**
 * Material sent out to be worked on, and what came of it.
 *
 * A jobworker is a supplier of type Jobworker — the owner's own vocabulary,
 * already offered on day one — rather than a list of their own, because the
 * galvaniser you send tubes to is also somebody you pay, phone and deal with.
 * What they are NOT is somebody with a rate against a material: their charge
 * is for a process, and letting it into the landed-cost ranking would let a
 * galvaniser win a comparison for the steel.
 */
import { addDays, daysBetween } from '@/lib/domain/calc'
import type { Vendor } from '@/lib/domain/types'
import { issueId } from './defaults'
import { jobWord } from './jobs'
import { allocate, dropLots, postMany, reverse, round3, usableOnHand } from './ledger'
import { arrive } from './receipts'
import { nextNo } from './sourcing'
import type { Challan, Workspace } from './types'

/** The owner's word for it, which `STARTER_CATEGORIES` has offered from the start. */
export const JOBWORKER = 'Jobworker'

export const isJobworker = (ws: Workspace, vendorId: string): boolean =>
  ws.vendorType[vendorId] === JOBWORKER

export const jobworkers = (ws: Workspace): Vendor[] =>
  ws.vendors.filter((v) => isJobworker(ws, v.id))

/** Challans still out, for the Jobwork row's badge. */
export const challansOut = (ws: Workspace) =>
  (ws.challans ?? []).filter((c) => c.status === 'out')

/** Challans still out that went for one style, job or order. */
export const challansFor = (ws: Workspace, jobId: string) =>
  challansOut(ws).filter((c) => c.jobId === jobId)

/*
 * The GST clock on material out for jobwork. Inputs sent to a jobworker have
 * to be back within a year of the day they left; past that, GST treats them
 * as supplied to the jobworker on the day they left — tax on a sale nobody
 * made. (Machinery and tools get three years; a challan here is material.)
 * The store is told from ninety days before, while a chase can still fix it.
 */
export const GST_JOBWORK_DAYS = 365
export const GST_JOBWORK_WARN_DAYS = 90

/** The last day it can come back before GST counts it as supplied. */
export const gstDueBy = (c: Challan): string => addDays(c.sentOn, GST_JOBWORK_DAYS)

/** Days until that day; negative once it has passed. */
export const gstDaysLeft = (c: Challan, today: string): number => daysBetween(today, gstDueBy(c))

/* ------------------------------------------------------------ the challan -- */

/** Usable stock of a material right now, less remnants — what can be sent out. */
export { usableOnHand }

export interface SendOut {
  vendorId: string
  itemId: string
  qty: number
  sentOn: string
  dueBack: string
  /** what comes back per unit sent — 0.95 for cutting, 1.04 for galvanising */
  expectedYield: number
  process?: string
  note?: string
  /** the one lot it goes from; absent takes the oldest first */
  lotId?: string
  /** who sent it, for the journal */
  actor?: string
  /** the style, job or order it goes out for; blank when it is for stock */
  jobId?: string
}

/** Why material cannot go out as described, or null. */
export function sendOutProblem(ws: Workspace, s: SendOut): string | null {
  if (!ws.vendors.some((v) => v.id === s.vendorId)) return 'Pick who it is going to.'
  if (!ws.items.some((i) => i.id === s.itemId)) return 'Pick the material going out.'
  if (!Number.isFinite(s.qty) || s.qty <= 0) return 'Put in how much is going out.'
  const have = usableOnHand(ws, s.itemId)
  if (s.qty > have) return `Only ${have} is usable on the shelf — you cannot send out more than you have.`
  if (!allocate(ws, s.itemId, s.qty, { lotId: s.lotId })) {
    return s.lotId
      ? 'That lot does not have that much on it — pick another, or let it take the oldest first.'
      : 'The lots on the shelf do not add up to that much — count the material first.'
  }
  if (s.sentOn.length !== 10) return 'Put in the day it left.'
  if (s.dueBack.length !== 10 || s.dueBack < s.sentOn) return 'Put in the day they promised it back, on or after it left.'
  if (!Number.isFinite(s.expectedYield) || s.expectedYield <= 0 || s.expectedYield > 2) {
    return 'Put in what should come back per 100 sent, as a percentage.'
  }
  if (s.jobId) {
    const word = jobWord(ws).one
    const job = (ws.jobs ?? []).find((j) => j.id === s.jobId)
    if (!job) return `Pick an open ${word}, or leave it blank.`
    if (job.closedOn) return `${job.no} is closed — pick an open ${word}, or leave it blank.`
  }
  return null
}

/**
 * Material out of the gate to a jobworker.
 *
 * It comes off the lots it actually left — the oldest first, or the one
 * somebody picked — as a movement on each, named for the challan. It used to
 * be a negative lot of its own, which kept the sums right but could not say
 * which pile went; the journal now does. Taking the challan back reverses
 * those movements. Valued at the last purchase price on the day it left
 * (§13-1).
 */
export function sendOut(ws: Workspace, s: SendOut): [Workspace, string] {
  if (sendOutProblem(ws, s)) return [ws, '']
  const [issued, id] = issueId(ws, 'JW')
  const no = nextNo('JW', issued.challans ?? [])
  const vendor = issued.vendors.find((v) => v.id === s.vendorId)
  const item = issued.items.find((i) => i.id === s.itemId)
  const challan: Challan = {
    id, no,
    vendorId: s.vendorId,
    itemId: s.itemId,
    qtySent: s.qty,
    sentOn: s.sentOn,
    dueBack: s.dueBack,
    expectedYield: s.expectedYield,
    rate: item?.lastPurchaseRate ?? 0,
    process: s.process?.trim() || undefined,
    note: s.note?.trim() || undefined,
    status: 'out',
    jobId: s.jobId || undefined,
  }
  const from = allocate(issued, s.itemId, s.qty, { lotId: s.lotId })
  if (!from) return [ws, '']
  const [moved, ids] = postMany(issued, from.map((f) => ({
    lotId: f.lotId, itemId: s.itemId, on: s.sentOn, kind: 'jobwork_out' as const, qty: -f.qty,
    source: 'challan' as const, sourceRef: no, actor: s.actor ?? '',
    note: `to ${vendor?.name ?? 'the jobworker'}`,
  })))
  if (ids.length === 0) return [ws, '']
  return [{ ...moved, challans: [...(moved.challans ?? []), challan] }, id]
}

/**
 * Material back from a jobworker — at the gate, like any delivery.
 *
 * It is a receipt against the challan, open until somebody inspects it, and
 * none of it is usable until then. Nothing bypasses inspection because the
 * material was ours to begin with.
 */
export function bookReturn(
  ws: Workspace, challanId: string, r: { qty: number; receivedOn: string; note?: string },
): [Workspace, string] {
  const challan = (ws.challans ?? []).find((c) => c.id === challanId)
  if (!challan || challan.status !== 'out' || !(r.qty > 0) || r.receivedOn < challan.sentOn) return [ws, '']
  return arrive(ws, { challan, qty: r.qty, receivedOn: r.receivedOn, note: r.note })
}

/**
 * A new return date, agreed with the jobworker.
 *
 * Kept as a line of its own, never written over: a re-agreed date is not an
 * on-time return, and the jobworker's record has to keep saying so.
 */
export function extendDue(
  ws: Workspace, challanId: string, e: { to: string; reason: string; on: string },
): Workspace {
  const c = (ws.challans ?? []).find((x) => x.id === challanId)
  if (!c || c.status !== 'out' || e.to <= c.dueBack || e.reason.trim().length < 4) return ws
  return {
    ...ws,
    challans: (ws.challans ?? []).map((x) => (x.id !== challanId ? x : {
      ...x,
      dueBack: e.to,
      extensions: [...(x.extensions ?? []), { from: x.dueBack, to: e.to, on: e.on, reason: e.reason.trim() }],
    })),
  }
}

/**
 * The challan settled, with a written reason.
 *
 * What was still unaccounted for is written off — recorded on the challan, not
 * moved anywhere, because it already left the shelf the day it went out. A
 * return still at the gate has to be inspected first: closing over it would
 * write off material that is standing by the door.
 */
export function closeChallan(
  ws: Workspace, challanId: string, c: { reason: string; on: string; unaccounted: number; actor?: string },
): Workspace {
  const ch = (ws.challans ?? []).find((x) => x.id === challanId)
  if (!ch || ch.status !== 'out' || c.reason.trim().length < 4) return ws
  if ((ws.receipts ?? []).some((r) => r.challanId === challanId && r.status === 'open')) return ws
  const writtenOff = round3(Math.max(0, c.unaccounted))
  let w: Workspace = {
    ...ws,
    challans: (ws.challans ?? []).map((x) => (x.id !== challanId ? x : {
      ...x, status: 'closed' as const, closedOn: c.on, closeReason: c.reason.trim(), writtenOff,
    })),
  }
  /*
   * What never came back is a loss with a cause — consumed at the jobworker,
   * past what the process allowed. No movement: it left the shelf the day it
   * went out, and the challan's own movement already says so.
   */
  if (writtenOff > 0) {
    const [issued, lossId] = issueId(w, 'LS')
    // on the style it went out for, when it went out for one
    const job = ch.jobId ? (ws.jobs ?? []).find((j) => j.id === ch.jobId) : undefined
    w = {
      ...issued,
      losses: [...(issued.losses ?? []), {
        id: lossId, on: c.on, itemId: ch.itemId, qty: writtenOff, cause: 'jobwork_loss',
        source: 'challan', sourceRef: ch.no, recoveryRate: 0, actor: c.actor ?? '',
        note: c.reason.trim(),
        ...(job ? { jobId: job.id, workOrder: job.no } : {}),
      }],
    }
  }
  return w
}

/** Why a challan cannot be closed yet, or null. */
export function closeChallanProblem(ws: Workspace, challanId: string, reason: string): string | null {
  if ((ws.receipts ?? []).some((r) => r.challanId === challanId && r.status === 'open')) {
    return 'Something from this jobwork challan is still at the gate — inspect it first.'
  }
  if (reason.trim().length < 4) return 'A jobwork challan closes against a written reason.'
  return null
}

/**
 * Taking a challan back — mis-keyed, never sent. Only while nothing has come
 * back against it: once a return is on record, the challan is history.
 */
export function removeChallan(ws: Workspace, challanId: string): Workspace {
  const c = (ws.challans ?? []).find((x) => x.id === challanId)
  if (!c || (ws.receipts ?? []).some((r) => r.challanId === challanId)) return ws
  // the movements it wrote go back onto their lots; one saved before the
  // journal left a negative lot of its own, which simply goes
  const w = dropLots(
    reverse(ws, (m) => m.source === 'challan' && m.sourceRef === c.no),
    (l) => l.id === `LOT-${challanId}`,
  )
  return {
    ...w,
    challans: (w.challans ?? []).filter((x) => x.id !== challanId),
    losses: (w.losses ?? []).filter((l) => !(l.source === 'challan' && l.sourceRef === c.no)),
  }
}

/* ------------------------------------------------------------- the ledger -- */

export type LedgerKind = 'sent' | 'returned' | 'extended' | 'closed'

export interface LedgerEntry {
  on: string
  kind: LedgerKind
  /** the quantity that moved, when something did */
  qty?: number
  /** the document it moved on: the challan, or the receipt */
  doc: string
  note: string
  /** what is still out after this line — at the jobworker, or unexplained */
  stillOut: number
}

/**
 * Every movement on one challan, in the order it happened.
 *
 * Sent; each return as it came back — "at the gate" until inspected, then
 * what was accepted and turned back; each date re-agreed; and the close, with
 * what it wrote off. After every line, what is still out: sent less what has
 * come back, counted exactly as the five-way split counts it — a return at the
 * gate in full, an inspected one by what was accepted. Rejected work is held
 * as non-usable stock and is still owed, so the ledger and the split can never
 * disagree about the balance. Closing settles it to nothing.
 */
export function challanLedger(ws: Workspace, challanId: string): LedgerEntry[] {
  const c = (ws.challans ?? []).find((x) => x.id === challanId)
  if (!c) return []
  const uom = ws.items.find((i) => i.id === c.itemId)?.uom ?? ''
  const vendor = ws.vendors.find((v) => v.id === c.vendorId)?.name ?? 'the jobworker'
  const moves: { on: string; order: number; entry: Omit<LedgerEntry, 'stillOut'>; back: number }[] = []

  moves.push({
    on: c.sentOn, order: 0, back: 0,
    entry: {
      on: c.sentOn, kind: 'sent', qty: c.qtySent, doc: c.no,
      note: `${c.qtySent} ${uom} to ${vendor}${c.process ? ` for ${c.process.toLowerCase()}` : ''}, due back ${
        c.extensions?.[0]?.from ?? c.dueBack}`,
    },
  })
  for (const r of (ws.receipts ?? []).filter((x) => x.challanId === challanId)) {
    const open = r.status === 'open'
    moves.push({
      // what the five-way split counts as back: all of it while at the gate,
      // what was accepted once inspected — rejected work is still owed
      on: r.receivedOn, order: 1, back: open ? r.qty : r.accepted,
      entry: {
        on: r.receivedOn, kind: 'returned', qty: r.qty, doc: r.id,
        note: open ? `${r.qty} ${uom} back — at the gate, not yet inspected`
          : `${r.qty} ${uom} back — accepted ${r.accepted}${r.rejected > 0
            ? `, rejected ${r.rejected} (held as non-usable, still owed)` : ''}`,
      },
    })
  }
  for (const e of c.extensions ?? []) {
    moves.push({
      on: e.on, order: 2, back: 0,
      entry: { on: e.on, kind: 'extended', doc: c.no, note: `due back ${e.from} → ${e.to} — ${e.reason}` },
    })
  }
  if (c.status === 'closed') {
    moves.push({
      on: c.closedOn ?? c.sentOn, order: 3, back: c.writtenOff ?? 0,
      entry: {
        on: c.closedOn ?? c.sentOn, kind: 'closed', qty: c.writtenOff || undefined, doc: c.no,
        note: `closed — ${c.closeReason ?? ''}${(c.writtenOff ?? 0) > 0 ? ` · ${c.writtenOff} ${uom} written off` : ''}`,
      },
    })
  }

  moves.sort((a, b) => a.on.localeCompare(b.on) || a.order - b.order)
  let out = c.qtySent
  return moves.map((m) => {
    if (m.entry.kind === 'returned') out = round3(out - m.back)
    // closing settles the rest: process loss and the write-off, and nothing is out after it
    if (m.entry.kind === 'closed') out = 0
    return { ...m.entry, stillOut: Math.max(0, out) }
  })
}

/** Every movement across every challan, newest first — the book, not one page of it. */
export function registerLedger(ws: Workspace): (LedgerEntry & { challanNo: string; jobworker: string; item: string })[] {
  return (ws.challans ?? [])
    .flatMap((c) => challanLedger(ws, c.id).map((e) => ({
      ...e,
      challanNo: c.no,
      jobworker: ws.vendors.find((v) => v.id === c.vendorId)?.name ?? 'Unknown jobworker',
      item: ws.items.find((i) => i.id === c.itemId)?.name ?? 'Unknown material',
    })))
    .sort((a, b) => b.on.localeCompare(a.on))
}
