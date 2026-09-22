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
import { buildRows, type DerivedRow } from '@/lib/domain/derive'
import type { Item, Vendor } from '@/lib/domain/types'
import { bundleFor } from './bundle'
import { issueId } from './defaults'
import { pruneCustom } from './fields'
import { repriceTerms } from './landed'
import { backfillRates, buildRate } from './records'
import { quoteState } from './types'
import type {
  OrderState, PurchaseOrder, Quote, QuoteLine, RateChange, Rfq, RfqState, Workspace,
} from './types'

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
  rfq: Rfq | undefined
  /** the materials on it, joined, in the order they were quoted */
  lines: QuoteLineRow[]
}

/**
 * One priced line, with everything a screen needs to draw it.
 *
 * Separate from `QuoteRow` because the owner's own columns hang off a LINE —
 * an HSN code or a pack size belongs to a material, not to the piece of paper
 * six of them arrived on. `buildColumns` is given `line.id` for that reason.
 */
export interface QuoteLineRow {
  quote: Quote
  line: QuoteLine
  vendor: Vendor | undefined
  item: Item | undefined
  rfq: Rfq | undefined
}

export function quoteRows(ws: Workspace): QuoteRow[] {
  return [...ws.quotes]
    .sort((a, b) => b.on.localeCompare(a.on) || b.id.localeCompare(a.id))
    .map((quote) => {
      const vendor = vendorOf(ws, quote.vendorId)
      const rfq = quote.rfqId ? byId(ws.rfqs, quote.rfqId) : undefined
      return {
        quote,
        vendor,
        rfq,
        lines: quote.lines.map((line) => ({
          quote, line, vendor, rfq, item: itemOf(ws, line.itemId),
        })),
      }
    })
}

/** Every line on every quotation, flat — what the list counts and searches. */
export const quoteLineRows = (ws: Workspace): QuoteLineRow[] =>
  quoteRows(ws).flatMap((r) => r.lines)

/** A quotation's lines that name one material — what an RFQ group compares. */
export const linesFor = (ws: Workspace, itemId: string): QuoteLineRow[] =>
  quoteLineRows(ws).filter((r) => r.line.itemId === itemId)

/**
 * Quotes grouped by the request they answer.
 *
 * The comparison is the point: several suppliers' prices for one material,
 * side by side. Quotations with no request behind them are a group of their
 * own rather than hidden — that is how most of them arrive.
 *
 * This used to gather a document's quotes back into one box, because one
 * uploaded quotation became six records and the screen had to put them back
 * together. A quotation is one record now, so there is nothing to gather.
 */
export interface QuoteGroup {
  rfq: Rfq | null
  rows: QuoteRow[]
}

export function quoteGroups(ws: Workspace): QuoteGroup[] {
  const rows = quoteRows(ws)
  const groups: QuoteGroup[] = ws.rfqs
    .map((rfq) => ({ rfq, rows: rows.filter((r) => r.quote.rfqId === rfq.id) }))
    .filter((g) => g.rows.length > 0)
  const loose = rows.filter((r) => !r.quote.rfqId)
  return loose.length ? [...groups, { rfq: null, rows: loose }] : groups
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

/**
 * Where an order as a whole has got to, given its lines.
 *
 * Lines move separately — receiving against one of six marks that one
 * delivered while the rest are still confirmed — so the order is only as far
 * along as its least advanced live line. Calling a six-line order delivered
 * because one material turned up is the kind of thing somebody plans a
 * production week around.
 *
 * Cancelled lines are ignored unless every line is cancelled, which is the one
 * case where the order itself is off.
 */
const LADDER: OrderState[] = ['draft', 'confirmed', 'shipped', 'delivered']

export function orderState(orders: PurchaseOrder[]): OrderState {
  const live = orders.filter((o) => o.state !== 'cancelled')
  if (live.length === 0) return 'cancelled'
  return live.reduce<OrderState>(
    (worst, o) => (LADDER.indexOf(o.state) < LADDER.indexOf(worst) ? o.state : worst),
    'delivered',
  )
}

/**
 * The lines of one order, gathered under the number that makes them one.
 *
 * A row is a LINE. Six lines of one order listed flat repeat the number, the
 * supplier, the status and both dates six times, which is how a screen stops
 * being read. The number has been the grouping key since the order form was
 * written; this is the Orders screen finally using it.
 */
export interface OrderGroup {
  no: string
  rows: OrderRow[]
  vendor: Vendor | undefined
  state: OrderState
  total: number
  /**
   * The latest date on it, not the first — the same rule the document uses,
   * for the same reason: a page headed with the earliest of three promises
   * something the other two lines were never going to meet.
   */
  expectedOn: string
}

export function orderGroups(rows: OrderRow[]): OrderGroup[] {
  const order: string[] = []
  const at = new Map<string, OrderRow[]>()
  for (const r of rows) {
    const held = at.get(r.order.no)
    if (held) held.push(r)
    else { at.set(r.order.no, [r]); order.push(r.order.no) }
  }
  return order.map((no) => {
    const mine = at.get(no)!
    return {
      no,
      rows: mine,
      vendor: mine[0].vendor,
      state: orderState(mine.map((r) => r.order)),
      total: Math.round(mine.reduce((a, r) => a + r.total, 0) * 100) / 100,
      expectedOn: mine.reduce(
        (a, r) => (r.order.expectedOn > a ? r.order.expectedOn : a), mine[0].order.expectedOn,
      ),
    }
  })
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
  // awarded the moment ONE line is taken — a request is for one material, so
  // a quotation answering it has one line that matters
  if (mine.some((q) => q.lines.some((l) => l.state === 'accepted'))) return 'awarded'
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
 * One line of an order, prefilled from one price on a quotation.
 *
 * It is offered, never posted: §11 has said from the start that the system
 * suggests and drafts, and that a person places the order. Accepting a price
 * is not the same act as committing the money.
 *
 * The number it carries is a placeholder — `draftOrderFrom` below issues one
 * number for the whole draft and writes it over every line, because that is
 * what makes several lines one order.
 */
export function orderFromQuote(
  ws: Workspace, quote: Quote, line: QuoteLine, today: string, rows: DerivedRow[] = [],
): Omit<PurchaseOrder, 'id'> {
  return {
    no: nextNo('PO', ws.orders),
    vendorId: quote.vendorId,
    itemId: line.itemId,
    qty: orderQtyFor(ws, quote, line, rows),
    unitPrice: line.unitPrice,
    orderedOn: today,
    expectedOn: addDays(today, line.leadDays || 0),
    state: 'draft',
    quoteId: quote.id,
    quoteLineId: line.id,
  }
}

/**
 * The prices taken off a quotation that are not on an order yet.
 *
 * Cancelled lines do not count as ordered — calling an order off is how you
 * undo it, and the price you agreed to is still agreed to.
 */
export function unorderedLines(orders: PurchaseOrder[], quote: Quote): QuoteLine[] {
  const already = new Set(
    orders
      .filter((o) => o.state !== 'cancelled' && o.quoteLineId)
      .map((o) => o.quoteLineId as string),
  )
  return quote.lines.filter((l) => l.state === 'accepted' && !already.has(l.id))
}

/**
 * Everything accepted on one quotation, drafted as ONE order.
 *
 * Three prices taken off a five-line quotation is one order to that supplier
 * for three materials — not three orders, three documents and three WhatsApp
 * messages to the same person on the same afternoon. The number is what makes
 * them one: `OrderForm` has always issued one number and given it to every
 * line, `buildPo` renders by number, and handing it over confirms by number.
 * This is the quote route finally doing the same.
 *
 * Accepting two more prices afterwards joins the draft that is already
 * standing rather than starting a second order — but only while it is still a
 * draft. Once it has been handed over the supplier has your order, and
 * appending to it silently would mean they hold a page that no longer says
 * what you think it says.
 *
 * Differing lead times need nothing here: `buildPo` heads the page with the
 * latest expected date of its lines, for reasons it explains itself.
 */
export function draftOrderFrom(ws: Workspace, quoteId: string, today: string): Workspace {
  const quote = ws.quotes.find((q) => q.id === quoteId)
  if (!quote) return ws

  const pending = unorderedLines(ws.orders, quote)
  if (pending.length === 0) return ws

  const standing = ws.orders.find((o) => o.quoteId === quoteId && o.state === 'draft')
  const no = standing?.no ?? nextNo('PO', ws.orders)

  /*
   * Once, not per line. This is the whole reorder derivation, and it is what
   * lets a drafted order carry the quantity the desk already knows you are
   * short of rather than a zero somebody has to notice.
   */
  const rows = buildRows(bundleFor(ws, today), ws.policy)

  let w = ws
  const made: PurchaseOrder[] = []
  for (const line of pending) {
    const [next, id] = issueId(w, 'PO')
    w = next
    made.push({ ...orderFromQuote(w, quote, line, today, rows), id, no })
  }
  return { ...w, orders: [...w.orders, ...made] }
}

/**
 * How much to order, from whatever the records actually say.
 *
 * Five rungs, and the build climbs down them rather than reaching for the
 * first number it can find. The supplier's minimum is the floor at every rung:
 * it is what they will sell at, not a quantity anybody wanted, so it raises an
 * answer and never becomes one on its own until there is nothing else.
 *
 * Drafting used to take the request's quantity or the supplier's minimum and
 * nothing else — so a price accepted off an uploaded quotation, with no
 * request behind it and no minimum on it, drafted an order for zero. The
 * middle three rungs are the fix, and none of them invents anything: the
 * figure the desk already computes for a material you are short of, what the
 * owner said they buy at a time, and the quantity printed on the quotation
 * itself — which the reader has always pulled off the page and thrown away.
 *
 * Nothing is invented at the bottom. A material nobody is short of, that the
 * owner has set no order size for, quoted with no minimum, has no quantity in
 * the records — and the queue asks for one rather than a document going out
 * saying zero.
 */
export function orderQtyFor(
  ws: Workspace, quote: Quote, line: QuoteLine, rows: DerivedRow[] = [],
): number {
  const floor = line.moq > 0 ? line.moq : 0

  // 1. what you asked them for
  const asked = quote.rfqId ? ws.rfqs.find((r) => r.id === quote.rfqId)?.qty ?? 0 : 0
  if (asked > 0) return Math.max(asked, floor)

  /*
   * 2. what the desk says you are short of. Already rounded to the material's
   * own order size by §5, and zero for anything not at risk — the system does
   * not raise a purchase for a line that is covered.
   */
  const need = rows.find((r) => r.item.id === line.itemId)?.reorderQty.value ?? 0
  if (need > 0) return Math.max(need, floor)

  // 3. how this factory buys it when it does — the owner's figure, not theirs
  const mine = ws.items.find((i) => i.id === line.itemId)?.moq ?? 0
  if (mine > 0) return Math.max(mine, floor)

  /*
   * 4. what their quotation priced against. The weakest of the four, because
   * it is their framing rather than the owner's — but "12 MT" on a letterhead
   * is a real number a person wrote, and a material quoted last week has no
   * consumption history for the rungs above to read.
   */
  if (line.qty && line.qty > 0) return Math.max(line.qty, floor)

  // 5. their minimum, alone, which is better than nothing but is not a want
  return floor
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
  const quotes = ws.quotes.reduce(
    (n, q) => n + q.lines.filter((l) => l.itemId === itemId).length, 0,
  )
  const orders = ws.orders.filter((o) => o.itemId === itemId).length
  const losses = [
    rates && `${count(rates, 'supplier rate')}`,
    lots && `${count(lots, 'stock count')}`,
    rfqs && count(rfqs, 'request'),
    quotes && count(quotes, 'quoted price'),
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
    /*
     * The lines that named it, not the quotations they were on. A quotation
     * pricing six materials should not disappear because one of them was
     * deleted — but one that priced nothing else has nothing left to be.
     */
    quotes: ws.quotes
      .map((q) => ({ ...q, lines: q.lines.filter((l) => l.itemId !== itemId) }))
      .filter((q) => q.lines.length > 0),
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
 * Taking one price off a quotation.
 *
 * Per line, because that is what a price is. A quotation pricing six materials
 * is rarely six things you want from them: you take the two they are cheapest
 * on and leave the rest, and accepting the whole page would write four rates
 * nobody agreed to. `acceptAll` is there for the case where you did mean all
 * of them.
 *
 * Taking one rejects the others quoted for the SAME material against the same
 * request. A request has one winner; leaving three marked accepted would make
 * the screen a lie.
 */
export function acceptLine(ws: Workspace, quoteId: string, lineId: string): Workspace {
  const quote = ws.quotes.find((q) => q.id === quoteId)
  const line = quote?.lines.find((l) => l.id === lineId)
  if (!quote || !line) return ws

  const marked = syncRfqStates({
    ...ws,
    quotes: ws.quotes.map((q) => {
      if (q.id === quoteId) {
        return { ...q, lines: q.lines.map((l) => (l.id === lineId ? { ...l, state: 'accepted' as const } : l)) }
      }
      if (!quote.rfqId || q.rfqId !== quote.rfqId) return q
      return {
        ...q,
        lines: q.lines.map((l) => (l.itemId === line.itemId && l.state === 'accepted'
          ? { ...l, state: 'rejected' as const } : l)),
      }
    }),
  })

  return writeRate(marked, quote, line)
}

/** Every line on one quotation, taken in one press. */
export function acceptAll(ws: Workspace, quoteId: string): Workspace {
  const quote = ws.quotes.find((q) => q.id === quoteId)
  if (!quote) return ws
  return quote.lines
    .filter((l) => l.state !== 'accepted')
    .reduce((w, l) => acceptLine(w, quoteId, l.id), ws)
}

/** Turning a price down, which is a decision worth recording as one. */
export function rejectLine(ws: Workspace, quoteId: string, lineId: string): Workspace {
  return syncRfqStates({
    ...ws,
    quotes: ws.quotes.map((q) => (q.id === quoteId
      ? { ...q, lines: q.lines.map((l) => (l.id === lineId ? { ...l, state: 'rejected' as const } : l)) }
      : q)),
  })
}

/**
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
function writeRate(ws: Workspace, quote: Quote, line: QuoteLine): Workspace {
  const previous = ws.vendorItems.find(
    (vi) => vi.vendorId === quote.vendorId && vi.itemId === line.itemId,
  )
  const rate = buildRate({
    vendorId: quote.vendorId,
    itemId: line.itemId,
    rate: line.unitPrice,
    leadDays: line.leadDays > 0 ? line.leadDays : previous?.quotedLeadTimeDays ?? 0,
    validUntil: validUntilOf(ws, quote),
  }, previous)

  return repriceTerms(logRate({
    ...ws,
    // §13-1 — a material never bought is valued at the first rate agreed for it
    items: backfillRates(ws.items, [rate]),
    vendorItems: [
      ...ws.vendorItems.filter(
        (vi) => !(vi.vendorId === quote.vendorId && vi.itemId === line.itemId),
      ),
      rate,
    ],
  }, { vendorId: quote.vendorId, itemId: line.itemId, was: previous?.rate ?? 0,
    now: line.unitPrice, on: quote.on, via: 'quote' }))
}

/**
 * A rate moving, written down.
 *
 * `VendorItem` holds the current rate and nothing else, so a supplier putting
 * their price up used to leave no trace: "has steel gone up?" had nowhere to
 * look. A move of nothing is not a move and is not logged — re-accepting the
 * same price is not news.
 */
export function logRate(
  ws: Workspace, move: Omit<RateChange, 'id'>,
): Workspace {
  if (move.was === move.now) return ws
  const [w, id] = issueId(ws, 'RC')
  return { ...w, rateLog: [...(w.rateLog ?? []), { ...move, id }] }
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
