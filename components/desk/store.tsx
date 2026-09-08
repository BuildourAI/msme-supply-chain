'use client'
import { createContext, useCallback, useContext, useMemo, useReducer } from 'react'
import { buildRows, deskKpis, needsDecision, type DerivedRow, type SeedBundle } from '@/lib/domain/derive'
import { DEFAULT_POLICY, type Policy } from '@/lib/domain/policy'
import * as S from '@/lib/seed/sourcing'
import { reviewQueue, seededAliases, supplierDocuments } from '@/lib/seed/intake'
import { useApp } from '@/state/app-store'
import { money } from '@/lib/domain/format'
import type { BuyerStatus, Decision } from '@/lib/domain/types'

export const SEED: SeedBundle = {
  today: S.TODAY_SOURCING,
  items: S.items, vendors: S.vendors, vendorItems: S.vendorItems,
  stockLots: S.stockLots, poLines: S.poLines, receipts: S.receipts,
}

export type ViewMode = 'summary' | 'detail'
export type SortCol = 'code' | 'position' | 'cover' | 'reorder' | 'value' | 'status'

/**
 * §7 snapshot rule: a suggestion freezes the figures it was decided on. A later
 * policy or rate change must never alter an approved line, so the decision
 * carries the numbers as they stood, and the row renders from them thereafter.
 */
export type RowSnapshot = Pick<DerivedRow,
  'reorderQty' | 'poCost' | 'shipmentCost' | 'otherCosts' | 'landedTotal' |
  'coverageAfterMonths' | 'held' | 'chosen' | 'chosenVendorId' | 'estimatedArrival' | 'orderBy'>

export interface DecisionRecord {
  decision: Decision; reason?: string; vendorName: string; decidedAt: string; snapshot: RowSnapshot
}

interface State {
  selectedId: string
  overrides: Record<string, string>
  decisions: Record<string, DecisionRecord>
  view: ViewMode
  sort: { col: SortCol; dir: 'asc' | 'desc' }
  query: string
  statusFilter: BuyerStatus | 'needs_decision' | 'all'
  policy: Policy
  intake: Record<string, 'pending' | 'confirmed' | 'rejected'>
  aliases: typeof seededAliases
}

type Action =
  | { t: 'select'; id: string }
  | { t: 'vendor'; id: string; vendorId: string }
  | { t: 'decide'; id: string; record: DecisionRecord }
  | { t: 'undecide'; id: string }
  | { t: 'view'; view: ViewMode }
  | { t: 'sort'; col: SortCol }
  | { t: 'query'; q: string }
  | { t: 'filter'; f: State['statusFilter'] }
  | { t: 'policy'; patch: Partial<Policy> }
  | { t: 'intake'; lineId: string; status: 'confirmed' | 'rejected'; alias?: typeof seededAliases[number] }
  | { t: 'reset' }

const initial: State = {
  selectedId: 'EL-TUB-INC85',
  overrides: {}, decisions: {}, view: 'summary',
  sort: { col: 'status', dir: 'asc' }, query: '', statusFilter: 'all',
  policy: DEFAULT_POLICY,
  intake: Object.fromEntries(reviewQueue.map((l) => [l.id, 'pending' as const])),
  aliases: seededAliases,
}

function reducer(s: State, a: Action): State {
  switch (a.t) {
    case 'select': return { ...s, selectedId: a.id }
    case 'vendor': return { ...s, overrides: { ...s.overrides, [a.id]: a.vendorId } }
    case 'decide':
      return { ...s, decisions: { ...s.decisions, [a.id]: a.record } }
    case 'undecide': {
      const { [a.id]: _gone, ...rest } = s.decisions
      return { ...s, decisions: rest }
    }
    case 'view': return { ...s, view: a.view }
    case 'sort':
      return { ...s, sort: { col: a.col, dir: s.sort.col === a.col && s.sort.dir === 'asc' ? 'desc' : 'asc' } }
    case 'query': return { ...s, query: a.q }
    case 'filter': return { ...s, statusFilter: a.f }
    case 'policy': return { ...s, policy: { ...s.policy, ...a.patch } }
    case 'intake':
      return {
        ...s,
        intake: { ...s.intake, [a.lineId]: a.status },
        aliases: a.alias ? [a.alias, ...s.aliases] : s.aliases,
      }
    case 'reset': return { ...initial, policy: DEFAULT_POLICY }
    default: return s
  }
}

const STATUS_RANK: Record<BuyerStatus, number> = {
  at_risk: 0, at_risk_late: 1, open_po_covers: 2, covered: 3,
}

export interface IntakeCounts { total: number; auto: number; review: number; escalated: number }

interface Ctx {
  state: State
  rows: DerivedRow[]
  intakeCounts: IntakeCounts
  visible: DerivedRow[]
  selected: DerivedRow
  kpis: ReturnType<typeof deskKpis>
  select: (id: string) => void
  chooseVendor: (row: DerivedRow, vendorId: string) => void
  decide: (row: DerivedRow, decision: Decision, reason?: string) => void
  /** §11 — every automated action reversible. Reverses a decision and says so in the log. */
  undo: (row: DerivedRow) => void
  setView: (v: ViewMode) => void
  toggleSort: (c: SortCol) => void
  setQuery: (q: string) => void
  setFilter: (f: State['statusFilter']) => void
  setPolicy: (p: Partial<Policy>) => void
  reviewIntake: (lineId: string, status: 'confirmed' | 'rejected') => void
  reset: () => void
}

const DeskCtx = createContext<Ctx>(null!)
export const useDesk = () => useContext(DeskCtx)

export function DeskProvider({ children }: { children: React.ReactNode }) {
  const [state, dispatch] = useReducer(reducer, initial)
  const { log, say } = useApp()

  // Rows are derived, never stored. Changing a vendor or a policy knob recomputes
  // the whole run from the seed — which is what makes every figure inspectable.
  // A decided line is the exception by design (§7): it keeps the figures it was
  // decided on, whatever the knobs do afterwards.
  const rows = useMemo(() => {
    const live = buildRows(SEED, state.policy, state.overrides)
    return live.map((r) => {
      const d = state.decisions[r.item.id]
      return d ? { ...r, ...d.snapshot } : r
    })
  }, [state.policy, state.overrides, state.decisions])

  // §8.2 — counts come from document status, never by subtraction: a rejected
  // line is escalated to a person, it does not become "auto-filed".
  const intakeCounts = useMemo<IntakeCounts>(() => {
    const review = reviewQueue.filter((l) => state.intake[l.id] === 'pending').length
    const confirmed = reviewQueue.filter((l) => state.intake[l.id] === 'confirmed').length
    const escalated = reviewQueue.filter((l) => state.intake[l.id] === 'rejected').length
    const autoDocs = supplierDocuments.filter((d) => d.status === 'auto').length
    return { total: supplierDocuments.length, auto: autoDocs + confirmed, review, escalated }
  }, [state.intake])

  // KPIs are computed over ALL rows, never the filtered view: filtering the table
  // must not change "4 lines need a decision" or the numbers stop meaning anything.
  const kpis = useMemo(() => deskKpis(rows), [rows])

  const visible = useMemo(() => {
    const q = state.query.trim().toLowerCase()
    let out = rows.filter((r) => {
      if (q && !`${r.item.code} ${r.item.name} ${r.chosen.vendor.name}`.toLowerCase().includes(q)) return false
      if (state.statusFilter === 'all') return true
      if (state.statusFilter === 'needs_decision') return needsDecision(r)
      return r.status.value === state.statusFilter
    })
    const { col, dir } = state.sort
    const key = (r: DerivedRow) => ({
      code: r.item.code, position: r.truePosition.value / Math.max(r.reorderPoint.value, 0.0001),
      cover: r.coverDays.value, reorder: r.reorderQty.value,
      value: r.landedTotal.value, status: STATUS_RANK[r.status.value],
    })[col]
    out = [...out].sort((a, b) => {
      const ka = key(a), kb = key(b)
      const c = typeof ka === 'string' ? ka.localeCompare(kb as string) : (ka as number) - (kb as number)
      return dir === 'asc' ? c : -c
    })
    return out
  }, [rows, state.query, state.statusFilter, state.sort])

  const selected = useMemo(
    () => rows.find((r) => r.item.id === state.selectedId) ?? rows[0],
    [rows, state.selectedId],
  )

  const select = useCallback((id: string) => dispatch({ t: 'select', id }), [])

  const chooseVendor = useCallback((row: DerivedRow, vendorId: string) => {
    const to = row.quotes.find((q) => q.vendor.id === vendorId)!
    dispatch({ t: 'vendor', id: row.item.id, vendorId })
    const premium = to.landedPerUnit.value - row.quotes[0].landedPerUnit.value
    log({
      entity: 'reorder_suggestion', entityId: row.item.code, action: 'Supplier changed',
      detail: `${row.item.code}` +
        (premium > 0 ? ` · ${money(premium, 2)}/unit above the recommendation` : ' · at or below the recommendation') +
        (to.vendorItem.rate > row.item.lastPurchaseRate ? ` · rate above last purchase price ${money(row.item.lastPurchaseRate, 2)} — needs sign-off (§11)` : ''),
      before: `${row.chosen.vendor.name} · ${money(row.landedTotal.value)}`,
      after: `${to.vendor.name} · ${money(row.reorderQty.value * to.landedPerUnit.value)}`,
    })
    say(`Supplier for ${row.item.code} set to ${to.vendor.name}. The line has been re-priced and the choice logged against you.`)
  }, [log, say])

  const decide = useCallback((row: DerivedRow, decision: Decision, reason?: string) => {
    const snapshot: RowSnapshot = {
      reorderQty: row.reorderQty, poCost: row.poCost, shipmentCost: row.shipmentCost,
      otherCosts: row.otherCosts, landedTotal: row.landedTotal,
      coverageAfterMonths: row.coverageAfterMonths, held: row.held, chosen: row.chosen,
      chosenVendorId: row.chosenVendorId, estimatedArrival: row.estimatedArrival, orderBy: row.orderBy,
    }
    dispatch({ t: 'decide', id: row.item.id, record: {
      decision, reason, vendorName: row.chosen.vendor.name,
      decidedAt: new Date().toISOString(), snapshot,
    } })
    const verb: Record<string, string> = {
      approved: 'Draft PO raised', held: 'Held', overridden: 'Guardrail overridden',
      expedited: 'Expedite requested', deferred: 'Deferred',
    }
    const flags = [
      row.aboveLastPurchase.value ? 'rate above last purchase price' : '',
      row.needsOwnerSignoff.value ? `above the owner’s ₹${(state.policy.ownerApprovalThreshold / 100000).toFixed(1)} L threshold — owner must sign off` : '',
    ].filter(Boolean).join(' · ')
    log({
      entity: 'reorder_suggestion', entityId: row.item.code,
      action: verb[decision] ?? decision, reason,
      detail: `${row.item.code} · ${row.chosen.vendor.name} · ${money(row.landedTotal.value)}${flags ? ' · ' + flags : ''}`,
      before: 'pending', after: decision,
    })
    const msg: Record<string, string> = {
      approved: `Draft PO prepared for ${row.chosen.vendor.name}. Nothing has been sent — the system never places an order.`,
      held: `${row.item.code} held. It stays on the desk until someone releases it.`,
      overridden: `Override recorded against you, with your reason. ${row.item.code} is released past the coverage ceiling.`,
      expedited: `Expedite drafted for ${row.inboundRefs[0] ?? 'the open order'}. This is a timing problem, so no new purchase was raised.`,
      deferred: `${row.item.code} set aside. It will be raised again on the next run.`,
    }
    say(msg[decision] ?? 'Recorded.')
  }, [log, say, state.policy.ownerApprovalThreshold])

  const undo = useCallback((row: DerivedRow) => {
    const prev = state.decisions[row.item.id]
    dispatch({ t: 'undecide', id: row.item.id })
    log({
      entity: 'reorder_suggestion', entityId: row.item.code, action: 'Decision reversed',
      detail: `${row.item.code} · back to pending — the earlier entry stays on the trail`,
      before: prev?.decision ?? '—', after: 'pending',
    })
    say(`${row.item.code} is back on the desk. Nothing was sent, so there is nothing to recall.`)
  }, [log, say, state.decisions])

  const reviewIntake = useCallback((lineId: string, status: 'confirmed' | 'rejected') => {
    const line = reviewQueue.find((l) => l.id === lineId)!
    const alias = status === 'confirmed'
      ? { itemId: line.suggestedItemId, vendorName: line.vendorName, rawText: line.rawItemText,
          confirmedBy: 'A. Nandy · Buyer', confirmedAt: SEED.today }
      : undefined
    dispatch({ t: 'intake', lineId, status, alias })
    log({
      entity: 'supplier_doc_line', entityId: lineId,
      action: status === 'confirmed' ? 'Item mapping confirmed' : 'Item mapping rejected',
      detail: status === 'confirmed'
        ? `“${line.rawItemText}” from ${line.vendorName} now resolves to ${line.suggestedItemId}`
        : `“${line.rawItemText}” rejected — escalated to a human rather than guessed`,
    })
    say(status === 'confirmed'
      ? `Mapped. ${line.vendorName}’s spelling will resolve to ${line.suggestedItemId} automatically from now on.`
      : `Rejected and escalated. The system does not guess at an unmatched supplier item.`)
  }, [log, say])

  const value: Ctx = {
    state, rows, visible, selected, kpis, intakeCounts, select, chooseVendor, decide, undo, reviewIntake,
    setView: (v) => dispatch({ t: 'view', view: v }),
    toggleSort: (c) => dispatch({ t: 'sort', col: c }),
    setQuery: (q) => dispatch({ t: 'query', q }),
    setFilter: (f) => dispatch({ t: 'filter', f }),
    setPolicy: (p) => {
      dispatch({ t: 'policy', patch: p })
      log({ entity: 'policy', entityId: 'run', action: 'Policy changed', detail: JSON.stringify(p) })
    },
    reset: () => { dispatch({ t: 'reset' }); say('Demo reset to the state §9.1 describes.') },
  }
  return <DeskCtx.Provider value={value}>{children}</DeskCtx.Provider>
}
