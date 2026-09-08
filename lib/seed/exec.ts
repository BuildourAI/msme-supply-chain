/**
 * Every assumption the Executive Dashboard rests on that this build does NOT
 * measure — collected in one file so a client can read the whole list in a
 * minute and argue with it, rather than finding the numbers scattered through
 * the code with no way to tell them from the real ones.
 *
 * The dashboard marks each figure with where it came from:
 *
 *   derived       computed from the modules' own data — SRC, INB, INV
 *   part derived  a real base figure × an assumption from this file
 *   illustrative  nothing in this build measures it; the tile says what it needs
 *
 * §2 scopes this build to Stage 1 plus the shop-floor read of Stages 3–4, so
 * every outbound figure is illustrative by construction. That is not an
 * oversight to paper over — it is the honest shape of what has been built, and
 * the "what it needs" line on each tile is the data-capture list.
 */

export interface Assumption {
  id: string
  label: string
  value: number
  unit: string
  /** why this number and not another — a client should be able to disagree */
  basis: string
}

export const ASSUMPTIONS: Assumption[] = [
  {
    id: 'holdingRatePctPerMonth', label: 'Inventory holding cost', value: 1.8, unit: '% of stock value per month',
    basis: 'Rent, power, insurance, stores labour and the interest on money sitting still. 1.5–2% a month is the ordinary range for a rented industrial shed in an Indian metro; 1.8% is the middle of it.',
  },
  {
    id: 'dsoDays', label: 'Days sales outstanding', value: 62, unit: 'days',
    basis: 'What customers actually take to pay against 45-day terms. MSME manufacturers selling to larger firms routinely run 55–75 days. Needed for cash-to-cash and nothing else.',
  },
  {
    id: 'procurementCostPerPo', label: 'Administrative cost per purchase order', value: 780, unit: '₹ per PO',
    basis: 'A buyer’s time to source, compare, raise, chase and file one order, plus the share of the systems that carry it. Falls sharply once SRC-02 files quotes automatically, which is the point of measuring it.',
  },
  {
    id: 'outboundFreightPerConsignment', label: 'Outbound freight per consignment', value: 4_850, unit: '₹',
    basis: 'A part-load consignment within the state. Illustrative — this build has no despatch table, so nothing here is measured.',
  },
  {
    id: 'consignmentsPerMonth', label: 'Consignments a month', value: 38, unit: 'consignments',
    basis: 'Illustrative. Sized to the sales orders §9.2 carries.',
  },
  {
    id: 'unitsPerConsignment', label: 'Units a consignment', value: 26, unit: 'units',
    basis: 'Illustrative. Panels and heaters ship in small batches.',
  },
  {
    id: 'customerOtifPct', label: 'Customer OTIF', value: 87.4, unit: '%',
    basis: 'Illustrative. Needs a despatch record with a promised date against each sales order — Stage 5, which §2 puts out of scope.',
  },
  {
    id: 'fulfilmentCycleDays', label: 'Order fulfilment cycle time', value: 11.4, unit: 'days',
    basis: 'Illustrative. Order to loading dock. Needs a sales-order timestamp and a despatch timestamp; this build has neither.',
  },
  {
    id: 'rmaRatePct', label: 'RMA rate', value: 2.1, unit: '%',
    basis: 'Illustrative. Needs a returns route with an owner and a deadline — the reverse-logistics gap the Dispatch stage already names.',
  },
  {
    id: 'finishedGoodsValue', label: 'Finished goods on hand', value: 3_20_000, unit: '₹',
    basis: 'Illustrative. This build models raw material and work in progress; there is no finished-goods table, so the third leg of the RM/WIP/FG split is assumed. Kept deliberately smaller than the two measured legs — an assumption that dominates the ratio it is part of makes the whole ratio an assumption.',
  },
]

export const A = Object.fromEntries(ASSUMPTIONS.map((a) => [a.id, a.value])) as Record<string, number>
export const assumption = (id: string) => ASSUMPTIONS.find((a) => a.id === id)!

/**
 * Illustrative carrier performance. There is no despatch table in this build, so
 * these are made up whole — kept because "which of my three couriers is losing
 * me customers" is the question a Stage 5 build has to answer, and it is worth
 * showing the shape of the answer even before the data exists.
 */
export const CARRIERS = [
  { name: 'Gati — surface', consignments: 17, lateConsignments: 1, avgDelayDays: 0.8 },
  { name: 'VRL Logistics', consignments: 13, lateConsignments: 3, avgDelayDays: 2.4 },
  { name: 'Local tempo (own arrangement)', consignments: 8, lateConsignments: 2, avgDelayDays: 1.1 },
]
