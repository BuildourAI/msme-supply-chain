/**
 * The three Inventory systems, as formulas.
 *
 * INV-01 · stock ledger & cycle count — a quantity is a balance, not a number
 * INV-02 · cutting yield & offcuts    — a remnant is stock, not a side list
 * INV-03 · wastage & loss ledger      — every loss has a cause and a rupee value
 *
 * Same contract as calc.ts: pure functions returning Derived<T>, so every figure
 * on the three screens opens into the arithmetic that made it (CONTEXT rule 1).
 */
import { daysBetween, round } from './calc'
import type { Policy } from './policy'
import type {
  CutRecord, CycleCount, Derived, DerivationInput, ItemClass, LossCause,
  LossRecord, StockMovement,
} from './types'

const D = <T>(
  value: T, label: string, formula: string, inputs: DerivationInput[],
  extra: { note?: string; unit?: string } = {},
): Derived<T> => ({ value, label, formula, inputs, ...extra })

const q = (n: number) => round(n, 3)

/* ========================================================================== */
/* INV-01 · the stock ledger                                                  */
/* ========================================================================== */

export const MOVEMENT_LABEL: Record<StockMovement['kind'], string> = {
  opening: 'Opening balance',
  receipt: 'Received',
  issue: 'Issued',
  jobwork_out: 'Out to jobwork',
  jobwork_return: 'Back from jobwork',
  offcut_in: 'Remnant added',
  offcut_issue: 'Remnant used',
  write_off: 'Written off',
  count_adjust: 'Count adjustment',
}

export const SOURCE_LABEL: Record<StockMovement['source'], string> = {
  opening: 'ledger opening', grn: 'goods receipt', job: 'work order',
  cut: 'cut record', challan: 'jobwork challan', count: 'cycle count', loss: 'loss record',
}

/**
 * The balance. This is the whole of INV-01: a lot quantity is not stored
 * anywhere, it is the sum of its movements, and every movement names the
 * document that caused it.
 */
export function lotBalance(movements: StockMovement[], uom: string): Derived {
  const v = movements.reduce((a, m) => a + m.qty, 0)
  return D(
    q(v),
    'Balance on hand',
    'Σ movement.qty — opening balance plus every document since',
    movements.map((m) => ({
      name: `${m.on} · ${MOVEMENT_LABEL[m.kind]}`,
      value: q(m.qty), unit: uom,
      source: m.kind === 'opening' ? 'ledger opening' : `${SOURCE_LABEL[m.source]} ${m.sourceRef}`,
    })),
    { unit: uom, note: 'Not a typed number. Every change is a document, and every document is on this list.' },
  )
}

/** When a person or a document last confirmed this balance was real. */
export function lastConfirmed(movements: StockMovement[], counts: CycleCount[], today: string): Derived<string> {
  const lastCount = counts.map((c) => c.on).sort().pop()
  const lastMove = movements.filter((m) => m.kind !== 'opening').map((m) => m.on).sort().pop()
  const on = [lastCount, lastMove].filter(Boolean).sort().pop() ?? movements[0]?.on ?? today
  return D(
    on,
    'Last confirmed',
    'the later of the last cycle count and the last posted movement',
    [
      { name: 'last cycle count', value: lastCount ?? 'never counted', source: lastCount ? 'a person on the rack' : 'no count on file' },
      { name: 'last movement', value: lastMove ?? 'nothing since opening' },
    ],
    { note: 'A balance nobody has touched or counted is not wrong — it is unverified, which is a different thing and worth showing.' },
  )
}

export function daysSinceConfirmed(on: string, today: string): Derived {
  return D(
    daysBetween(on, today),
    'Days since the balance was confirmed',
    'today − last_confirmed',
    [{ name: 'last_confirmed', value: on }, { name: 'today', value: today }],
    { unit: 'days' },
  )
}

/** Past the class cadence, the balance is stale — the invisible problem, made visible. */
export function isStale(days: number, cls: ItemClass, policy: Policy): boolean {
  return days > policy.countCadenceDays[cls]
}

export function countVariance(c: CycleCount, uom: string): Derived {
  return D(
    q(c.countedQty - c.bookQty),
    'Count variance',
    'counted_qty − book_qty',
    [
      { name: 'counted_qty', value: c.countedQty, unit: uom, source: `${c.counter}, ${c.on}` },
      { name: 'book_qty', value: c.bookQty, unit: uom, source: 'the ledger at that moment' },
    ],
    { unit: uom, note: 'Posted as a signed movement, never written over the balance. The book was wrong, and the history says so.' },
  )
}

export function countVariancePct(c: CycleCount): Derived {
  const pct = c.bookQty === 0 ? 0 : ((c.countedQty - c.bookQty) / c.bookQty) * 100
  return D(
    round(pct, 2),
    'Variance against book',
    '(counted_qty − book_qty) ÷ book_qty × 100',
    [
      { name: 'counted_qty', value: c.countedQty },
      { name: 'book_qty', value: c.bookQty },
    ],
    { unit: '%' },
  )
}

export function isCountOverTolerance(c: CycleCount, cls: ItemClass, policy: Policy): boolean {
  const pct = c.bookQty === 0 ? 0 : Math.abs((c.countedQty - c.bookQty) / c.bookQty) * 100
  return pct > policy.countTolerancePct[cls]
}

/**
 * Record accuracy — the number that answers "can I trust the stock screen".
 * Counts inside their class tolerance, over the counts on file.
 */
export function recordAccuracy(
  rows: { count: CycleCount; cls: ItemClass }[], policy: Policy,
): Derived {
  const inTol = rows.filter((r) => !isCountOverTolerance(r.count, r.cls, policy))
  return D(
    rows.length === 0 ? 0 : round((inTol.length / rows.length) * 100, 1),
    'Record accuracy',
    'counts inside class tolerance ÷ counts taken × 100',
    rows.length
      ? rows.map((r) => ({
          name: `${r.count.id} · ${r.count.itemId}`,
          value: `${round(r.count.countedQty - r.count.bookQty, 3)} against ${r.count.bookQty}`,
          source: isCountOverTolerance(r.count, r.cls, policy)
            ? `outside the ${policy.countTolerancePct[r.cls]}% tolerance for class ${r.cls}`
            : `inside the ${policy.countTolerancePct[r.cls]}% tolerance for class ${r.cls}`,
        }))
      : [{ name: 'counts', value: 0, source: 'nothing has been counted yet' }],
    { unit: '%', note: 'Not "is the stock right" — "how often is the book right when someone checks". They are different questions and only one is answerable.' },
  )
}

export function valueAt(qty: number, rate: number, uom: string, label: string): Derived {
  return D(
    round(qty * rate, 2), label, 'qty × last_purchase_rate',
    [
      { name: 'qty', value: q(qty), unit: uom },
      { name: 'last_purchase_rate', value: rate, unit: `₹/${uom}`, source: 'last purchase price, ex-freight (§13-1)' },
    ],
    { unit: '₹' },
  )
}

/* ========================================================================== */
/* INV-02 · cutting yield & the offcut register                               */
/* ========================================================================== */

/** The identity that makes a cut record trustworthy. Asserted on every one. */
export function cutBalances(c: CutRecord): boolean {
  const sum = c.partsQty + c.kerfQty + c.remnants.reduce((a, r) => a + r.size * r.pieces, 0)
  return Math.abs(sum - c.inputQty) < 1e-6
}

export function cutYield(c: CutRecord): Derived {
  return D(
    c.inputQty === 0 ? 0 : round((c.partsQty / c.inputQty) * 100, 2),
    'Cutting yield',
    'parts_qty ÷ input_qty × 100',
    [
      { name: 'parts_qty', value: c.partsQty, source: `${c.partsCount} pieces` },
      { name: 'input_qty', value: c.inputQty, source: `lot ${c.lotId}` },
    ],
    { unit: '%' },
  )
}

export function plannedYield(c: CutRecord): Derived {
  return D(
    c.inputQty === 0 ? 0 : round((c.plannedPartsQty / c.inputQty) * 100, 2),
    'Yield the nest planned for',
    'planned_parts_qty ÷ input_qty × 100',
    [
      { name: 'planned_parts_qty', value: c.plannedPartsQty, source: 'the nest as drawn' },
      { name: 'input_qty', value: c.inputQty },
    ],
    { unit: '%' },
  )
}

export function yieldShortfall(c: CutRecord): Derived {
  const actual = c.inputQty === 0 ? 0 : (c.partsQty / c.inputQty) * 100
  const planned = c.inputQty === 0 ? 0 : (c.plannedPartsQty / c.inputQty) * 100
  return D(
    round(planned - actual, 2),
    'Below the nest plan',
    'planned_yield − actual_yield',
    [
      { name: 'planned_yield', value: `${round(planned, 2)}%` },
      { name: 'actual_yield', value: `${round(actual, 2)}%` },
    ],
    { unit: '%', note: 'Positive means the cut gave back less than the nest said it would. That is a nesting question, not a buying one.' },
  )
}

/** Pieces are derived from the band's ordinary size, never stored twice. */
export function remnantPieces(qty: number, avgPieceSize: number): Derived {
  return D(
    avgPieceSize === 0 ? 0 : Math.round(qty / avgPieceSize),
    'Pieces in this band',
    'balance ÷ ordinary piece size',
    [
      { name: 'balance', value: q(qty) },
      { name: 'ordinary piece size', value: avgPieceSize, source: 'the usual size in this band — invented, since §9.1 records the band not the pieces' },
    ],
    { note: 'Approximate by construction. A band holds pieces of different sizes; this is how many of the usual size it comes to.' },
  )
}

/**
 * The whole point of the register: a need that a remnant already on the rack can
 * cover, netted off before anything is bought. This is unnecessary repurchase
 * caught at the moment it would happen.
 */
export function remnantMatch(
  needQty: number, remnantQty: number, rate: number, uom: string,
): Derived {
  const covered = Math.min(needQty, remnantQty)
  return D(
    round(covered * rate, 2),
    'Repurchase avoided',
    'min(quantity needed, remnants on hand) × last_purchase_rate',
    [
      { name: 'quantity needed', value: q(needQty), unit: uom, source: 'the reorder suggestion on the desk' },
      { name: 'remnants on hand', value: q(remnantQty), unit: uom, source: 'the offcut register' },
      { name: 'covered', value: q(covered), unit: uom },
    ],
    { unit: '₹', note: 'Material already owned, already paid for, and about to be bought a second time.' },
  )
}

export function remnantAgeDays(oldestOn: string, today: string): Derived {
  return D(
    daysBetween(oldestOn, today),
    'Age of the oldest piece',
    'today − oldest_piece_date',
    [{ name: 'oldest_piece_date', value: oldestOn }, { name: 'today', value: today }],
    { unit: 'days', note: 'A remnant nobody has used in a long time is a candidate to scrap or downgrade — offered, never scrapped automatically.' },
  )
}

/* ========================================================================== */
/* INV-03 · the wastage & loss ledger                                         */
/* ========================================================================== */

export const LOSS_LABEL: Record<LossCause, string> = {
  cut_kerf: 'Cutting kerf',
  cut_offcut_scrap: 'Offcut below usable size',
  process_scrap: 'Process scrap on the floor',
  store_spoilage: 'Spoilage in store',
  jobwork_loss: 'Consumed at a jobworker',
  count_shortage: 'Count shortage',
  grn_rejection: 'Rejected at the gate and scrapped',
}

/**
 * Causes whose quantity is carried by their own movement. The rest are named
 * components of a movement already posted — the kerf inside a cut's issue, the
 * spoilage inside an issue to a job — so the two ledgers never double-count.
 */
export const CAUSE_MOVES_STOCK: Record<LossCause, boolean> = {
  cut_kerf: false, cut_offcut_scrap: false, process_scrap: false,
  store_spoilage: true, jobwork_loss: false, count_shortage: true, grn_rejection: true,
}

/** What the material cost us, at the one valuation basis used everywhere. */
export function lossValue(l: LossRecord, rate: number, uom: string): Derived {
  return D(
    round(l.qty * rate, 2),
    'What this loss cost',
    'qty × last_purchase_rate',
    [
      { name: 'qty', value: q(l.qty), unit: uom, source: `${LOSS_LABEL[l.cause]} · ${l.sourceRef}` },
      { name: 'last_purchase_rate', value: rate, unit: `₹/${uom}` },
    ],
    { unit: '₹' },
  )
}

/**
 * What the scrap is EXPECTED to sell for. Fired ceramic and ruined powder are
 * worth nothing. This is the figure booked when the loss was recorded; what the
 * scrap actually fetched is `realisedValue` below, and the two are separate
 * columns on the ledger precisely so nobody has to take this one on trust.
 */
export function recoveryValue(l: LossRecord, uom: string): Derived {
  return D(
    round(l.qty * l.recoveryRate, 2),
    'Recoverable as scrap',
    'qty × scrap_rate',
    [
      { name: 'qty', value: q(l.qty), unit: uom },
      { name: 'scrap_rate', value: l.recoveryRate, unit: `₹/${uom}`,
        source: l.recoveryRate === 0 ? 'nothing recoverable — this material is dead loss' : 'invented scrap rate' },
      { name: 'realised', value: l.soldOn ?? 'not sold yet', source: l.soldOn ? 'a scrap sale is a movement out with money in' : 'still in the bin' },
    ],
    { unit: '₹' },
  )
}

/** What a settled record actually recovered: money in, or nothing. */
export function settledRecovery(l: LossRecord): number {
  if (l.noSaleOn) return 0
  if (l.soldOn) return l.realised ?? round(l.qty * l.recoveryRate, 2)
  return round(l.qty * l.recoveryRate, 2)
}

/** Whether a record is finished with — sold, or written off unsold. */
export const isSettled = (l: LossRecord) => !!l.soldOn || !!l.noSaleOn

/**
 * The money that actually arrived, against the money that was booked. A sale
 * below the booked rate is the common case and the reason this column exists:
 * the estimate is what the ledger assumed, this is what the dealer paid.
 */
export function realisedValue(l: LossRecord, uom: string): Derived {
  const expected = round(l.qty * l.recoveryRate, 2)
  const actual = settledRecovery(l)
  const variance = round(actual - expected, 2)
  const rate = l.qty > 0 ? round(actual / l.qty, 2) : 0
  return D(
    actual,
    l.noSaleOn ? 'Written off — no sale' : 'Realised on the scrap sale',
    l.noSaleOn ? 'nothing recovered — the scrap never sold' : 'the amount received, entered at the sale',
    [
      { name: 'expected', value: expected, unit: '₹', source: `qty × scrap_rate — ${q(l.qty)} ${uom} × ₹${l.recoveryRate}/${uom}` },
      { name: 'actual', value: actual, unit: '₹',
        source: l.noSaleOn ? `written off ${l.noSaleOn} — nobody bought it` : l.realised != null ? 'typed in when the sale was recorded' : 'sold at the booked rate' },
      { name: 'variance', value: variance, unit: '₹',
        source: variance === 0 ? 'sold for exactly what was booked' : variance < 0 ? 'the scrap fetched less than the ledger assumed' : 'the scrap fetched more than the ledger assumed' },
      { name: 'realised rate', value: rate, unit: `₹/${uom}`, source: 'what it actually went for, per unit' },
      { name: 'settled', value: l.noSaleOn ?? l.soldOn ?? 'not yet', source: l.noSaleOn ? 'no sale' : l.soldOn ? 'a scrap sale is a movement out with money in' : 'still in the bin' },
    ],
    { unit: '₹', note: l.noSaleOn
      ? 'A dead loss by decision rather than by material. The recoverable figure stays on the record as what was hoped for.'
      : 'Net loss is computed on this figure once a record is settled, never on the estimate.' },
  )
}

/** The honest headline: what it cost, less what came back. */
export function netLoss(
  rows: { loss: LossRecord; rate: number }[], label = 'Net loss',
): Derived {
  const gross = rows.reduce((a, r) => a + r.loss.qty * r.rate, 0)
  // settled records count the money that actually arrived; open ones still
  // count the estimate, because nothing better is known yet
  const rec = rows.reduce((a, r) => a + settledRecovery(r.loss), 0)
  const settled = rows.filter((r) => isSettled(r.loss))
  const drift = settled.reduce((a, r) => a + (settledRecovery(r.loss) - r.loss.qty * r.loss.recoveryRate), 0)
  return D(
    round(gross - rec, 2),
    label,
    'Σ (qty × last_purchase_rate) − Σ recovered',
    [
      { name: 'gross loss', value: round(gross, 2), unit: '₹', source: 'valued at what we paid' },
      { name: 'recovered', value: round(rec, 2), unit: '₹',
        source: 'what settled records actually fetched, plus the estimate on the ones still in the bin' },
      { name: 'settled records', value: settled.length, source: `${settled.filter((r) => r.loss.noSaleOn).length} written off without a sale` },
      { name: 'estimate vs actual', value: round(drift, 2), unit: '₹',
        source: drift === 0 ? 'every settled record fetched exactly what was booked' : drift < 0 ? 'the settled scrap fetched less than the ledger had assumed' : 'the settled scrap fetched more than the ledger had assumed' },
      { name: 'records', value: rows.length },
    ],
    { unit: '₹', note: 'Steel, brass, nichrome and zinc come back as money. Fired ceramic, mineral wool and wet MgO do not.' },
  )
}

/**
 * Scrap as a share of what was issued — DERIVED, which is the point. §9.2 carries
 * this as a stored constant per material; after INV-03 it is the loss ledger over
 * the issue ledger, and it moves when someone records a loss.
 */
export function scrapPct(lossQty: number, issuedQty: number, uom: string): Derived {
  return D(
    issuedQty === 0 ? 0 : round((lossQty / issuedQty) * 100, 2),
    'Scrap against material issued',
    'Σ loss_qty ÷ Σ issued_qty × 100',
    [
      { name: 'Σ loss_qty', value: q(lossQty), unit: uom, source: 'the loss ledger, every cause' },
      { name: 'Σ issued_qty', value: q(issuedQty), unit: uom, source: 'issues and jobwork out, from the stock ledger' },
    ],
    { unit: '%', note: 'A percentage of material issued, not of material bought — so a quiet month does not flatter it.' },
  )
}

export function overScrapTarget(pct: number, cls: ItemClass, policy: Policy): boolean {
  return pct > policy.scrapTargetPct[cls] + policy.scrapTolerancePct
}

/**
 * §11 wants two marginals that agree. Blocked capital does it by cause and by
 * age; the loss ledger does it by cause and by item, and the totals must match.
 */
export function lossByCause(
  rows: { loss: LossRecord; rate: number }[],
): { cause: LossCause; qtyItems: number; gross: number; net: number }[] {
  const causes = [...new Set(rows.map((r) => r.loss.cause))]
  return causes.map((cause) => {
    const mine = rows.filter((r) => r.loss.cause === cause)
    const gross = mine.reduce((a, r) => a + r.loss.qty * r.rate, 0)
    const rec = mine.reduce((a, r) => a + r.loss.qty * r.loss.recoveryRate, 0)
    return {
      cause,
      qtyItems: new Set(mine.map((r) => r.loss.itemId)).size,
      gross: round(gross, 2),
      net: round(gross - rec, 2),
    }
  }).sort((a, b) => b.net - a.net)
}

export function unrealisedRecovery(
  rows: { loss: LossRecord; rate: number }[], today: string, policy: Policy,
): Derived {
  const open = rows.filter((r) => r.loss.recoveryRate > 0 && !isSettled(r.loss))
  const v = open.reduce((a, r) => a + r.loss.qty * r.loss.recoveryRate, 0)
  const stale = open.filter((r) => daysBetween(r.loss.on, today) > policy.scrapUnrealisedDays)
  return D(
    round(v, 2),
    'Scrap still in the bin',
    'Σ (qty × scrap_rate) where the scrap has not been sold',
    open.length
      ? open.map((r) => ({
          name: `${r.loss.id} · ${r.loss.itemId}`, value: round(r.loss.qty * r.loss.recoveryRate, 2), unit: '₹',
          source: `${LOSS_LABEL[r.loss.cause]}, ${r.loss.on}`,
        }))
      : [{ name: 'unsold scrap', value: 0, source: 'every recoverable loss is settled — sold, or written off unsold' }],
    { unit: '₹', note: stale.length
      ? `${stale.length} of these have been sitting past ${policy.scrapUnrealisedDays} days — recovery you have booked but not collected.`
      : 'Money you are owed by the scrap dealer, not money you have.' },
  )
}

/* ========================================================================== */
/* INV-02 → SRC-01 · what a remnant does to an order the desk is about to raise */
/* ========================================================================== */

export interface OffcutEffect {
  /** the need before the remnant is considered, before MOQ rounding */
  rawNeed: Derived
  /** the need with the remnant netted off, before MOQ rounding */
  netNeed: Derived
  /** what the order becomes once MOQ rounding is re-applied */
  revisedQty: Derived
  /** units the order actually drops by — often zero, because MOQ eats it */
  reducedBy: number
  /** true when there is a remnant and the order still does not move */
  absorbedByMoq: boolean
}

/**
 * The honest arithmetic of "we already own some of this".
 *
 * A remnant does NOT reduce true position — 62 m of 1.2–1.8 m offcuts is not 62 m
 * of full lengths, and counting it as cover would quietly under-buy. What it does
 * is reduce the NEED on this particular order, and then MOQ rounding is applied
 * again. Very often the MOQ swallows the whole remnant and the order does not
 * move at all; saying so is more useful than quoting a saving that is not real.
 * Where it does not, the order genuinely drops.
 */
export function offcutEffect(
  rop: number, cycleDays: number, avgDaily: number, truePos: number,
  moq: number, orderedQty: number, offcut: number, unit?: string,
): OffcutEffect {
  const raw = round(rop + cycleDays * avgDaily - truePos, 3)
  const net = round(Math.max(0, raw - offcut), 3)
  const revised = net > 0 ? q(Math.ceil(net / moq) * moq) : 0
  const reducedBy = round(Math.max(0, orderedQty - revised), 3)
  return {
    rawNeed: D(
      raw, 'Net need before the remnant', 'reorder_point + CYCLE_DAYS × avg_daily_consumption − true_position',
      [
        { name: 'reorder_point', value: rop, unit },
        { name: 'CYCLE_DAYS', value: cycleDays, unit: 'days', source: 'policy' },
        { name: 'avg_daily_consumption', value: avgDaily, unit: unit && `${unit}/day` },
        { name: 'true_position', value: truePos, unit, source: 'usable + in transit + open PO — remnants are NOT in this' },
      ],
      { unit },
    ),
    netNeed: D(
      net, 'Need with the remnant netted off', 'max(0, net_need − remnants on the rack)',
      [
        { name: 'net_need', value: raw, unit },
        { name: 'remnants on the rack', value: q(offcut), unit, source: 'the INV-02 register, live' },
      ],
      { unit, note: 'Netted off the order, not added to cover: a short remnant is not a full length, and treating it as cover would under-buy.' },
    ),
    revisedQty: D(
      revised, 'Order after the remnant', 'ceil((net_need − remnants) / moq) × moq',
      [
        { name: 'need after remnants', value: net, unit },
        { name: 'moq', value: moq, unit, source: 'the supplier’s minimum order quantity' },
        { name: 'order as it stands', value: orderedQty, unit },
      ],
      { unit, note: reducedBy > 0
        ? 'The remnant crosses an MOQ boundary, so the order genuinely drops.'
        : 'The MOQ rounds back up to the same figure, so this order does not change. The remnant’s value is in sequencing — use it first and the next order comes later.' },
    ),
    reducedBy,
    absorbedByMoq: offcut > 0 && reducedBy === 0,
  }
}
