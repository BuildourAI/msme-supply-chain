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

/* ------------------------------------------------- INB-01 · goods receipt & QC */

/**
 * The inspection spec. Two to four checks per item with a tolerance — a vernier,
 * a weighing scale and a certificate, which is what MSME inbound QC actually is.
 * A check that fails names the bucket the material lands in, so a rejection can
 * never be recorded without a reason from the enum (§9.1's eight reasons).
 */
export type CheckKind = 'measure' | 'document' | 'visual' | 'count'

export interface SpecCheck {
  id: string
  itemId: string
  label: string
  kind: CheckKind
  /** measure only — the tolerance band */
  min?: number
  max?: number
  unit?: string
  /** where the lot lands if this check fails */
  failBucket: Usability
  failReason: string
  /** a mandatory check cannot be waived; the GRN will not close without it */
  mandatory: boolean
}

export type CheckOutcome = 'pass' | 'fail' | 'not_checked'

export interface CheckResult {
  checkId: string
  outcome: CheckOutcome
  /** the reading, for a `measure` check */
  measured?: number
}

/**
 * A goods receipt. Nothing becomes usable stock without one: a GRN cannot close
 * until every check is marked, and its outcome writes the lot's usability rather
 * than a storeman's opinion. Closing one also files a Receipt, so the trailing
 * lead time and the trailing rejection rate both move.
 */
export interface Grn {
  id: string
  grnNo: string
  itemId: string
  itemName: string
  uom: string
  vendorName: string
  /** an inbound purchase receipt … */
  poNo?: string
  poLineId?: string
  /** … or a jobwork return coming back through the same gate */
  challanId?: string
  receivedOn: string
  qtyReceived: number
  /** what the PO asked for — the "in full" half of OTIF. Purchase receipts only. */
  orderedQty?: number
  /** what the vendor promised — the "on time" half of OTIF. Purchase receipts only. */
  promisedDate?: string
  /** the PO revision the vendor actually shipped against — INB-02's evidence */
  againstVersion?: number
  /** ₹/uom, last purchase price ex-freight — the §13-1 valuation basis */
  rate: number
  status: 'open' | 'closed'
  /** set on close */
  results?: CheckResult[]
  acceptedQty?: number
  rejectedQty?: number
  failedCheckIds?: string[]
  inspector?: string
  closedAt?: string
  /** true when the item has no spec on file: received unchecked, never blocked */
  noSpec?: boolean
}

/* ------------------------------------------------ INB-02 · order change sync */

export type PoChangeKind = 'created' | 'qty' | 'date' | 'spec' | 'cancel'

export interface PoRevision {
  version: number
  qty: number
  promisedDate: string
  changedOn: string
  changedBy: string
  kind: PoChangeKind
  reason: string
}

/**
 * A PO line and everything the vendor has been told about it. `ackedVersion` is
 * the only quantity the inbound board and the cover maths are allowed to use —
 * an internal change does not improve cover until the vendor has confirmed it.
 */
export interface PoSync {
  poLineId: string
  poNo: string
  itemId: string
  vendorName: string
  /** whether the material has already left the vendor */
  shipped: boolean
  revisions: PoRevision[]
  /** highest version the vendor has been sent a notice for */
  notifiedVersion: number
  /** highest version the vendor has confirmed back */
  ackedVersion: number
  notifiedOn?: string
  ackedOn?: string
  ackRef?: string
}

/* -------------------------------------------------- INB-03 · jobwork register */

/**
 * One challan out to a jobworker. Everything that left is accounted for as one
 * of five things: back in stock, back and waiting on inspection, still at the
 * jobworker, allowed process loss, or unaccounted — and the five always sum to
 * the quantity sent. Only the last carries a write-off.
 *
 * There is deliberately no `returns` field: what came back is derived from the
 * closed GRNs that carry this challan's id, so a return cannot be recorded
 * without passing inspection first.
 */
export interface JobworkChallan {
  id: string
  challanNo: string
  /** which floor's run date this challan is aged against */
  floor: 'heaters' | 'fabrication'
  asOf: string
  itemId: string
  itemName: string
  uom: string
  jobworkerName: string
  process: string
  qtySent: number
  sentOn: string
  dueBack: string
  /**
   * Expected return ÷ quantity sent. Below 1 for a cutting or machining process
   * (the difference is allowed process loss); above 1 for galvanising, which adds
   * zinc weight.
   */
  expectedYield: number
  /** ₹/uom, last purchase price ex-freight (§13-1) */
  rate: number
  purpose?: string
  status: 'out' | 'closed'
  closedOn?: string
}

/* ================================================== INV-01 · the stock ledger */

/**
 * Every quantity in this build becomes a balance, not a stored number:
 * lot.qty = Σ movement.qty. A movement can only exist against a source document
 * — there is no movement kind meaning "adjustment, no reason".
 */
export type MovementKind =
  | 'opening'         // the balance when the ledger window opens
  | 'receipt'         // an INB-01 GRN closed
  | 'issue'           // to a job, or to a cut
  | 'jobwork_out'     // an INB-03 challan raised
  | 'jobwork_return'  // an INB-03 return, through a GRN
  | 'offcut_in'       // INV-02 · a remnant added to the register
  | 'offcut_issue'    // INV-02 · a remnant used instead of full stock
  | 'write_off'       // INV-03 · spoilage or scrapping, quantity leaves
  | 'count_adjust'    // INV-01 · a cycle count variance, signed

export type MovementSource = 'opening' | 'grn' | 'job' | 'cut' | 'challan' | 'count' | 'loss'

export interface StockMovement {
  id: string
  lotId: string
  itemId: string
  on: string
  kind: MovementKind
  /** signed, in the item's uom: receipts positive, issues negative */
  qty: number
  /** the document behind it. A movement without one cannot be recorded. */
  source: MovementSource
  sourceRef: string
  note?: string
  actor: string
}

/**
 * A cycle count. The variance is never overwritten onto the balance — it posts a
 * signed count_adjust movement, so the history says the book was wrong and by how
 * much. Counting accuracy is then a measurable thing rather than a feeling.
 */
export interface CycleCount {
  id: string
  lotId: string
  itemId: string
  on: string
  /** what was on the rack */
  countedQty: number
  /** what the ledger said at that moment — a snapshot, since the ledger moves on */
  bookQty: number
  counter: string
  note?: string
}

/* ============================================ INV-02 · cutting & the offcuts */

/** A remnant that did not make the minimum usable size is scrap at the cut. */
export interface Remnant {
  /** the piece size, in the item's uom */
  size: number
  pieces: number
  spec: string
}

/**
 * One cutting, nesting or blanking operation. The identity that makes it
 * trustworthy: input = parts + kerf + Σ remnants, asserted on every record.
 */
export interface CutRecord {
  id: string
  cutNo: string
  on: string
  itemId: string
  /** the lot the material was drawn from */
  lotId: string
  workOrder: string
  inputQty: number
  /** what the nest plan said should come out as parts */
  plannedPartsQty: number
  /** what actually came out as parts */
  partsQty: number
  partsCount: number
  /** blade / torch width consumed — a real loss, not a rounding */
  kerfQty: number
  remnants: Remnant[]
  operator: string
}

/* ================================================ INV-03 · the loss ledger */

export type LossCause =
  | 'cut_kerf'
  | 'cut_offcut_scrap'
  | 'process_scrap'
  | 'store_spoilage'
  | 'jobwork_loss'
  | 'count_shortage'
  | 'grn_rejection'

/**
 * The loss ledger owns "why, and what it cost". The stock ledger owns quantity.
 * A loss either carries its own write_off / count_adjust movement, or is a named
 * component of a movement already posted (the kerf inside a cut's issue, the
 * spoilage inside an issue to a job) — so the two ledgers never double-count.
 */
export interface LossRecord {
  id: string
  on: string
  itemId: string
  lotId?: string
  qty: number
  cause: LossCause
  source: MovementSource
  sourceRef: string
  workOrder?: string
  /**
   * ₹ per uom this scrap actually sells for. Zero where nothing is recoverable —
   * fired ceramic and mineral wool are dead loss; steel, brass and zinc are not.
   */
  recoveryRate: number
  /** set when the scrap was actually sold, not when it was expected to be */
  soldOn?: string
  actor: string
}
