/**
 * The three Inbound systems, as formulas.
 *
 * INB-01 · goods receipt & inbound QC — nothing becomes usable without a GRN
 * INB-02 · order change sync        — the vendor's version is the one that arrives
 * INB-03 · jobwork register         — everything that left is one of four things
 *
 * Same contract as calc.ts: every function is pure and returns a Derived<T>
 * carrying the formula and the substituted inputs, so every figure on the three
 * screens opens into the arithmetic that made it (CONTEXT rule 1).
 */
import { addDays, daysBetween, round } from './calc'
import type { Policy } from './policy'
import type {
  CheckOutcome, CheckResult, Derived, DerivationInput, Grn, JobworkChallan,
  PoRevision, PoSync, SpecCheck,
} from './types'

const D = <T>(
  value: T, label: string, formula: string, inputs: DerivationInput[],
  extra: { note?: string; unit?: string } = {},
): Derived<T> => ({ value, label, formula, inputs, ...extra })

/* ========================================================================== */
/* INB-01 · goods receipt & inbound QC                                        */
/* ========================================================================== */

export type QcState = 'fresh' | 'at_limit' | 'overdue'

/** Days a receipt has been sitting at the gate, uninspected. */
export function qcAgeDays(receivedOn: string, today: string): Derived {
  return D(
    daysBetween(receivedOn, today),
    'Days in inbound QC',
    'today − received_on',
    [
      { name: 'received_on', value: receivedOn, source: 'goods inward register' },
      { name: 'today', value: today, source: 'run date' },
    ],
    { unit: 'days', note: 'Received is not usable. This is the gap between the two.' },
  )
}

export function qcState(age: number, policy: Policy): QcState {
  if (age > policy.qcOverdueDays) return 'overdue'
  if (age >= policy.inboundQcDays) return 'at_limit'
  return 'fresh'
}

/** The day this receipt becomes issuable if it is inspected on time. */
export function issuableFrom(receivedOn: string, policy: Policy): Derived<string> {
  return D(
    addDays(receivedOn, policy.inboundQcDays),
    'Issuable from',
    'received_on + inbound_qc_days',
    [
      { name: 'received_on', value: receivedOn },
      { name: 'inbound_qc_days', value: policy.inboundQcDays, unit: 'days', source: 'policy' },
    ],
    { note: 'Until a GRN closes, none of this quantity counts as cover (§11).' },
  )
}

/** Every mandatory check marked, one way or the other. A GRN cannot close before this. */
export function inspectionComplete(checks: SpecCheck[], results: CheckResult[]): boolean {
  return checks.filter((c) => c.mandatory).every((c) => {
    const r = results.find((x) => x.checkId === c.id)
    return r != null && r.outcome !== 'not_checked'
  })
}

/**
 * A `measure` check decides itself: a reading outside the band is a fail, and no
 * one has to agree with it. Anything else is the inspector's mark.
 */
export function outcomeForMeasure(check: SpecCheck, measured: number | undefined): CheckOutcome {
  if (measured == null || Number.isNaN(measured)) return 'not_checked'
  const lo = check.min ?? -Infinity
  const hi = check.max ?? Infinity
  return measured >= lo && measured <= hi ? 'pass' : 'fail'
}

export function failedChecks(checks: SpecCheck[], results: CheckResult[]): SpecCheck[] {
  return checks.filter((c) => results.find((r) => r.checkId === c.id)?.outcome === 'fail')
}

/** accepted = received − rejected. Partial acceptance is the normal case. */
export function acceptedQty(received: number, rejected: number, unit?: string): Derived {
  return D(
    round(received - rejected, 3),
    'Accepted into usable stock',
    'qty_received − qty_rejected',
    [
      { name: 'qty_received', value: received, unit, source: 'weighed / counted at the gate' },
      { name: 'qty_rejected', value: rejected, unit, source: 'failed a spec check' },
    ],
    { unit, note: 'Only this quantity becomes usable. The rejected part lands in a named non-usable bucket.' },
  )
}

export function rejectionPct(rejected: number, received: number): Derived {
  return D(
    received === 0 ? 0 : round((rejected / received) * 100, 2),
    'Rejection on this receipt',
    'qty_rejected ÷ qty_received × 100',
    [
      { name: 'qty_rejected', value: rejected },
      { name: 'qty_received', value: received },
    ],
    { unit: '%' },
  )
}

/**
 * The trailing rejection rate, recomputed from closed GRNs. This is the loop the
 * build was missing: §5 prices a rejection allowance off this figure, and until
 * now it was a seeded constant. Close a GRN and the Sourcing Desk re-prices.
 */
export function trailingRejectionRate(closed: Grn[], vendorName: string, itemId: string): Derived {
  const mine = closed
    .filter((g) => g.vendorName === vendorName && g.itemId === itemId && g.status === 'closed')
    .slice(0, 6)
  const recd = mine.reduce((a, g) => a + g.qtyReceived, 0)
  const rej = mine.reduce((a, g) => a + (g.rejectedQty ?? 0), 0)
  return D(
    recd === 0 ? 0 : round((rej / recd) * 100, 2),
    'Trailing rejection rate',
    'Σ qty_rejected ÷ Σ qty_received over the last 6 closed GRNs × 100',
    mine.length
      ? mine.map((g) => ({
          name: g.grnNo, value: `${g.rejectedQty ?? 0} of ${g.qtyReceived}`,
          source: `closed ${g.closedAt ?? g.receivedOn}`,
        }))
      : [{ name: 'closed GRNs', value: 0, source: 'no inspection history for this vendor and item yet' }],
    { unit: '%', note: 'Feeds SRC-03’s rejection allowance. A GRN closed here changes what the desk quotes tomorrow.' },
  )
}

/** A receipt this much worse than the vendor's own record is a signal, not a bad batch. */
export function isRejectionSpike(thisPct: number, trailingPct: number, policy: Policy): boolean {
  if (thisPct === 0) return false
  if (trailingPct === 0) return thisPct > 0
  return thisPct > trailingPct * policy.rejectionSpikeMultiple
}

/** ₹ standing at the gate, received and paid for but not issuable. */
export function valueHeldInQc(open: Grn[]): Derived {
  const v = open.reduce((a, g) => a + g.qtyReceived * g.rate, 0)
  return D(
    round(v, 2),
    'Value held in inbound QC',
    'Σ (qty_received × last_purchase_rate) over open GRNs',
    open.map((g) => ({
      name: `${g.grnNo} · ${g.itemName}`, value: round(g.qtyReceived * g.rate, 2), unit: '₹',
      source: `${g.qtyReceived} ${g.uom} × ₹${g.rate}`,
    })),
    { unit: '₹', note: 'Valued at last purchase price, ex-freight — the one basis used everywhere (§13-1).' },
  )
}

/* ========================================================================== */
/* INB-02 · order change sync                                                 */
/* ========================================================================== */

export type SyncState = 'acknowledged' | 'awaiting_ack' | 'not_told'

export const latestRevision = (s: PoSync): PoRevision => s.revisions[s.revisions.length - 1]
export const revisionAt = (s: PoSync, v: number): PoRevision =>
  s.revisions.find((r) => r.version === v) ?? s.revisions[0]

export function syncState(s: PoSync): SyncState {
  const latest = latestRevision(s).version
  if (s.ackedVersion >= latest) return 'acknowledged'
  if (s.notifiedVersion >= latest) return 'awaiting_ack'
  return 'not_told'
}

/** What we need. The internal truth, and NOT what the cover maths may use. */
export function internalQty(s: PoSync, unit?: string): Derived {
  const r = latestRevision(s)
  return D(
    r.qty, 'Quantity we need', `po_line v${r.version}.qty`,
    [
      { name: `v${r.version}`, value: r.qty, unit, source: `${r.kind} · ${r.changedOn} · ${r.changedBy}` },
      { name: 'reason', value: r.reason },
    ],
    { unit, note: 'The latest internal version. It does not become real until the vendor confirms it.' },
  )
}

/** What the vendor believes. This is the quantity that will actually arrive. */
export function vendorKnownQty(s: PoSync, unit?: string): Derived {
  const r = revisionAt(s, s.ackedVersion)
  return D(
    r.qty, 'Quantity the vendor is making', `po_line v${s.ackedVersion}.qty — the last version acknowledged`,
    [
      { name: `v${r.version}`, value: r.qty, unit, source: s.ackedOn ? `acknowledged ${s.ackedOn}` : 'never acknowledged' },
      { name: 'acknowledgement', value: s.ackRef ?? '—' },
      { name: 'later versions', value: latestRevision(s).version - s.ackedVersion, source: 'not confirmed by the vendor' },
    ],
    { unit, note: 'The inbound board and every cover calculation use THIS number, because this is what will arrive.' },
  )
}

/** Signed: positive means the vendor will under-deliver, negative means over. */
export function quantityGap(s: PoSync, unit?: string): Derived {
  const need = latestRevision(s).qty
  const known = revisionAt(s, s.ackedVersion).qty
  return D(
    round(need - known, 3),
    'Gap between what we need and what the vendor is making',
    'internal_qty − vendor_acknowledged_qty',
    [
      { name: 'internal_qty', value: need, unit, source: `v${latestRevision(s).version}` },
      { name: 'vendor_acknowledged_qty', value: known, unit, source: `v${s.ackedVersion}` },
    ],
    { unit, note: 'Positive: short delivery coming. Negative: material arriving that nobody needs.' },
  )
}

export function lineExposure(gap: number, rate: number, uom: string): Derived {
  return D(
    round(Math.abs(gap) * rate, 2),
    'Unacknowledged exposure on this line',
    '|internal_qty − vendor_acknowledged_qty| × last_purchase_rate',
    [
      { name: 'gap', value: gap, unit: uom },
      { name: 'last_purchase_rate', value: rate, unit: `₹/${uom}` },
    ],
    { unit: '₹' },
  )
}

export function unacknowledgedExposure(
  lines: { poNo: string; gap: number; rate: number; uom: string }[],
): Derived {
  const v = lines.reduce((a, l) => a + Math.abs(l.gap) * l.rate, 0)
  return D(
    round(v, 2),
    'Unacknowledged exposure',
    'Σ |internal_qty − vendor_acknowledged_qty| × rate over open PO lines',
    lines.length
      ? lines.map((l) => ({
          name: l.poNo, value: round(Math.abs(l.gap) * l.rate, 2), unit: '₹',
          source: `${l.gap > 0 ? 'short' : 'over'} ${Math.abs(l.gap)} ${l.uom} × ₹${l.rate}`,
        }))
      : [{ name: 'lines out of sync', value: 0, source: 'every open line is acknowledged at its current version' }],
    { unit: '₹', note: 'Money riding on changes the vendor has not confirmed. Zero is the only acceptable resting state.' },
  )
}

/** How much production time the shortfall costs, if the vendor ships the old quantity. */
export function coverGapDays(gap: number, avgDailyConsumption: number, unit?: string): Derived {
  return D(
    avgDailyConsumption === 0 ? 0 : round(gap / avgDailyConsumption, 1),
    'Cover lost if the vendor ships the quantity it knows',
    'quantity_gap ÷ avg_daily_consumption',
    [
      { name: 'quantity_gap', value: gap, unit },
      { name: 'avg_daily_consumption', value: avgDailyConsumption, unit: unit && `${unit}/day`, source: 'trailing 90-day issue history' },
    ],
    { unit: 'days' },
  )
}

export function daysSinceChange(s: PoSync, today: string): Derived {
  const r = latestRevision(s)
  return D(
    daysBetween(r.changedOn, today),
    'Days since the change',
    'today − last_revision.changed_on',
    [
      { name: 'last_revision.changed_on', value: r.changedOn, source: `v${r.version} · ${r.kind}` },
      { name: 'today', value: today },
    ],
    { unit: 'days' },
  )
}

export function daysAwaitingAck(s: PoSync, today: string): Derived {
  return D(
    s.notifiedOn ? daysBetween(s.notifiedOn, today) : 0,
    'Days awaiting acknowledgement',
    'today − notified_on',
    [
      { name: 'notified_on', value: s.notifiedOn ?? '—', source: 'the buyer marked the notice sent' },
      { name: 'today', value: today },
    ],
    { unit: 'days' },
  )
}

/** Changes to one line inside 30 days. Above the limit, the vendor is being whipsawed. */
export function churn(s: PoSync, today: string): Derived {
  const within = s.revisions.filter((r) => r.kind !== 'created' && daysBetween(r.changedOn, today) <= 30)
  return D(
    within.length,
    'Changes in the last 30 days',
    'count(revisions where kind ≠ created and changed_on within 30 days)',
    within.length
      ? within.map((r) => ({ name: `v${r.version} · ${r.kind}`, value: r.changedOn, source: r.reason }))
      : [{ name: 'changes', value: 0, source: 'the line has not moved since it was raised' }],
    { note: 'A line that keeps moving costs the vendor more than it costs us — and the cost comes back as price.' },
  )
}

/**
 * The change notice, drafted. §11: the system never contacts a supplier, so this
 * is text for a person to send, and nothing else.
 */
export function changeNoticeDraft(s: PoSync, itemName: string, uom: string): string {
  const from = revisionAt(s, s.ackedVersion)
  const to = latestRevision(s)
  const lines = [
    `To: ${s.vendorName}`,
    `Re: ${s.poNo} — ${itemName}`,
    '',
    `Our order has changed since your confirmation of ${s.ackedOn ?? '—'}.`,
    '',
    `  Quantity   ${from.qty} ${uom}  →  ${to.qty} ${uom}`,
  ]
  if (from.promisedDate !== to.promisedDate) {
    lines.push(`  Required   ${from.promisedDate}  →  ${to.promisedDate}`)
  }
  lines.push(
    '',
    `Reason: ${to.reason}`,
    '',
    'Please confirm you have received this and are producing to the revised figure.',
    'Anything already made to the earlier quantity, tell us before you ship.',
  )
  return lines.join('\n')
}

/* ========================================================================== */
/* INB-03 · jobwork register                                                  */
/* ========================================================================== */

/** What came back — derived from closed GRNs, so nothing returns without inspection. */
export function returnedQty(challan: JobworkChallan, grns: Grn[]): Derived {
  const mine = grns.filter((g) => g.challanId === challan.id && g.status === 'closed')
  const v = mine.reduce((a, g) => a + (g.acceptedQty ?? 0), 0)
  return D(
    round(v, 3),
    'Returned and accepted',
    'Σ accepted_qty over closed GRNs against this challan',
    mine.length
      ? mine.map((g) => ({ name: g.grnNo, value: g.acceptedQty ?? 0, unit: challan.uom, source: `received ${g.receivedOn}` }))
      : [{ name: 'returns', value: 0, source: 'nothing has come back yet' }],
    { unit: challan.uom, note: 'A jobwork return passes the same inspection as a purchase. Nothing bypasses QC because it is ours.' },
  )
}

/** What the process should give back. Above 100% for galvanising, which adds zinc. */
export function expectedReturn(challan: JobworkChallan): Derived {
  return D(
    round(challan.qtySent * challan.expectedYield, 3),
    'Expected return',
    'qty_sent × expected_yield',
    [
      { name: 'qty_sent', value: challan.qtySent, unit: challan.uom },
      { name: 'expected_yield', value: `${round(challan.expectedYield * 100, 1)}%`, source: `${challan.process} — agreed with ${challan.jobworkerName}` },
    ],
    { unit: challan.uom },
  )
}

/** Allowed process loss. Negative where the process adds weight. */
export function allowedLoss(challan: JobworkChallan): Derived {
  return D(
    round(challan.qtySent * (1 - challan.expectedYield), 3),
    'Allowed process loss',
    'qty_sent × (1 − expected_yield)',
    [
      { name: 'qty_sent', value: challan.qtySent, unit: challan.uom },
      { name: 'expected_yield', value: `${round(challan.expectedYield * 100, 1)}%` },
    ],
    { unit: challan.uom, note: challan.expectedYield > 1
      ? 'Negative: hot-dip galvanising adds zinc, so more weight should come back than went out.'
      : 'Skeleton, swarf and offcut the process is expected to consume.' },
  )
}

export function balanceAtVendor(challan: JobworkChallan, returned: number): Derived {
  return D(
    round(challan.qtySent - returned, 3),
    'Balance still with the jobworker',
    'qty_sent − returned',
    [
      { name: 'qty_sent', value: challan.qtySent, unit: challan.uom, source: `challan ${challan.challanNo}, ${challan.sentOn}` },
      { name: 'returned', value: returned, unit: challan.uom },
    ],
    { unit: challan.uom, note: 'Neither on the shelf nor consumed. Never counted as cover (§11).' },
  )
}

/** The number nobody can currently answer: material that is neither back nor allowed. */
export function unaccountedQty(challan: JobworkChallan, returned: number, allowed: number): Derived {
  const shortfall = challan.qtySent - returned
  return D(
    round(Math.max(0, shortfall - allowed), 3),
    'Unaccounted',
    'max(0, (qty_sent − returned) − allowed_process_loss)',
    [
      { name: 'qty_sent − returned', value: round(shortfall, 3), unit: challan.uom },
      { name: 'allowed_process_loss', value: round(allowed, 3), unit: challan.uom },
    ],
    { unit: challan.uom, note: 'Material that left and is neither back nor explained by the process. This is the figure a jobwork register exists to produce.' },
  )
}

export function valueAt(qty: number, rate: number, uom: string, label: string): Derived {
  return D(
    round(qty * rate, 2),
    label,
    'qty × last_purchase_rate',
    [
      { name: 'qty', value: qty, unit: uom },
      { name: 'last_purchase_rate', value: rate, unit: `₹/${uom}`, source: 'last purchase price, ex-freight (§13-1)' },
    ],
    { unit: '₹' },
  )
}

export function daysLate(challan: JobworkChallan): Derived {
  return D(
    daysBetween(challan.dueBack, challan.asOf),
    'Days against the promised return',
    'as_of − due_back',
    [
      { name: 'due_back', value: challan.dueBack, source: `agreed with ${challan.jobworkerName}` },
      { name: 'as_of', value: challan.asOf, source: challan.floor === 'fabrication' ? '§9.2 run date' : '§9.1 run date' },
    ],
    { unit: 'days', note: 'Positive is overdue; negative is days still in hand.' },
  )
}

export function actualYield(challan: JobworkChallan, returned: number): Derived {
  return D(
    challan.qtySent === 0 ? 0 : round((returned / challan.qtySent) * 100, 1),
    'Actual yield',
    'returned ÷ qty_sent × 100',
    [
      { name: 'returned', value: returned, unit: challan.uom },
      { name: 'qty_sent', value: challan.qtySent, unit: challan.uom },
    ],
    { unit: '%', note: `Expected ${round(challan.expectedYield * 100, 1)}% for ${challan.process.toLowerCase()}.` },
  )
}

/** ₹ one jobworker is holding across every open challan — the concentration limit. */
export function jobworkerExposure(
  name: string, rows: { challan: JobworkChallan; balance: number }[],
): Derived {
  const mine = rows.filter((r) => r.challan.jobworkerName === name && r.challan.status === 'out')
  const v = mine.reduce((a, r) => a + r.balance * r.challan.rate, 0)
  return D(
    round(v, 2),
    `Held by ${name}`,
    'Σ (balance × last_purchase_rate) over that jobworker’s open challans',
    mine.map((r) => ({
      name: r.challan.challanNo, value: round(r.balance * r.challan.rate, 2), unit: '₹',
      source: `${round(r.balance, 3)} ${r.challan.uom} × ₹${r.challan.rate}`,
    })),
    { unit: '₹' },
  )
}

/** The chase note, drafted. Again: text for a person to send. */
export function chaseDraft(challan: JobworkChallan, balance: number, late: number): string {
  return [
    `To: ${challan.jobworkerName}`,
    `Re: challan ${challan.challanNo} — ${challan.itemName}`,
    '',
    `Sent ${challan.sentOn}: ${challan.qtySent} ${challan.uom} for ${challan.process.toLowerCase()}.`,
    `Promised back ${challan.dueBack}${late > 0 ? ` — ${late} days ago` : ''}.`,
    `Still with you: ${round(balance, 3)} ${challan.uom}.`,
    '',
    'Please confirm the balance you are holding and a date we can plan against.',
    'If any of it is scrap, tell us the quantity so we can close the challan against it.',
  ].join('\n')
}
