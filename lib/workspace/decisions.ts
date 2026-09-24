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
import { money, num, shortDate } from '@/lib/domain/format'
import { boardLines, verdictText } from './board'
import { churnNotedKey, syncOrders } from './orders'
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
  /* once an order is with its supplier — see `withSuppliers` below */
  | 'notice'        // send the supplier the changed order
  | 'ack'           // they confirmed the change
  | 'chase'         // text for a person to send a supplier or jobworker
  /* the gate's — see `inbound-decisions.ts` */
  | 'arrive'        // goods are at the gate: say what came
  | 'inspect'       // work down the checks and close the receipt
  | 'return'        // material came back from a jobworker
  | 'close-challan' // settle a challan, and write off what never came back
  /* the store's — see `inventory-decisions.ts` */
  | 'count'         // count a lot, or walk a rack
  | 'write-off'     // take held stock off the book, with a reason
  | 'release'       // held stock is fine after all
  | 'sell'          // the scrap was sold — say for what
  | 'no-sale'       // nobody will buy it
  | 'use'           // remnant pieces into a job
  | 'scrap'         // remnant pieces off the book, by decision
  /* the floor's — see `production-decisions.ts` */
  | 'plan'          // give a job its product, quantity and dates, or re-plan it
  | 'output'        // book what came off a job
  | 'resume'        // the floor started again on a halted job
  /* the shipping bay's — see `dispatch-decisions.ts` */
  | 'dispatch'      // raise a dispatch note against an order
  | 'book'          // give a dispatch note its carrier and docket
  | 'delivered'     // the customer has it: when, and who said so
  | 'receive'       // a customer's return is back at the gate

export type DecisionKind =
  | 'at-risk' | 'late' | 'unsourced'
  | 'flip' | 'stale'
  | 'unfiled' | 'undecided' | 'unordered' | 'no-qty' | 'unsent' | 'no-reply'
  /* sourcing's, once an order is with its supplier */
  | 'not-told' | 'awaiting-ack' | 'churn' | 'lands-late'
  /* the gate's */
  | 'to-receive' | 'at-gate' | 'qc-overdue' | 'spike'
  | 'challan-overdue' | 'challan-unaccounted' | 'over-ceiling'
  /* the store's — see `inventory-decisions.ts` */
  | 'count-due' | 'no-rack' | 'negative-stock' | 'count-variance' | 'held-long'
  | 'scrap-unsold' | 'scrap-over'
  /* only with cutting switched on */
  | 'remnant-aged' | 'remnant-covers' | 'cut-below-plan'
  /* the floor's */
  | 'job-halted' | 'job-will-halt' | 'job-at-risk' | 'job-behind' | 'job-late' | 'no-plan' | 'no-bom'
  /* the shipping bay's */
  | 'order-late' | 'order-at-risk' | 'order-short-stock' | 'order-no-style'
  | 'note-no-carrier' | 'note-eway' | 'delivery-due' | 'carrier-late' | 'return-overdue'

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
    lotId?: string
    rackId?: string
    countId?: string
    jobId?: string
    productId?: string
    haltId?: string
    noteId?: string
    consignmentId?: string
    rmaId?: string
    carrierId?: string
    lossId?: string
    cutId?: string
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
    ...withSuppliers(ws, today),
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

/* -------------------------------------------- once it is with the supplier -- */

/**
 * An order after it is handed over: changed and not told, told and not
 * confirmed, changed too often, or landing after the line stops.
 *
 * These were the gate's once. They are the buyer's — each answer is a word
 * with the supplier, never anything done at the gate — so they sit here, on
 * the same queue as the order's own "past the date they gave". Each card
 * carries its band, so the sort puts it among the others rather than in a
 * block of its own.
 */
function withSuppliers(ws: Workspace, today: string): Decision[] {
  // no date, no arithmetic — the command palette asks for rows, not for alarms
  if (!today) return []
  const out: Decision[] = []

  /*
   * A change nobody has told the supplier about costs money every day it
   * sits: they are making the old quantity, and cover is counted on the old
   * quantity. A notice unanswered past the days your rules allow costs too;
   * inside them, it is only half-finished — somebody has to record the reply.
   */
  const synced = syncOrders(ws, today)
  for (const g of synced) {
    const vendor = g.vendor?.name ?? 'Unknown supplier'
    const moved = g.lines.filter((l) => l.state !== 'acknowledged')
    const one = moved[0]
    if (!one) continue
    const what = moved.length === 1
      ? `${one.item?.name ?? 'a material'} now ${num(one.need.value, 3)} ${one.uom}, they are making ${num(one.making.value, 3)}`
      : `${moved.length} lines changed`
    if (g.state === 'not_told') {
      out.push({
        id: `not-told:${g.no}`,
        band: 'costs',
        kind: 'not-told',
        title: `${g.no} · ${vendor}`,
        detail: `changed, supplier not told — ${what}`
          + (g.exposure > 0 ? ` · ${money(g.exposure)} riding on it` : ''),
        act: 'notice',
        actLabel: 'Send the change',
        href: '/sourcing/orders',
        refs: { orderNo: g.no, vendorId: g.vendor?.id },
        weight: 300 + Math.min(199, Math.round(g.exposure / 1000)),
      })
      continue
    }
    if (g.state === 'awaiting_ack') {
      const days = Math.max(...moved.map((l) => l.awaiting.value))
      const overdue = moved.some((l) => l.chaseOverdue)
      out.push({
        id: `awaiting-ack:${g.no}`,
        band: overdue ? 'costs' : 'unfinished',
        kind: 'awaiting-ack',
        title: `${g.no} · ${vendor}`,
        detail: `change sent ${days === 0 ? 'today' : `${days} day${days === 1 ? '' : 's'} ago`}, not confirmed — ${what}`,
        act: 'ack',
        actLabel: 'They confirmed',
        alt: { act: 'notice', label: 'Send it again' },
        href: '/sourcing/orders',
        refs: { orderNo: g.no, vendorId: g.vendor?.id },
        weight: (overdue ? 250 : 90) + days,
      })
    }
  }

  /*
   * A line that keeps moving. The supplier re-plans every time, and prices it
   * in next quarter; the fix is upstream of purchasing. "Noted" sticks until
   * the line moves again.
   */
  for (const g of synced) {
    for (const l of g.lines) {
      if (!l.whipsawed) continue
      if (ws.drafts[churnNotedKey(l.order.id, l.sync.revisions.length)] === true) continue
      out.push({
        id: `churn:${l.order.id}`,
        band: 'costs',
        kind: 'churn',
        title: `${g.no} · ${l.item?.name ?? 'Unknown material'}`,
        detail: `changed ${l.churn.value} times in 30 days — your rules allow ${ws.policy.poChurnLimit}`,
        act: 'open',
        actLabel: 'Look at it',
        alt: { act: 'keep', label: 'Noted' },
        href: '/sourcing/orders',
        refs: { orderNo: g.no, orderId: l.order.id, vendorId: g.vendor?.id, itemId: l.order.itemId },
        weight: 150 + l.churn.value,
      })
    }
  }

  /*
   * What will not be here in time. Covered on quantity is not covered: an
   * order that lands after the line stops, or lands and cannot be inspected
   * before it does, stops the line all the same. The answer is to hurry the
   * order already placed, not to place a second one.
   */
  for (const l of boardLines(ws, today)) {
    const v = l.verdict.value
    if (v !== 'late' && v !== 'tight') continue
    out.push({
      id: `lands-late:${l.order.id}`,
      band: 'stops',
      kind: 'lands-late',
      title: `${l.order.no} · ${l.item?.name ?? 'Unknown material'}`,
      detail: v === 'late'
        ? `lands ${verdictText(l)}: line stops ${shortDate(l.stops!)}, arrives ${shortDate(l.arrives)}`
        : `tight: line stops ${shortDate(l.stops!)}, issuable ${shortDate(l.issuable)}`,
      act: 'open',
      actLabel: 'Look at it',
      alt: { act: 'chase', label: 'Ask them to hurry' },
      href: '/sourcing/orders',
      refs: { orderNo: l.order.no, orderId: l.order.id, vendorId: l.order.vendorId, itemId: l.order.itemId },
      weight: 700 + l.lateBy,
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
