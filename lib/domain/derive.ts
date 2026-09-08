/**
 * Assembles a derived row per item from raw seed facts. Nothing here invents a
 * number: every field is a Derived<T> carrying the §5 formula that produced it.
 */
import * as C from './calc'
import type { Policy } from './policy'
import type {
  BuyerStatus, Derived, Item, PurchaseOrderLine, Receipt, StockLot, Vendor, VendorItem,
} from './types'

export interface DerivedQuote {
  vendor: Vendor
  vendorItem: VendorItem
  rejectionAllowance: Derived
  landedPerUnit: Derived
  leadTime: Derived
  isRecommended: boolean
  isLowestRate: boolean
}

export interface DerivedRow {
  item: Item
  usable: Derived
  nonUsable: Derived
  nonUsableReasons: string[]
  inTransit: Derived
  openPoQty: Derived
  truePosition: Derived
  leadTime: Derived
  reorderPoint: Derived
  coverDays: Derived
  stockoutDate: Derived<string>
  earliestInboundEta: string | null
  inboundRefs: string[]
  status: Derived<BuyerStatus>
  reorderQty: Derived
  quotes: DerivedQuote[]
  recommendedVendorId: string
  chosenVendorId: string
  chosen: DerivedQuote
  premiumPerUnit: Derived | null
  poCost: Derived
  shipmentCost: Derived
  otherCosts: Derived
  landedTotal: Derived
  estimatedArrival: Derived<string>
  coverageAfterMonths: Derived
  held: Derived<boolean>
  nonUsableValue: Derived
  /** §8.3 — does landed cost overturn the cheapest quoted rate on this line? */
  flipsVendor: boolean
  /** §11 — the two sign-off triggers the data can evaluate */
  aboveLastPurchase: Derived<boolean>
  needsOwnerSignoff: Derived<boolean>
}

export interface SeedBundle {
  today: string
  items: Item[]
  vendors: Vendor[]
  vendorItems: VendorItem[]
  stockLots: StockLot[]
  poLines: PurchaseOrderLine[]
  receipts: Receipt[]
}

const sum = (ns: number[]) => C.round(ns.reduce((a, b) => a + b, 0), 3)

/**
 * The recommendation is derived, never a stored flag: it is argmin(landed cost),
 * which reproduces every RECOMMENDED marking in §9.1 across all nine items.
 */
export function buildRows(
  seed: SeedBundle, policy: Policy, overrides: Record<string, string> = {},
): DerivedRow[] {
  return seed.items.map((item) => buildRow(item, seed, policy, overrides[item.id]))
}

export function buildRow(
  item: Item, seed: SeedBundle, policy: Policy, overrideVendorId?: string,
): DerivedRow {
  const lots = seed.stockLots.filter((l) => l.itemId === item.id)
  const u = sum(lots.filter((l) => l.usability === 'usable').map((l) => l.qty))
  const nonUsableLots = lots.filter((l) => l.usability !== 'usable')
  const nu = sum(nonUsableLots.map((l) => l.qty))

  const uom = item.uom === 'm2' ? 'm²' : item.uom
  const poFor = seed.poLines.filter((l) => l.itemId === item.id)
  const transitLines = poFor.filter((l) => l.status === 'in_transit')
  const openLines = poFor.filter((l) => l.status === 'open')
  const inTransitQty = sum(transitLines.map((l) => l.qty))
  const openQty = sum(openLines.map((l) => l.qty))

  const usable = D(u, 'Usable stock', 'Σ stock_lot.qty where usability = usable',
    lots.filter((l) => l.usability === 'usable').map((l) => ({ name: `lot ${l.batchNo}`, value: l.qty, unit: uom })), uom)
  const nonUsable = D(nu, 'Non-usable stock', 'Σ stock_lot.qty where usability ≠ usable',
    nonUsableLots.map((l) => ({ name: `${l.batchNo} · ${l.usability.replace('_', ' ')}`, value: l.qty, unit: uom, source: l.usabilityReason })), uom,
    'Always displayed, never counted as cover (§11).')
  const inTransit = D(inTransitQty, 'In transit', 'Σ po_line.qty where status = in_transit',
    transitLines.map((l) => ({ name: l.poNo, value: l.qty, unit: uom, source: `ETA ${l.promisedDate}` })), uom,
    'Despatched by the vendor, not yet received (§4).')
  const openPoQty = D(openQty, 'Open PO quantity', 'Σ po_line.qty where status = open',
    openLines.map((l) => ({ name: l.poNo, value: l.qty, unit: uom, source: `due ${l.promisedDate}` })), uom,
    'Ordered, not yet despatched (§4).')

  /* -------- quotes; recommendation is argmin(landed cost), never a stored flag */
  const vItems = seed.vendorItems.filter((v) => v.itemId === item.id)
  const quotes: DerivedQuote[] = vItems.map((vi) => {
    const vendor = seed.vendors.find((v) => v.id === vi.vendorId)!
    const rej = C.rejectionAllowance(vi.rate, vi.trailingRejectionRate, vi.rejectionAllowance)
    const rcpts = seed.receipts.filter((r) => r.vendorId === vi.vendorId && r.itemId === item.id)
    return {
      vendor, vendorItem: vi,
      rejectionAllowance: rej,
      landedPerUnit: C.landedCostPerUnit(vi, rej),
      leadTime: C.trailingLeadTimeDays(rcpts, vi.quotedLeadTimeDays),
      isRecommended: false, isLowestRate: false,
    }
  }).sort((a, b) => a.landedPerUnit.value - b.landedPerUnit.value)

  quotes[0].isRecommended = true
  const cheapestRate = quotes.reduce((a, b) => (b.vendorItem.rate < a.vendorItem.rate ? b : a))
  cheapestRate.isLowestRate = true
  const flipsVendor = cheapestRate.vendor.id !== quotes[0].vendor.id

  const recommendedVendorId = policy.supplierDefault === 'preferred'
    ? (quotes.find((q) => q.vendorItem.isPreferred) ?? quotes[0]).vendor.id
    : quotes[0].vendor.id
  const chosenVendorId = overrideVendorId ?? recommendedVendorId
  const chosen = quotes.find((q) => q.vendor.id === chosenVendorId) ?? quotes[0]
  const snapshot = quotes.find((q) => q.vendor.id === recommendedVendorId)!

  /* ---------------------------------------------------------------- §5 core */
  // §7's snapshot rule: the run freezes the lead time it was generated on, so
  // changing the supplier re-prices the line without moving the reorder logic.
  const leadTime = snapshot.leadTime
  const reorderPoint = C.reorderPoint(item.avgDailyConsumption, leadTime.value, item.safetyStock, uom)
  const truePosition = C.truePosition(u, inTransitQty, openQty, uom)
  const coverDays = C.buyerCoverDays(u, item.avgDailyConsumption, uom)
  const stockoutDate = C.stockoutDate(seed.today, coverDays.value)

  const inboundSorted = [...poFor].sort((a, b) => a.promisedDate.localeCompare(b.promisedDate))
  const earliestInboundEta = inboundSorted[0]?.promisedDate ?? null
  const status = C.buyerStatus(truePosition.value, reorderPoint.value, u, earliestInboundEta, stockoutDate.value)
  const reorderQty = C.reorderQty(
    reorderPoint.value, policy.cycleDays[item.itemClass], item.avgDailyConsumption,
    truePosition.value, item.moq, status.value === 'at_risk', uom,
  )

  /* ------------------------------------------------------------------ money */
  const q = reorderQty.value
  const poCost = C.poCost(q, chosen.vendorItem)
  const shipmentCost = C.shipmentCost(q, chosen.vendorItem)
  const otherCosts = C.otherCosts(q, chosen.vendorItem, chosen.rejectionAllowance.value)
  const landedTotal = C.landedTotal(poCost.value, shipmentCost.value, otherCosts.value)
  const premiumPerUnit = chosen.vendor.id === quotes[0].vendor.id ? null
    : D(C.money(chosen.landedPerUnit.value - quotes[0].landedPerUnit.value),
        'Premium over the recommendation', 'chosen landed − lowest landed',
        [
          { name: `${chosen.vendor.name} landed`, value: chosen.landedPerUnit.value, unit: '₹/unit' },
          { name: `${quotes[0].vendor.name} landed`, value: quotes[0].landedPerUnit.value, unit: '₹/unit' },
        ], '₹/unit')

  const estimatedArrival = C.estimatedArrival(seed.today, chosen.leadTime.value, policy.inboundQcDays)
  const coverageAfterMonths = C.coverageAfterReceiptMonths(u, inTransitQty, openQty, q, item.avgDailyConsumption)
  const held = C.heldByGuardrail(q, coverageAfterMonths.value, policy.coverageCeiling[item.itemClass])

  // §11 human sign-off triggers, from data the seed already carries.
  const aboveLastPurchase: Derived<boolean> = {
    value: chosen.vendorItem.rate > item.lastPurchaseRate,
    label: 'Rate above last purchase price',
    formula: 'chosen vendor rate > last_purchase_rate',
    inputs: [
      { name: 'chosen vendor rate', value: chosen.vendorItem.rate, unit: `₹/${uom}`, source: chosen.vendor.name },
      { name: 'last_purchase_rate', value: item.lastPurchaseRate, unit: `₹/${uom}` },
    ],
    note: 'A rate above the last-bought price needs a person’s sign-off (§11). The system flags it; it does not refuse it.',
  }
  const needsOwnerSignoff: Derived<boolean> = {
    value: q > 0 && landedTotal.value > policy.ownerApprovalThreshold,
    label: 'Needs the owner’s sign-off',
    formula: 'landed_total > owner_approval_threshold',
    inputs: [
      { name: 'landed_total', value: landedTotal.value, unit: '₹' },
      { name: 'owner_approval_threshold', value: policy.ownerApprovalThreshold, unit: '₹', source: 'policy' },
    ],
    note: 'Any order above the owner’s threshold is the owner’s decision, not the buyer’s (§11).',
  }

  const nonUsableValue = D(
    C.money(nu * item.lastPurchaseRate), 'Non-usable stock value',
    'non_usable_qty × last_purchase_rate',
    [
      { name: 'non_usable_qty', value: nu, unit: uom },
      { name: 'last_purchase_rate', value: item.lastPurchaseRate, unit: `₹/${uom}`, source: 'valuation basis: last purchase price, ex-freight (§13-1)' },
    ], '₹',
    'One valuation basis, applied everywhere stock is valued (§13-1).')

  return {
    item, usable, nonUsable,
    nonUsableReasons: nonUsableLots.map((l) => l.usabilityReason).filter(Boolean) as string[],
    inTransit, openPoQty, truePosition, leadTime, reorderPoint, coverDays, stockoutDate,
    earliestInboundEta, inboundRefs: inboundSorted.map((l) => l.poNo),
    status, reorderQty, quotes, recommendedVendorId, chosenVendorId, chosen, premiumPerUnit,
    poCost, shipmentCost, otherCosts, landedTotal, estimatedArrival,
    coverageAfterMonths, held, nonUsableValue, flipsVendor, aboveLastPurchase, needsOwnerSignoff,
  }
}

function D(
  value: number, label: string, formula: string,
  inputs: { name: string; value: number | string; unit?: string; source?: string }[],
  unit?: string, note?: string,
): Derived {
  return { value, label, formula, inputs, unit, note }
}

/* ------------------------------------------------------------------- totals */

export interface DeskKpis {
  linesNeedingDecision: Derived
  toRelease: Derived
  draftPoCount: number
  nonUsableValue: Derived
  heldCount: number
}

/** §6 — the lines a buyer must actually act on today. */
export const needsDecision = (r: DerivedRow) =>
  r.status.value === 'at_risk' || r.status.value === 'at_risk_late'

export function deskKpis(rows: DerivedRow[]): DeskKpis {
  const decide = rows.filter(needsDecision)
  const withQty = rows.filter((r) => r.reorderQty.value > 0)
  const vendorsInvolved = new Set(withQty.map((r) => r.chosenVendorId))
  return {
    linesNeedingDecision: {
      value: decide.length, label: 'Lines needing a decision',
      formula: 'count(status = at_risk or at_risk_late)',
      inputs: decide.map((r) => ({ name: r.item.code, value: r.status.value })),
      note: 'Filtering the table does not change this figure — it counts the whole run.',
    },
    toRelease: {
      value: C.money(withQty.reduce((a, r) => a + r.landedTotal.value, 0)),
      label: 'Cash to release', formula: 'Σ landed_total where reorder_qty > 0',
      inputs: withQty.map((r) => ({ name: r.item.code, value: r.landedTotal.value, unit: '₹' })),
      unit: '₹',
      note: 'Includes the line the guardrail is holding — the money is not committed until a person releases it.',
    },
    draftPoCount: vendorsInvolved.size,
    nonUsableValue: {
      value: C.money(rows.reduce((a, r) => a + r.nonUsableValue.value, 0)),
      label: 'Non-usable stock', formula: 'Σ non_usable_qty × last_purchase_rate',
      inputs: rows.filter((r) => r.nonUsable.value > 0)
        .map((r) => ({ name: r.item.code, value: r.nonUsableValue.value, unit: '₹' })),
      unit: '₹', note: 'On hand but not issuable. Displayed always, counted as cover never (§11).',
    },
    heldCount: rows.filter((r) => r.held.value).length,
  }
}
