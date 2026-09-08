'use client'
import { createContext, useCallback, useContext, useMemo, useReducer } from 'react'
import * as V from '@/lib/domain/inventory'
import { DEFAULT_POLICY, type Policy } from '@/lib/domain/policy'
import { money, qtyText } from '@/lib/domain/format'
import { useApp } from '@/state/app-store'
import * as S from '@/lib/seed/sourcing'
import {
  classOf, cuts as seedCuts, cycleCounts as seedCounts, ledgerLots, LEDGER_FROM,
  losses as seedLosses, movements as seedMovements, offcutBands, OPERATOR,
  RECOVERY_RATE, STOREKEEPER, TODAY_INVENTORY, isUsableRemnant, remnantQty,
  scrapRemnantQty, usableRemnantQty,
} from '@/lib/seed/inventory'
import type {
  CutRecord, CycleCount, Derived, Item, ItemClass, LossCause, LossRecord,
  StockLot, StockMovement,
} from '@/lib/domain/types'

export { TODAY_INVENTORY, LEDGER_FROM }

const itemById = (id: string): Item => S.items.find((i) => i.id === id)!
const uomOf = (i: Item) => (i.uom === 'm2' ? 'm²' : i.uom)

/* ------------------------------------------------------------------- state */

interface State {
  policy: Policy
  extraMovements: StockMovement[]
  extraCounts: CycleCount[]
  extraLosses: LossRecord[]
  extraCuts: CutRecord[]
  /** loss ids realised this session — a scrap sale */
  sold: Record<string, string>
  selectedLotId: string | null
  countingLotId: string | null
}

const initial: State = {
  policy: DEFAULT_POLICY,
  extraMovements: [], extraCounts: [], extraLosses: [], extraCuts: [],
  sold: {}, selectedLotId: null, countingLotId: null,
}

type Action =
  | { t: 'count'; count: CycleCount; movement: StockMovement; loss?: LossRecord }
  | { t: 'writeOff'; movement: StockMovement; loss: LossRecord }
  | { t: 'loss'; loss: LossRecord }
  | { t: 'cut'; cut: CutRecord; movements: StockMovement[]; losses: LossRecord[] }
  | { t: 'useRemnant'; movement: StockMovement }
  | { t: 'sell'; lossId: string; on: string }
  | { t: 'select'; id: string | null }
  | { t: 'counting'; id: string | null }
  | { t: 'reset' }

function reducer(s: State, a: Action): State {
  switch (a.t) {
    case 'count':
      return {
        ...s,
        extraCounts: [...s.extraCounts, a.count],
        extraMovements: [...s.extraMovements, a.movement],
        extraLosses: a.loss ? [...s.extraLosses, a.loss] : s.extraLosses,
        countingLotId: null,
      }
    case 'writeOff':
      return { ...s, extraMovements: [...s.extraMovements, a.movement], extraLosses: [...s.extraLosses, a.loss] }
    case 'loss':
      return { ...s, extraLosses: [...s.extraLosses, a.loss] }
    case 'cut':
      return {
        ...s,
        extraCuts: [...s.extraCuts, a.cut],
        extraMovements: [...s.extraMovements, ...a.movements],
        extraLosses: [...s.extraLosses, ...a.losses],
      }
    case 'useRemnant':
      return { ...s, extraMovements: [...s.extraMovements, a.movement] }
    case 'sell':
      return { ...s, sold: { ...s.sold, [a.lossId]: a.on } }
    case 'select': return { ...s, selectedLotId: a.id }
    case 'counting': return { ...s, countingLotId: a.id }
    case 'reset': return initial
    default: return s
  }
}

/* ----------------------------------------------------------------- derived */

export interface LotRow {
  lot: StockLot & { kind: 'lot' | 'offcut' }
  item: Item
  uom: string
  cls: ItemClass
  movements: StockMovement[]
  balance: Derived
  value: Derived
  counts: CycleCount[]
  lastConfirmed: Derived<string>
  sinceConfirmed: Derived
  stale: boolean
  /** offcut bands only */
  band?: (typeof offcutBands)[number]
  pieces?: Derived
  age?: Derived
  aged?: boolean
}

export interface CountRow {
  count: CycleCount
  item: Item
  uom: string
  cls: ItemClass
  variance: Derived
  variancePct: Derived
  overTolerance: boolean
}

export interface CutRow {
  cut: CutRecord
  item: Item
  uom: string
  balances: boolean
  yielded: Derived
  planned: Derived
  shortfall: Derived
  belowPlan: boolean
  usableRemnants: number
  scrapRemnants: number
}

export interface LossRow {
  loss: LossRecord
  item: Item
  uom: string
  rate: number
  cost: Derived
  recovery: Derived
  sold: boolean
}

export interface ScrapRow {
  item: Item
  uom: string
  cls: ItemClass
  issued: number
  lost: number
  pct: Derived
  target: number
  over: boolean
  net: Derived
}

interface Ctx {
  policy: Policy
  today: string
  lotRows: LotRow[]
  stockRows: LotRow[]
  offcutRows: LotRow[]
  countRows: CountRow[]
  cutRows: CutRow[]
  lossRows: LossRow[]
  scrapRows: ScrapRow[]
  accuracy: Derived
  staleValue: Derived
  offcutValue: Derived
  netLoss: Derived
  unrealised: Derived
  byCause: ReturnType<typeof V.lossByCause>
  selected: LotRow | null
  counting: LotRow | null
  select: (id: string | null) => void
  startCount: (id: string | null) => void
  recordCount: (row: LotRow, counted: number, note: string) => void
  writeOff: (row: LotRow, qty: number, note: string) => void
  recordLoss: (itemId: string, qty: number, cause: LossCause, workOrder: string, note: string) => void
  recordCut: (itemId: string, lotId: string, input: number, parts: number, kerf: number,
              remnantSize: number, remnantPieces: number, workOrder: string) => void
  useRemnant: (row: LotRow, qty: number, workOrder: string) => void
  /** INV-02 → SRC-01: remnants taken off the rack against an order at its approval. */
  issueRemnantToOrder: (itemId: string, qty: number, poRef: string) => void
  sellScrap: (row: LossRow) => void
  reset: () => void
}

const InvCtx = createContext<Ctx>(null!)
export const useInventory = () => useContext(InvCtx)

let seq = 0
const nextId = (p: string) => `${p}-${TODAY_INVENTORY.slice(5).replace('-', '')}${++seq}`

export function InventoryProvider({ children }: { children: React.ReactNode }) {
  const [state, dispatch] = useReducer(reducer, initial)
  const { log, say } = useApp()
  const today = TODAY_INVENTORY
  const policy = state.policy

  const movements = useMemo(
    () => [...seedMovements, ...state.extraMovements], [state.extraMovements],
  )
  const counts = useMemo(() => [...seedCounts, ...state.extraCounts], [state.extraCounts])
  const cutList = useMemo(() => [...seedCuts, ...state.extraCuts], [state.extraCuts])
  const lossList = useMemo(
    () => [...seedLosses, ...state.extraLosses].map((l) =>
      state.sold[l.id] ? { ...l, soldOn: state.sold[l.id] } : l),
    [state.extraLosses, state.sold],
  )

  /* -------------------------------------------------------------- INV-01 --- */

  const lotRows = useMemo<LotRow[]>(() => ledgerLots.map((lot) => {
    const item = itemById(lot.itemId)
    const uom = uomOf(item)
    const mine = movements.filter((m) => m.lotId === lot.id).sort((a, b) => a.on.localeCompare(b.on))
    const myCounts = counts.filter((c) => c.lotId === lot.id)
    const balance = V.lotBalance(mine, uom)
    const confirmed = V.lastConfirmed(mine, myCounts, today)
    const since = V.daysSinceConfirmed(confirmed.value, today)
    const cls = classOf(lot.itemId)
    const band = offcutBands.find((b) => b.lotId === lot.id)
    const row: LotRow = {
      lot, item, uom, cls, movements: mine, balance,
      value: V.valueAt(balance.value, item.lastPurchaseRate, uom, 'Value of this lot'),
      counts: myCounts, lastConfirmed: confirmed, sinceConfirmed: since,
      stale: V.isStale(since.value, cls, policy),
    }
    if (band) {
      row.band = band
      row.pieces = V.remnantPieces(balance.value, band.avgPieceSize)
      row.age = V.remnantAgeDays(band.oldestOn, today)
      row.aged = row.age.value > policy.remnantAgeDays
    }
    return row
  }), [movements, counts, policy, today])

  const stockRows = useMemo(() => lotRows.filter((r) => r.lot.kind === 'lot'), [lotRows])
  const offcutRows = useMemo(() => lotRows.filter((r) => r.lot.kind === 'offcut'), [lotRows])

  const countRows = useMemo<CountRow[]>(() => counts.map((c) => {
    const item = itemById(c.itemId)
    const uom = uomOf(item)
    const cls = classOf(c.itemId)
    return {
      count: c, item, uom, cls,
      variance: V.countVariance(c, uom),
      variancePct: V.countVariancePct(c),
      overTolerance: V.isCountOverTolerance(c, cls, policy),
    }
  }).sort((a, b) => b.count.on.localeCompare(a.count.on)), [counts, policy])

  const accuracy = useMemo(
    () => V.recordAccuracy(counts.map((c) => ({ count: c, cls: classOf(c.itemId) })), policy),
    [counts, policy],
  )

  const staleValue = useMemo<Derived>(() => {
    const s = stockRows.filter((r) => r.stale)
    return {
      value: Math.round(s.reduce((a, r) => a + r.value.value, 0) * 100) / 100,
      label: 'Value on an unconfirmed balance',
      formula: 'Σ (balance × last_purchase_rate) where days since confirmed > the class cadence',
      inputs: s.length
        ? s.map((r) => ({
            name: `${r.item.code} · ${r.lot.batchNo}`, value: r.value.value, unit: '₹',
            source: `${r.sinceConfirmed.value} days, class ${r.cls} wants every ${policy.countCadenceDays[r.cls]}`,
          }))
        : [{ name: 'unconfirmed lots', value: 0, source: 'every balance is inside its counting cadence' }],
      unit: '₹',
      note: 'Not stock that is wrong. Stock nobody has verified — which is the honest version of "no live visibility".',
    }
  }, [stockRows, policy])

  /* -------------------------------------------------------------- INV-02 --- */

  const cutRows = useMemo<CutRow[]>(() => cutList.map((c) => {
    const item = itemById(c.itemId)
    const shortfall = V.yieldShortfall(c)
    return {
      cut: c, item, uom: uomOf(item),
      balances: V.cutBalances(c),
      yielded: V.cutYield(c),
      planned: V.plannedYield(c),
      shortfall,
      belowPlan: shortfall.value > policy.yieldTolerancePct,
      usableRemnants: usableRemnantQty(c),
      scrapRemnants: scrapRemnantQty(c),
    }
  }).sort((a, b) => b.cut.on.localeCompare(a.cut.on)), [cutList, policy])

  const offcutValue = useMemo<Derived>(() => ({
    value: Math.round(offcutRows.reduce((a, r) => a + r.value.value, 0) * 100) / 100,
    label: 'Remnants on the rack',
    formula: 'Σ (band balance × last_purchase_rate)',
    inputs: offcutRows.map((r) => ({
      name: `${r.item.code} · ${r.band?.spec}`, value: r.value.value, unit: '₹',
      source: `${r.balance.value} ${r.uom} at ${r.band?.location}`,
    })),
    unit: '₹',
    note: 'Material already owned and already paid for. Every rupee of it is a rupee that can be spent twice by accident.',
  }), [offcutRows])

  /* -------------------------------------------------------------- INV-03 --- */

  const lossRows = useMemo<LossRow[]>(() => lossList.map((l) => {
    const item = itemById(l.itemId)
    const uom = uomOf(item)
    return {
      loss: l, item, uom, rate: item.lastPurchaseRate,
      cost: V.lossValue(l, item.lastPurchaseRate, uom),
      recovery: V.recoveryValue(l, uom),
      sold: !!l.soldOn,
    }
  }).sort((a, b) => b.loss.on.localeCompare(a.loss.on)), [lossList])

  const withRates = useMemo(
    () => lossRows.map((r) => ({ loss: r.loss, rate: r.rate })), [lossRows],
  )
  const netLoss = useMemo(() => V.netLoss(withRates), [withRates])
  const byCause = useMemo(() => V.lossByCause(withRates), [withRates])
  const unrealised = useMemo(
    () => V.unrealisedRecovery(withRates, today, policy), [withRates, today, policy],
  )

  /**
   * Scrap % per item, derived. This is what replaces §9.2's stored constant:
   * the loss ledger over the issue ledger, and it moves when a loss is recorded.
   */
  const scrapRows = useMemo<ScrapRow[]>(() => {
    const items = [...new Set(lossList.map((l) => l.itemId))]
    return items.map((itemId) => {
      const item = itemById(itemId)
      const uom = uomOf(item)
      const cls = classOf(itemId)
      const issued = movements
        .filter((m) => m.itemId === itemId && (m.kind === 'issue' || m.kind === 'jobwork_out'))
        .reduce((a, m) => a + Math.abs(m.qty), 0)
      const lost = lossList.filter((l) => l.itemId === itemId).reduce((a, l) => a + l.qty, 0)
      const pct = V.scrapPct(lost, issued, uom)
      const mine = withRates.filter((r) => r.loss.itemId === itemId)
      return {
        item, uom, cls, issued, lost, pct,
        target: policy.scrapTargetPct[cls],
        over: V.overScrapTarget(pct.value, cls, policy),
        net: V.netLoss(mine, `Net loss on ${item.code}`),
      }
    }).sort((a, b) => b.net.value - a.net.value)
  }, [lossList, movements, withRates, policy])

  /* ------------------------------------------------------------- actions --- */

  const recordCount = useCallback((row: LotRow, counted: number, note: string) => {
    const book = row.balance.value
    const variance = Math.round((counted - book) * 1000) / 1000
    const id = nextId('CC')
    const count: CycleCount = {
      id, lotId: row.lot.id, itemId: row.item.id, on: today,
      countedQty: counted, bookQty: book, counter: STOREKEEPER, note: note || undefined,
    }
    const movement: StockMovement = {
      id: nextId('MV'), lotId: row.lot.id, itemId: row.item.id, on: today,
      kind: 'count_adjust', qty: variance, source: 'count', sourceRef: id,
      note: note || undefined, actor: STOREKEEPER,
    }
    // A shortage is a loss with a cause; a surplus is a book error, not a loss.
    const loss: LossRecord | undefined = variance < 0 ? {
      id: nextId('LS'), on: today, itemId: row.item.id, lotId: row.lot.id,
      qty: Math.abs(variance), cause: 'count_shortage', source: 'count', sourceRef: id,
      recoveryRate: 0, actor: STOREKEEPER,
    } : undefined

    dispatch({ t: 'count', count, movement, loss })
    log({
      entity: 'cycle_count', entityId: id, action: 'Cycle count posted',
      detail: `${row.item.code} · ${row.lot.batchNo} · counted ${qtyText(counted, row.uom)} against a book of ${qtyText(book, row.uom)}` +
        (variance === 0 ? ' · agreed' : ` · ${variance > 0 ? 'surplus' : 'shortage'} of ${qtyText(Math.abs(variance), row.uom)}`),
      reason: note || undefined,
      before: `book ${qtyText(book, row.uom)}`, after: `book ${qtyText(counted, row.uom)}`,
    })
    say(variance === 0
      ? `${row.item.code} counted and agreed. The balance is confirmed as of today, so it is no longer running on trust.`
      : `${row.item.code}: a ${variance > 0 ? 'surplus' : 'shortage'} of ${qtyText(Math.abs(variance), row.uom)} posted as an adjustment. The old balance stays on the ledger — the book was wrong, and it now says so.`)
  }, [log, say, today])

  const writeOff = useCallback((row: LotRow, qty: number, note: string) => {
    const lossId = nextId('LS')
    const movement: StockMovement = {
      id: nextId('MV'), lotId: row.lot.id, itemId: row.item.id, on: today,
      kind: 'write_off', qty: -qty, source: 'loss', sourceRef: lossId,
      note, actor: STOREKEEPER,
    }
    const loss: LossRecord = {
      id: lossId, on: today, itemId: row.item.id, lotId: row.lot.id, qty,
      cause: 'store_spoilage', source: 'loss', sourceRef: row.lot.batchNo,
      recoveryRate: RECOVERY_RATE[row.item.id] ?? 0, actor: STOREKEEPER,
    }
    dispatch({ t: 'writeOff', movement, loss })
    const recov = qty * (RECOVERY_RATE[row.item.id] ?? 0)
    log({
      entity: 'stock_lot', entityId: row.lot.batchNo, action: 'Stock written off',
      detail: `${row.item.code} · ${qtyText(qty, row.uom)} · ${money(qty * row.item.lastPurchaseRate)} at cost` +
        (recov > 0 ? ` · ${money(recov)} recoverable as scrap` : ' · nothing recoverable'),
      reason: note,
      before: qtyText(row.balance.value, row.uom), after: qtyText(row.balance.value - qty, row.uom),
    })
    say(`${qtyText(qty, row.uom)} of ${row.item.code} written off against your reason. It leaves the balance and lands on the loss ledger as spoilage in store — ${recov > 0 ? `${money(recov)} of it is recoverable` : 'none of it is recoverable'}.`)
  }, [log, say, today])

  const recordLoss = useCallback((itemId: string, qty: number, cause: LossCause, workOrder: string, note: string) => {
    const item = itemById(itemId)
    const id = nextId('LS')
    const loss: LossRecord = {
      id, on: today, itemId, qty, cause, source: 'job', sourceRef: workOrder || 'floor entry',
      workOrder: workOrder || undefined, recoveryRate: RECOVERY_RATE[itemId] ?? 0,
      actor: 'R. Mehta · Production',
    }
    dispatch({ t: 'loss', loss })
    log({
      entity: 'loss_record', entityId: id, action: 'Wastage recorded',
      detail: `${item.code} · ${qtyText(qty, uomOf(item))} · ${V.LOSS_LABEL[cause]}` +
        (workOrder ? ` · ${workOrder}` : '') + ` · ${money(qty * item.lastPurchaseRate)} at cost`,
      reason: note || undefined,
    })
    say(`Recorded. ${item.code}'s scrap percentage has moved — it is computed from this ledger, not stored, so Line Watch shows the new figure straight away.`)
  }, [log, say, today])

  const recordCut = useCallback((
    itemId: string, lotId: string, input: number, parts: number, kerf: number,
    remnantSize: number, pieces: number, workOrder: string,
  ) => {
    const item = itemById(itemId)
    const uom = uomOf(item)
    const id = nextId('CUT')
    const remnants = pieces > 0 ? [{ size: remnantSize, pieces, spec: `${remnantSize} ${uom} pieces` }] : []
    const cut: CutRecord = {
      id, cutNo: id, on: today, itemId, lotId, workOrder: workOrder || 'floor entry',
      inputQty: input, plannedPartsQty: parts, partsQty: parts, partsCount: 0,
      kerfQty: kerf, remnants, operator: OPERATOR,
    }
    const usable = usableRemnantQty(cut)
    const scrap = scrapRemnantQty(cut)
    const band = offcutBands.find((b) => b.itemId === itemId)

    const mv: StockMovement[] = [{
      id: nextId('MV'), lotId, itemId, on: today, kind: 'issue', qty: -input,
      source: 'cut', sourceRef: id, actor: OPERATOR,
    }]
    if (usable > 0 && band) mv.push({
      id: nextId('MV'), lotId: band.lotId, itemId, on: today, kind: 'offcut_in', qty: usable,
      source: 'cut', sourceRef: id, actor: OPERATOR,
    })

    const ls: LossRecord[] = []
    if (kerf > 0) ls.push({
      id: nextId('LS'), on: today, itemId, lotId, qty: kerf, cause: 'cut_kerf',
      source: 'cut', sourceRef: id, workOrder: workOrder || undefined, recoveryRate: 0, actor: OPERATOR,
    })
    if (scrap > 0) ls.push({
      id: nextId('LS'), on: today, itemId, lotId, qty: scrap, cause: 'cut_offcut_scrap',
      source: 'cut', sourceRef: id, workOrder: workOrder || undefined,
      recoveryRate: RECOVERY_RATE[itemId] ?? 0, actor: OPERATOR,
    })

    dispatch({ t: 'cut', cut, movements: mv, losses: ls })
    log({
      entity: 'cut_record', entityId: id, action: 'Cut recorded',
      detail: `${item.code} · ${qtyText(input, uom)} in → ${qtyText(parts, uom)} parts, ` +
        `${qtyText(usable, uom)} to the offcut register, ${qtyText(kerf + scrap, uom)} lost` +
        (workOrder ? ` · ${workOrder}` : ''),
      before: 'material in the lot', after: 'parts, remnants and a measured loss',
    })
    say(usable > 0
      ? `Cut recorded. ${qtyText(usable, uom)} went to the offcut register as usable stock instead of the scrap bin — worth ${money(usable * item.lastPurchaseRate)} next time this item is short.`
      : `Cut recorded. Nothing made the usable minimum, so the remnants went to the loss ledger as scrap at the cut.`)
  }, [log, say, today])

  const useRemnant = useCallback((row: LotRow, qty: number, workOrder: string) => {
    const movement: StockMovement = {
      id: nextId('MV'), lotId: row.lot.id, itemId: row.item.id, on: today,
      kind: 'offcut_issue', qty: -qty, source: 'job', sourceRef: workOrder || 'floor entry',
      note: 'Cut from remnants instead of drawing full stock', actor: STOREKEEPER,
    }
    dispatch({ t: 'useRemnant', movement })
    log({
      entity: 'stock_lot', entityId: row.lot.batchNo, action: 'Remnant used instead of full stock',
      detail: `${row.item.code} · ${qtyText(qty, row.uom)} from ${row.band?.location} · ` +
        `${money(qty * row.item.lastPurchaseRate)} of material not bought again`,
      before: qtyText(row.balance.value, row.uom), after: qtyText(row.balance.value - qty, row.uom),
    })
    say(`${qtyText(qty, row.uom)} taken off ${row.band?.location}. That is ${money(qty * row.item.lastPurchaseRate)} of material already owned, used instead of bought.`)
  }, [log, say, today])

  const issueRemnantToOrder = useCallback((itemId: string, qty: number, poRef: string) => {
    const band = offcutBands.find((b) => b.itemId === itemId)
    if (!band || qty <= 0) return
    const item = itemById(itemId)
    const uom = uomOf(item)
    dispatch({ t: 'useRemnant', movement: {
      id: nextId('MV'), lotId: band.lotId, itemId, on: today, kind: 'offcut_issue', qty: -qty,
      source: 'job', sourceRef: poRef,
      note: 'Netted off at the approval — cut from remnants instead of ordering it again',
      actor: STOREKEEPER,
    } })
    log({
      entity: 'stock_lot', entityId: band.batchNo, action: 'Remnants committed to an order',
      detail: `${item.code} · ${qtyText(qty, uom)} off ${band.location} against ${poRef} · ` +
        `${money(qty * item.lastPurchaseRate)} of material the desk will not buy again`,
      before: 'on the rack, invisible to the buyer', after: `committed to ${poRef}`,
    })
  }, [log, today])

  const sellScrap = useCallback((row: LossRow) => {
    dispatch({ t: 'sell', lossId: row.loss.id, on: today })
    log({
      entity: 'loss_record', entityId: row.loss.id, action: 'Scrap sold',
      detail: `${row.item.code} · ${qtyText(row.loss.qty, row.uom)} · ${money(row.recovery.value)} realised against a cost of ${money(row.cost.value)}`,
      before: 'in the bin', after: `sold ${today}`,
    })
    say(`${money(row.recovery.value)} recovered. The net loss figure moves, because net loss is what it cost less what came back.`)
  }, [log, say, today])

  const selected = useMemo(
    () => lotRows.find((r) => r.lot.id === state.selectedLotId) ?? null,
    [lotRows, state.selectedLotId],
  )
  const counting = useMemo(
    () => lotRows.find((r) => r.lot.id === state.countingLotId) ?? null,
    [lotRows, state.countingLotId],
  )

  const value: Ctx = {
    policy, today, lotRows, stockRows, offcutRows, countRows, cutRows, lossRows, scrapRows,
    accuracy, staleValue, offcutValue, netLoss, unrealised, byCause, selected, counting,
    select: (id) => dispatch({ t: 'select', id }),
    startCount: (id) => dispatch({ t: 'counting', id }),
    recordCount, writeOff, recordLoss, recordCut, useRemnant, issueRemnantToOrder, sellScrap,
    reset: () => { dispatch({ t: 'reset' }); say('Inventory reset to the state the ledger seed describes.') },
  }
  return <InvCtx.Provider value={value}>{children}</InvCtx.Provider>
}

/** Re-exported so the pages can name the minimum without importing the seed twice. */
export { isUsableRemnant, remnantQty }
