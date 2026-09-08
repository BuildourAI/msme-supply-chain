'use client'
import { createContext, useCallback, useContext, useMemo, useReducer } from 'react'
import * as I from '@/lib/domain/inbound'
import { DEFAULT_POLICY, type Policy } from '@/lib/domain/policy'
import { money, qtyText } from '@/lib/domain/format'
import { useApp } from '@/state/app-store'
import * as S from '@/lib/seed/sourcing'
import {
  challans as seedChallans, checksFor, grns as seedGrns, INSPECTOR,
  poSync as seedSync, RECEIVED_PO_LINE_IDS, TODAY_INBOUND,
} from '@/lib/seed/inbound'
import type {
  CheckOutcome, CheckResult, Derived, Grn, Item, JobworkChallan, PoRevision, PoSync, SpecCheck,
} from '@/lib/domain/types'

export { TODAY_INBOUND }

const itemById = (id: string): Item | undefined => S.items.find((i) => i.id === id)

/* ------------------------------------------------------------------- state */

interface GrnPatch {
  results: CheckResult[]
  closed?: boolean
  acceptedQty?: number
  rejectedQty?: number
  failedCheckIds?: string[]
  deviationReason?: string
  closedAt?: string
}

interface SyncPatch {
  extra: PoRevision[]
  notifiedVersion?: number
  ackedVersion?: number
  notifiedOn?: string
  ackedOn?: string
  ackRef?: string
}

interface ChallanPatch {
  closed?: boolean
  closedOn?: string
  dueBack?: string
  writtenOff?: number
}

interface State {
  policy: Policy
  grnPatch: Record<string, GrnPatch>
  extraGrns: Grn[]
  syncPatch: Record<string, SyncPatch>
  challanPatch: Record<string, ChallanPatch>
  /** which GRN is open in the inspection sheet */
  openGrnId: string | null
  /** which PO line's change notice is drafted on screen */
  draftFor: string | null
  /** which challan's chase note is drafted on screen */
  chaseFor: string | null
}

const initial: State = {
  policy: DEFAULT_POLICY,
  grnPatch: {}, extraGrns: [], syncPatch: {}, challanPatch: {},
  openGrnId: null, draftFor: null, chaseFor: null,
}

type Action =
  | { t: 'mark'; grnId: string; checkId: string; outcome: CheckOutcome; measured?: number }
  | { t: 'close'; grnId: string; patch: GrnPatch }
  | { t: 'reopen'; grnId: string }
  | { t: 'addGrn'; grn: Grn }
  | { t: 'revise'; poLineId: string; revision: PoRevision }
  | { t: 'notified'; poLineId: string; version: number; on: string }
  | { t: 'acked'; poLineId: string; version: number; on: string; ref: string }
  | { t: 'challan'; id: string; patch: ChallanPatch }
  | { t: 'openGrn'; id: string | null }
  | { t: 'draft'; id: string | null }
  | { t: 'chase'; id: string | null }
  | { t: 'reset' }

function reducer(s: State, a: Action): State {
  switch (a.t) {
    case 'mark': {
      const cur = s.grnPatch[a.grnId]?.results ?? []
      const results = [
        ...cur.filter((r) => r.checkId !== a.checkId),
        { checkId: a.checkId, outcome: a.outcome, measured: a.measured },
      ]
      return { ...s, grnPatch: { ...s.grnPatch, [a.grnId]: { ...s.grnPatch[a.grnId], results } } }
    }
    case 'close':
      return { ...s, grnPatch: { ...s.grnPatch, [a.grnId]: a.patch }, openGrnId: null }
    case 'reopen': {
      const p = s.grnPatch[a.grnId]
      return { ...s, grnPatch: { ...s.grnPatch, [a.grnId]: { results: p?.results ?? [] } } }
    }
    case 'addGrn':
      return { ...s, extraGrns: [a.grn, ...s.extraGrns] }
    case 'revise': {
      const p = s.syncPatch[a.poLineId] ?? { extra: [] }
      return { ...s, syncPatch: { ...s.syncPatch, [a.poLineId]: { ...p, extra: [...p.extra, a.revision] } } }
    }
    case 'notified': {
      const p = s.syncPatch[a.poLineId] ?? { extra: [] }
      return { ...s, syncPatch: { ...s.syncPatch, [a.poLineId]: { ...p, notifiedVersion: a.version, notifiedOn: a.on } }, draftFor: null }
    }
    case 'acked': {
      const p = s.syncPatch[a.poLineId] ?? { extra: [] }
      return { ...s, syncPatch: { ...s.syncPatch, [a.poLineId]: { ...p, ackedVersion: a.version, ackedOn: a.on, ackRef: a.ref } } }
    }
    case 'challan':
      return { ...s, challanPatch: { ...s.challanPatch, [a.id]: { ...s.challanPatch[a.id], ...a.patch } }, chaseFor: null }
    case 'openGrn': return { ...s, openGrnId: a.id }
    case 'draft': return { ...s, draftFor: a.id }
    case 'chase': return { ...s, chaseFor: a.id }
    case 'reset': return initial
    default: return s
  }
}

/* ----------------------------------------------------------------- derived */

export interface GrnRow {
  grn: Grn
  checks: SpecCheck[]
  results: CheckResult[]
  age: ReturnType<typeof I.qcAgeDays>
  state: I.QcState
  issuable: ReturnType<typeof I.issuableFrom>
  value: ReturnType<typeof I.valueAt>
  complete: boolean
  failed: SpecCheck[]
  trailing: ReturnType<typeof I.trailingRejectionRate>
  /** set once closed */
  accepted?: ReturnType<typeof I.acceptedQty>
  rejPct?: ReturnType<typeof I.rejectionPct>
  spike?: boolean
  deviationReason?: string
  /** INB-02 evidence: this receipt matched a version the vendor was never told to leave */
  staleAgainst?: { sync: PoSync; internal: number; received: number }
}

export interface SyncRow {
  sync: PoSync
  item: Item
  uom: string
  state: I.SyncState
  internal: ReturnType<typeof I.internalQty>
  vendorKnown: ReturnType<typeof I.vendorKnownQty>
  gap: ReturnType<typeof I.quantityGap>
  exposure: ReturnType<typeof I.lineExposure>
  coverGap: ReturnType<typeof I.coverGapDays>
  sinceChange: ReturnType<typeof I.daysSinceChange>
  awaitingAck: ReturnType<typeof I.daysAwaitingAck>
  churn: ReturnType<typeof I.churn>
  whipsawed: boolean
  chaseOverdue: boolean
  draft: string
  received: boolean
}

export interface ChallanRow {
  challan: JobworkChallan
  /** the five-way split; the parts always sum to qty_sent */
  acct: I.Accounting
  expected: ReturnType<typeof I.expectedReturn>
  allowed: ReturnType<typeof I.allowedLoss>
  valueOut: ReturnType<typeof I.valueAt>
  valueLost: ReturnType<typeof I.valueAt>
  late: ReturnType<typeof I.daysLate>
  yielded: ReturnType<typeof I.actualYield>
  overdue: boolean
  chase: string
}

interface Ctx {
  policy: Policy
  today: string
  grns: Grn[]
  queue: GrnRow[]
  closedRows: GrnRow[]
  qcHeld: ReturnType<typeof I.valueHeldInQc>
  syncRows: SyncRow[]
  exposure: ReturnType<typeof I.unacknowledgedExposure>
  outOfSync: SyncRow[]
  challanRows: ChallanRow[]
  jobworkers: {
    name: string; exposure: ReturnType<typeof I.jobworkerExposure>
    unaccounted: number; over: boolean; oldest: number
  }[]
  jobworkTotal: Derived
  unaccountedTotal: Derived
  openGrn: GrnRow | null
  draftRow: SyncRow | null
  chaseRow: ChallanRow | null
  mark: (grnId: string, check: SpecCheck, outcome: CheckOutcome, measured?: number) => void
  closeGrn: (row: GrnRow, rejected: number, deviationReason?: string) => void
  reopenGrn: (row: GrnRow) => void
  openInspection: (id: string | null) => void
  revise: (row: SyncRow, qty: number, promisedDate: string, reason: string) => void
  markNotified: (row: SyncRow) => void
  recordAck: (row: SyncRow, ref: string) => void
  showDraft: (id: string | null) => void
  showChase: (id: string | null) => void
  recordReturn: (row: ChallanRow, qty: number) => void
  closeChallan: (row: ChallanRow, reason: string) => void
  extendDue: (row: ChallanRow, date: string, reason: string) => void
  reset: () => void
}

const InboundCtx = createContext<Ctx>(null!)
export const useInbound = () => useContext(InboundCtx)

const uomOf = (i?: Item) => (i ? (i.uom === 'm2' ? 'm²' : i.uom) : '')
const round3 = (n: number) => Math.round(n * 1000) / 1000

export function InboundProvider({ children }: { children: React.ReactNode }) {
  const [state, dispatch] = useReducer(reducer, initial)
  const { log, say } = useApp()
  const today = TODAY_INBOUND
  const policy = state.policy

  /* ---- effective records: seed merged with whatever the session has done ---- */

  const grns = useMemo<Grn[]>(() => {
    const merged = [...state.extraGrns, ...seedGrns].map((g) => {
      const p = state.grnPatch[g.id]
      if (!p) return g
      return {
        ...g,
        status: p.closed ? ('closed' as const) : g.status,
        results: p.results,
        acceptedQty: p.closed ? p.acceptedQty : g.acceptedQty,
        rejectedQty: p.closed ? p.rejectedQty : g.rejectedQty,
        failedCheckIds: p.closed ? p.failedCheckIds : g.failedCheckIds,
        inspector: p.closed ? INSPECTOR : g.inspector,
        closedAt: p.closed ? p.closedAt : g.closedAt,
      }
    })
    return merged
  }, [state.extraGrns, state.grnPatch])

  const syncs = useMemo<PoSync[]>(() => seedSync.map((s) => {
    const p = state.syncPatch[s.poLineId]
    if (!p) return s
    return {
      ...s,
      revisions: [...s.revisions, ...p.extra],
      notifiedVersion: p.notifiedVersion ?? s.notifiedVersion,
      ackedVersion: p.ackedVersion ?? s.ackedVersion,
      notifiedOn: p.notifiedOn ?? s.notifiedOn,
      ackedOn: p.ackedOn ?? s.ackedOn,
      ackRef: p.ackRef ?? s.ackRef,
    }
  }), [state.syncPatch])

  const challans = useMemo<JobworkChallan[]>(() => seedChallans.map((c) => {
    const p = state.challanPatch[c.id]
    if (!p) return c
    return {
      ...c,
      status: p.closed ? ('closed' as const) : c.status,
      closedOn: p.closedOn ?? c.closedOn,
      dueBack: p.dueBack ?? c.dueBack,
    }
  }), [state.challanPatch])

  /* -------------------------------------------------------------- INB-01 --- */

  const buildGrnRow = useCallback((g: Grn): GrnRow => {
    const checks = checksFor(g.itemId)
    const results = state.grnPatch[g.id]?.results ?? g.results ?? []
    const age = I.qcAgeDays(g.receivedOn, today)
    const failed = I.failedChecks(checks, results)
    const closedHistory = grns.filter((x) => x.id !== g.id && x.status === 'closed')
    const trailing = I.trailingRejectionRate(closedHistory, g.vendorName, g.itemId)
    const row: GrnRow = {
      grn: g, checks, results,
      age, state: qcStateOf(age.value, policy, g),
      issuable: I.issuableFrom(g.receivedOn, policy),
      value: I.valueAt(g.qtyReceived, g.rate, g.uom, 'Value on this receipt'),
      complete: checks.length > 0 && I.inspectionComplete(checks, results),
      failed, trailing,
      deviationReason: state.grnPatch[g.id]?.deviationReason,
    }
    if (g.status === 'closed') {
      const rej = g.rejectedQty ?? 0
      row.accepted = I.acceptedQty(g.qtyReceived, rej, g.uom)
      row.rejPct = I.rejectionPct(rej, g.qtyReceived)
      row.spike = I.isRejectionSpike(row.rejPct.value, trailing.value, policy)
    }
    // INB-02 evidence — a receipt against a version the vendor was never moved off
    if (g.poLineId) {
      const sync = syncs.find((s) => s.poLineId === g.poLineId)
      const internal = sync ? I.latestRevision(sync).qty : 0
      if (sync && g.againstVersion != null && g.againstVersion < I.latestRevision(sync).version) {
        row.staleAgainst = { sync, internal, received: g.qtyReceived }
      }
    }
    return row
  }, [grns, policy, state.grnPatch, syncs, today])

  const allRows = useMemo(() => grns.map(buildGrnRow), [grns, buildGrnRow])
  const queue = useMemo(
    () => allRows.filter((r) => r.grn.status === 'open').sort((a, b) => b.age.value - a.age.value),
    [allRows],
  )
  const closedRows = useMemo(
    () => allRows.filter((r) => r.grn.status === 'closed')
      .sort((a, b) => (a.grn.closedAt ?? '') < (b.grn.closedAt ?? '') ? 1 : -1),
    [allRows],
  )
  const qcHeld = useMemo(() => I.valueHeldInQc(queue.map((r) => r.grn)), [queue])

  /* -------------------------------------------------------------- INB-02 --- */

  const syncRows = useMemo<SyncRow[]>(() => syncs.map((s) => {
    const item = itemById(s.itemId)!
    const uom = uomOf(item)
    const gap = I.quantityGap(s, uom)
    const st = I.syncState(s)
    const ch = I.churn(s, today)
    const awaiting = I.daysAwaitingAck(s, today)
    return {
      sync: s, item, uom, state: st,
      internal: I.internalQty(s, uom),
      vendorKnown: I.vendorKnownQty(s, uom),
      gap,
      exposure: I.lineExposure(gap.value, item.lastPurchaseRate, uom),
      coverGap: I.coverGapDays(gap.value, item.avgDailyConsumption, uom),
      sinceChange: I.daysSinceChange(s, today),
      awaitingAck: awaiting,
      churn: ch,
      whipsawed: ch.value > policy.poChurnLimit,
      chaseOverdue: st === 'awaiting_ack' && awaiting.value > policy.ackChaseDays,
      draft: I.changeNoticeDraft(s, item.name, uom),
      received: RECEIVED_PO_LINE_IDS.includes(s.poLineId),
    }
  }), [syncs, policy, today])

  const outOfSync = useMemo(() => syncRows.filter((r) => r.state !== 'acknowledged'), [syncRows])

  const exposure = useMemo(() => I.unacknowledgedExposure(
    outOfSync.map((r) => ({ poNo: r.sync.poNo, gap: r.gap.value, rate: r.item.lastPurchaseRate, uom: r.uom })),
  ), [outOfSync])

  /* -------------------------------------------------------------- INB-03 --- */

  const challanRows = useMemo<ChallanRow[]>(() => challans.map((c) => {
    const acct = I.challanAccounting(c, grns, policy)
    const late = I.daysLate(c)
    const back = acct.returned.value + acct.inQc.value
    return {
      challan: c, acct,
      expected: I.expectedReturn(c),
      allowed: I.allowedLoss(c),
      valueOut: I.valueAt(acct.atVendor.value, c.rate, c.uom, 'Value with the jobworker'),
      valueLost: I.valueAt(acct.unaccounted.value, c.rate, c.uom, 'Value unaccounted'),
      late,
      yielded: I.actualYield(c, back),
      overdue: c.status === 'out' && late.value > policy.jobworkGraceDays,
      // A chase asks about everything that has not come back — including what
      // the process would have been allowed to consume, since the jobworker has
      // not declared that as scrap either.
      chase: I.chaseDraft(c, round3(c.qtySent - back), late.value),
    }
  }), [challans, grns, policy])

  const jobworkers = useMemo(() => {
    const names = [...new Set(challanRows.filter((r) => r.challan.status === 'out').map((r) => r.challan.jobworkerName))]
    return names.map((name) => {
      const mine = challanRows.filter((r) => r.challan.jobworkerName === name && r.challan.status === 'out')
      const exp = I.jobworkerExposure(name, challanRows.map((r) => ({ challan: r.challan, balance: r.acct.atVendor.value })))
      const lost = challanRows.filter((r) => r.challan.jobworkerName === name)
        .reduce((a, r) => a + r.valueLost.value, 0)
      return {
        name, exposure: exp,
        unaccounted: Math.round(lost * 100) / 100,
        over: exp.value > policy.jobworkerExposureCeiling,
        oldest: Math.max(0, ...mine.map((r) => r.late.value)),
      }
    }).sort((a, b) => b.exposure.value - a.exposure.value)
  }, [challanRows, policy])

  const jobworkTotal = useMemo<Derived>(() => {
    const open = challanRows.filter((r) => r.challan.status === 'out')
    return {
      value: Math.round(open.reduce((a, r) => a + r.valueOut.value, 0) * 100) / 100,
      label: 'Material out at jobworkers',
      formula: 'Σ (balance × last_purchase_rate) over open challans',
      inputs: open.map((r) => ({
        name: `${r.challan.challanNo} · ${r.challan.jobworkerName}`, value: r.valueOut.value, unit: '₹',
        source: `${r.acct.atVendor.value} ${r.challan.uom} × ₹${r.challan.rate}`,
      })),
      note: 'Neither on the shelf nor consumed. Never counted as cover (§11).',
      unit: '₹',
    }
  }, [challanRows])

  const unaccountedTotal = useMemo<Derived>(() => {
    const rows = challanRows.filter((r) => r.acct.unaccounted.value > 0)
    return {
      value: Math.round(rows.reduce((a, r) => a + r.valueLost.value, 0) * 100) / 100,
      label: 'Unaccounted at jobworkers',
      formula: 'Σ (unaccounted × last_purchase_rate) over all challans',
      inputs: rows.length
        ? rows.map((r) => ({
            name: `${r.challan.challanNo} · ${r.challan.jobworkerName}`, value: r.valueLost.value, unit: '₹',
            source: `${r.acct.unaccounted.value} ${r.challan.uom} beyond the allowed process loss`,
          }))
        : [{ name: 'unaccounted', value: 0, source: 'every challan is inside its allowed process loss' }],
      note: 'Material that left the gate and is neither back, at the vendor, nor explained by the process.',
      unit: '₹',
    }
  }, [challanRows])

  /* ------------------------------------------------------------- actions --- */

  const mark = useCallback((grnId: string, check: SpecCheck, outcome: CheckOutcome, measured?: number) => {
    dispatch({ t: 'mark', grnId, checkId: check.id, outcome, measured })
  }, [])

  const closeGrn = useCallback((row: GrnRow, rejected: number, deviationReason?: string) => {
    const g = row.grn
    const failedIds = row.failed.map((c) => c.id)
    dispatch({ t: 'close', grnId: g.id, patch: {
      results: row.results, closed: true,
      acceptedQty: Math.round((g.qtyReceived - rejected) * 1000) / 1000,
      rejectedQty: rejected, failedCheckIds: failedIds,
      deviationReason, closedAt: today,
    } })
    const bucket = row.failed[0]?.failBucket
    const reason = row.failed[0]?.failReason
    log({
      entity: 'grn', entityId: g.grnNo, action: 'GRN closed',
      detail: `${g.itemName} · ${g.vendorName} · accepted ${qtyText(g.qtyReceived - rejected, g.uom)}` +
        (rejected > 0 ? ` · rejected ${qtyText(rejected, g.uom)} → ${bucket?.replace('_', ' ')} · ${reason}` : ' · nothing rejected') +
        (deviationReason ? ' · accepted under deviation' : ''),
      reason: deviationReason,
      before: 'awaiting inspection', after: rejected > 0 ? 'closed, part rejected' : 'closed, all accepted',
    })
    say(rejected > 0
      ? `${g.grnNo} closed. ${qtyText(g.qtyReceived - rejected, g.uom)} is now usable; ${qtyText(rejected, g.uom)} went to ${bucket?.replace('_', ' ')} against “${reason}”. ${g.vendorName}’s trailing rejection rate has moved, so the desk re-prices this line.`
      : `${g.grnNo} closed. ${qtyText(g.qtyReceived, g.uom)} is now usable stock and the receipt is on ${g.vendorName}’s lead-time record.`)
  }, [log, say, today])

  const reopenGrn = useCallback((row: GrnRow) => {
    dispatch({ t: 'reopen', grnId: row.grn.id })
    log({
      entity: 'grn', entityId: row.grn.grnNo, action: 'GRN reopened',
      detail: `${row.grn.itemName} · back to awaiting inspection — the earlier close stays on the trail`,
      before: 'closed', after: 'awaiting inspection',
    })
    say(`${row.grn.grnNo} is back in the queue. Nothing was sent anywhere, so there is nothing to recall.`)
  }, [log, say])

  const revise = useCallback((row: SyncRow, qty: number, promisedDate: string, reason: string) => {
    const next = I.latestRevision(row.sync).version + 1
    const prev = I.latestRevision(row.sync)
    const kind = qty !== prev.qty ? 'qty' : 'date'
    dispatch({ t: 'revise', poLineId: row.sync.poLineId, revision: {
      version: next, qty, promisedDate, changedOn: today, changedBy: 'A. Nandy · Buyer', kind, reason,
    } })
    log({
      entity: 'po_line', entityId: row.sync.poNo, action: `Order changed to v${next}`,
      detail: `${row.item.name} · the vendor has NOT been told — a change notice is drafted and waiting to be sent`,
      reason,
      before: `v${prev.version} · ${qtyText(prev.qty, row.uom)} due ${prev.promisedDate}`,
      after: `v${next} · ${qtyText(qty, row.uom)} due ${promisedDate}`,
    })
    say(`${row.sync.poNo} is now at v${next} internally. ${row.sync.vendorName} still believes ${qtyText(row.vendorKnown.value, row.uom)} — the notice is drafted for you to send.`)
  }, [log, say, today])

  const markNotified = useCallback((row: SyncRow) => {
    const v = I.latestRevision(row.sync).version
    dispatch({ t: 'notified', poLineId: row.sync.poLineId, version: v, on: today })
    log({
      entity: 'po_line', entityId: row.sync.poNo, action: `Change notice sent for v${v}`,
      detail: `${row.sync.vendorName} · sent by A. Nandy — the system drafted it and never sent anything itself (§11)`,
      before: `vendor told v${row.sync.notifiedVersion}`, after: `vendor told v${v}, awaiting acknowledgement`,
    })
    say(`Marked sent. ${row.sync.poNo} is awaiting ${row.sync.vendorName}’s acknowledgement — the cover maths still uses the old quantity until it arrives.`)
  }, [log, say, today])

  const recordAck = useCallback((row: SyncRow, ref: string) => {
    const v = I.latestRevision(row.sync).version
    dispatch({ t: 'acked', poLineId: row.sync.poLineId, version: v, on: today, ref })
    log({
      entity: 'po_line', entityId: row.sync.poNo, action: `Vendor acknowledged v${v}`,
      detail: `${row.sync.vendorName} confirmed ${qtyText(I.latestRevision(row.sync).qty, row.uom)} · ${money(row.exposure.value)} of exposure closed`,
      reason: ref,
      before: `vendor making ${qtyText(row.vendorKnown.value, row.uom)}`,
      after: `vendor making ${qtyText(I.latestRevision(row.sync).qty, row.uom)}`,
    })
    say(`${row.sync.vendorName} is now on v${v}. The inbound board and the cover figures move to the new quantity.`)
  }, [log, say, today])

  const recordReturn = useCallback((row: ChallanRow, qty: number) => {
    const c = row.challan
    const id = `GRN-R${Math.round(Math.random() * 9000 + 1000)}`
    dispatch({ t: 'addGrn', grn: {
      id, grnNo: id, itemId: c.itemId, itemName: `${c.itemName} — ${c.process.toLowerCase()}`,
      uom: c.uom, vendorName: c.jobworkerName, challanId: c.id,
      receivedOn: c.asOf, qtyReceived: qty, rate: c.rate, status: 'open',
      noSpec: checksFor(c.itemId).length === 0,
    } })
    log({
      entity: 'jobwork_challan', entityId: c.challanNo, action: 'Jobwork return booked in',
      detail: `${qtyText(qty, c.uom)} back from ${c.jobworkerName} · raised ${id} — it goes through inbound QC like any other receipt`,
      before: `${qtyText(row.acct.atVendor.value, c.uom)} with the jobworker`,
      after: `awaiting inspection on ${id}`,
    })
    say(`${id} raised for ${qtyText(qty, c.uom)}. It is not usable stock yet — it is in the receiving queue until a GRN closes on it.`)
  }, [log, say])

  const closeChallan = useCallback((row: ChallanRow, reason: string) => {
    const c = row.challan
    dispatch({ t: 'challan', id: c.id, patch: { closed: true, closedOn: c.asOf, writtenOff: row.acct.unaccounted.value } })
    log({
      entity: 'jobwork_challan', entityId: c.challanNo, action: 'Challan closed',
      detail: row.acct.unaccounted.value > 0
        ? `${c.jobworkerName} · ${qtyText(row.acct.unaccounted.value, c.uom)} written off as unaccounted — ${money(row.valueLost.value)}`
        : `${c.jobworkerName} · fully accounted, inside the allowed process loss`,
      reason,
      before: `${qtyText(row.acct.atVendor.value, c.uom)} outstanding`, after: 'closed',
    })
    say(row.acct.unaccounted.value > 0
      ? `${c.challanNo} closed with ${qtyText(row.acct.unaccounted.value, c.uom)} unaccounted — ${money(row.valueLost.value)} against your name and your reason.`
      : `${c.challanNo} closed clean. Everything that left is back or inside the allowed process loss.`)
  }, [log, say])

  const extendDue = useCallback((row: ChallanRow, date: string, reason: string) => {
    const c = row.challan
    dispatch({ t: 'challan', id: c.id, patch: { dueBack: date } })
    log({
      entity: 'jobwork_challan', entityId: c.challanNo, action: 'Return date re-agreed',
      detail: `${c.jobworkerName} · ${qtyText(row.acct.atVendor.value, c.uom)} still out`,
      reason, before: `due ${c.dueBack}`, after: `due ${date}`,
    })
    say(`${c.challanNo} re-dated to ${date}. The old date stays on the record — a re-agreed date is not the same as an on-time return.`)
  }, [log, say])

  const openGrn = useMemo(
    () => queue.find((r) => r.grn.id === state.openGrnId) ?? null, [queue, state.openGrnId],
  )
  const draftRow = useMemo(
    () => syncRows.find((r) => r.sync.poLineId === state.draftFor) ?? null, [syncRows, state.draftFor],
  )
  const chaseRow = useMemo(
    () => challanRows.find((r) => r.challan.id === state.chaseFor) ?? null, [challanRows, state.chaseFor],
  )

  const value: Ctx = {
    policy, today, grns, queue, closedRows, qcHeld,
    syncRows, exposure, outOfSync,
    challanRows, jobworkers, jobworkTotal, unaccountedTotal,
    openGrn, draftRow, chaseRow,
    mark, closeGrn, reopenGrn, revise, markNotified, recordAck, recordReturn, closeChallan, extendDue,
    openInspection: (id) => dispatch({ t: 'openGrn', id }),
    showDraft: (id) => dispatch({ t: 'draft', id }),
    showChase: (id) => dispatch({ t: 'chase', id }),
    reset: () => { dispatch({ t: 'reset' }); say('Inbound reset to the state the seed describes.') },
  }
  return <InboundCtx.Provider value={value}>{children}</InboundCtx.Provider>
}

/** A receipt with no spec on file is never blocked — it is flagged and left uninspected. */
function qcStateOf(age: number, policy: Policy, g: Grn): I.QcState {
  return checksFor(g.itemId).length === 0 && age <= policy.qcOverdueDays
    ? 'at_limit'
    : I.qcState(age, policy)
}
