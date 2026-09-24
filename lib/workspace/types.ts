/**
 * A workspace is one company's own data.
 *
 * Every figure in this build is computed from a `SeedBundle`
 * (`lib/domain/derive.ts`), so an owner's company is simply another source of
 * that bundle — empty on the day they sign in, filled by the set-up steps. The
 * demo company keeps its seed and becomes the sample workspace, which is why
 * none of the derivations, formulas or guardrails change to support this.
 *
 * The domain types are left exactly as they are. Two things the owner
 * customises — what they call a kind of supplier, and what they call a group of
 * materials — have no field on `Vendor` or `Item`, and inventing one would
 * change types the reconciliation suites pin. They live here instead, as
 * side-tables keyed by id, which is also the honest shape: they are this
 * company's vocabulary, not a property of the material itself.
 */
import type { Policy } from '@/lib/domain/policy'
import type {
  CheckResult, CutRecord, CycleCount, FgMovement, Item, LossRecord, PoRevision, SpecCheck, StockLot,
  StockMovement, Uom, Usability, Vendor, VendorItem,
} from '@/lib/domain/types'
import type { SupplierDoc, VendorAlias } from '@/lib/intake/types'

export type PersonRole = 'owner' | 'manager' | 'stores' | 'buyer'

export const ROLE_LABEL: Record<PersonRole, string> = {
  owner: 'Owner',
  manager: 'Manager',
  stores: 'Stores',
  buyer: 'Buying',
}

export interface Person {
  name: string
  role: PersonRole
}

/**
 * The owner's own words. Every select over these offers "Add new…", because a
 * list of categories a developer guessed is a list somebody has to work around.
 */
export interface Categories {
  supplierType: string[]
  materialGroup: string[]
  units: Uom[]
}

/* ------------------------------------------------------ the sourcing desk -- */

/**
 * What an owner actually does, as three records.
 *
 * The build already holds masters — materials, suppliers, the rates they quote.
 * These are the transactions on top of them: what you asked for, what came
 * back, and what you ordered. They live here rather than in
 * `lib/domain/types.ts` because that file's shapes are pinned by the
 * reconciliation suites, and nothing here has any business changing them.
 *
 * They are joined but not enforced into a funnel. Every small firm in the
 * source set quotes on WhatsApp, so an owner who never raises a request must
 * still be able to record a quote, and somebody who already knows the price
 * must still be able to raise an order. A system that refuses the way people
 * actually work is a system they keep a parallel notebook for.
 */
export type RfqState = 'draft' | 'sent' | 'quoted' | 'awarded' | 'closed'
export type QuoteState = 'received' | 'accepted' | 'rejected'
export type OrderState = 'draft' | 'confirmed' | 'shipped' | 'delivered' | 'cancelled'

export interface Rfq {
  id: string
  /** what it is called on the screen and on the phone — RFQ-1, RFQ-2 */
  no: string
  itemId: string
  qty: number
  /** the date the material is actually wanted by */
  neededBy: string
  /** who was asked. Empty is allowed: a draft is a note to yourself. */
  vendorIds: string[]
  state: RfqState
  raisedOn: string
  note?: string
}

/**
 * One material on a quotation: what they would charge, and how fast.
 *
 * Its own state, because taking a price is a decision per material. A
 * quotation pricing six things is rarely six things you want from them — you
 * take the two they are cheapest on and leave the rest, and accepting the
 * whole page would write four rates you did not agree to.
 */
export interface QuoteLine {
  /** quotation-scoped, the way a document's lines are — `QT-001/1` */
  id: string
  itemId: string
  unitPrice: number
  /** smallest quantity they will sell at this price */
  moq: number
  /**
   * What their quotation priced against, when it named a quantity.
   *
   * Not a minimum and not a want — "12 MT @ ₹62,800" is usually what somebody
   * asked them about on the phone. It is kept because it is a real number a
   * person wrote down, and when nothing else in the records says how much to
   * buy it beats drafting an order for nothing. See `orderQtyFor`.
   */
  qty?: number
  leadDays: number
  state: QuoteState
}

/**
 * A quotation: one supplier, one date, and the prices on it.
 *
 * It was one record per material, which is what the comparison ranks and what
 * accepting turns into a rate — so a quotation pricing six materials became
 * six records. Correct underneath and wrong as a thing to hold: a quotation is
 * one piece of paper with one number, one date and one validity, and six
 * records meant six deletes, six edits of the same validity, and a screen that
 * said "6 quotes" after one upload.
 *
 * So the header is the paper and the lines are the prices. Nothing downstream
 * lost anything: the comparison reads rates, not quotes, and a rate is still
 * written one material at a time — by accepting one line.
 */
export interface Quote {
  id: string
  /** absent when the price arrived without a request behind it */
  rfqId?: string
  /**
   * The document this was read off, when it was read off one.
   *
   * What it buys now is the link back — "the original" on the card. It used to
   * do the grouping as well, when six records had to be gathered up again;
   * the quotation being one record makes that unnecessary.
   */
  docId?: string
  vendorId: string
  /** their own reference, if they gave one */
  ref?: string
  /**
   * The day their prices stop being their prices.
   *
   * Almost every quotation says so and this build threw it away. A rate that
   * expired in March is still ranking suppliers in September with nothing
   * said, which is the quiet kind of wrong figure this build exists to avoid.
   * Optional, because a price settled on the phone carries no validity and
   * inventing one would be worse than having none.
   */
  validUntil?: string
  on: string
  lines: QuoteLine[]
}

/**
 * Where a quotation has got to, from the lines on it.
 *
 * Derived rather than stored, because it is not a separate fact: a quotation
 * somebody has taken something off is answered, one they turned down entirely
 * is closed, and anything else is still open.
 */
export function quoteState(q: Quote): QuoteState {
  if (q.lines.some((l) => l.state === 'accepted')) return 'accepted'
  if (q.lines.length > 0 && q.lines.every((l) => l.state === 'rejected')) return 'rejected'
  return 'received'
}

/**
 * A rate changing, kept because nothing else remembers that it did.
 *
 * `VendorItem` holds one rate — the current one — so a supplier putting their
 * price up left no trace at all. An owner asking "has steel gone up?" had
 * nowhere to look. Appended to, never edited: this is what happened.
 */
export interface RateChange {
  id: string
  vendorId: string
  itemId: string
  /** what it was. Zero when this is the first rate ever agreed for the pairing */
  was: number
  now: number
  on: string
  /** what caused it — taking a quotation's price, or typing it in */
  via: 'quote' | 'entered'
}

export interface PurchaseOrder {
  id: string
  no: string
  vendorId: string
  itemId: string
  qty: number
  unitPrice: number
  orderedOn: string
  expectedOn: string
  state: OrderState
  /** the quotation it came from, when it came from one */
  quoteId?: string
  /**
   * And which price on it.
   *
   * The quotation alone is not enough to tell whether a line has been ordered
   * already: three prices taken off one quotation share a `quoteId`, and a
   * quotation can carry two lines for the same material. Without this, drafting
   * again after accepting two more prices would re-order the first three.
   */
  quoteLineId?: string
  /**
   * Every version of the line the supplier has been, or might have been, told.
   *
   * Absent until the order is handed over: a draft is on your desk, and an
   * edit to something nobody else has seen is not a change. The first hand-over
   * writes version 1, and from then on `qty` and `expectedOn` above are OUR
   * truth — what we now want — while the supplier's truth is whichever version
   * they confirmed. The two differ exactly when a change has not landed, which
   * is the whole of INB-02.
   *
   * The domain's own `PoRevision`, not a copy of it, so the sample's order
   * change arithmetic runs on this unchanged.
   */
  revisions?: PoRevision[]
  /** the highest version the supplier has been sent */
  notifiedVersion?: number
  /**
   * The highest version they confirmed back. The only quantity cover may use:
   * an internal change does not improve anybody's stock position until the
   * supplier has agreed to make it.
   */
  ackedVersion?: number
  notifiedOn?: string
  ackedOn?: string
  /** what they confirmed with, in words — "WhatsApp from Rakesh, 14:10" */
  ackRef?: string
  /**
   * A picture of the confirmation, when there is one — a screenshot, a photo of
   * a signed copy. An id into the files kept on this device, never the bytes:
   * the workspace is pushed whole on a timer, and an image in it would make
   * every save carry it.
   */
  ackImageId?: string
}

/**
 * Goods arriving, which is what turns remembered into measured.
 *
 * §5 makes lead time the trailing average of the last six actual receipts and
 * calls that non-negotiable, precisely because the quoted figure flatters. The
 * owner's workspace passed an empty receipt list to every derivation, so their
 * lead times and rejection rates could only ever be what somebody typed. This
 * is the record that changes it.
 *
 * `accepted` and `rejected` are kept separately rather than derived from each
 * other, because a delivery can be short: 100 ordered, 96 arrived, 4 of those
 * rejected. Three figures, three different things to know.
 */
export type ReceiptStatus = 'open' | 'closed'

export interface GoodsReceipt {
  id: string
  /**
   * The order line it came against — absent for a jobwork return, which came
   * back against a challan, not an order.
   */
  orderId?: string
  /** the challan it came back against, when it is a jobwork return */
  challanId?: string
  vendorId: string
  itemId: string
  /** what turned up */
  qty: number
  /** how much of it you could use */
  accepted: number
  /** and how much you could not */
  rejected: number
  /** why, in the owner's words */
  note?: string
  /**
   * Copied off the order rather than looked up.
   *
   * A receipt has to be able to say how long it took on its own — the order it
   * came against can be edited, and a lead time that changes because somebody
   * corrected a date last month is not a measurement.
   */
  orderedOn: string
  /**
   * And what was promised, copied off the order for the same reason.
   *
   * On-time is a comparison against the date the supplier gave. If it were
   * looked up when the tile is drawn, correcting a delivery date next month
   * would change whether last month's delivery was late — which is not a
   * measurement, it is a rewrite. Optional: receipts recorded before this
   * existed have no promise to be judged against, and are left out of the
   * figure rather than counted as on time.
   */
  expectedOn?: string
  receivedOn: string
  /**
   * Open while it waits at the gate, closed once somebody has inspected it.
   *
   * Nothing becomes usable stock until it is closed — no lot is written and the
   * order does not move — because a lorry at the gate is not material you can
   * issue. Absent reads as closed: every receipt recorded before the gate
   * existed was recorded as a finished fact, and that is what it stays.
   */
  status?: ReceiptStatus
  /** each check on the material's spec, marked — the domain's own shape */
  results?: CheckResult[]
  failedCheckIds?: string[]
  /**
   * Why a failed check let everything through. Override, never block: a check
   * can fail with nothing rejected, but only against a reason in writing.
   */
  deviationReason?: string
  /** why some was rejected when no check failed — a rejection always has a reason */
  rejectReason?: string
  /** who inspected it — the signed-in name, for the trail */
  inspector?: string
  closedAt?: string
  /** the material had no checks written, so it closed unchecked and says so */
  noSpec?: boolean
  /** the version of the order the supplier had confirmed when it arrived */
  againstVersion?: number
  /**
   * What the material was valued at before this receipt moved it (§13-1 values
   * stock at the last purchase price). Kept so removing the receipt can put the
   * valuation back rather than leave it on a price nobody paid.
   */
  priceBefore?: number
}

/**
 * Material sent out to a jobworker, and everything that happened to it since.
 *
 * Deliberately no `returned` figure: what came back is derived from the
 * receipts that carry this challan's id, so a return cannot be counted without
 * passing through the same gate as a purchase. The sample company's rule,
 * kept.
 */
export interface Challan {
  id: string
  /** what it is called on the phone — JW-1, JW-2 */
  no: string
  /** the jobworker, who is a supplier of type Jobworker */
  vendorId: string
  itemId: string
  qtySent: number
  sentOn: string
  /** the day they promised it back — the latest of any extensions below */
  dueBack: string
  /**
   * What should come back per unit sent. Below 1 for cutting or machining,
   * where the difference is allowed process loss; above 1 for galvanising,
   * which adds weight.
   */
  expectedYield: number
  /** ₹ per unit when it left — last purchase price, ex-freight (§13-1) */
  rate: number
  /** what they are doing to it */
  process?: string
  note?: string
  status: 'out' | 'closed'
  closedOn?: string
  closeReason?: string
  /** what was still unaccounted for when it closed — the write-off */
  writtenOff?: number
  /** every time the promised date moved, kept rather than written over */
  extensions?: { from: string; to: string; on: string; reason: string }[]
  /**
   * The style, job or order it went out for. Line watch gives that one its
   * material first when it comes back; blank is material out for stock.
   */
  jobId?: string
}

/* -------------------------------------------------------------- the store -- */

/**
 * A place stock sits — A-1, "Fabric wall", "Trims cupboard". One store, many
 * racks: every lot is on one of them, and a count is walked rack by rack.
 */
export interface Rack {
  id: string
  name: string
  note?: string
}

/**
 * A lot as the owner's store holds it.
 *
 * Structurally still the domain's `StockLot` — every field added is optional —
 * so the derivation takes it unchanged and every reader written before racks
 * existed still compiles. `qty` stays the balance; `moves` below is the
 * journal behind it, and nothing but `post` in `ledger.ts` writes it.
 */
export type WsLot = StockLot & {
  rack?: string
  /** the day it came to be: the opening count, the receipt closed, the return */
  on?: string
  receiptId?: string
  challanId?: string
  /**
   * A remnant: returned from a job short of a full piece, or left over from a
   * cut. Never counted as cover — a remnant is offered against an order, not
   * assumed to be one.
   */
  remnant?: true
  pieces?: number
  /** a cut's remnant: the piece size in the item's unit, and what it is */
  size?: number
  spec?: string
  cutId?: string
}

/** A line in the journal. The domain's movement, and the job it was for. */
export type StockMove = StockMovement & { jobId?: string }

/**
 * A lot moved from one rack to another, or put on hold and released. No
 * quantity changes, so neither is a movement — but both are on the lot's
 * trail, dated and named.
 */
export interface Transfer {
  id: string
  lotId: string
  from?: string
  to?: string
  /** a change of state rather than of place */
  state?: { from: Usability; to: Usability; note?: string }
  on: string
  actor: string
}

/** A count of one lot, and the walk of the rack it was part of. */
export type WsCount = CycleCount & { rack?: string; sheet?: string }

/** What material leaves the store against — a job, a style, an order. */
export interface Job {
  id: string
  /** the owner's own number — ST-4521, JOB-12 */
  no: string
  name?: string
  customer?: string
  openedOn: string
  closedOn?: string
  note?: string
  /*
   * The plan, which Production adds: what it makes, how many, when, and at
   * what pace. All optional — a style opened in the store with none of it is
   * still a style material can be issued against; Production asks for a plan.
   */
  productId?: string
  qty?: number
  plannedStart?: string
  plannedFinish?: string
  /** pieces a working day — the daily target output is measured against */
  perDay?: number
  /** what it needs: worked out from the product's material list, and adjustable */
  needs?: { itemId: string; qty: number }[]
}

export interface JobNumbering {
  prefix: string
  word: 'job' | 'style' | 'order'
}

/** A slip: material out of the store against a job, or back into it. */
export interface IssueSlip {
  id: string
  /** IS-1, IS-2 */
  no: string
  kind: 'issue' | 'return'
  jobId: string
  on: string
  takenBy: string
  actor: string
  note?: string
  /** `pieces` is set when remnant pieces were issued, so taking the slip back restores the count */
  lines: { lotId: string; itemId: string; qty: number; pieces?: number }[]
}

export type WsCut = CutRecord & { jobId?: string; rack?: string }
/** A loss, the job it happened on, and what the person recording it said. */
export type WsLoss = LossRecord & { jobId?: string; note?: string }

/* -------------------------------------------------------- the floor -- */

/**
 * What the company makes, and what goes into one.
 *
 * Structurally the domain's finished good — code, name, unit, what one costs
 * to make, HSN — plus the material list. `builtBy` is not stored: which jobs
 * make it is read off the jobs, never kept twice. A quantity per unit of 0 is
 * "not said yet", which Line watch treats as needing nothing and the Products
 * screen flags.
 */
export interface Product {
  id: string
  code: string
  name: string
  uom: Uom
  /** ₹ to make one — finished stock is valued at this, never at a selling price */
  standardCost?: number
  hsn?: string
  bom: { itemId: string; qtyPerUnit: number }[]
  note?: string
}

/** Pieces off a job on a day: the good ones go to finished stock, the rejected do not. */
export interface Output {
  id: string
  jobId: string
  on: string
  good: number
  rejected: number
  /** why the rejected ones were rejected — one of the floor rules' reasons */
  reason?: string
  actor: string
  note?: string
}

export type HaltCause = 'material' | 'machine' | 'manpower' | 'power' | 'quality' | 'jobworker' | 'other'

/** The floor stopped on a job, why, and when it started again. */
export interface Halt {
  id: string
  jobId: string
  on: string
  cause: HaltCause
  note?: string
  resumedOn?: string
  actor: string
}

export interface FloorRules {
  /** 0 is Sunday — the days a target is set for */
  workingDays: number[]
  /** behind the daily target by more than this share counts as behind */
  behindPct: number
  rejectReasons: string[]
}

/* ------------------------------------------------------ the shipping bay -- */

export interface WsCustomer {
  id: string
  name: string
  gstin?: string
  /** read off the GSTIN when it is given; typed when it is not */
  state?: string
  shipTo?: string
  phone?: string
  email?: string
  /** only used to work out freight from a carrier's rate */
  distanceKm?: number
  paymentTerms?: number
  note?: string
}

export type CarrierMode = 'own' | 'part' | 'full' | 'courier' | 'other'

export interface WsCarrier {
  id: string
  name: string
  mode: CarrierMode
  /** ₹ per kg per km, when they quote one */
  ratePerKgKm?: number
  phone?: string
  note?: string
}

/** A customer's order: what, how many, at what rate, by when — and which style makes it. */
export interface CustomerOrder {
  id: string
  /** SO-1, SO-2 */
  no: string
  customerId: string
  takenOn: string
  promisedDate: string
  state: 'open' | 'cancelled'
  note?: string
  lines: OrderLine[]
}

export interface OrderLine {
  /** order-scoped — SO-001/1 */
  id: string
  productId: string
  qty: number
  /** what the customer is charged per unit */
  rate: number
  /** the style or job making it, when one does */
  jobId?: string
}

/** Goods out of the bay against an order — the domain's despatch note, on the owner's ids. */
export interface DispatchNote {
  id: string
  /** DN-1, DN-2 */
  no: string
  orderId: string
  customerId: string
  on: string
  lines: { productId: string; qty: number }[]
  weightKg?: number
  /** who let the goods out. A dispatch without a name is stock walking. */
  authorisedBy: string
  actor: string
  note?: string
}

/** A note on its way with a carrier, and whether it got there. One per note at most. */
export interface WsConsignment {
  id: string
  noteId: string
  carrierId: string
  /** the docket the carrier's own system knows it by */
  lrNo?: string
  /** the day the customer was told it would arrive */
  promisedDate: string
  deliveredOn?: string
  /** ₹ — the carrier's bill for it */
  freight?: number
  /** who confirmed it arrived, and how. A date with no name is a guess. */
  confirmedBy?: string
  note?: string
}

/** Goods coming back from a customer. */
export interface WsRma {
  id: string
  /** RMA-1 */
  no: string
  orderId: string
  noteId: string
  customerId: string
  productId: string
  qty: number
  reason: string
  raisedOn: string
  dueBy: string
  owner: string
  state: 'authorised' | 'received' | 'closed'
  receivedOn?: string
  checkedBy?: string
  /** of what came back: fit to sell again, and not */
  good?: number
  damaged?: number
  damageNote?: string
}

export interface DispatchRules {
  /** ₹ — a consignment worth this or more needs an e-way bill */
  ewayThreshold: number
  otifTargetPct: number
  /** days from order to promise, offered on a new order */
  promiseDays: number
  /** days a customer is given to send a return back */
  returnDays: number
}

/* --------------------------------------------- fields the owner invents -- */

/**
 * A column this build did not think of.
 *
 * Every business has a few — a GST number, an MSME registration, a drawing
 * number, a rating somebody keeps in their head. A system that cannot hold them
 * is a system with a spreadsheet open beside it, which is the thing this is
 * supposed to replace.
 *
 * Values are kept as strings and interpreted through `kind`, so changing a
 * field from text to number never destroys what somebody already typed. The
 * kind decides the input, the alignment, the sort and how an import validates —
 * not how it is stored.
 */
export type FieldKind = 'text' | 'number' | 'date' | 'choice' | 'yesno'

/**
 * The lists that carry custom fields.
 *
 * Quotes and orders were left out when this was written, and the note here
 * said they came later. This is later: a quotation arrives carrying an HSN
 * code, a brand or a pack size, and a list that cannot hold those is a list
 * with a spreadsheet open beside it.
 */
export type SheetEntity =
  | 'supplier' | 'material' | 'rfq' | 'quote' | 'order'
  /** the inbound desk's three lists */
  | 'check' | 'receipt' | 'challan'
  /** the store's */
  | 'rack' | 'lot' | 'count' | 'move' | 'job' | 'issue' | 'loss' | 'cut' | 'offcut'
  /** the floor's */
  | 'product' | 'output' | 'halt'
  /** the shipping bay's */
  | 'customer' | 'carrier' | 'salesOrder' | 'dispatchNote' | 'consignment' | 'rma'

export interface FieldDef {
  id: string
  entity: SheetEntity
  label: string
  kind: FieldKind
  /** for `choice` — the list offered, which the owner edits */
  choices?: string[]
  /** for `number` — printed after the figure, e.g. "kg" */
  unit?: string
  /** print this on the RFQ document as well as the screen */
  onDoc?: boolean
}

/**
 * How one list's table is arranged.
 *
 * `order` holds built-in column keys and field ids in one sequence, because to
 * the person arranging them they are the same thing — a column. `labels` only
 * carries the ones that have been renamed, so a built-in head that nobody
 * touched keeps following the build rather than freezing at whatever it said
 * the day somebody opened this dialog.
 */
export interface TableView {
  order: string[]
  hidden: string[]
  labels: Record<string, string>
  /**
   * Columns the owner has deliberately un-hidden.
   *
   * Some columns hide themselves until somebody fills them — a phone number,
   * a quotation reference. That is a rule, not a decision, and the two have to
   * be told apart: writing the rule's current answer into `hidden` turns it
   * into a decision, and the column then stays hidden for ever even once it
   * has values in it. An import that invented a column did exactly that, so a
   * sheet full of quotation numbers arrived with the reference column pinned
   * shut. This is the third state the rule needs — decided-to-show, as against
   * decided-to-hide and never-decided.
   */
  shown?: string[]
}

/** How to reach a supplier. `Vendor` is pinned, so this lives beside it. */
export interface VendorContact {
  email?: string
  phone?: string
  /**
   * Where they are.
   *
   * Asked for because a purchase order is addressed to somebody — a request
   * for prices can go out with a name on it, an order cannot. Optional, like
   * the rest: an owner who only has a WhatsApp number for a supplier still
   * gets a document, just without a line under their name.
   */
  address?: string
}

/**
 * That a document was handed to somebody, and how. The system never sends.
 *
 * `kind` and `id` rather than `rfqId`, because a purchase order is handed over
 * the same four ways a request is and the log is how a week of silence becomes
 * visible. Entries saved before orders could be put on paper are read as
 * requests by `migrate`, which is what they were.
 */
export interface SendEntry {
  kind: 'rfq' | 'po' | 'grn' | 'dn'
  /** the request's id, the order NUMBER — several lines are one document —
   *  the receipt's id, or the dispatch note's */
  id: string
  /** who it went to: a supplier, or for a dispatch note the customer */
  vendorId: string
  via: 'whatsapp' | 'email' | 'share' | 'download' | 'print'
  at: string
}

/**
 * Enough to put the last import back, and nothing more.
 *
 * Deliberately a list of what the import DID rather than a copy of what the
 * workspace looked like before it. A snapshot is the obvious design and it is
 * wrong twice over: restoring it throws away every unrelated edit made since,
 * and because custom values for all three lists live in one map, undoing a
 * supplier import would wipe values somebody had typed against materials.
 *
 * A delta undoes exactly the rows the import touched. Records it created are
 * removed through the normal cascade helpers so nothing is orphaned; records it
 * changed are put back field by field; cells and fields it added go with them.
 */
export interface ImportUndo {
  id: string
  entity: SheetEntity
  at: string
  source: string
  /** ids this import brought into existence */
  created: string[]
  /** what the records it overwrote looked like first */
  updated: { id: string; before: Record<string, unknown> }[]
  /**
   * Rates written over an existing pairing, by `vendorId|itemId`.
   *
   * Declared when the undo was written and, until now, produced by nothing and
   * read by nothing — so a rate this build overwrote could not be put back.
   * Approving a supplier's quotation is almost entirely the act of setting
   * rates, so this is where the field finally earns its declaration.
   */
  vendorItemsBefore?: { key: string; before: VendorItem | null }[]
  /**
   * Items whose `lastPurchaseRate` was back-filled from a quoted rate. It is a
   * valuation basis (§13-1), so putting a rate back without putting this back
   * would leave the stock valued off a figure nobody agreed to.
   */
  itemRatesBefore?: { id: string; before: number }[]
  /** wordings this action taught, so undoing it un-teaches them */
  aliasesCreated?: { vendorId: string; raw: string }[]
  /** the document this approval filed, which goes back to waiting */
  docApproved?: string
  /** side-table entries it wrote, and what was there before */
  sideBefore?: { map: 'vendorType' | 'itemGroup'; id: string; before: string | null }[]
  /** custom cells it wrote: [recordId, fieldId, whatWasThereBefore] */
  cells: [string, string, string][]
  /** fields the mapping step created, which nothing else has used */
  fieldsCreated: string[]
  /** opening stock lots written by an on-hand column */
  lotsCreated?: string[]
  added: number
  changed: number
}

export interface Workspace {
  id: string
  createdAt: string
  owner: { name: string; contact: string }
  /** `name` and `makes` are asked at sign-up; the rest is the RFQ letterhead */
  company: {
    name: string
    makes: string
    address?: string
    gstin?: string
    /** for place of supply; read off the GSTIN when absent */
    state?: string
    phone?: string
    email?: string
  }
  people: Person[]
  categories: Categories
  /** the masters the set-up steps write */
  items: Item[]
  vendors: Vendor[]
  vendorItems: VendorItem[]
  stockLots: WsLot[]
  /** step 5 — the rules, which the Sourcing Desk's own panel then edits */
  policy: Policy
  /** this company's vocabulary, keyed by vendor id and item id */
  vendorType: Record<string, string>
  itemGroup: Record<string, string>
  /** what you asked for, what came back, what you ordered */
  rfqs: Rfq[]
  quotes: Quote[]
  orders: PurchaseOrder[]
  /** and what actually turned up, which is the only thing that measures anybody */
  receipts: GoodsReceipt[]
  /**
   * What to check when each material arrives. The domain's own `SpecCheck`,
   * keyed to a material by `itemId`, so the sample's inspection arithmetic —
   * whether an inspection is complete, which checks failed — runs on it as is.
   */
  specChecks: SpecCheck[]
  /** material out at jobworkers, and what came of it */
  challans: Challan[]
  /** every time a rate moved, so "has it gone up?" has an answer */
  rateLog: RateChange[]
  /** the columns the owner invented, and what each record holds in them */
  fields: FieldDef[]
  /**
   * recordId → fieldId → value. One map across all three lists, which is safe
   * because `nextId` gives each its own prefix — VN-001, IT-001, RF-001.
   */
  custom: Record<string, Record<string, string>>
  /** how each list's table is arranged */
  views: Record<SheetEntity, TableView>
  /** where to reach a supplier, for handing them a request */
  vendorContact: Record<string, VendorContact>
  /** that a request was handed over, and how */
  sendLog: SendEntry[]
  /**
   * The documents suppliers have sent, and what became of each. The bytes are
   * never here — they are far too big for a blob that is pushed whole on a
   * couple of seconds' delay. Only what was read out of them.
   */
  docs: SupplierDoc[]
  /** each supplier's own wording, resolved for good */
  aliases: VendorAlias[]
  /** the one import that can still be undone */
  lastImport?: ImportUndo
  /**
   * The highest id issued per prefix, ever. Kept rather than derived so that
   * deleting the newest record cannot hand its id to the next one — see
   * `issueId` in `defaults.ts`.
   */
  nextIds: Record<string, number>
  /**
   * What shape this blob is in. Lets `migrate` be explicit about a change
   * instead of null-coalescing every field for ever. The localStorage KEY must
   * never change: bumping it signs everybody out.
   */
  schema?: number
  /** a wizard closed halfway reopens where it was */
  drafts: Record<string, unknown>
  /**
   * Which figures the owner keeps on the dashboard.
   *
   * Undefined means they have never chosen, and the default set stands. An
   * empty array is a choice — somebody who wants the work queue and nothing
   * else — so it is not the same as never having decided.
   */
  metricPicks?: string[]
  /**
   * Flips the owner has looked at and decided to leave.
   *
   * itemId → what the comparison looked like when they looked. "I know
   * somebody is cheaper and I am staying with them" is a real decision, and
   * without somewhere to put it the queue asks the same question every
   * morning until the owner stops reading the queue.
   *
   * It stores the shape of the comparison rather than a date, so the question
   * comes back when the answer might have changed — a new rate, a different
   * supplier winning — and not merely because a week passed.
   */
  reviewedFlips?: Record<string, string>
  /**
   * The inbound dashboard's figures, chosen separately from sourcing's. One
   * list for both would have every existing owner's sourcing choice decide
   * what the gate shows — and absent here means the same as there: nobody
   * has chosen yet.
   */
  inboundMetricPicks?: string[]

  /* ------------------------------------------------------------ the store */
  racks: Rack[]
  /**
   * The journal: every change to a lot's quantity, against the document that
   * made it. Σ per lot equals `lot.qty`, always — the tests hold it to that.
   * Append-only; at a small firm's volume that is a few hundred lines a month.
   */
  moves: StockMove[]
  transfers: Transfer[]
  counts: WsCount[]
  jobs: Job[]
  /** absent until the owner says what they call a job */
  jobNumbering?: JobNumbering
  issues: IssueSlip[]
  /**
   * Whether this company cuts material into parts — fabric lays, sheet, tube.
   * Absent reads as no. The records behind it exist either way, so switching
   * it on later is a choice, not a migration.
   */
  cutting?: boolean
  cuts: WsCut[]
  losses: WsLoss[]
  /** below this piece size a remnant is scrap at the cut, by item id */
  minRemnant: Record<string, number>
  /** ₹ per unit a scrap dealer pays, by item id; absent is dead loss */
  scrapRate: Record<string, number>
  inventoryMetricPicks?: string[]

  /* ------------------------------------------------------------ the floor */
  products: Product[]
  outputs: Output[]
  halts: Halt[]
  /** absent until the floor rules are agreed; the defaults stand in */
  floor?: FloorRules
  /**
   * Finished goods' journal, in the domain's own shape: output booked in,
   * dispatch notes out, returns back. A balance is a sum of these, always.
   */
  fgMoves: FgMovement[]
  productionMetricPicks?: string[]

  /* ----------------------------------------------------- the shipping bay */
  customers: WsCustomer[]
  carriers: WsCarrier[]
  customerOrders: CustomerOrder[]
  dispatchNotes: DispatchNote[]
  consignments: WsConsignment[]
  rmas: WsRma[]
  dispatchRules?: DispatchRules
  dispatchMetricPicks?: string[]
}

/**
 * Raised whenever `migrate` has to do something a past version cannot undo.
 *
 * 3 records supplier documents and learned wordings. 4 records goods arriving,
 * which is what moves a lead time and a rejection rate off what somebody typed.
 * 5 makes a quotation one record with lines on it rather than one record per
 * material, and `migrate` gathers the old flat ones back up by the document
 * they came off.
 *
 * 6 turns the inbound stage on: checks per material, receipts that wait open
 * at the gate until inspected, the versions of an order the supplier has been
 * told and confirmed, and material out at jobworkers.
 *
 * Nothing reads this number yet — it is written and kept — so what the bump
 * documents is the direction it cannot go: a build from before 6 reading a
 * workspace saved by this one would treat an uninspected receipt as stock.
 *
 * 7 opens the store: a journal of movements behind every lot, racks, counts,
 * jobs and what is issued against them, cuts and losses. Every lot saved
 * before it gets one opening movement, so the journal adds up from the first
 * load. A build from before 7 would read a remnant as cover, and would not
 * know that material sent to a jobworker left a lot rather than a new one.
 *
 * 8 opens the floor and the shipping bay: products and their material lists,
 * a plan on a job, output and halts, finished goods' own journal, customers,
 * carriers, orders, dispatch notes, consignments and returns. All empty on a
 * workspace saved before; nothing is derived for them.
 */
export const SCHEMA = 8

/** Which company the screens are reading. The sample is never written to. */
export type WorkspaceMode = 'sample' | 'mine'

export interface Session {
  /** what the audit trail records against every action */
  actor: string
  role: PersonRole
}
