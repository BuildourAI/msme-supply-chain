/**
 * Seed for the three Inventory systems. Same factory and the same run date as
 * §9.1 — 2026-09-02 — because the whole point is that these figures cannot
 * disagree with the Sourcing Desk.
 *
 * THE INVARIANT, and how it is guaranteed rather than hoped for:
 *
 *   opening + Σ movements  ===  §9.1 stock_lot.qty      (all 17 lots)
 *
 * §9.1's lot quantities are the CLOSING balance at the run date, which is the
 * only reading on which the desk's true position and status reconcile. So the
 * opening balance is not typed in: it is computed as `target − Σ(later
 * movements)` at module load, exactly the way the §5 receipt spans are built to
 * average to the stated lead time. The test asserts opening ≥ 0 on every lot, so
 * an implausible history fails loudly instead of quietly balancing.
 *
 * CONTEXT.md supplies none of this: §9.1 has lot quantities but no movements, an
 * offcut list but no cut records, and §9.2 carries scrap percentages as stored
 * constants. Everything below is invented to a stated shape, and each invention
 * is named. What is NOT invented: lot ids, batch numbers, closing quantities,
 * usability reasons, item codes and rates all come from §9.1 verbatim, and every
 * GRN, challan and jobwork reference is a real record from the Inbound seed.
 */
import type {
  CutRecord, CycleCount, ItemClass, LossRecord, StockLot, StockMovement,
} from '@/lib/domain/types'
import * as S from '@/lib/seed/sourcing'
import { grns } from '@/lib/seed/inbound'

export const TODAY_INVENTORY = '2026-09-02'

/** The ledger shows the last seven weeks. Before that is the opening balance. */
export const LEDGER_FROM = '2026-07-14'

export const STOREKEEPER = 'S. Kale · Stores'
export const OPERATOR = 'M. Shaikh · Cutting'

/* --------------------------------------------------------- INV-02 · offcuts */

/**
 * Offcut lots are ordinary stock lots with a size band, not a side list. §9.1
 * already describes them at band grain — "Ø8.5 tube, 1.2–1.8 m lengths" — so a
 * lot holds every piece in that band and the piece count is derived from the
 * average piece size rather than stored.
 *
 * Invented: the average piece size per band, and the minimum size below which a
 * remnant is scrap at the cut instead of an offcut. Both are the figures that
 * decide whether the register fills up with bits nobody will ever use.
 */
export interface OffcutBand {
  lotId: string
  itemId: string
  batchNo: string
  spec: string
  location: string
  /** ordinary piece size in this band, for the derived piece count */
  avgPieceSize: number
  /** the oldest piece still in the band — drives ageing */
  oldestOn: string
}

export const offcutBands: OffcutBand[] = [
  { lotId: 'OC-TUB-A', itemId: 'EL-TUB-INC85', batchNo: 'OC-NC85-A', location: 'Rack B-4',
    spec: 'Ø8.5 tube, 1.2–1.8 m lengths', avgPieceSize: 1.5, oldestOn: '2026-06-02' },
  { lotId: 'OC-CRC-A', itemId: 'RM-CRC-120', batchNo: 'OC--120-A', location: 'Rack A-1',
    spec: 'CRCA 1.2 mm, 400 × 1250 sheets', avgPieceSize: 0.0047, oldestOn: '2026-07-08' },
  { lotId: 'OC-FLG-A', itemId: 'RM-FLG-304-2', batchNo: 'OC-04-2-A', location: 'Rack C-2',
    spec: 'SS 304 blanks, undrilled', avgPieceSize: 1, oldestOn: '2026-07-30' },
]

/** Below this, a remnant is scrap at the cut. Invented, per item. */
export const MIN_USABLE_REMNANT: Record<string, number> = {
  'EL-TUB-INC85': 0.5,      // half a metre of tube is still an element
  'RM-CRC-120': 0.0035,     // ≈ a 300 × 1250 strip
  'RM-FLG-304-2': 1,        // a blank is a blank
  'RM-NCR-8020': 0.2,
  'IN-MWL-050': 2,
}

/** §9.1's three offcut rows are the CLOSING balance of these bands. */
export const OFFCUT_TARGET: Record<string, number> = Object.fromEntries(
  S.offcuts.map((o) => {
    const band = offcutBands.find((b) => b.itemId === o.itemId)!
    return [band.lotId, o.qty]
  }),
)

/* ------------------------------------------------------- INV-02 · cut records */

/**
 * Seven cutting, nesting and blanking operations across the ledger window.
 * Each balances: input = parts + kerf + Σ remnants. Work-order numbers are
 * invented; the lots and items are §9.1's.
 */
export const cuts: CutRecord[] = [
  {
    id: 'CUT-2138', cutNo: 'CUT-2138', on: '2026-08-18', itemId: 'EL-TUB-INC85', lotId: 'L-001',
    workOrder: 'WO-8814', inputQty: 300, plannedPartsQty: 292, partsQty: 290.3, partsCount: 145,
    kerfQty: 1.5, operator: OPERATOR,
    remnants: [
      { size: 1.8, pieces: 1, spec: '1.8 m end length' },
      { size: 1.5, pieces: 3, spec: '1.5 m end lengths' },
      { size: 1.2, pieces: 1, spec: '1.2 m end length' },
      { size: 0.35, pieces: 2, spec: '0.35 m drops — under the usable minimum' },
    ],
  },
  {
    id: 'CUT-2145', cutNo: 'CUT-2145', on: '2026-08-26', itemId: 'EL-TUB-INC85', lotId: 'L-001',
    workOrder: 'WO-8821', inputQty: 280, plannedPartsQty: 271, partsQty: 268.8, partsCount: 134,
    kerfQty: 1.4, operator: OPERATOR,
    remnants: [
      { size: 1.7, pieces: 2, spec: '1.7 m end lengths' },
      { size: 1.6, pieces: 1, spec: '1.6 m end length' },
      { size: 1.5, pieces: 1, spec: '1.5 m end length' },
      { size: 1.3, pieces: 1, spec: '1.3 m end length' },
      { size: 1.2, pieces: 1, spec: '1.2 m end length' },
      { size: 0.4, pieces: 2, spec: '0.4 m drops — under the usable minimum' },
    ],
  },
  {
    id: 'CUT-2152', cutNo: 'CUT-2152', on: '2026-09-01', itemId: 'EL-TUB-INC85', lotId: 'L-001',
    workOrder: 'WO-8829', inputQty: 260, plannedPartsQty: 253, partsQty: 252.15, partsCount: 126,
    kerfQty: 1.3, operator: OPERATOR,
    remnants: [
      { size: 1.6, pieces: 1, spec: '1.6 m end length' },
      { size: 1.5, pieces: 2, spec: '1.5 m end lengths' },
      { size: 1.4, pieces: 1, spec: '1.4 m end length' },
      { size: 0.275, pieces: 2, spec: '0.275 m drops — under the usable minimum' },
    ],
  },
  {
    id: 'CUT-2140', cutNo: 'CUT-2140', on: '2026-08-20', itemId: 'RM-CRC-120', lotId: 'L-003',
    workOrder: 'WO-8816', inputQty: 0.35, plannedPartsQty: 0.318, partsQty: 0.3118, partsCount: 24,
    kerfQty: 0.004, operator: OPERATOR,
    remnants: [
      { size: 0.0047, pieces: 6, spec: '400 × 1250 strips' },
      { size: 0.003, pieces: 2, spec: '250 × 1250 strips — under the usable minimum' },
    ],
  },
  {
    id: 'CUT-2149', cutNo: 'CUT-2149', on: '2026-08-29', itemId: 'RM-CRC-120', lotId: 'L-003',
    workOrder: 'WO-8824', inputQty: 0.28, plannedPartsQty: 0.259, partsQty: 0.254, partsCount: 20,
    kerfQty: 0.003, operator: OPERATOR,
    remnants: [
      { size: 0.00475, pieces: 4, spec: '400 × 1250 strips' },
      { size: 0.002, pieces: 2, spec: '180 × 1250 strips — under the usable minimum' },
    ],
  },
  {
    id: 'CUT-2143', cutNo: 'CUT-2143', on: '2026-08-22', itemId: 'RM-FLG-304-2', lotId: 'L-015',
    workOrder: 'WO-8818', inputQty: 60, plannedPartsQty: 56, partsQty: 54, partsCount: 54,
    kerfQty: 0, operator: OPERATOR,
    remnants: [
      { size: 1, pieces: 5, spec: 'undrilled blanks — bolt circle not yet set' },
      { size: 0.5, pieces: 2, spec: 'bored oversize — under the usable minimum' },
    ],
  },
  {
    id: 'CUT-2151', cutNo: 'CUT-2151', on: '2026-08-31', itemId: 'RM-FLG-304-2', lotId: 'L-015',
    workOrder: 'WO-8827', inputQty: 40, plannedPartsQty: 38, partsQty: 36, partsCount: 36,
    kerfQty: 0, operator: OPERATOR,
    remnants: [
      { size: 1, pieces: 3, spec: 'undrilled blanks — bolt circle not yet set' },
      { size: 0.5, pieces: 2, spec: 'bored oversize — under the usable minimum' },
    ],
  },
]

export const remnantQty = (r: { size: number; pieces: number }) => r.size * r.pieces
export const isUsableRemnant = (itemId: string, size: number) =>
  size >= (MIN_USABLE_REMNANT[itemId] ?? 0)

/** Usable remnants from one cut — what rolls into the offcut band. */
export const usableRemnantQty = (c: CutRecord) =>
  round3(c.remnants.filter((r) => isUsableRemnant(c.itemId, r.size)).reduce((a, r) => a + remnantQty(r), 0))
/** Remnants under the minimum — scrap the moment they hit the floor. */
export const scrapRemnantQty = (c: CutRecord) =>
  round3(c.remnants.filter((r) => !isUsableRemnant(c.itemId, r.size)).reduce((a, r) => a + remnantQty(r), 0))

function round3(n: number) { return Math.round(n * 1e6) / 1e6 }

/* ---------------------------------------------------------- INV-01 · counts */

/**
 * Eight cycle counts across the window. Two find a shortage, one finds material
 * the book had already written off, the rest agree — which is roughly the shape
 * of real counting, and it means the accuracy figure is not a flat 100%.
 */
export const cycleCounts: CycleCount[] = [
  { id: 'CC-01', lotId: 'L-001', itemId: 'EL-TUB-INC85', on: '2026-08-24', countedQty: 869, bookQty: 882, counter: STOREKEEPER, note: 'Thirteen metres short against the book. Two racks, one tally sheet, and nobody signing for a part-issue.' },
  { id: 'CC-02', lotId: 'L-013', itemId: 'SN-RTD-6150', on: '2026-08-25', countedQty: 368, bookQty: 368, counter: STOREKEEPER },
  { id: 'CC-03', lotId: 'L-005', itemId: 'RM-MGO-EG', on: '2026-08-27', countedQty: 393, bookQty: 390, counter: STOREKEEPER, note: 'Three bags found behind the pallet — the book had them issued.' },
  { id: 'CC-04', lotId: 'L-011', itemId: 'CM-TRB-2W', on: '2026-08-28', countedQty: 1610, bookQty: 1610, counter: STOREKEEPER },
  { id: 'CC-05', lotId: 'L-009', itemId: 'HW-GLD-M20', on: '2026-08-30', countedQty: 1150, bookQty: 1162, counter: STOREKEEPER, note: 'Twelve glands short. Loose stock, no bin card.' },
  { id: 'CC-06', lotId: 'L-007', itemId: 'RM-NCR-8020', on: '2026-08-31', countedQty: 38, bookQty: 38, counter: STOREKEEPER },
  { id: 'CC-07', lotId: 'L-003', itemId: 'RM-CRC-120', on: '2026-09-01', countedQty: 0.9, bookQty: 0.9, counter: STOREKEEPER },
  { id: 'CC-08', lotId: 'L-017', itemId: 'IN-MWL-050', on: '2026-09-01', countedQty: 690, bookQty: 684, counter: STOREKEEPER, note: 'Six square metres more than the book. A part-issue never posted.' },
]

/* ------------------------------------------------------- INV-01 · movements */

/**
 * Every movement except the opening balance, in date order per lot. The opening
 * is appended below, computed so the lot closes at exactly §9.1's quantity.
 *
 * Each `sourceRef` names a document that exists elsewhere in this build: a GRN
 * from the Inbound seed, a challan from the jobwork register, a cut record above,
 * a cycle count above, or an invented work order.
 */
type Mv = Omit<StockMovement, 'id' | 'itemId' | 'actor'> & { actor?: string }

const MOVES: Mv[] = [
  /* -- EL-TUB-INC85 · Incoloy tube ------------------------------------------ */
  { lotId: 'L-001', on: '2026-08-08', kind: 'receipt', qty: 491, source: 'grn', sourceRef: 'GRN-1160', note: '500 m received, 9 m rejected on ovality' },
  { lotId: 'L-001', on: '2026-08-18', kind: 'issue', qty: -300, source: 'cut', sourceRef: 'CUT-2138' },
  { lotId: 'L-001', on: '2026-08-24', kind: 'count_adjust', qty: -13, source: 'count', sourceRef: 'CC-01' },
  { lotId: 'L-001', on: '2026-08-26', kind: 'issue', qty: -280, source: 'cut', sourceRef: 'CUT-2145' },
  { lotId: 'L-001', on: '2026-08-26', kind: 'jobwork_out', qty: -180, source: 'challan', sourceRef: 'JC-2203', note: 'Centreless grinding at Precision Grinders' },
  { lotId: 'L-001', on: '2026-09-01', kind: 'issue', qty: -260, source: 'cut', sourceRef: 'CUT-2152' },
  { lotId: 'L-002', on: '2026-08-08', kind: 'receipt', qty: 9, source: 'grn', sourceRef: 'GRN-1160', note: 'The rejected part of the same receipt — ovality out of tolerance' },

  /* -- RM-CRC-120 · CRCA sheet ---------------------------------------------- */
  { lotId: 'L-003', on: '2026-08-05', kind: 'receipt', qty: 1.4775, source: 'grn', sourceRef: 'GRN-1155', note: '1.5 MT received, 0.0225 MT rejected on surface rust' },
  { lotId: 'L-003', on: '2026-08-20', kind: 'issue', qty: -0.35, source: 'cut', sourceRef: 'CUT-2140' },
  { lotId: 'L-003', on: '2026-08-20', kind: 'jobwork_out', qty: -1.2, source: 'challan', sourceRef: 'JC-2198', note: 'Laser cutting at Shree Laser Works' },
  { lotId: 'L-003', on: '2026-08-26', kind: 'jobwork_return', qty: 0.62, source: 'grn', sourceRef: 'GRN-1179', note: 'First return off JC-2198, inspected and accepted' },
  { lotId: 'L-003', on: '2026-08-29', kind: 'issue', qty: -0.28, source: 'cut', sourceRef: 'CUT-2149' },
  { lotId: 'L-004', on: '2026-08-05', kind: 'receipt', qty: 0.0225, source: 'grn', sourceRef: 'GRN-1155', note: 'Rejected at the gate — surface rust' },

  /* -- RM-MGO-EG · MgO powder ----------------------------------------------- */
  { lotId: 'L-005', on: '2026-07-29', kind: 'receipt', qty: 393.6, source: 'grn', sourceRef: 'GRN-1149', note: '400 kg received, 6.4 kg rejected on moisture' },
  { lotId: 'L-005', on: '2026-08-12', kind: 'issue', qty: -250, source: 'job', sourceRef: 'WO-8810' },
  { lotId: 'L-005', on: '2026-08-24', kind: 'issue', qty: -240, source: 'job', sourceRef: 'WO-8819' },
  { lotId: 'L-005', on: '2026-08-27', kind: 'count_adjust', qty: 3, source: 'count', sourceRef: 'CC-03' },
  { lotId: 'L-005', on: '2026-08-31', kind: 'issue', qty: -180, source: 'job', sourceRef: 'WO-8826' },
  { lotId: 'L-006', on: '2026-07-29', kind: 'receipt', qty: 6.4, source: 'grn', sourceRef: 'GRN-1149', note: 'Rejected at the gate — moisture ingress, needs re-drying' },

  /* -- RM-NCR-8020 · nichrome wire ------------------------------------------ */
  { lotId: 'L-007', on: '2026-08-05', kind: 'jobwork_out', qty: -40, source: 'challan', sourceRef: 'JC-2186', note: 'Coil winding at Precision Wire Co.' },
  { lotId: 'L-007', on: '2026-08-11', kind: 'jobwork_return', qty: 39.2, source: 'grn', sourceRef: 'GRN-1162', note: '0.8 kg consumed by the process, inside the allowance' },
  { lotId: 'L-007', on: '2026-08-14', kind: 'issue', qty: -55, source: 'job', sourceRef: 'WO-8812' },
  { lotId: 'L-007', on: '2026-08-25', kind: 'issue', qty: -48, source: 'job', sourceRef: 'WO-8820' },

  /* -- HW-GLD-M20 · cable gland --------------------------------------------- */
  { lotId: 'L-009', on: '2026-07-21', kind: 'receipt', qty: 1974, source: 'grn', sourceRef: 'GRN-1142', note: '2,000 received, 26 rejected on thread damage' },
  { lotId: 'L-009', on: '2026-07-28', kind: 'issue', qty: -780, source: 'job', sourceRef: 'WO-8802' },
  { lotId: 'L-009', on: '2026-08-10', kind: 'issue', qty: -620, source: 'job', sourceRef: 'WO-8808' },
  { lotId: 'L-009', on: '2026-08-12', kind: 'jobwork_out', qty: -2000, source: 'challan', sourceRef: 'JC-2190', note: 'Nickel plating at Bright Plating Co.' },
  { lotId: 'L-009', on: '2026-08-18', kind: 'jobwork_return', qty: 1150, source: 'grn', sourceRef: 'GRN-1168' },
  { lotId: 'L-009', on: '2026-08-22', kind: 'jobwork_return', qty: 700, source: 'grn', sourceRef: 'GRN-1173' },
  { lotId: 'L-009', on: '2026-08-24', kind: 'issue', qty: -540, source: 'job', sourceRef: 'WO-8817' },
  { lotId: 'L-009', on: '2026-08-30', kind: 'count_adjust', qty: -12, source: 'count', sourceRef: 'CC-05' },
  { lotId: 'L-010', on: '2026-07-21', kind: 'receipt', qty: 26, source: 'grn', sourceRef: 'GRN-1142', note: 'Rejected at the gate — thread damage' },

  /* -- CM-TRB-2W · ceramic terminal block ----------------------------------- */
  { lotId: 'L-011', on: '2026-07-15', kind: 'receipt', qty: 4915, source: 'grn', sourceRef: 'GRN-1137', note: '5,000 received, 85 rejected on chipping' },
  { lotId: 'L-011', on: '2026-07-22', kind: 'issue', qty: -1600, source: 'job', sourceRef: 'WO-8800' },
  { lotId: 'L-011', on: '2026-08-05', kind: 'issue', qty: -1450, source: 'job', sourceRef: 'WO-8806' },
  { lotId: 'L-011', on: '2026-08-19', kind: 'issue', qty: -1380, source: 'job', sourceRef: 'WO-8815' },
  { lotId: 'L-011', on: '2026-08-29', kind: 'issue', qty: -1200, source: 'job', sourceRef: 'WO-8825' },
  { lotId: 'L-012', on: '2026-07-15', kind: 'receipt', qty: 85, source: 'grn', sourceRef: 'GRN-1137', note: 'Rejected at the gate — chipped in handling' },
  { lotId: 'L-012', on: '2026-07-20', kind: 'write_off', qty: -67, source: 'loss', sourceRef: 'LS-01', note: 'Fired ceramic cannot go back to the vendor — scrapped, nothing recoverable' },

  /* -- SN-RTD-6150 · PT100 sensor ------------------------------------------- */
  { lotId: 'L-013', on: '2026-07-30', kind: 'issue', qty: -60, source: 'job', sourceRef: 'WO-8804' },
  { lotId: 'L-013', on: '2026-08-13', kind: 'issue', qty: -55, source: 'job', sourceRef: 'WO-8811' },
  { lotId: 'L-013', on: '2026-08-27', kind: 'issue', qty: -48, source: 'job', sourceRef: 'WO-8822' },

  /* -- RM-FLG-304-2 · SS 304 flange ----------------------------------------- */
  { lotId: 'L-015', on: '2026-08-22', kind: 'issue', qty: -60, source: 'cut', sourceRef: 'CUT-2143' },
  { lotId: 'L-015', on: '2026-08-28', kind: 'jobwork_out', qty: -120, source: 'challan', sourceRef: 'JC-2205', note: 'Bore machining & facing at Sanghvi Machining' },
  { lotId: 'L-015', on: '2026-08-31', kind: 'issue', qty: -40, source: 'cut', sourceRef: 'CUT-2151' },

  /* -- IN-MWL-050 · mineral wool -------------------------------------------- */
  { lotId: 'L-017', on: '2026-07-24', kind: 'issue', qty: -220, source: 'job', sourceRef: 'WO-8801' },
  { lotId: 'L-017', on: '2026-08-07', kind: 'issue', qty: -260, source: 'job', sourceRef: 'WO-8807' },
  { lotId: 'L-017', on: '2026-08-21', kind: 'issue', qty: -240, source: 'job', sourceRef: 'WO-8816' },
  { lotId: 'L-017', on: '2026-09-01', kind: 'count_adjust', qty: 6, source: 'count', sourceRef: 'CC-08' },

  /* -- the offcut bands ------------------------------------------------------ */
  { lotId: 'OC-TUB-A', on: '2026-08-18', kind: 'offcut_in', qty: 7.5, source: 'cut', sourceRef: 'CUT-2138' },
  { lotId: 'OC-TUB-A', on: '2026-08-26', kind: 'offcut_in', qty: 9.0, source: 'cut', sourceRef: 'CUT-2145' },
  { lotId: 'OC-TUB-A', on: '2026-08-28', kind: 'offcut_issue', qty: -8, source: 'job', sourceRef: 'WO-8823', note: 'Short elements cut from remnants instead of drawing full lengths' },
  { lotId: 'OC-TUB-A', on: '2026-09-01', kind: 'offcut_in', qty: 6.0, source: 'cut', sourceRef: 'CUT-2152' },
  { lotId: 'OC-CRC-A', on: '2026-08-20', kind: 'offcut_in', qty: 0.0282, source: 'cut', sourceRef: 'CUT-2140' },
  { lotId: 'OC-CRC-A', on: '2026-08-29', kind: 'offcut_in', qty: 0.019, source: 'cut', sourceRef: 'CUT-2149' },
  { lotId: 'OC-FLG-A', on: '2026-08-22', kind: 'offcut_in', qty: 5, source: 'cut', sourceRef: 'CUT-2143' },
  { lotId: 'OC-FLG-A', on: '2026-08-31', kind: 'offcut_in', qty: 3, source: 'cut', sourceRef: 'CUT-2151' },
]

/* ---------------------------------------------- the lots the ledger runs over */

/** Offcut bands are ordinary lots, so one list covers both. */
export const ledgerLots: (StockLot & { kind: 'lot' | 'offcut' })[] = [
  ...S.stockLots.map((l) => ({ ...l, kind: 'lot' as const })),
  ...offcutBands.map((b) => ({
    id: b.lotId, itemId: b.itemId, batchNo: b.batchNo,
    qty: OFFCUT_TARGET[b.lotId], usability: 'usable' as const, kind: 'offcut' as const,
  })),
]

const CLOSING: Record<string, number> = Object.fromEntries(ledgerLots.map((l) => [l.id, l.qty]))

/**
 * The opening balance is DERIVED, not typed: target − Σ(everything after it).
 * That is what makes "opening + Σ movements = §9.1" true by construction rather
 * than by proofreading. A negative opening would mean the invented history is
 * impossible, so the test asserts every one is ≥ 0.
 */
export const movements: StockMovement[] = (() => {
  const byLot = new Map<string, Mv[]>()
  for (const m of MOVES) byLot.set(m.lotId, [...(byLot.get(m.lotId) ?? []), m])

  const out: StockMovement[] = []
  for (const lot of ledgerLots) {
    const later = byLot.get(lot.id) ?? []
    const sum = later.reduce((a, m) => a + m.qty, 0)
    const opening = Math.round((CLOSING[lot.id] - sum) * 1e6) / 1e6
    out.push({
      id: `MV-${lot.id}-000`, lotId: lot.id, itemId: lot.itemId, on: LEDGER_FROM,
      kind: 'opening', qty: opening, source: 'opening', sourceRef: 'ledger opening',
      note: 'The balance when the ledger window opens. Everything after it is a document.',
      actor: STOREKEEPER,
    })
    later.forEach((m, i) => out.push({
      ...m, id: `MV-${lot.id}-${String(i + 1).padStart(3, '0')}`,
      itemId: lot.itemId, actor: m.actor ?? STOREKEEPER,
    }))
  }
  return out.sort((a, b) => (a.on === b.on ? a.id.localeCompare(b.id) : a.on.localeCompare(b.on)))
})()

/* ------------------------------------------------------- INV-03 · the losses */

/**
 * What scrap actually sells for, per kilogram of the item's own unit. Invented,
 * and deliberately not uniform: Incoloy and nichrome scrap is worth real money,
 * mild-steel and brass turnings less, and fired ceramic, mineral wool and
 * moisture-ruined MgO are dead loss.
 */
export const RECOVERY_RATE: Record<string, number> = {
  'EL-TUB-INC85': 74,        // ₹/m of Ø8.5 Incoloy, sold as alloy scrap
  'RM-CRC-120': 21_000,      // ₹/MT of CRCA offcut
  'RM-MGO-EG': 0,            // ruined powder is dead
  'RM-NCR-8020': 420,        // ₹/kg — nichrome is worth recovering
  'HW-GLD-M20': 9.4,         // ₹/nos of brass
  'CM-TRB-2W': 0,            // fired ceramic is dead
  'SN-RTD-6150': 0,
  'RM-FLG-304-2': 116,       // ₹/nos of SS 304
  'IN-MWL-050': 0,
}

const lossFromCuts = (): LossRecord[] => cuts.flatMap((c) => {
  const rows: LossRecord[] = []
  if (c.kerfQty > 0) rows.push({
    id: `LS-K-${c.id}`, on: c.on, itemId: c.itemId, lotId: c.lotId, qty: c.kerfQty,
    cause: 'cut_kerf', source: 'cut', sourceRef: c.id, workOrder: c.workOrder,
    recoveryRate: 0, actor: OPERATOR,
  })
  const scrap = scrapRemnantQty(c)
  if (scrap > 0) rows.push({
    id: `LS-R-${c.id}`, on: c.on, itemId: c.itemId, lotId: c.lotId, qty: scrap,
    cause: 'cut_offcut_scrap', source: 'cut', sourceRef: c.id, workOrder: c.workOrder,
    recoveryRate: RECOVERY_RATE[c.itemId] ?? 0, actor: OPERATOR,
  })
  return rows
})

export const losses: LossRecord[] = [
  /* the one write-off that also moved stock: chipped ceramic cannot go back */
  { id: 'LS-01', on: '2026-07-20', itemId: 'CM-TRB-2W', lotId: 'L-012', qty: 67,
    cause: 'grn_rejection', source: 'grn', sourceRef: 'GRN-1137',
    recoveryRate: 0, actor: STOREKEEPER },

  /* the two count shortages — the quantity moved through CC-01 and CC-05 */
  { id: 'LS-02', on: '2026-08-24', itemId: 'EL-TUB-INC85', lotId: 'L-001', qty: 13,
    cause: 'count_shortage', source: 'count', sourceRef: 'CC-01',
    recoveryRate: 0, actor: STOREKEEPER },
  { id: 'LS-03', on: '2026-08-30', itemId: 'HW-GLD-M20', lotId: 'L-009', qty: 12,
    cause: 'count_shortage', source: 'count', sourceRef: 'CC-05',
    recoveryRate: 0, actor: STOREKEEPER },

  /* the floor's own entries — the one place a person types a loss */
  { id: 'LS-04', on: '2026-08-12', itemId: 'RM-MGO-EG', qty: 11,
    cause: 'process_scrap', source: 'job', sourceRef: 'WO-8810', workOrder: 'WO-8810',
    recoveryRate: 0, actor: 'R. Mehta · Production' },
  { id: 'LS-05', on: '2026-08-14', itemId: 'RM-NCR-8020', qty: 1.8,
    cause: 'process_scrap', source: 'job', sourceRef: 'WO-8812', workOrder: 'WO-8812',
    recoveryRate: 420, soldOn: '2026-08-28', actor: 'R. Mehta · Production' },
  { id: 'LS-06', on: '2026-08-24', itemId: 'RM-MGO-EG', qty: 9,
    cause: 'process_scrap', source: 'job', sourceRef: 'WO-8819', workOrder: 'WO-8819',
    recoveryRate: 0, actor: 'R. Mehta · Production' },
  { id: 'LS-07', on: '2026-08-24', itemId: 'HW-GLD-M20', qty: 22,
    cause: 'process_scrap', source: 'job', sourceRef: 'WO-8817', workOrder: 'WO-8817',
    recoveryRate: 9.4, actor: 'R. Mehta · Production' },
  { id: 'LS-08', on: '2026-08-19', itemId: 'CM-TRB-2W', qty: 46,
    cause: 'process_scrap', source: 'job', sourceRef: 'WO-8815', workOrder: 'WO-8815',
    recoveryRate: 0, actor: 'R. Mehta · Production' },
  { id: 'LS-09', on: '2026-08-07', itemId: 'IN-MWL-050', qty: 18,
    cause: 'process_scrap', source: 'job', sourceRef: 'WO-8807', workOrder: 'WO-8807',
    recoveryRate: 0, actor: 'R. Mehta · Production' },

  /* the jobwork allowance JC-2186 consumed, from the register */
  { id: 'LS-10', on: '2026-08-11', itemId: 'RM-NCR-8020', qty: 0.8,
    cause: 'jobwork_loss', source: 'challan', sourceRef: 'JC-2186',
    recoveryRate: 420, actor: STOREKEEPER },

  ...lossFromCuts(),
]

/** Item class per item, for the per-class policy knobs. */
export const classOf = (itemId: string): ItemClass =>
  S.items.find((i) => i.id === itemId)?.itemClass ?? 'C'

/** Every GRN the ledger already has a receipt for — so closing one twice cannot double-post. */
export const POSTED_GRN_REFS = new Set(
  movements.filter((m) => m.source === 'grn').map((m) => m.sourceRef),
)

/** The open GRNs whose receipts are still to come. */
export const pendingGrnRefs = grns
  .filter((g) => g.status === 'open')
  .map((g) => g.grnNo)
  .filter((no) => !POSTED_GRN_REFS.has(no))
