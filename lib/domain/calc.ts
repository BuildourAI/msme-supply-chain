/**
 * Canonical formulas — CONTEXT.md §5 — and status logic — §6.
 *
 * Every function is pure and returns a Derived<T> carrying the formula and the
 * substituted inputs, so the UI can answer "where does this number come from"
 * generically instead of hand-writing an explanation per figure.
 */
import type {
  BuyerStatus, Derived, DerivationInput, JobStatus, OwnerStatus, VendorItem,
} from './types'

/* ------------------------------------------------------------------ helpers */

/** Money is numeric(14,2), quantities numeric(14,3) — §7. */
export const round = (n: number, dp = 2): number => {
  const f = 10 ** dp
  return Math.round((n + Number.EPSILON * Math.sign(n) * Math.abs(n)) * f) / f
}
export const money = (n: number) => round(n, 2)
export const qty = (n: number) => round(n, 3)

export const parseDate = (iso: string): Date => new Date(`${iso}T00:00:00Z`)
export const fmtDate = (d: Date): string => d.toISOString().slice(0, 10)
export const addDays = (iso: string, n: number): string => {
  const d = parseDate(iso)
  d.setUTCDate(d.getUTCDate() + n)
  return fmtDate(d)
}
export const daysBetween = (a: string, b: string): number =>
  Math.round((parseDate(b).getTime() - parseDate(a).getTime()) / 86_400_000)

const D = <T>(
  value: T, label: string, formula: string, inputs: DerivationInput[],
  extra: { note?: string; unit?: string; crossCheck?: Derived['crossCheck'] } = {},
): Derived<T> => ({ value, label, formula, inputs, ...extra })

/* ---------------------------------------------------------------- constants */

/** §5 — configurable per item class. §13-3 flags 15 as a guess. */
export const DEFAULT_CYCLE_DAYS = 15
export const DEFAULT_INBOUND_QC_DAYS = 2
export const DEFAULT_BUFFER_DAYS = 3

/* ----------------------------------------------------------------- formulas */

/** reorder_point = avg_daily_consumption × vendor_lead_time + safety_stock */
export function reorderPoint(
  avgDailyConsumption: number, vendorLeadTime: number, safetyStock: number, unit?: string,
): Derived {
  return D(
    round(avgDailyConsumption * vendorLeadTime + safetyStock, 3),
    'Reorder point',
    'avg_daily_consumption × vendor_lead_time + safety_stock',
    [
      { name: 'avg_daily_consumption', value: avgDailyConsumption, unit: unit && `${unit}/day`, source: 'trailing 90-day issue history' },
      { name: 'vendor_lead_time', value: vendorLeadTime, unit: 'days', source: 'trailing average of last 6 receipts' },
      { name: 'safety_stock', value: safetyStock, unit, source: '≈60% of lead-time demand, recomputed monthly' },
    ],
    { unit, note: 'Lead time is the trailing average of the last six actual receipts, never the vendor’s quoted figure (§5).' },
  )
}

/** true_position = usable + in_transit + open_po_qty */
export function truePosition(
  usable: number, inTransit: number, openPoQty: number, unit?: string,
): Derived {
  return D(
    qty(usable + inTransit + openPoQty),
    'True position',
    'usable + in_transit + open_po_qty',
    [
      { name: 'usable', value: usable, unit, source: 'on hand, good, available to issue' },
      { name: 'in_transit', value: inTransit, unit, source: 'despatched by vendor, not yet received' },
      { name: 'open_po_qty', value: openPoQty, unit, source: 'ordered, not yet despatched' },
    ],
    { unit, note: 'Excludes non-usable stock and anything with a jobworker — neither counts as cover (§11).' },
  )
}

/** production_cover_days = usable / floor_consumption_per_day */
export function productionCoverDays(
  usable: number, perDay: number, unit?: string, rateLabel = 'floor_consumption_per_day',
): Derived {
  return D(
    perDay === 0 ? Infinity : round(usable / perDay, 2),
    'Production cover',
    `usable / ${rateLabel}`,
    [
      { name: 'usable', value: usable, unit, source: 'usable stock only — QC-hold, damaged and jobwork excluded' },
      { name: rateLabel, value: perDay, unit: unit && `${unit}/day` },
    ],
    { unit: 'days' },
  )
}

/**
 * The buyer's cover figure. §4: two consumption rates exist and they are not the
 * same number — the owner's screen uses floor_consumption_per_day, the buyer's uses
 * avg_daily_consumption. §9.1 carries only the latter, and every §9.1 status
 * resolves on it (MgO's 10 Sep stockout is 210/26 = 8.08 → +8 days).
 */
export function buyerCoverDays(usable: number, avgDailyConsumption: number, unit?: string): Derived {
  return D(
    avgDailyConsumption === 0 ? Infinity : round(usable / avgDailyConsumption, 2),
    'Cover left',
    'usable / avg_daily_consumption',
    [
      { name: 'usable', value: usable, unit, source: 'non-usable and jobwork stock excluded' },
      { name: 'avg_daily_consumption', value: avgDailyConsumption, unit: unit && `${unit}/day`, source: 'trailing 90-day issue history' },
    ],
    { unit: 'days', note: 'The buyer\u2019s rate (§4). The owner\u2019s screen runs on floor_consumption_per_day instead.' },
  )
}

/**
 * §5, non-negotiable: lead time is the trailing average of the last six ACTUAL
 * receipts, never the vendor's quoted figure. This is why the demo works — zinc on
 * a quoted 15-day lead shows 16 days of cover and is still a stockout.
 */
export function trailingLeadTimeDays(
  receipts: { orderedOn: string; receivedOn: string }[], quoted?: number,
): Derived {
  const spans = receipts.map((r) => daysBetween(r.orderedOn, r.receivedOn))
  const mean = spans.length ? round(spans.reduce((a, b) => a + b, 0) / spans.length, 2) : 0
  return D(
    mean, 'Vendor lead time',
    'mean(last 6 actual receipts: received_on − ordered_on)',
    [
      ...receipts.map((r, i) => ({
        name: `receipt ${i + 1}`, value: `${r.orderedOn} → ${r.receivedOn}`,
        unit: `${spans[i]} days`,
      })),
      { name: 'mean', value: mean, unit: 'days' },
    ],
    {
      unit: 'days',
      note: 'Never the vendor\u2019s quoted figure — §5 calls this non-negotiable.',
      crossCheck: quoted === undefined ? undefined : {
        label: 'Vendor\u2019s quoted lead time',
        expected: `${quoted} days quoted`,
        actual: `${mean} days actual`,
        drift: mean === quoted ? 'no drift' : `${mean > quoted ? '+' : ''}${round(mean - quoted, 2)} days`,
      },
    },
  )
}

/** stockout_date = today + floor(production_cover_days) */
export function stockoutDate(today: string, coverDays: number): Derived<string> {
  const days = Number.isFinite(coverDays) ? Math.floor(coverDays) : 9999
  return D(
    addDays(today, days),
    'Stockout date',
    'today + floor(production_cover_days)',
    [
      { name: 'today', value: today },
      { name: 'production_cover_days', value: round(coverDays, 2), unit: 'days' },
      { name: 'floor(...)', value: days, unit: 'days' },
    ],
  )
}

/**
 * reorder_qty = ceil((reorder_point + CYCLE_DAYS × avg_daily − true_position) / moq) × moq
 * Only when status = at_risk; otherwise 0. §5
 */
export function reorderQty(
  rop: number, cycleDays: number, avgDaily: number, truePos: number, moq: number,
  isAtRisk: boolean, unit?: string,
): Derived {
  const netNeed = round(rop + cycleDays * avgDaily - truePos, 3)
  const value = isAtRisk && netNeed > 0 ? qty(Math.ceil(netNeed / moq) * moq) : 0
  return D(
    value,
    'Reorder quantity',
    isAtRisk
      ? 'ceil((reorder_point + CYCLE_DAYS × avg_daily_consumption − true_position) / moq) × moq'
      : 'status is not at_risk → 0',
    [
      { name: 'reorder_point', value: rop, unit },
      { name: 'CYCLE_DAYS', value: cycleDays, unit: 'days', source: 'policy — configurable per item class' },
      { name: 'avg_daily_consumption', value: avgDaily, unit: unit && `${unit}/day` },
      { name: 'true_position', value: truePos, unit },
      { name: 'net need', value: netNeed, unit, source: 'before MOQ rounding' },
      { name: 'moq', value: moq, unit },
    ],
    { unit, note: isAtRisk ? undefined : 'The system does not raise a purchase for a line that is covered on quantity.' },
  )
}

/** estimated_arrival = today + vendor_lead_time + INBOUND_QC_DAYS */
export function estimatedArrival(
  today: string, vendorLeadTime: number, inboundQcDays: number,
): Derived<string> {
  return D(
    addDays(today, vendorLeadTime + inboundQcDays),
    'Estimated arrival',
    'today + vendor_lead_time + INBOUND_QC_DAYS',
    [
      { name: 'today', value: today },
      { name: 'vendor_lead_time', value: vendorLeadTime, unit: 'days', source: 'trailing average of last 6 receipts' },
      { name: 'INBOUND_QC_DAYS', value: inboundQcDays, unit: 'days', source: 'policy' },
    ],
  )
}

/** order_by_date = need_date − (vendor_lead_time + INBOUND_QC_DAYS + BUFFER_DAYS) */
export function orderByDate(
  needDate: string, vendorLeadTime: number, inboundQcDays: number, bufferDays: number,
): Derived<string> {
  return D(
    addDays(needDate, -(vendorLeadTime + inboundQcDays + bufferDays)),
    'Order by',
    'need_date − (vendor_lead_time + INBOUND_QC_DAYS + BUFFER_DAYS)',
    [
      { name: 'need_date', value: needDate },
      { name: 'vendor_lead_time', value: vendorLeadTime, unit: 'days' },
      { name: 'INBOUND_QC_DAYS', value: inboundQcDays, unit: 'days' },
      { name: 'BUFFER_DAYS', value: bufferDays, unit: 'days' },
    ],
  )
}

/* -------------------------------------------------------------- landed cost */

/**
 * rejection_allowance = rate × vendor_trailing_rejection_rate  (§5)
 *
 * The quoted per-unit allowance is authoritative — §7's snapshot rule freezes what
 * the vendor actually quoted. Where that differs from the §5 rule (8 of 27 quotes
 * do), both are shown and the drift is named rather than silently resolved.
 */
export function rejectionAllowance(
  rate: number, trailingRejectionRatePct: number, quoted?: number,
): Derived {
  const byRule = money(rate * (trailingRejectionRatePct / 100))
  const value = quoted ?? byRule
  const drift = money(value - byRule)
  return D(
    value,
    'Rejection allowance',
    'rate × vendor_trailing_rejection_rate',
    [
      { name: 'rate', value: rate, unit: '₹/unit' },
      { name: 'vendor_trailing_rejection_rate', value: trailingRejectionRatePct, unit: '%', source: 'vendor history' },
    ],
    {
      unit: '₹/unit',
      crossCheck: quoted === undefined || Math.abs(drift) < 0.005 ? undefined : {
        label: 'As quoted vs the §5 rule',
        expected: `₹${byRule.toFixed(2)} by the rule`,
        actual: `₹${value.toFixed(2)} as quoted`,
        drift: `${drift > 0 ? '+' : ''}₹${drift.toFixed(2)} per unit`,
      },
    },
  )
}

/**
 * landed_cost_per_unit = rate + freight + non_creditable_gst
 *                      + payment_term_cost + rejection_allowance
 */
export function landedCostPerUnit(vi: VendorItem, rejAllowance: number): Derived {
  return D(
    money(vi.rate + vi.freightPerUnit + vi.nonCreditableGst + vi.paymentTermCost + rejAllowance),
    'Landed cost per unit',
    'rate + freight + non_creditable_gst + payment_term_cost + rejection_allowance',
    [
      { name: 'rate', value: vi.rate, unit: '₹/unit', source: 'quoted' },
      { name: 'freight', value: vi.freightPerUnit, unit: '₹/unit' },
      { name: 'non_creditable_gst', value: vi.nonCreditableGst, unit: '₹/unit' },
      { name: 'payment_term_cost', value: vi.paymentTermCost, unit: '₹/unit', source: 'cost of the vendor’s payment terms' },
      { name: 'rejection_allowance', value: rejAllowance, unit: '₹/unit', source: `rate × ${vi.trailingRejectionRate}% rejection history` },
    ],
    { unit: '₹/unit', note: 'Landed cost is derived, never stored (§7).' },
  )
}

export function poCost(q: number, vi: VendorItem): Derived {
  return D(money(q * vi.rate), 'PO cost', 'qty × vendor.rate',
    [{ name: 'qty', value: q }, { name: 'vendor.rate', value: vi.rate, unit: '₹/unit' }], { unit: '₹' })
}

export function shipmentCost(q: number, vi: VendorItem): Derived {
  return D(money(q * vi.freightPerUnit), 'Shipment cost', 'qty × vendor.freight',
    [{ name: 'qty', value: q }, { name: 'vendor.freight', value: vi.freightPerUnit, unit: '₹/unit' }], { unit: '₹' })
}

export function otherCosts(q: number, vi: VendorItem, rejAllowance: number): Derived {
  return D(
    money(q * (vi.nonCreditableGst + vi.paymentTermCost + rejAllowance)),
    'Other costs', 'qty × (vendor.gst + vendor.term + vendor.rejection_allowance)',
    [
      { name: 'qty', value: q },
      { name: 'vendor.gst', value: vi.nonCreditableGst, unit: '₹/unit' },
      { name: 'vendor.term', value: vi.paymentTermCost, unit: '₹/unit' },
      { name: 'vendor.rejection_allowance', value: rejAllowance, unit: '₹/unit' },
    ], { unit: '₹' })
}

export function landedTotal(po: number, ship: number, other: number): Derived {
  return D(money(po + ship + other), 'Landed total', 'po_cost + shipment_cost + other_costs',
    [
      { name: 'po_cost', value: po, unit: '₹' },
      { name: 'shipment_cost', value: ship, unit: '₹' },
      { name: 'other_costs', value: other, unit: '₹' },
    ],
    { unit: '₹', note: 'Equals qty × landed_cost_per_unit (§5).' })
}

/* ---------------------------------------------------------------- guardrail */

/**
 * coverage_after_receipt_months =
 *   (usable + in_transit + open_po_qty + reorder_qty) / avg_daily_consumption / 30
 */
export function coverageAfterReceiptMonths(
  usable: number, inTransit: number, openPoQty: number, rQty: number, avgDaily: number,
): Derived {
  const total = qty(usable + inTransit + openPoQty + rQty)
  return D(
    avgDaily === 0 ? Infinity : round(total / avgDaily / 30, 2),
    'Coverage after receipt',
    '(usable + in_transit + open_po_qty + reorder_qty) / avg_daily_consumption / 30',
    [
      { name: 'usable', value: usable },
      { name: 'in_transit', value: inTransit },
      { name: 'open_po_qty', value: openPoQty },
      { name: 'reorder_qty', value: rQty },
      { name: 'total after receipt', value: total },
      { name: 'avg_daily_consumption', value: avgDaily, unit: '/day' },
    ],
    { unit: 'months' },
  )
}

/** held_by_guardrail = reorder_qty > 0 AND coverage_after_receipt_months > coverage_ceiling */
export function heldByGuardrail(rQty: number, coverageMonths: number, ceiling: number): Derived<boolean> {
  return D(
    rQty > 0 && coverageMonths > ceiling,
    'Held by guardrail',
    'reorder_qty > 0 AND coverage_after_receipt_months > coverage_ceiling',
    [
      { name: 'reorder_qty', value: rQty },
      { name: 'coverage_after_receipt_months', value: round(coverageMonths, 2), unit: 'months' },
      { name: 'coverage_ceiling', value: ceiling, unit: 'months', source: 'per item class' },
    ],
    { note: 'The guardrail holds the line and demands a written reason. Only a person releases it — override, never block (§11).' },
  )
}

/* ------------------------------------------------------------ status logic */

/**
 * §6 buyer's view. Judged on two axes — quantity AND timing — which produces
 * four outcomes, not two. `at_risk_late` produces Expedite, not a new PO:
 * the system does not buy its way out of a timing problem.
 */
export function buyerStatus(
  truePos: number, rop: number, usable: number,
  earliestInboundEta: string | null, stockout: string,
): Derived<BuyerStatus> {
  let value: BuyerStatus
  let why: string
  if (truePos < rop) {
    value = 'at_risk'
    why = `true_position ${truePos} < reorder_point ${rop}`
  } else if (usable >= rop) {
    value = 'covered'
    why = `usable ${usable} ≥ reorder_point ${rop}`
  } else if (earliestInboundEta && earliestInboundEta <= stockout) {
    value = 'open_po_covers'
    why = `earliest inbound ${earliestInboundEta} lands on or before stockout ${stockout}`
  } else {
    value = 'at_risk_late'
    why = earliestInboundEta
      ? `covered on quantity, but inbound ${earliestInboundEta} lands after stockout ${stockout}`
      : 'covered on quantity, but nothing inbound before stockout'
  }
  return D(
    value, 'Status',
    'if true_position < reorder_point → at_risk; else if usable ≥ reorder_point → covered; ' +
    'else if earliest_inbound_eta ≤ stockout_date → open_po_covers; else → at_risk_late',
    [
      { name: 'true_position', value: truePos },
      { name: 'reorder_point', value: rop },
      { name: 'usable', value: usable },
      { name: 'earliest_inbound_eta', value: earliestInboundEta ?? '—' },
      { name: 'stockout_date', value: stockout },
    ],
    { note: why },
  )
}

/** §6 owner's view — three states, plain language on the face. */
export function ownerStatus(coverDays: number, leadTime: number): Derived<OwnerStatus> {
  const value: OwnerStatus =
    coverDays < leadTime ? 'stop' : coverDays < leadTime + 5 ? 'watch' : 'fine'
  return D(
    value, 'Line status',
    'cover_days < lead_time → Line will stop; cover_days < lead_time + 5 → Watch this; else → Fine for now',
    [
      { name: 'cover_days', value: round(coverDays, 1), unit: 'days' },
      { name: 'lead_time', value: leadTime, unit: 'days' },
    ],
    { note: 'Days of cover alone is a misleading trigger — cover longer than lead time can still be a stockout (§5).' },
  )
}

/**
 * §6 job status. A job halting because a jobworker is late is a different
 * problem from a job halting because stock ran out, and the UI must say which.
 */
export function jobStatus(
  needs: { itemId: string; name: string; coverDays: number }[],
  startOffset: number, durationDays: number,
  lateJobworkItemIds: Set<string>,
): Derived<JobStatus> & { blocking: string[]; lateJw: string[] } {
  const threshold = startOffset + durationDays
  const blocking = needs.filter((n) => n.coverDays < threshold).map((n) => n.name)
  const lateJw = needs.filter((n) => lateJobworkItemIds.has(n.itemId)).map((n) => n.name)
  const value: JobStatus = blocking.length ? 'will_halt' : lateJw.length ? 'at_risk' : 'will_run'
  const base = D(
    value, 'Job outcome',
    'blocking = needs where production_cover_days < start_offset + duration; ' +
    'late_jw = needs with an overdue jobworker; ' +
    'if blocking → Will halt; else if late_jw → At risk; else → Will run',
    [
      { name: 'start_offset + duration', value: threshold, unit: 'days' },
      { name: 'blocking materials', value: blocking.length ? blocking.join(', ') : 'none' },
      { name: 'materials with a late jobworker', value: lateJw.length ? lateJw.join(', ') : 'none' },
    ],
  )
  return { ...base, blocking, lateJw }
}
