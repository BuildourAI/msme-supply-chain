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
import type { Item, StockLot, Uom, Vendor, VendorItem } from '@/lib/domain/types'
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
export interface GoodsReceipt {
  id: string
  /** the order line it came against */
  orderId: string
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
export type SheetEntity = 'supplier' | 'material' | 'rfq' | 'quote' | 'order'

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
  kind: 'rfq' | 'po'
  /** the request's id, or the order NUMBER — several lines are one document */
  id: string
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
    phone?: string
    email?: string
  }
  people: Person[]
  categories: Categories
  /** the masters the set-up steps write */
  items: Item[]
  vendors: Vendor[]
  vendorItems: VendorItem[]
  stockLots: StockLot[]
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
 * Nothing reads this number yet — it is written and kept — so what the bump
 * documents is the direction it cannot go: a build from before 5 reading a
 * workspace saved by this one finds quotes it cannot parse at all.
 */
export const SCHEMA = 5

/** Which company the screens are reading. The sample is never written to. */
export type WorkspaceMode = 'sample' | 'mine'

export interface Session {
  /** what the audit trail records against every action */
  actor: string
  role: PersonRole
}
