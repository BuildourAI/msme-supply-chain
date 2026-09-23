/**
 * Everything waiting on a person, collected from wherever it happens to live.
 *
 * The decisions were always there — a document nobody filed, a price nobody
 * took, an order drafted on Tuesday and never handed over. They were spread
 * across six screens, so clearing them meant remembering which screens to
 * visit. This is the same information, gathered.
 *
 * It is deliberately a LIST OF DECISIONS, not a feed of events. Everything
 * here can be acted on, and everything here disappears when it is. A queue
 * that only grows is a queue people stop opening, so nothing goes in that the
 * owner cannot make go away.
 *
 * Ordered by what it costs to ignore, not by which record it came from.
 * Grouping by type would just rebuild the tabs inside one page.
 *
 * Pure, and it takes `rows` rather than reaching for them: the at-risk band
 * comes from `buildRows`, the same derivation the desk runs, so the dashboard
 * and the desk cannot disagree about which materials are in trouble.
 */
import type { DerivedRow } from '@/lib/domain/derive'
import { needsDecision } from '@/lib/domain/derive'
import { orderGroups, orderRows, quoteRows, unorderedLines, expired } from './sourcing'
import { flipSignature, flippingItems, sourcing } from './metrics'
import { awaitingArrival } from './receipts'
import type { Workspace } from './types'

/**
 * Why it is in the list, which is also the order it is in.
 *
 * `stops` is time you cannot buy back; `costs` is money still on the table;
 * `unfinished` is something you started and did not end. Nothing is in more
 * than one band — a price you accepted on a material that is also at risk
 * appears as the at-risk line, because that is the one with the deadline.
 */
export type Band = 'stops' | 'costs' | 'unfinished'

export const BAND_LABEL: Record<Band, string> = {
  stops: 'Will stop the line',
  costs: 'Costing you money',
  unfinished: 'Half-finished',
}

/**
 * What pressing the button does.
 *
 * Kept as data rather than a function so this file stays pure and testable.
 * The screen maps each one to a handler; `open` needs a screen's worth of
 * context and navigates instead.
 */
export type Act =
  | 'open'          // go to `href` — the decision needs more than a row
  | 'accept'        // take this price
  | 'reject'        // turn it down
  | 'draft'         // make one order from everything accepted on that quotation
  | 'paper'         // make the order's document
  | 'keep'          // looked at the cheaper supplier and staying put
  | 'close'         // close a request nobody answered
  /* the gate's — see `inbound-decisions.ts` */
  | 'arrive'        // goods are at the gate: say what came
  | 'inspect'       // work down the checks and close the receipt
  | 'notice'        // send the supplier the changed order
  | 'ack'           // they confirmed the change
  | 'chase'         // text for a person to send a supplier or jobworker
  | 'return'        // material came back from a jobworker
  | 'close-challan' // settle a challan, and write off what never came back

export type DecisionKind =
  | 'at-risk' | 'late' | 'unsourced'
  | 'flip' | 'stale'
  | 'unfiled' | 'undecided' | 'unordered' | 'no-qty' | 'unsent' | 'no-reply'
  /* the gate's */
  | 'to-receive' | 'at-gate' | 'qc-overdue' | 'spike'
  | 'not-told' | 'awaiting-ack' | 'churn' | 'lands-late'
  | 'challan-overdue' | 'challan-unaccounted' | 'over-ceiling'

export interface Decision {
  /** stable across renders, so a list key is not an index */
  id: string
  band: Band
  kind: DecisionKind
  /** the sentence, naming the thing */
  title: string
  /** the quieter second line */
  detail: string
  /** the main button; `open` when it needs a screen */
  act: Act
  /** words on the main button */
  actLabel: string
  /** the quieter second button, where there is a real alternative */
  alt?: { act: Act; label: string }
  href: string
  /** what it acts on — the screen reads only what its handler needs */
  refs: {
    itemId?: string
    vendorId?: string
    quoteId?: string
    lineId?: string
    orderNo?: string
    docId?: string
    rfqId?: string
    receiptId?: string
    challanId?: string
    orderId?: string
  }
  /** within a band, bigger first */
  weight: number
}

export const BAND_ORDER: Band[] = ['stops', 'costs', 'unfinished']

/** Band first, then the worst within it — the one order every queue is read in. */
export const sortDecisions = (list: Decision[]): Decision[] =>
  [...list].sort(
    (a, b) => BAND_ORDER.indexOf(a.band) - BAND_ORDER.indexOf(b.band) || b.weight - a.weight,
  )

/**
 * Every open decision, worst first.
 *
 * `rows` is optional so a workspace can be queued without running the whole
 * derivation — the two bands that do not need it still come back, which is
 * what the rail badge wants.
 */
export function decisionsFor(
  ws: Workspace, today: string, rows: DerivedRow[] = [],
): Decision[] {
  return sortDecisions([
    ...stops(ws, today, rows),
    ...costs(ws, today),
    ...unfinished(ws, today),
  ])
}

/** How many things are waiting, for the badge that has to go down. */
export const openCount = (ws: Workspace, today: string, rows: DerivedRow[] = []): number =>
  decisionsFor(ws, today, rows).length

/* --------------------------------------------------- will stop the line -- */

function stops(ws: Workspace, today: string, rows: DerivedRow[]): Decision[] {
  const out: Decision[] = []

  /*
   * Materials the desk says are in trouble. Read from `buildRows` rather than
   * worked out again, so "at risk" means exactly what it means on the desk.
   */
  for (const r of rows.filter(needsDecision)) {
    const cover = Math.round(r.coverDays.value)
    out.push({
      id: `at-risk:${r.item.id}`,
      band: 'stops',
      kind: 'at-risk',
      title: r.item.name,
      detail: cover <= 0
        ? 'out of cover — nothing on the shelf to run on'
        : `${cover} day${cover === 1 ? '' : 's'} of cover left`,
      act: 'open',
      actLabel: 'Order now',
      href: '/sourcing/desk',
      refs: { itemId: r.item.id },
      // the closer to zero, the higher it sits
      weight: 1000 - Math.max(0, cover),
    })
  }

  /* An order that was due and has not arrived. */
  for (const g of orderGroups(orderRows(ws))) {
    const open = g.state !== 'delivered' && g.state !== 'cancelled'
    if (!open || g.expectedOn >= today) continue
    // everything on it is at the gate: not late any more, waiting on inspection
    if (!awaitingArrival(ws, g.rows.map((r) => r.order))) continue
    const late = daysBetween(g.expectedOn, today)
    out.push({
      id: `late:${g.no}`,
      band: 'stops',
      kind: 'late',
      title: `${g.no} · ${g.vendor?.name ?? 'Unknown supplier'}`,
      detail: `${late} day${late === 1 ? '' : 's'} past the date they gave`,
      act: 'paper',
      actLabel: 'Chase',
      href: '/sourcing/orders',
      refs: { orderNo: g.no, vendorId: g.vendor?.id },
      weight: 500 + late,
    })
  }

  /*
   * A material nobody quotes. It never shows up on a price report and it is
   * the one that stops a line with no warning at all.
   *
   * A price sitting undecided is NOT this. Uploading a quotation creates the
   * materials on it and no rates — rates come from accepting — so without
   * this every fresh upload filled the worst band with "no supplier quotes
   * it" for six materials whose prices were one row below, waiting to be
   * taken. The decision worth surfacing there is "decide the price", and it
   * already is; saying it twice, once in red, is how a queue stops being read.
   */
  const quotedFor = new Set(
    ws.quotes.flatMap((q) => q.lines.filter((l) => l.state !== 'rejected').map((l) => l.itemId)),
  )
  for (const itemId of sourcing(ws).none.filter((id) => !quotedFor.has(id))) {
    const item = ws.items.find((i) => i.id === itemId)
    out.push({
      id: `unsourced:${itemId}`,
      band: 'stops',
      kind: 'unsourced',
      title: item?.name ?? 'Unknown material',
      detail: 'no supplier quotes it',
      act: 'open',
      actLabel: 'Find a supplier',
      href: '/sourcing/materials',
      refs: { itemId },
      weight: 400,
    })
  }

  return out
}

/* ------------------------------------------------------ costing you money -- */

function costs(ws: Workspace, today: string): Decision[] {
  const out: Decision[] = []

  /*
   * The flip: somebody else's material costs less once freight, terms and a
   * rejection history are in. "Keep" is a real decision and it sticks — a
   * badge that cannot be answered is one people learn to ignore.
   */
  for (const itemId of flippingItems(ws)) {
    // waved through, and the comparison has not moved since
    if ((ws.reviewedFlips ?? {})[itemId] === flipSignature(ws, itemId)) continue
    const item = ws.items.find((i) => i.id === itemId)
    out.push({
      id: `flip:${itemId}`,
      band: 'costs',
      kind: 'flip',
      title: item?.name ?? 'Unknown material',
      detail: 'the cheapest quote is not the cheapest material',
      act: 'open',
      actLabel: 'Compare',
      alt: { act: 'keep', label: 'Keep as is' },
      href: '/sourcing/compare',
      refs: { itemId },
      weight: 200,
    })
  }

  /* A rate still ranking suppliers on a quotation that has run out. */
  for (const vi of ws.vendorItems.filter((v) => expired(v.quoteValidUntil, today))) {
    const item = ws.items.find((i) => i.id === vi.itemId)
    const vendor = ws.vendors.find((v) => v.id === vi.vendorId)
    out.push({
      id: `stale:${vi.vendorId}:${vi.itemId}`,
      band: 'costs',
      kind: 'stale',
      title: `${item?.name ?? 'Unknown material'} · ${vendor?.name ?? 'Unknown supplier'}`,
      detail: `their price ran out on ${vi.quoteValidUntil}`,
      act: 'open',
      actLabel: 'Ask again',
      href: '/sourcing/rfqs',
      refs: { itemId: vi.itemId, vendorId: vi.vendorId },
      weight: 150,
    })
  }

  return out
}

/* ------------------------------------------------------------ half-finished -- */

function unfinished(ws: Workspace, today: string): Decision[] {
  const out: Decision[] = []

  /* A document read but never approved. */
  for (const doc of ws.docs.filter((d) => d.status === 'draft')) {
    out.push({
      id: `unfiled:${doc.id}`,
      band: 'unfinished',
      kind: 'unfiled',
      title: doc.vendorName || doc.fileName,
      detail: 'uploaded, not filed',
      act: 'open',
      actLabel: 'Read it',
      href: '/sourcing/documents',
      refs: { docId: doc.id },
      weight: 90,
    })
  }

  for (const r of quoteRows(ws)) {
    const waiting = r.lines.filter((l) => l.line.state === 'received')

    /* Prices nobody has taken or turned down. */
    if (waiting.length > 0) {
      out.push({
        id: `undecided:${r.quote.id}`,
        band: 'unfinished',
        kind: 'undecided',
        title: r.vendor?.name ?? 'Unknown supplier',
        detail: waiting.length === 1
          ? `1 price undecided · ${waiting[0].item?.name ?? 'a material'}`
          : `${waiting.length} prices undecided`,
        act: waiting.length === 1 ? 'accept' : 'open',
        actLabel: waiting.length === 1 ? 'Accept price' : 'Decide',
        alt: waiting.length === 1 ? { act: 'reject', label: 'Turn down' } : undefined,
        href: '/sourcing/quotes',
        refs: {
          quoteId: r.quote.id,
          lineId: waiting.length === 1 ? waiting[0].line.id : undefined,
          vendorId: r.vendor?.id,
        },
        weight: 80,
      })
    }

    /* Prices agreed and never turned into an order. */
    const pending = unorderedLines(ws.orders, r.quote)
    if (pending.length > 0) {
      out.push({
        id: `unordered:${r.quote.id}`,
        band: 'unfinished',
        kind: 'unordered',
        title: r.vendor?.name ?? 'Unknown supplier',
        detail: `${pending.length} price${pending.length === 1 ? '' : 's'} agreed, not ordered`,
        act: 'draft',
        actLabel: pending.length === 1 ? 'Draft an order' : `Draft an order · ${pending.length} lines`,
        href: '/sourcing/quotes',
        refs: { quoteId: r.quote.id, vendorId: r.vendor?.id },
        weight: 85,
      })
    }
  }

  const sentOn = new Set(ws.sendLog.filter((s) => s.kind === 'po').map((s) => s.id))

  for (const g of orderGroups(orderRows(ws))) {
    /*
     * Lines the records could not put a quantity on.
     *
     * `orderQtyFor` climbs four rungs and this is the bottom of them: nobody
     * asked for it, the desk is not short of it, the owner has set no order
     * size and the supplier named no minimum. Nothing in the records says how
     * much, so nothing invents it — but a document saying zero must not go out
     * quietly either, so it is asked for here.
     */
    const blank = g.rows.filter((r) => r.order.qty <= 0 && r.order.state !== 'cancelled')
    if (blank.length > 0) {
      out.push({
        id: `no-qty:${g.no}`,
        band: 'unfinished',
        kind: 'no-qty',
        title: `${g.no} · ${g.vendor?.name ?? 'Unknown supplier'}`,
        detail: blank.length === 1
          ? `${blank[0].item?.name ?? 'one line'} has no quantity`
          : `${blank.length} lines have no quantity`,
        act: 'open',
        actLabel: 'Set the quantity',
        href: '/sourcing/orders',
        refs: { orderNo: g.no, vendorId: g.vendor?.id },
        // above "never sent", because it cannot be sent until this is answered
        weight: 95,
      })
    }

    /* Drafted and never handed over. */
    if (g.state === 'draft' && !sentOn.has(g.no) && blank.length === 0) {
      out.push({
        id: `unsent:${g.no}`,
        band: 'unfinished',
        kind: 'unsent',
        title: `${g.no} · ${g.vendor?.name ?? 'Unknown supplier'}`,
        detail: `drafted, never sent · ${g.rows.length} line${g.rows.length === 1 ? '' : 's'}`,
        act: 'paper',
        actLabel: 'Make the document',
        href: '/sourcing/orders',
        refs: { orderNo: g.no, vendorId: g.vendor?.id },
        weight: 70,
      })
    }

    /*
     * An order due at the gate is not here. Recording what arrived is the
     * gate's job, on the inbound desk, and asking for it on both screens would
     * count one lorry twice. What stays here is `late` above: chasing a
     * supplier is a sourcing act, recording their delivery is not.
     */
  }

  /* A request sent out that nobody answered. */
  const answered = new Set(ws.quotes.map((q) => q.rfqId).filter(Boolean) as string[])
  for (const rfq of ws.rfqs.filter((r) => r.state === 'sent' && !answered.has(r.id))) {
    const item = ws.items.find((i) => i.id === rfq.itemId)
    out.push({
      id: `no-reply:${rfq.id}`,
      band: 'unfinished',
      kind: 'no-reply',
      title: `${rfq.no} · ${item?.name ?? 'Unknown material'}`,
      detail: 'asked, nothing back yet',
      act: 'open',
      actLabel: 'Open',
      alt: { act: 'close', label: 'Close it' },
      href: '/sourcing/rfqs',
      refs: { rfqId: rfq.id, itemId: rfq.itemId },
      weight: 60,
    })
  }

  return out
}

/* ----------------------------------------------------------------- shared -- */

const daysBetween = (from: string, to: string) =>
  Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86400000)

/** Only the bands that have something in them, in order. */
export function byBand(list: Decision[]): { band: Band; rows: Decision[] }[] {
  return BAND_ORDER
    .map((band) => ({ band, rows: list.filter((d) => d.band === band) }))
    .filter((g) => g.rows.length > 0)
}
