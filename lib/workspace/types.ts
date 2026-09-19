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

export interface Quote {
  id: string
  /** absent when the price arrived without a request behind it */
  rfqId?: string
  vendorId: string
  itemId: string
  unitPrice: number
  /** smallest quantity they will sell at this price */
  moq: number
  leadDays: number
  /** their own reference, if they gave one */
  ref?: string
  state: QuoteState
  on: string
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
  /** the quote it came from, when it came from one */
  quoteId?: string
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

/** The three lists that carry custom fields. Quotes and orders come later. */
export type SheetEntity = 'supplier' | 'material' | 'rfq'

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
}

/** A supplier's phone and email. `Vendor` is pinned, so they live beside it. */
export interface VendorContact {
  email?: string
  phone?: string
}

/** That a request was handed to somebody, and how. The system never sends. */
export interface SendEntry {
  rfqId: string
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
}

/**
 * Raised whenever `migrate` has to do something a past version cannot undo.
 *
 * 3 records supplier documents and learned wordings. Nothing reads this number
 * yet — it is written and kept — so what the bump documents is the direction it
 * cannot go: a build from before 3 reading a workspace saved by this one will
 * drop both on its next migrate.
 */
export const SCHEMA = 3

/** Which company the screens are reading. The sample is never written to. */
export type WorkspaceMode = 'sample' | 'mine'

export interface Session {
  /** what the audit trail records against every action */
  actor: string
  role: PersonRole
}
