/**
 * Raw seed types — mirror the §7 schema. These hold ONLY stored facts.
 * Nothing derived lives here: no landed cost, no true position, no status.
 * CONTEXT.md rule 1 — every number on screen must be derived and inspectable.
 */

export type Usability = 'usable' | 'qc_hold' | 'damaged' | 'expired'
export type ItemClass = 'A' | 'B' | 'C'
export type Uom = 'm' | 'kg' | 'MT' | 'nos' | 'm2'

export interface Item {
  id: string
  code: string
  name: string
  uom: Uom
  itemClass: ItemClass
  /** §7 — months of cover a single order may create. */
  coverageCeilingMonths: number
  moq: number
  safetyStock: number
  /** Trailing 90-day issue history. Drives ROP. §4 */
  avgDailyConsumption: number
  /** What the shop actually draws on a working day. Drives production cover. §4 */
  floorConsumptionPerDay: number
  /** §13-1 — valuation basis is last purchase price, ex-freight. */
  lastPurchaseRate: number
  feeds: string[]
  batchNo?: string
}

export interface Vendor {
  id: string
  name: string
  paymentTermsDays: number
}

/** §7 vendor_item — landed cost is DERIVED from these, never stored. */
export interface VendorItem {
  vendorId: string
  itemId: string
  rate: number
  freightPerUnit: number
  nonCreditableGst: number
  paymentTermCost: number
  /**
   * As-quoted per-unit allowance. §5 derives this as rate × trailing_rejection_rate,
   * but 8 of the 27 §9.1 quotes carry a figure that differs from the rule (worst:
   * Mahalaxmi CRCA, ₹980 quoted vs ₹921 by the rule). §7's snapshot rule makes the
   * quoted figure authoritative; the derivation shows both and names the drift.
   */
  rejectionAllowance: number
  quotedLeadTimeDays: number
  /** §5 — avg of last 6 actual receipts. Authoritative, never the quoted figure. */
  trailingLeadTimeDays: number
  /** %, drives rejection_allowance */
  trailingRejectionRate: number
  onTimePct: number
  score: number
  isPreferred?: boolean
  quoteValidUntil: string
}

/**
 * §5 — "Lead time is the trailing average of the last six actual receipts, never
 * the vendor's quoted figure. This is non-negotiable." So receipts are seeded and
 * the lead time is derived from them, rather than lead time being a stored scalar.
 */
export interface Receipt {
  id: string
  vendorId: string
  itemId: string
  orderedOn: string
  receivedOn: string
}

export interface StockLot {
  id: string
  itemId: string
  batchNo: string
  qty: number
  usability: Usability
  usabilityReason?: string
}

export interface JobworkOut {
  id: string
  itemId: string
  vendorName: string
  qty: number
  process: string
  sentOn: string
  dueBack: string
  status: 'out' | 'part_returned' | 'closed'
}

export interface PurchaseOrderLine {
  id: string
  poNo: string
  itemId: string
  qty: number
  promisedDate: string
  /** 'open' = ordered not despatched; 'in_transit' = despatched not received. §4 */
  status: 'open' | 'in_transit'
  earmarkedJobNo?: string
}

export interface ProductionJob {
  jobNo: string
  product: string
  qty: number
  /** day offset from the screen's `today` */
  startOffset: number
  durationDays: number
  needs: string[]
}

export interface SalesOrder {
  soNo: string
  customer: string
  description: string
  value: number
  promisedDate: string
  /** item ids whose shortage puts this order at risk */
  atRiskFrom: string[]
}

export interface Offcut {
  itemId: string
  qty: number
  specNote: string
  location: string
}

export interface ScrapRecord {
  itemId: string
  scrapPct: number
  targetPct: number
}

export type BlockedCause =
  | 'moq_forced' | 'spec_change' | 'over_buy' | 'cancelled_order' | 'wrong_purchase'
export type AgeBucket = '0_90' | '90_180' | 'over_180'

export interface BlockedStock {
  id: string
  itemCode: string
  itemName: string
  qty: number
  uom: string
  value: number
  ageBucket: AgeBucket
  cause: BlockedCause
  owner: string
  route: 'return' | 'resell' | 'alternate' | 'scrap'
  deadline: string
}

/** §8.2 / §7 supplier_document */
export interface SupplierDocument {
  id: string
  vendorName: string
  kind: 'quote' | 'price_list' | 'proforma' | 'test_cert'
  receivedAt: string
  channel: 'email' | 'whatsapp'
  fileName: string
  lineCount: number
  status: 'auto' | 'pending'
}

/** §8.2 supplier_doc_line — the review queue. */
export interface SupplierDocLine {
  id: string
  documentId: string
  vendorName: string
  rawItemText: string
  rate: number
  uom: string
  suggestedItemId: string
  confidence: number
  reviewStatus: 'auto' | 'pending' | 'confirmed' | 'rejected'
}

export interface ItemAlias {
  itemId: string
  vendorName: string
  rawText: string
  confirmedBy: string
  confirmedAt: string
}

/* ------------------------------------------------------------------ derived */

/**
 * The inspection contract. Every derived number carries the formula that made
 * it and the substituted inputs, so "where does 620 come from" is answerable
 * from the UI without a developer — CONTEXT.md rule 1.
 */
export interface Derived<T = number> {
  value: T
  label: string
  formula: string
  inputs: DerivationInput[]
  note?: string
  /** rendering hint */
  unit?: string
  /** Where a stored figure and the §5 rule disagree, show both rather than hide it. */
  crossCheck?: { label: string; expected: string; actual: string; drift?: string }
}

export interface DerivationInput {
  name: string
  value: number | string
  unit?: string
  source?: string
}

/** §6 buyer's view — four states, judged on quantity AND timing. */
export type BuyerStatus = 'at_risk' | 'covered' | 'open_po_covers' | 'at_risk_late'

/** §6 owner's view — three states. */
export type OwnerStatus = 'stop' | 'watch' | 'fine'

/** §6 job status. */
export type JobStatus = 'will_run' | 'at_risk' | 'will_halt'

export type Decision = 'pending' | 'approved' | 'held' | 'overridden' | 'expedited' | 'deferred'
