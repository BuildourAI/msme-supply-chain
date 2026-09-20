/**
 * The sourcing desk's own logic: numbering, joins, and what a delete takes
 * with it.
 *
 * Everything a screen needs is computed here so that the screens stay what they
 * look like in the reference portal — a title, a table, and nothing else. No
 * component does a join, sums a total or decides a state.
 *
 * Deliberately not a workflow engine. The three records reference each other
 * but nothing forces the order: a quote can arrive with no request behind it, an
 * order can be raised with no quote. Small firms quote on WhatsApp and settle
 * prices on the phone, and a system that refuses that is one they keep a
 * parallel notebook for. What the joins do is notice the connection when it is
 * there — a quote recorded against a request moves the request on by itself.
 */
import type { Item, Vendor } from '@/lib/domain/types'
import { pruneCustom } from './fields'
import { repriceTerms } from './landed'
import { backfillRates, buildRate } from './records'
import type { SupplierDoc } from '@/lib/intake/types'
import type { PurchaseOrder, Quote, Rfq, RfqState, Workspace } from './types'

/* ------------------------------------------------------------- numbering -- */

/**
 * The next document number. Counts up from the highest ever issued, never from
 * how many survive — a deleted RFQ-3 must not be handed out again, or last
 * month's quotes would attach themselves to a different request.
 */
export function nextNo(prefix: string, existing: { no: string }[]): string {
  const re = new RegExp(`^${prefix}-(\\d+)$`)
  const highest = existing.reduce((max, e) => {
    const m = re.exec(e.no)
    return m ? Math.max(max, Number(m[1])) : max
  }, 0)
  return `${prefix}-${highest + 1}`
}

/* ----------------------------------------------------------------- joins -- */

const byId = <T extends { id: string }>(xs: T[], id: string) => xs.find((x) => x.id === id)

export const itemOf = (ws: Workspace, id: string): Item | undefined => byId(ws.items, id)
export const vendorOf = (ws: Workspace, id: string): Vendor | undefined => byId(ws.vendors, id)

export interface SupplierRow {
  vendor: Vendor
  type: string
  /** how many materials they quote a standing rate for */
  supplies: number
  /**
   * The quickest they deliver, across those materials.
   *
   * Measured where goods have been recorded arriving, and what they say about
   * themselves everywhere else. It used to be the quoted figure always, which
   * was the only figure that existed; §5 calls the trailing average of the
   * last six receipts non-negotiable, so the moment there is one it wins.
   */
  leadDays: number | null
  /** whether that figure came from receipts or from the supplier */
  leadMeasured: boolean
  openOrders: number
}

export function supplierRows(ws: Workspace): SupplierRow[] {
  return ws.vendors.map((vendor) => {
    const mine = ws.vendorItems.filter((vi) => vi.vendorId === vendor.id)
    const leads = mine.map((vi) => vi.trailingLeadTimeDays || vi.quotedLeadTimeDays)
      .filter((n) => n > 0)
    return {
      vendor,
      type: ws.vendorType[vendor.id] ?? '',
      supplies: mine.length,
      leadDays: leads.length ? Math.min(...leads) : null,
      leadMeasured: (ws.receipts ?? []).some((r) => r.vendorId === vendor.id),
      openOrders: ws.orders.filter(
        (o) => o.vendorId === vendor.id && o.state !== 'delivered' && o.state !== 'cancelled',
      ).length,
    }
  })
}

export interface MaterialRow {
  item: Item
  group: string
  /** what is on the shelf and issuable */
  onHand: number
  /** how many suppliers quote it — zero is the state worth seeing */
  suppliers: number
}

export function materialRows(ws: Workspace): MaterialRow[] {
  return ws.items.map((item) => ({
    item,
    group: ws.itemGroup[item.id] ?? '',
    onHand: ws.stockLots
      .filter((l) => l.itemId === item.id && l.usability === 'usable')
      .reduce((a, l) => a + l.qty, 0),
    suppliers: ws.vendorItems.filter((vi) => vi.itemId === item.id).length,
  }))
}

export interface RfqRow {
  rfq: Rfq
  item: Item | undefined
  vendors: Vendor[]
  quotes: Quote[]
}

export function rfqRows(ws: Workspace): RfqRow[] {
  return [...ws.rfqs]
    .sort((a, b) => b.raisedOn.localeCompare(a.raisedOn) || b.no.localeCompare(a.no))
    .map((rfq) => ({
      rfq,
      item: itemOf(ws, rfq.itemId),
      vendors: rfq.vendorIds.map((id) => vendorOf(ws, id)).filter(Boolean) as Vendor[],
      quotes: ws.quotes.filter((q) => q.rfqId === rfq.id),
    }))
}

export interface QuoteRow {
  quote: Quote
  vendor: Vendor | undefined
  item: Item | undefined
  rfq: Rfq | undefined
}

export function quoteRows(ws: Workspace): QuoteRow[] {
  return [...ws.quotes]
    .sort((a, b) => b.on.localeCompare(a.on))
    .map((quote) => ({
      quote,
      vendor: vendorOf(ws, quote.vendorId),
      item: itemOf(ws, quote.itemId),
      rfq: quote.rfqId ? byId(ws.rfqs, quote.rfqId) : undefined,
    }))
}

/**
 * Quotes grouped by where they came from, which is how the reference shows
 * them — the comparison is the point, and a flat list of prices against
 * different materials compares nothing.
 *
 * Three kinds of group, in the order they are worth seeing:
 *
 * A request, and the prices that came back against it. Those are for one
 * material from several suppliers, which is the comparison this screen exists
 * for.
 *
 * A document. A quotation quoting six materials is six quotes, and they
 * arrived on one piece of paper — so they sit in one box headed by the
 * supplier and the quotation number, with the original a click away. They used
 * to fall into the loose bucket with everything else, which turned one upload
 * into six unrelated cards and is what this grouping exists to stop.
 *
 * And everything else: a price somebody wrote down off a phone call, which is
 * how most of them arrive and is not a failure to be hidden.
 */
export interface QuoteGroup {
  rfq: Rfq | null
  /** set when these quotes were all read off one supplier document */
  doc?: SupplierDoc
  rows: QuoteRow[]
}

export function quoteGroups(ws: Workspace): QuoteGroup[] {
  const rows = quoteRows(ws)

  const byRfq: QuoteGroup[] = ws.rfqs
    .map((rfq) => ({ rfq, rows: rows.filter((r) => r.quote.rfqId === rfq.id) }))
    .filter((g) => g.rows.length > 0)

  const loose = rows.filter((r) => !r.quote.rfqId)

  /*
   * By document, newest first, so a quotation that came in this morning is at
   * the top. A quote whose document has since been deleted keeps its `docId`
   * and finds no document here, so it falls through to the loose bucket rather
   * than forming a group with no heading.
   */
  const byDoc: QuoteGroup[] = []
  const filed = new Set<string>()
  for (const doc of [...(ws.docs ?? [])].sort((a, b) => b.addedAt.localeCompare(a.addedAt))) {
    const mine = loose.filter((r) => r.quote.docId === doc.id)
    if (mine.length === 0) continue
    byDoc.push({ rfq: null, doc, rows: mine })
    for (const r of mine) filed.add(r.quote.id)
  }

  const rest = loose.filter((r) => !filed.has(r.quote.id))
  return [
    ...byRfq,
    ...byDoc,
    ...(rest.length ? [{ rfq: null, rows: rest }] : []),
  ]
}

export interface OrderRow {
  order: PurchaseOrder
  vendor: Vendor | undefined
  item: Item | undefined
  total: number
}

export function orderRows(ws: Workspace): OrderRow[] {
  return [...ws.orders]
    .sort((a, b) => b.orderedOn.localeCompare(a.orderedOn) || b.no.localeCompare(a.no))
    .map((order) => ({
      order,
      vendor: vendorOf(ws, order.vendorId),
      item: itemOf(ws, order.itemId),
      total: Math.round(order.qty * order.unitPrice * 100) / 100,
    }))
}

/* ----------------------------------------------------------- transitions -- */

/**
 * Where a request has got to, given the quotes against it.
 *
 * Only the states the data can prove are moved. Draft and closed are decisions
 * a person makes, so they are left alone: a request somebody has deliberately
 * closed does not reopen itself because a late quote arrived.
 */
export function rfqStateFrom(rfq: Rfq, quotes: Quote[]): RfqState {
  if (rfq.state === 'draft' || rfq.state === 'closed') return rfq.state
  const mine = quotes.filter((q) => q.rfqId === rfq.id)
  if (mine.some((q) => q.state === 'accepted')) return 'awarded'
  if (mine.length > 0) return 'quoted'
  return 'sent'
}

/** Re-reads every request against the quotes, after any quote changes. */
export function syncRfqStates(ws: Workspace): Workspace {
  const rfqs = ws.rfqs.map((r) => {
    const state = rfqStateFrom(r, ws.quotes)
    return state === r.state ? r : { ...r, state }
  })
  return rfqs.every((r, i) => r === ws.rfqs[i]) ? ws : { ...ws, rfqs }
}

/**
 * An order prefilled from a quote. It is offered, never posted: §11 has said
 * from the start that the system suggests and drafts, and that a person places
 * the order. Accepting a price is not the same act as committing the money.
 */
export function orderFromQuote(ws: Workspace, quote: Quote, today: string): Omit<PurchaseOrder, 'id'> {
  // What you asked for, if you asked. A quote's minimum order is the floor a
  // supplier will sell at, not a quantity anybody wanted, and most quotes carry
  // no minimum at all — taking it blindly drafts an order for nothing.
  const asked = quote.rfqId ? ws.rfqs.find((r) => r.id === quote.rfqId)?.qty : undefined
  const qty = asked && asked > 0 ? Math.max(asked, quote.moq) : quote.moq
  return {
    no: nextNo('PO', ws.orders),
    vendorId: quote.vendorId,
    itemId: quote.itemId,
    qty: qty > 0 ? qty : 0,
    unitPrice: quote.unitPrice,
    orderedOn: today,
    expectedOn: addDays(today, quote.leadDays || 0),
    state: 'draft',
    quoteId: quote.id,
  }
}

export function addDays(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

/* --------------------------------------------------------------- deletes -- */

/**
 * What else goes when this goes.
 *
 * A delete that silently takes six other records with it is how a person loses
 * an afternoon's typing. The screen asks once, and it can only ask usefully if
 * it can say what is attached.
 */
export interface DeleteImpact {
  /** one line per kind of thing that would go, already worded for the dialog */
  losses: string[]
  /** nothing attached — the dialog can be a single confirm */
  clean: boolean
  /**
   * What survives, when that is the question somebody is actually asking.
   *
   * Deleting a supplier's document is the case this exists for: the fear is
   * that the rates go with it, and they do not. Saying so before the button is
   * pressed is cheaper than a sentence afterwards explaining that they are
   * still there.
   */
  keeps?: string
}

const count = (n: number, one: string, many = `${one}s`) =>
  `${n} ${n === 1 ? one : many}`

export function vendorImpact(ws: Workspace, vendorId: string): DeleteImpact {
  const rates = ws.vendorItems.filter((vi) => vi.vendorId === vendorId).length
  const quotes = ws.quotes.filter((q) => q.vendorId === vendorId).length
  const orders = ws.orders.filter((o) => o.vendorId === vendorId).length
  const asked = ws.rfqs.filter((r) => r.vendorIds.includes(vendorId)).length
  const losses = [
    rates && `${count(rates, 'rate')} they quoted`,
    quotes && count(quotes, 'quote'),
    orders && count(orders, 'purchase order'),
    asked && `they are on ${count(asked, 'request')}`,
  ].filter(Boolean) as string[]
  return { losses, clean: losses.length === 0 }
}

export function itemImpact(ws: Workspace, itemId: string): DeleteImpact {
  const rates = ws.vendorItems.filter((vi) => vi.itemId === itemId).length
  const lots = ws.stockLots.filter((l) => l.itemId === itemId).length
  const rfqs = ws.rfqs.filter((r) => r.itemId === itemId).length
  const quotes = ws.quotes.filter((q) => q.itemId === itemId).length
  const orders = ws.orders.filter((o) => o.itemId === itemId).length
  const losses = [
    rates && `${count(rates, 'supplier rate')}`,
    lots && `${count(lots, 'stock count')}`,
    rfqs && count(rfqs, 'request'),
    quotes && count(quotes, 'quote'),
    orders && count(orders, 'purchase order'),
  ].filter(Boolean) as string[]
  return { losses, clean: losses.length === 0 }
}

export function rfqImpact(ws: Workspace, rfqId: string): DeleteImpact {
  const quotes = ws.quotes.filter((q) => q.rfqId === rfqId).length
  // A quote is evidence of a price somebody gave: it outlives the request and
  // simply stops pointing at one.
  const losses = quotes
    ? [`${count(quotes, 'quote')} against it stay, no longer linked to a request`]
    : []
  return { losses, clean: losses.length === 0 }
}

/**
 * Removing a supplier, and everything that only existed because of them.
 *
 * `pruneCustom` goes around the outside of all three of these rather than each
 * filtering its own side-tables, because the cascades are transitive: removing
 * a material also removes the requests for it, and those requests have custom
 * values of their own. Keeping only the keys that still name a live record
 * cannot miss a path, and tidies anything an earlier version left behind.
 */
export function removeVendor(ws: Workspace, vendorId: string): Workspace {
  return pruneCustom(syncRfqStates({
    ...ws,
    vendors: ws.vendors.filter((v) => v.id !== vendorId),
    vendorItems: ws.vendorItems.filter((vi) => vi.vendorId !== vendorId),
    quotes: ws.quotes.filter((q) => q.vendorId !== vendorId),
    orders: ws.orders.filter((o) => o.vendorId !== vendorId),
    // and what arrived from them, which measures a supplier who is no longer one
    receipts: (ws.receipts ?? []).filter((r) => r.vendorId !== vendorId),
    rfqs: ws.rfqs.map((r) => ({ ...r, vendorIds: r.vendorIds.filter((id) => id !== vendorId) })),
    vendorType: Object.fromEntries(
      Object.entries(ws.vendorType).filter(([id]) => id !== vendorId),
    ),
  }))
}

export function removeItem(ws: Workspace, itemId: string): Workspace {
  return pruneCustom(syncRfqStates({
    ...ws,
    items: ws.items.filter((i) => i.id !== itemId),
    vendorItems: ws.vendorItems.filter((vi) => vi.itemId !== itemId),
    stockLots: ws.stockLots.filter((l) => l.itemId !== itemId),
    rfqs: ws.rfqs.filter((r) => r.itemId !== itemId),
    quotes: ws.quotes.filter((q) => q.itemId !== itemId),
    orders: ws.orders.filter((o) => o.itemId !== itemId),
    receipts: (ws.receipts ?? []).filter((r) => r.itemId !== itemId),
    itemGroup: Object.fromEntries(
      Object.entries(ws.itemGroup).filter(([id]) => id !== itemId),
    ),
  }))
}

export function removeRfq(ws: Workspace, rfqId: string): Workspace {
  return pruneCustom(syncRfqStates({
    ...ws,
    rfqs: ws.rfqs.filter((r) => r.id !== rfqId),
    quotes: ws.quotes.map((q) => (q.rfqId === rfqId ? { ...q, rfqId: undefined } : q)),
  }))
}

/*
 * Both prune now, because quotes and orders carry the owner's own columns.
 * Before they did, there was nothing keyed to a quote id to leave behind; a
 * deleted quote that kept its HSN code would be a cell pointing at nothing,
 * and the next id issued with that number would inherit it.
 */
export function removeQuote(ws: Workspace, quoteId: string): Workspace {
  return pruneCustom(syncRfqStates({
    ...ws,
    quotes: ws.quotes.filter((q) => q.id !== quoteId),
    orders: ws.orders.map((o) => (o.quoteId === quoteId ? { ...o, quoteId: undefined } : o)),
  }))
}

export function removeOrder(ws: Workspace, orderId: string): Workspace {
  return pruneCustom({
    ...ws,
    orders: ws.orders.filter((o) => o.id !== orderId),
    /*
     * The receipts against it go too. A receipt is a measurement of a delivery
     * on an order, and one whose order has been deleted measures nothing — it
     * would go on shortening a supplier's lead time from a line nobody can see.
     */
    receipts: (ws.receipts ?? []).filter((r) => r.orderId !== orderId),
  })
}

/**
 * Accepting one quote rejects the others on the same request. A request has one
 * winner; leaving three marked accepted would make the screen a lie.
 */
export function acceptQuote(ws: Workspace, quoteId: string): Workspace {
  const target = ws.quotes.find((q) => q.id === quoteId)
  if (!target) return ws

  const marked = syncRfqStates({
    ...ws,
    quotes: ws.quotes.map((q) => {
      if (q.id === quoteId) return { ...q, state: 'accepted' as const }
      if (target.rfqId && q.rfqId === target.rfqId && q.state === 'accepted') {
        return { ...q, state: 'rejected' as const }
      }
      return q
    }),
  })

  /*
   * And this is where a price becomes a rate.
   *
   * Accepting used to flip a state and nothing else, which meant a quotation
   * somebody had agreed to never reached the supplier's rate, the landed-cost
   * comparison, or the figure the order form suggests. The quote was a note in
   * a different notebook.
   *
   * What it deliberately does NOT write is the quote's minimum order onto the
   * material. That is the supplier's figure about what they will sell, not the
   * owner's about what they order, and `Item.moq` is read as the latter.
   */
  const previous = marked.vendorItems.find(
    (vi) => vi.vendorId === target.vendorId && vi.itemId === target.itemId,
  )
  const rate = buildRate({
    vendorId: target.vendorId,
    itemId: target.itemId,
    rate: target.unitPrice,
    leadDays: target.leadDays > 0 ? target.leadDays : previous?.quotedLeadTimeDays ?? 0,
    validUntil: validUntilOf(marked, target),
  }, previous)

  return repriceTerms({
    ...marked,
    // §13-1 — a material never bought is valued at the first rate agreed for it
    items: backfillRates(marked.items, [rate]),
    vendorItems: [
      ...marked.vendorItems.filter(
        (vi) => !(vi.vendorId === target.vendorId && vi.itemId === target.itemId),
      ),
      rate,
    ],
  })
}

/**
 * How long an accepted price holds.
 *
 * The quote's own date first, because that is what the supplier wrote against
 * this price; the document it came in on second, for a quote recorded before
 * quotes carried a validity. Nothing is invented when neither says: a validity
 * somebody would act on has to come from the supplier.
 */
function validUntilOf(ws: Workspace, quote: Quote): string | undefined {
  if (quote.validUntil) return quote.validUntil
  const doc = ws.docs.find(
    (d) => d.vendorId === quote.vendorId && d.validUntil && d.status === 'approved',
  )
  return doc?.validUntil
}

/* ------------------------------------------------------------ going stale -- */

/**
 * Whether a price has stopped being a price.
 *
 * Dates only, and a string comparison, because ISO dates sort. A quote with no
 * validity never expires — which is not the same as saying it is fresh, and
 * the screens say "no date" rather than "valid".
 */
export const expired = (validUntil: string | undefined, today: string): boolean =>
  Boolean(validUntil) && validUntil! < today

/**
 * How many of an owner's rates are ranking suppliers on an expired price.
 *
 * Counted for the rail badge, so the number goes down when somebody acts on
 * it rather than only ever climbing.
 */
export const staleRates = (ws: Workspace, today: string): number =>
  ws.vendorItems.filter((vi) => expired(vi.quoteValidUntil, today)).length
