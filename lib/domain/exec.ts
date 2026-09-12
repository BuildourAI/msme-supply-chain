/**
 * The Executive Dashboard's KPIs.
 *
 * The rule this file exists to enforce: a figure on the executive screen must
 * say where it came from. Sixteen numbers where some are measured and some are
 * assumed, with nothing to tell them apart, is worse than eight measured ones —
 * an owner who finds out one figure was invented stops trusting all sixteen.
 *
 * So every KPI carries a `provenance`, and the illustrative ones carry `needs`:
 * the data this build would have to capture to make the number real. Read down
 * the `needs` column and you have the implementation backlog.
 */
import { daysBetween, round } from './calc'
import type { Derived, DerivationInput, Grn, LossRecord, StockMovement } from './types'
import type { DerivedRow } from './derive'
import { A, assumption } from '@/lib/seed/exec'

export type Provenance = 'derived' | 'part' | 'illustrative'

export interface Kpi {
  id: string
  label: string
  /** the one-line explanation the client asked for, in their words */
  meaning: string
  d: Derived
  format: 'money' | 'lakh' | 'raw' | 'int' | 'days'
  dp?: number
  suffix?: string
  provenance: Provenance
  /** what the figure is aiming at, where there is a target worth naming */
  target?: string
  /** true when the target is met — drives the colour, never colour alone */
  meetsTarget?: boolean
  caption: string
  /** illustrative and part-derived only: what would make it real */
  needs?: string
}

const D = (
  value: number, label: string, formula: string, inputs: DerivationInput[],
  extra: { unit?: string; note?: string } = {},
): Derived => ({ value, label, formula, inputs, ...extra })

const pct = (n: number, d: number) => (d === 0 ? 0 : round((n / d) * 100, 1))

/* ========================================================================== */
/* 1 · Inbound procurement — supplier efficiency & risk                       */
/* ========================================================================== */

/** Purchase receipts only. A jobwork challan coming back is not a supplier delivery. */
export const purchaseGrns = (grns: Grn[]) =>
  grns.filter((g) => g.status === 'closed' && g.poNo && g.orderedQty != null && g.promisedDate)

export function supplierOtif(grns: Grn[]): Kpi {
  const mine = purchaseGrns(grns)
  const ok = mine.filter((g) => g.receivedOn <= g.promisedDate! && g.qtyReceived >= g.orderedQty!)
  const value = pct(ok.length, mine.length)
  return {
    id: 'otif', label: 'Supplier OTIF', provenance: 'derived',
    meaning: 'Raw-material batches delivered exactly when promised and in the right quantity.',
    format: 'raw', dp: 1, suffix: '%',
    target: '> 95%', meetsTarget: value > 95,
    caption: `${ok.length} of ${mine.length} purchase receipts arrived on the promised day and complete`,
    d: D(
      value, 'Supplier OTIF',
      'receipts on or before the promised date AND at or above the ordered quantity ÷ receipts × 100',
      mine.map((g) => {
        const late = daysBetween(g.promisedDate!, g.receivedOn)
        const full = g.qtyReceived >= g.orderedQty!
        return {
          name: `${g.grnNo} · ${g.vendorName}`,
          value: late <= 0 && full ? 'on time, in full' : late > 0 ? `${late} days late` : 'short supplied',
          source: `promised ${g.promisedDate}, received ${g.receivedOn}, ${g.qtyReceived} of ${g.orderedQty} ${g.uom}`,
        }
      }),
      { unit: '%', note: 'Measured over the receipts that carry both a promised date and an ordered quantity. A thin sample is itself a finding — most MSMEs cannot compute this at all, because the promise was never written down.' },
    ),
  }
}

/** The larger-sample supporting figure: on-time alone, across every seeded receipt. */
export function onTimeRate(
  receipts: { orderedOn: string; receivedOn: string; vendorId: string; itemId: string }[],
  quotedFor: (vendorId: string, itemId: string) => number,
): Derived {
  const judged = receipts.map((r) => ({
    span: daysBetween(r.orderedOn, r.receivedOn),
    quoted: quotedFor(r.vendorId, r.itemId),
  }))
  const ok = judged.filter((j) => j.span <= j.quoted)
  return D(
    pct(ok.length, judged.length), 'On-time delivery, all receipts',
    'receipts where actual span ≤ the vendor’s quoted lead time ÷ all receipts × 100',
    [
      { name: 'receipts on time', value: ok.length },
      { name: 'receipts', value: judged.length, source: 'every seeded receipt across all 27 supplier–item pairs' },
    ],
    { unit: '%', note: 'The on-time half of OTIF on a much larger sample. Quantity is not observable on these records, so it cannot carry the in-full half.' },
  )
}

export function supplierDefectRate(grns: Grn[]): Kpi {
  // Purchase receipts only, for the same reason OTIF excludes them: a jobwork
  // challan coming back is the jobworker's quality, not a supplier's, and the
  // four clean returns in this seed would deflate the figure by a third.
  const closed = grns.filter((g) => g.status === 'closed' && g.poNo)
  const recd = closed.reduce((a, g) => a + g.qtyReceived, 0)
  const rej = closed.reduce((a, g) => a + (g.rejectedQty ?? 0), 0)
  // Quantities are in mixed units, so the honest measure is by receipt-weighted rate
  const rates = closed.filter((g) => g.qtyReceived > 0)
    .map((g) => ((g.rejectedQty ?? 0) / g.qtyReceived) * 100)
  const value = round(rates.reduce((a, b) => a + b, 0) / Math.max(1, rates.length), 2)
  return {
    id: 'defect', label: 'Supplier defect rate', provenance: 'derived',
    meaning: 'Incoming raw materials rejected during inspection. High numbers mean poor supplier quality control.',
    format: 'raw', dp: 2, suffix: '%',
    target: '< 2%', meetsTarget: value < 2,
    caption: `across ${closed.length} closed purchase receipts · every rejection carries a named reason`,
    d: D(
      value, 'Supplier defect rate',
      'mean of (qty_rejected ÷ qty_received) across closed GRNs',
      closed.map((g) => ({
        name: `${g.grnNo} · ${g.itemName}`,
        value: `${round(((g.rejectedQty ?? 0) / Math.max(g.qtyReceived, 1e-9)) * 100, 2)}%`,
        source: `${g.rejectedQty ?? 0} of ${g.qtyReceived} ${g.uom} from ${g.vendorName}`,
      })),
      { unit: '%', note: `A mean of rates, not Σrejected ÷ Σreceived: the receipts are in metres, kilograms, MT and pieces, and adding those together would be arithmetic on nothing. Totals: ${round(rej, 3)} rejected across ${round(recd, 3)} received, in mixed units.` },
    ),
  }
}

export function avgLeadTime(rows: DerivedRow[]): Kpi {
  const value = round(rows.reduce((a, r) => a + r.leadTime.value, 0) / Math.max(1, rows.length), 1)
  const quoted = round(
    rows.reduce((a, r) => a + r.chosen.vendorItem.quotedLeadTimeDays, 0) / Math.max(1, rows.length), 1)
  return {
    id: 'leadtime', label: 'Average supplier lead time', provenance: 'derived',
    meaning: 'Time from placing a purchase order to receiving the goods at the factory.',
    format: 'days', dp: 1, suffix: ' days',
    target: `quoted ${quoted} days`, meetsTarget: value <= quoted,
    caption: `measured, never quoted — the vendors promise ${quoted} days and take ${value}`,
    d: D(
      value, 'Average supplier lead time',
      'mean of each item’s trailing lead time — itself the mean of its last six actual receipts (§5)',
      rows.map((r) => ({
        name: `${r.item.code} · ${r.chosen.vendor.name}`, value: r.leadTime.value, unit: 'days',
        source: `quoted ${r.chosen.vendorItem.quotedLeadTimeDays}`,
      })),
      { unit: 'days', note: '§5 makes this non-negotiable: lead time is the trailing average of six real receipts, never the vendor’s quoted figure. The gap between the two is the whole reason for the rule.' },
    ),
  }
}

export function poBacklog(
  rows: DerivedRow[], poLines: { poNo: string; itemId: string; qty: number; promisedDate: string }[],
  today: string,
): Kpi {
  const pastDue = poLines.filter((l) => l.promisedDate < today)
  const lateForTheLine = poLines.filter((l) => {
    const row = rows.find((r) => r.item.id === l.itemId)
    return row != null && l.promisedDate > row.stockoutDate.value
  })
  const value = pastDue.length + lateForTheLine.length
  return {
    id: 'backlog', label: 'PO backlog', provenance: 'derived',
    meaning: 'Open orders with suppliers that are delayed or past due.',
    format: 'int',
    target: '0', meetsTarget: value === 0,
    caption: `${poLines.length} orders open · ${pastDue.length} past due · ${lateForTheLine.length} landing after the line stops`,
    d: D(
      value, 'Purchase orders in backlog',
      'count(open PO lines past their promised date) + count(open PO lines arriving after the material runs out)',
      poLines.map((l) => {
        const row = rows.find((r) => r.item.id === l.itemId)
        const late = row != null && l.promisedDate > row.stockoutDate.value
        return {
          name: `${l.poNo} · ${row?.item.code ?? l.itemId}`,
          value: late ? 'lands after the line stops' : l.promisedDate < today ? 'past due' : 'on schedule',
          source: `due ${l.promisedDate}${row ? `, material runs out ${row.stockoutDate.value}` : ''}`,
        }
      }),
      { note: 'A PO that is not late by the calendar can still be late for the line. Both count, and PO-2611 is the case: covered on quantity, nine days after the material runs dry.' },
    ),
  }
}

/* ========================================================================== */
/* 2 · Warehouse & inventory health                                           */
/* ========================================================================== */

export function daysInventoryOutstanding(rows: DerivedRow[]): Kpi {
  const stockValue = rows.reduce((a, r) => a + r.usable.value * r.item.lastPurchaseRate, 0)
  const dailyBurn = rows.reduce((a, r) => a + r.item.avgDailyConsumption * r.item.lastPurchaseRate, 0)
  const value = dailyBurn === 0 ? 0 : round(stockValue / dailyBurn, 1)
  return {
    id: 'dio', label: 'Days inventory outstanding', provenance: 'derived',
    meaning: 'How long material sits in the warehouse before it is consumed. Lower is better.',
    format: 'days', dp: 1, suffix: ' days',
    target: '< 30 days', meetsTarget: value < 30,
    caption: `₹${Math.round(stockValue).toLocaleString('en-IN')} of usable stock against ₹${Math.round(dailyBurn).toLocaleString('en-IN')} consumed a day`,
    d: D(
      value, 'Days inventory outstanding',
      'Σ (usable × last_purchase_rate) ÷ Σ (avg_daily_consumption × last_purchase_rate)',
      [
        { name: 'usable stock at cost', value: round(stockValue, 2), unit: '₹' },
        { name: 'consumed per day at cost', value: round(dailyBurn, 2), unit: '₹/day' },
        ...rows.map((r) => ({
          name: r.item.code, value: round(r.usable.value * r.item.lastPurchaseRate, 2), unit: '₹',
          source: `${r.usable.value} ${r.item.uom} × ₹${r.item.lastPurchaseRate}`,
        })),
      ],
      { unit: 'days', note: 'Raw material only. Non-usable stock is excluded, because material you cannot issue is not inventory turning — it is money stopped.' },
    ),
  }
}

export function stockoutRisk(
  halting: number, atRisk: number, jobs: number, blocking: string[],
): Kpi {
  return {
    id: 'stockouts', label: 'Production halts forecast', provenance: 'derived',
    meaning: 'How many times production stops because a component ran out.',
    format: 'int',
    target: '0', meetsTarget: halting === 0,
    caption: `${halting} of ${jobs} jobs will halt this week · ${atRisk} more at risk`,
    d: D(
      halting, 'Jobs that will halt this week',
      'count(job where a material it needs runs out before the job runs)',
      blocking.length
        ? blocking.map((b) => ({ name: b, value: 'short', source: 'Line Watch, §9.2' }))
        : [{ name: 'blocked jobs', value: 0, source: 'every job on the week has its material' }],
      { note: 'Forward-looking, not historical. Counting halts that already happened needs a production-halt log with a cause, which this build does not carry — so it counts the ones about to happen instead, which is the more useful direction anyway.' },
    ),
  }
}

export function shrinkageAndWaste(
  losses: LossRecord[], movements: StockMovement[], rateOf: (itemId: string) => number,
): Kpi {
  const shrink = losses.filter((l) => l.cause === 'count_shortage' || l.cause === 'store_spoilage')
  const shrinkValue = shrink.reduce((a, l) => a + l.qty * rateOf(l.itemId), 0)
  const allValue = losses.reduce((a, l) => a + l.qty * rateOf(l.itemId), 0)
  const issuedValue = movements
    .filter((m) => m.kind === 'issue' || m.kind === 'jobwork_out')
    .reduce((a, m) => a + Math.abs(m.qty) * rateOf(m.itemId), 0)
  const wasteRate = pct(allValue, issuedValue)
  return {
    id: 'shrinkage', label: 'Shrinkage & waste', provenance: 'derived',
    meaning: 'Inventory lost to damage, spoilage, or administrative error, and the wider waste rate.',
    format: 'money',
    target: 'waste < 4%', meetsTarget: wasteRate < 4,
    caption: `shrinkage alone, from ${shrink.length} records · all wastage is ${wasteRate}% of material issued`,
    d: D(
      round(shrinkValue, 2), 'Shrinkage — lost, not consumed',
      'Σ (qty × last_purchase_rate) over count shortages and spoilage in store',
      shrink.length
        ? shrink.map((l) => ({
            name: `${l.id} · ${l.itemId}`, value: round(l.qty * rateOf(l.itemId), 2), unit: '₹',
            source: `${l.cause === 'count_shortage' ? 'found short at a count' : 'spoiled in store'} · ${l.sourceRef}`,
          }))
        : [{ name: 'shrinkage', value: 0, source: 'nothing lost to counting or spoilage' }],
      { unit: '₹', note: 'Shrinkage is the subset of loss with nothing to show for it — no kerf, no process, no scrap value. It is the honest name for stock that is simply not there.' },
    ),
  }
}

export function stockSplit(
  rmValue: number, wipValue: number, fgValue: number,
  rmParts: DerivationInput[], wipParts: DerivationInput[], fgParts: DerivationInput[] = [],
): Kpi {
  const total = rmValue + wipValue + fgValue
  const wipPct = pct(wipValue, total)
  return {
    id: 'split', label: 'Raw material · WIP · finished goods', provenance: 'derived',
    meaning: 'Where the stock is sitting. Too much WIP means a bottleneck on the floor.',
    format: 'lakh',
    target: 'WIP < 25%', meetsTarget: wipPct < 25,
    caption: `raw ${pct(rmValue, total)}% · WIP ${wipPct}% · finished ${pct(fgValue, total)}%`,
    d: D(
      round(total, 2), 'Stock across the three stages',
      'raw material on the shelf + material with jobworkers + finished goods',
      [
        { name: 'raw material', value: round(rmValue, 2), unit: '₹', source: 'usable stock lots, at last purchase price' },
        ...rmParts,
        { name: 'work in progress', value: round(wipValue, 2), unit: '₹', source: 'material out at jobworkers — neither on the shelf nor consumed' },
        ...wipParts,
        { name: 'finished goods', value: round(fgValue, 2), unit: '₹', source: 'the despatch bay, at standard cost — a balance summed from its movements, not a stored number' },
        ...fgParts,
      ],
      { unit: '₹', note: 'All three legs are measured now. The finished-goods leg was an assumption until DSP-01 gave the thing that ships an identity and a balance.' },
    ),
  }
}

/* ========================================================================== */
/* 3 · Outbound fulfilment                                                    */
/*                                                                            */
/* Every figure in this section used to be illustrative, because §2 put Stage  */
/* 5 out of scope and nothing in the build observed a delivery. DSP-01 to      */
/* DSP-04 changed that: these now take the despatch, consignment and return    */
/* records and are counted rather than assumed.                               */
/* ========================================================================== */

export function customerOtif(
  otif: Derived, delivered: number, inTransit: number,
  atRiskOrders: { soNo: string; customer: string; value: number; promisedDate: string }[],
): Kpi {
  const v = otif.value as number
  return {
    id: 'cotif', label: 'Customer OTIF', provenance: 'derived',
    meaning: 'Shipments delivered to customers when they expected them, with nothing missing.',
    format: 'raw', dp: 1, suffix: '%',
    target: '> 95%', meetsTarget: v > 95,
    caption: `${delivered} deliveries observed · ${inTransit} still in transit and counted as neither · ${atRiskOrders.length} orders at risk from short material`,
    d: otif,
  }
}

export function fulfilmentCycle(cycle: Derived, notes: number): Kpi {
  return {
    id: 'cycle', label: 'Order fulfilment cycle time', provenance: 'derived',
    meaning: 'From receiving a customer order to the moment it leaves the loading dock.',
    format: 'days', dp: 1, suffix: ' days',
    caption: `mean across ${notes} despatch notes — order taken to goods gone`,
    d: cycle,
  }
}

export function carrierDelays(rows: {
  name: string; shipped: number; delivered: number; late: number; drift: number
}[]): Kpi {
  // A carrier with one delivery has no rate, only an anecdote. Those are kept
  // in the derivation and left out of the ranking, and the caption says which —
  // a chart that silently drops a row reads as "this is everyone".
  const RANKABLE = 2
  const ranked = rows.filter((r) => r.delivered >= RANKABLE)
  const thin = rows.filter((r) => r.delivered > 0 && r.delivered < RANKABLE)
  const late = ranked.reduce((a, c) => a + c.late, 0)
  const total = ranked.reduce((a, c) => a + c.delivered, 0)
  const worst = [...ranked].sort((a, b) => (b.late / b.delivered) - (a.late / a.delivered))[0]
  const thinNote = thin.length
    ? ` · ${thin.map((t) => t.name).join(', ')} not ranked on ${thin[0].delivered} delivery`
    : ''
  return {
    id: 'carriers', label: 'Delays by carrier', provenance: 'derived',
    meaning: 'Which logistics partner is causing the most shipping delays.',
    format: 'raw', dp: 1, suffix: '%',
    caption: (worst && worst.late > 0
      ? `${worst.name} is the worst — ${pct(worst.late, worst.delivered)}% late, ${worst.drift} days against the promise`
      : 'nothing late among the carriers with enough deliveries to rank') + thinNote,
    d: D(
      pct(late, total), 'Consignments delivered late', 'late deliveries ÷ delivered consignments × 100',
      rows.map((c) => ({
        name: c.name, value: `${c.late} of ${c.delivered} late`,
        source: c.delivered >= RANKABLE
          ? `${c.drift} days against the promise on average, across ${c.shipped} shipped`
          : `not ranked — ${c.delivered} delivery is an anecdote, not a rate (${c.shipped} shipped)`,
      })),
      { unit: '%', note: 'Counted on consignments that have actually arrived. A carrier still in transit cannot be late yet, and counting it either way would be a guess.' },
    ),
  }
}

export function rmaRate(rate: Derived, open: number, shippedUnits: number): Kpi {
  const v = rate.value as number
  return {
    id: 'rma', label: 'RMA rate', provenance: 'derived',
    meaning: 'Shipped products returned by customers for delivery damage or wrong items.',
    format: 'raw', dp: 2, suffix: '%',
    target: '< 1.5%', meetsTarget: v < 1.5,
    caption: `on ${shippedUnits.toLocaleString('en-IN')} units shipped · ${open} authorisation${open === 1 ? '' : 's'} still open`,
    d: rate,
  }
}

/* ========================================================================== */
/* 4 · Supply chain financials                                                */
/* ========================================================================== */

export function holdingCost(stockValue: number, nonUsableValue: number, jobworkValue: number): Kpi {
  const base = stockValue + nonUsableValue + jobworkValue
  const rate = A.holdingRatePctPerMonth
  const value = round(base * (rate / 100), 2)
  return {
    id: 'holding', label: 'Inventory holding cost', provenance: 'part',
    meaning: 'The monthly cost of storing inventory — rent, power, insurance and stores labour.',
    format: 'money',
    caption: `${rate}% a month on ₹${(base / 100000).toFixed(2)} L of stock — including the ₹${Math.round(nonUsableValue).toLocaleString('en-IN')} nobody can issue`,
    needs: `The ${rate}% rate. The stock it is applied to is measured; the rate is the ordinary range for a rented shed and should be replaced with the client's actual shed cost.`,
    d: D(
      value, 'Monthly inventory holding cost',
      '(usable + non-usable + material at jobworkers) × holding_rate',
      [
        { name: 'usable stock', value: round(stockValue, 2), unit: '₹' },
        { name: 'non-usable stock', value: round(nonUsableValue, 2), unit: '₹', source: 'still costs rent and insurance, and still cannot be issued' },
        { name: 'at jobworkers', value: round(jobworkValue, 2), unit: '₹', source: 'their shed, our money' },
        { name: 'holding_rate', value: `${rate}% per month`, source: assumption('holdingRatePctPerMonth').basis },
      ],
      { unit: '₹', note: 'Non-usable stock is deliberately in the base. It is the most expensive stock a factory owns: it carries the same holding cost and returns nothing.' },
    ),
  }
}

/**
 * The metric as asked — outbound, per unit shipped — which nothing in this build
 * measures. The inbound half IS measured and is shown beneath it as the real
 * supporting figure, rather than being blended into the same tile: mixing a
 * measured number and an assumed one inside one figure is the thing the
 * provenance chip exists to prevent.
 */
export function outboundFreightPerUnit(freight: Derived, consignments: number): Kpi {
  return {
    id: 'freightOut', label: 'Freight cost per unit shipped', provenance: 'derived',
    meaning: 'Total shipping cost divided by units sent out. Keeps a check on rising fuel and transport surcharges.',
    format: 'money', dp: 2,
    caption: `across ${consignments} consignments, from the carriers\u2019 own bills — inbound freight is measured as a share of order value, below`,
    d: freight,
  }
}

/** The measured half: what it costs to get material IN, this run. */
export function inboundFreight(rows: DerivedRow[]): Derived {
  const withQty = rows.filter((r) => r.reorderQty.value > 0)
  const freight = withQty.reduce((a, r) => a + r.shipmentCost.value, 0)
  const landed = withQty.reduce((a, r) => a + r.landedTotal.value, 0)
  return D(
    landed === 0 ? 0 : round((freight / landed) * 100, 2),
    'Inbound freight as a share of order value',
    'Σ shipment_cost ÷ Σ landed_total × 100',
    [
      { name: 'freight this run', value: round(freight, 2), unit: '₹' },
      { name: 'landed value this run', value: round(landed, 2), unit: '₹' },
      ...withQty.map((r) => ({
        name: `${r.item.code} · per unit`, value: round(r.chosen.vendorItem.freightPerUnit, 2),
        unit: `₹/${r.item.uom}`,
        source: `${r.reorderQty.value} ${r.item.uom} from ${r.chosen.vendor.name}`,
      })),
    ],
    { unit: '%', note: 'A share of value, not rupees per unit: these orders are in metres, kilograms and pieces, and dividing one rupee total by the sum of those would be arithmetic on nothing. The per-unit freight for each item is listed above, where it does mean something. Freight is one of the five components of landed cost (§5), which is why the cheapest quoted rate is so often not the cheapest material.' },
  )
}

export function cashToCash(dio: number, paymentTermsDays: number): Kpi {
  const dso = A.dsoDays
  const value = round(dio + dso - paymentTermsDays, 1)
  return {
    id: 'c2c', label: 'Cash-to-cash cycle', provenance: 'part',
    meaning: 'Days between paying suppliers for material and collecting cash from customers.',
    format: 'days', dp: 1, suffix: ' days',
    target: '< 60 days', meetsTarget: value < 60,
    caption: `${dio} days of stock + ${dso} days to collect − ${paymentTermsDays} days of supplier credit`,
    needs: `The ${dso}-day collection period. Stock days and supplier terms are both measured; days-sales-outstanding needs the sales ledger.`,
    d: D(
      value, 'Cash-to-cash cycle time',
      'days_inventory_outstanding + days_sales_outstanding − days_payable_outstanding',
      [
        { name: 'days inventory outstanding', value: dio, unit: 'days', source: 'measured — stock at cost ÷ daily consumption at cost' },
        { name: 'days sales outstanding', value: dso, unit: 'days', source: assumption('dsoDays').basis },
        { name: 'days payable outstanding', value: paymentTermsDays, unit: 'days', source: 'measured — every vendor in §9.1 is on 30-day terms' },
      ],
      { unit: 'days', note: 'The number that decides whether a growing order book is survivable. Two of its three legs are measured here; the collection leg is the one an MSME usually knows off the top of their head anyway.' },
    ),
  }
}

export function procurementCost(poCount: number, linesRun: number): Kpi {
  const per = A.procurementCostPerPo
  const value = round(poCount * per, 2)
  return {
    id: 'proccost', label: 'Cost of procurement', provenance: 'part',
    meaning: 'The administrative cost of sourcing, ordering and processing raw materials.',
    format: 'money',
    caption: `₹${per} of buyer time per order, across ${poCount} draft POs from ${linesRun} lines`,
    needs: `The ₹${per} per order. The order count is measured; the admin cost per order needs a look at how the buyer actually spends a day.`,
    d: D(
      value, 'Cost of procurement this run',
      'draft POs × administrative cost per order',
      [
        { name: 'draft POs', value: poCount, source: 'measured — distinct suppliers across the lines needing a decision' },
        { name: 'lines reviewed', value: linesRun, source: 'measured' },
        { name: 'admin cost per order', value: `₹${per}`, source: assumption('procurementCostPerPo').basis },
      ],
      { unit: '₹', note: 'Worth measuring precisely because it is the figure SRC-02 is supposed to move: a buyer who stops re-keying quotes raises the same orders for less.' },
    ),
  }
}

export const PROVENANCE_LABEL: Record<Provenance, string> = {
  derived: 'derived',
  part: 'part derived',
  illustrative: 'illustrative',
}
