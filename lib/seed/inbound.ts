/**
 * Seed for the three Inbound systems. Same factory as §9.1 — industrial heaters
 * and control panels — and the same run date, 2026-09-02, so every figure here
 * reconciles against the Sourcing Desk rather than living in its own world.
 *
 * CONTEXT.md supplies none of this: §9.1 has no inspection specs, no PO revision
 * history and an empty jobwork_out. Everything below is invented to a stated
 * shape, and each invention is named in the comment above it. What is NOT
 * invented: item codes, names, units, last purchase rates, PO numbers, promised
 * dates and vendor names all come from §9.1 verbatim.
 */
import type { Grn, JobworkChallan, PoSync, SpecCheck } from '@/lib/domain/types'

/** The same run date as §9.1's Sourcing Desk. */
export const TODAY_INBOUND = '2026-09-02'

/** The fabrication floor of §9.2 keeps its own run date — Line Watch's Monday. */
export const TODAY_FABRICATION = '2026-09-07'

export const INSPECTOR = 'S. Kale · Stores'

/* ------------------------------------------------------------ INB-01 · specs */

/**
 * Two to four checks per item. A `measure` check carries a tolerance band, so a
 * reading outside it fails without anyone deciding; a `document` check is a
 * certificate present or not; `visual` is a person's eye with a named defect;
 * `count` is quantity against the order.
 *
 * The failure buckets are the four §7 usability states, and each carries one of
 * the eight non-usable reasons §9.1 already uses — so a rejection recorded here
 * lands in exactly the same bucket the Inventory page already displays.
 */
export const specChecks: SpecCheck[] = [
  // EL-TUB-INC85 · Incoloy 800 sheathed element tube Ø8.5
  { id: 'SC-TUB-OD', itemId: 'EL-TUB-INC85', label: 'Outside diameter', kind: 'measure',
    min: 8.4, max: 8.6, unit: 'mm', failBucket: 'qc_hold', failReason: 'Ovality out of tolerance', mandatory: true },
  { id: 'SC-TUB-WALL', itemId: 'EL-TUB-INC85', label: 'Wall thickness', kind: 'measure',
    min: 0.6, max: 0.8, unit: 'mm', failBucket: 'qc_hold', failReason: 'Wall below drawing', mandatory: true },
  { id: 'SC-TUB-MTC', itemId: 'EL-TUB-INC85', label: 'Mill test certificate, Incoloy 800', kind: 'document',
    failBucket: 'qc_hold', failReason: 'Certificate missing', mandatory: true },
  { id: 'SC-TUB-QTY', itemId: 'EL-TUB-INC85', label: 'Quantity against the order', kind: 'count',
    failBucket: 'usable', failReason: 'Short supply — quantity only, material is good', mandatory: true },

  // RM-CRC-120 · CRCA sheet 1.2 mm × 1250
  { id: 'SC-CRC-THK', itemId: 'RM-CRC-120', label: 'Sheet thickness', kind: 'measure',
    min: 1.14, max: 1.26, unit: 'mm', failBucket: 'qc_hold', failReason: 'Thickness outside IS 513 tolerance', mandatory: true },
  { id: 'SC-CRC-MTC', itemId: 'RM-CRC-120', label: 'Mill test certificate', kind: 'document',
    failBucket: 'qc_hold', failReason: 'Certificate missing', mandatory: true },
  { id: 'SC-CRC-SURF', itemId: 'RM-CRC-120', label: 'Surface — rust, scale, dents', kind: 'visual',
    failBucket: 'qc_hold', failReason: 'Surface rust rejected at GRN', mandatory: true },
  { id: 'SC-CRC-WT', itemId: 'RM-CRC-120', label: 'Weighbridge against challan', kind: 'count',
    failBucket: 'usable', failReason: 'Short weight — quantity only', mandatory: true },

  // RM-MGO-EG · MgO powder, electrical grade
  { id: 'SC-MGO-MOIST', itemId: 'RM-MGO-EG', label: 'Moisture content', kind: 'measure',
    min: 0, max: 0.3, unit: '%', failBucket: 'qc_hold', failReason: 'Moisture ingress — needs re-drying', mandatory: true },
  { id: 'SC-MGO-PUR', itemId: 'RM-MGO-EG', label: 'Purity certificate, electrical grade', kind: 'document',
    failBucket: 'qc_hold', failReason: 'Certificate missing', mandatory: true },
  { id: 'SC-MGO-QTY', itemId: 'RM-MGO-EG', label: 'Bag count and net weight', kind: 'count',
    failBucket: 'usable', failReason: 'Short weight — quantity only', mandatory: true },

  // RM-NCR-8020 · Nichrome 80/20 wire Ø0.5
  { id: 'SC-NCR-DIA', itemId: 'RM-NCR-8020', label: 'Wire diameter', kind: 'measure',
    min: 0.49, max: 0.51, unit: 'mm', failBucket: 'damaged', failReason: 'Drawn off-gauge', mandatory: true },
  { id: 'SC-NCR-RES', itemId: 'RM-NCR-8020', label: 'Resistance per metre', kind: 'measure',
    min: 5.4, max: 5.7, unit: 'Ω/m', failBucket: 'qc_hold', failReason: 'Resistance outside band', mandatory: true },
  { id: 'SC-NCR-MTC', itemId: 'RM-NCR-8020', label: 'Alloy composition certificate', kind: 'document',
    failBucket: 'qc_hold', failReason: 'Certificate missing', mandatory: true },

  // HW-GLD-M20 · Cable gland M20, brass
  { id: 'SC-GLD-THR', itemId: 'HW-GLD-M20', label: 'Thread gauge, M20 go / no-go', kind: 'visual',
    failBucket: 'damaged', failReason: 'Thread damage', mandatory: true },
  { id: 'SC-GLD-QTY', itemId: 'HW-GLD-M20', label: 'Piece count', kind: 'count',
    failBucket: 'usable', failReason: 'Short supply — quantity only', mandatory: true },

  // CM-TRB-2W · Ceramic terminal block 2-way 30 A
  { id: 'SC-TRB-DIEL', itemId: 'CM-TRB-2W', label: 'Dielectric test certificate', kind: 'document',
    failBucket: 'qc_hold', failReason: 'Certificate missing', mandatory: true },
  { id: 'SC-TRB-VIS', itemId: 'CM-TRB-2W', label: 'Chipping and hairline cracks', kind: 'visual',
    failBucket: 'damaged', failReason: 'Chipped in handling', mandatory: true },
  { id: 'SC-TRB-QTY', itemId: 'CM-TRB-2W', label: 'Piece count', kind: 'count',
    failBucket: 'usable', failReason: 'Short supply — quantity only', mandatory: true },

  // SN-RTD-6150 · PT100 RTD sensor 6 × 150
  { id: 'SC-RTD-CAL', itemId: 'SN-RTD-6150', label: 'Calibration certificate', kind: 'document',
    failBucket: 'qc_hold', failReason: 'Certificate missing', mandatory: true },
  { id: 'SC-RTD-R0', itemId: 'SN-RTD-6150', label: 'Resistance at 0 °C', kind: 'measure',
    min: 99.9, max: 100.1, unit: 'Ω', failBucket: 'qc_hold', failReason: 'Calibration drift', mandatory: true },
  { id: 'SC-RTD-QTY', itemId: 'SN-RTD-6150', label: 'Piece count', kind: 'count',
    failBucket: 'usable', failReason: 'Short supply — quantity only', mandatory: true },

  // RM-FLG-304-2 · SS 304 flange 2" ANSI 150#
  { id: 'SC-FLG-BORE', itemId: 'RM-FLG-304-2', label: 'Bore diameter', kind: 'measure',
    min: 50.6, max: 51.4, unit: 'mm', failBucket: 'damaged', failReason: 'Bore undersize', mandatory: true },
  { id: 'SC-FLG-PMI', itemId: 'RM-FLG-304-2', label: 'PMI — 304 grade confirmation', kind: 'document',
    failBucket: 'qc_hold', failReason: 'Grade not confirmed', mandatory: true },
  { id: 'SC-FLG-QTY', itemId: 'RM-FLG-304-2', label: 'Piece count', kind: 'count',
    failBucket: 'usable', failReason: 'Short supply — quantity only', mandatory: true },

  // IN-MWL-050 · Mineral wool insulation 50 mm
  { id: 'SC-MWL-THK', itemId: 'IN-MWL-050', label: 'Slab thickness', kind: 'measure',
    min: 48, max: 52, unit: 'mm', failBucket: 'qc_hold', failReason: 'Thickness outside tolerance', mandatory: true },
  { id: 'SC-MWL-QTY', itemId: 'IN-MWL-050', label: 'Area against the order', kind: 'count',
    failBucket: 'usable', failReason: 'Short supply — quantity only', mandatory: true },
]

export const checksFor = (itemId: string) => specChecks.filter((c) => c.itemId === itemId)

/* -------------------------------------------------------- INB-02 · PO history */

/**
 * The invariant that makes this fit §9.1 rather than contradict it:
 *
 *   revisionAt(sync, ackedVersion).qty  ===  §9.1 po_line.qty      (all four lines)
 *
 * §9.1's open and in-transit quantities are what the VENDOR has confirmed — which
 * has to be true, because the Sourcing Desk's true position and status reconcile
 * against them, and material arrives at the quantity the vendor is making, not at
 * the quantity we last typed. INB-02 does not move those figures; it reveals that
 * behind three of them sits a different internal number nobody passed on. Nothing
 * on the Sourcing Desk changes, and the reports still reconcile.
 *
 * PO-2596 is a fifth, already-received line. §9.1 does not carry it; it exists so
 * the receipt in GRN-1187 has an order to be short against.
 */
export const poSync: PoSync[] = [
  {
    poLineId: 'POL-1', poNo: 'PO-2611', itemId: 'RM-MGO-EG', vendorName: 'Nirmal Minerals',
    shipped: false, notifiedVersion: 2, ackedVersion: 2,
    notifiedOn: '2026-08-28', ackedOn: '2026-08-28', ackRef: 'WhatsApp — “noted, 19th”',
    revisions: [
      { version: 1, qty: 400, promisedDate: '2026-09-12', changedOn: '2026-08-20',
        changedBy: 'A. Nandy · Buyer', kind: 'created', reason: 'Reorder raised — MgO below reorder point.' },
      { version: 2, qty: 400, promisedDate: '2026-09-19', changedOn: '2026-08-28',
        changedBy: 'Nirmal Minerals', kind: 'date', reason: 'Vendor asked for a week; kiln under maintenance.' },
    ],
  },
  {
    poLineId: 'POL-2', poNo: 'PO-2648', itemId: 'RM-FLG-304-2', vendorName: 'Sanghvi Forgings',
    shipped: false, notifiedVersion: 1, ackedVersion: 1,
    notifiedOn: '2026-08-25', ackedOn: '2026-08-25', ackRef: 'Email — order confirmation 25/08',
    revisions: [
      { version: 1, qty: 300, promisedDate: '2026-09-08', changedOn: '2026-08-25',
        changedBy: 'A. Nandy · Buyer', kind: 'created', reason: 'Reorder raised against SO-2288.' },
      { version: 2, qty: 380, promisedDate: '2026-09-08', changedOn: '2026-08-29',
        changedBy: 'A. Nandy · Buyer', kind: 'qty', reason: 'SO-2288 extended by 20 heaters.' },
      { version: 3, qty: 420, promisedDate: '2026-09-08', changedOn: '2026-08-31',
        changedBy: 'R. Mehta · Production', kind: 'qty', reason: 'Spare flanges added for the service stock.' },
      { version: 4, qty: 450, promisedDate: '2026-09-08', changedOn: '2026-09-01',
        changedBy: 'A. Nandy · Buyer', kind: 'qty', reason: 'SO-2288 extended again — final count 450.' },
    ],
  },
  {
    poLineId: 'POL-3', poNo: 'PO-2637', itemId: 'RM-CRC-120', vendorName: 'Mahalaxmi Steel',
    shipped: true, notifiedVersion: 2, ackedVersion: 1,
    notifiedOn: '2026-08-30', ackedOn: '2026-08-27', ackRef: 'Email — order confirmation 27/08',
    revisions: [
      { version: 1, qty: 1.5, promisedDate: '2026-09-05', changedOn: '2026-08-27',
        changedBy: 'A. Nandy · Buyer', kind: 'created', reason: 'Reorder raised — CRCA at reorder point.' },
      { version: 2, qty: 1.0, promisedDate: '2026-09-05', changedOn: '2026-08-30',
        changedBy: 'A. Nandy · Buyer', kind: 'qty', reason: 'Enclosure job for Deccan pulled — 0.5 MT no longer needed.' },
    ],
  },
  {
    poLineId: 'POL-4', poNo: 'PO-2641', itemId: 'HW-GLD-M20', vendorName: 'Krishna Electricals',
    shipped: true, notifiedVersion: 1, ackedVersion: 1,
    notifiedOn: '2026-08-28', ackedOn: '2026-08-28', ackRef: 'WhatsApp — “dispatching 4th”',
    revisions: [
      { version: 1, qty: 1000, promisedDate: '2026-09-06', changedOn: '2026-08-28',
        changedBy: 'A. Nandy · Buyer', kind: 'created', reason: 'Reorder raised — glands below reorder point.' },
    ],
  },
  {
    poLineId: 'POL-H1', poNo: 'PO-2596', itemId: 'EL-TUB-INC85', vendorName: 'Nirmal Alloy Tubes',
    shipped: true, notifiedVersion: 1, ackedVersion: 1,
    notifiedOn: '2026-08-18', ackedOn: '2026-08-19', ackRef: 'Email — order confirmation 19/08',
    revisions: [
      { version: 1, qty: 500, promisedDate: '2026-09-01', changedOn: '2026-08-18',
        changedBy: 'A. Nandy · Buyer', kind: 'created', reason: 'Reorder raised against the August run.' },
      { version: 2, qty: 650, promisedDate: '2026-09-01', changedOn: '2026-08-24',
        changedBy: 'A. Nandy · Buyer', kind: 'qty', reason: 'Safety stock revised upward after the July stockout.' },
    ],
  },
]

/** PO-2596 is closed on receipt, so it never appears on the open-orders board. */
export const RECEIVED_PO_LINE_IDS = ['POL-H1']

/* --------------------------------------------------- INB-03 · jobwork challans */

/**
 * Two floors. The heater factory (§9.1, run date 02 Sep) sends material out for
 * grinding, cutting, machining and plating. The fabrication floor (§9.2, run date
 * 07 Sep) is Line Watch's shop, and its three challans are the source of the
 * `withJobworker` quantities that page already displays — so the late-jobwork
 * flag there now resolves to a specific challan here.
 *
 * Invented: challan numbers, processes, promised return dates and expected
 * yields. The yields are the ordinary figures for each process — laser cutting
 * leaves a skeleton, bending loses almost nothing, galvanising ADDS zinc weight,
 * so its yield is above 1. Rates are the §9.1 / §9.2 last purchase prices.
 */
export const challans: JobworkChallan[] = [
  {
    id: 'JC-2190', challanNo: 'JC-2190', floor: 'heaters', asOf: TODAY_INBOUND,
    itemId: 'HW-GLD-M20', itemName: 'Cable gland M20, brass', uom: 'nos',
    jobworkerName: 'Bright Plating Co.', process: 'Nickel plating',
    qtySent: 2000, sentOn: '2026-08-12', dueBack: '2026-08-19',
    expectedYield: 0.99, rate: 35.8, purpose: 'Panel build — coastal spec',
    status: 'out',
  },
  {
    id: 'JC-2198', challanNo: 'JC-2198', floor: 'heaters', asOf: TODAY_INBOUND,
    itemId: 'RM-CRC-120', itemName: 'CRCA sheet 1.2 mm × 1250', uom: 'MT',
    jobworkerName: 'Shree Laser Works', process: 'Laser cutting',
    qtySent: 1.2, sentOn: '2026-08-20', dueBack: '2026-08-27',
    expectedYield: 0.95, rate: 61400, purpose: 'Enclosure blanks, 600×800',
    status: 'out',
  },
  {
    id: 'JC-2203', challanNo: 'JC-2203', floor: 'heaters', asOf: TODAY_INBOUND,
    itemId: 'EL-TUB-INC85', itemName: 'Incoloy 800 sheathed element tube Ø8.5', uom: 'm',
    jobworkerName: 'Precision Grinders', process: 'Centreless grinding',
    qtySent: 180, sentOn: '2026-08-26', dueBack: '2026-09-04',
    expectedYield: 0.97, rate: 212, purpose: 'Immersion heater 6 kW',
    status: 'out',
  },
  {
    id: 'JC-2205', challanNo: 'JC-2205', floor: 'heaters', asOf: TODAY_INBOUND,
    itemId: 'RM-FLG-304-2', itemName: 'SS 304 flange 2" ANSI 150#', uom: 'nos',
    jobworkerName: 'Sanghvi Machining', process: 'Bore machining & facing',
    qtySent: 120, sentOn: '2026-08-28', dueBack: '2026-09-06',
    expectedYield: 0.98, rate: 486, purpose: 'Immersion heater 6 kW',
    status: 'out',
  },
  {
    id: 'JC-2186', challanNo: 'JC-2186', floor: 'heaters', asOf: TODAY_INBOUND,
    itemId: 'RM-NCR-8020', itemName: 'Nichrome 80/20 wire Ø0.5', uom: 'kg',
    jobworkerName: 'Precision Wire Co.', process: 'Coil winding',
    qtySent: 40, sentOn: '2026-08-05', dueBack: '2026-08-12',
    expectedYield: 0.97, rate: 1198, purpose: 'Cartridge heaters',
    status: 'closed', closedOn: '2026-08-11',
  },

  /* -- the fabrication floor, §9.2 · these are Line Watch's withJobworker rows -- */
  {
    id: 'JW-01', challanNo: 'JC-3141', floor: 'fabrication', asOf: TODAY_FABRICATION,
    itemId: 'SM-CRCA-16', itemName: 'CRCA sheet 1.6 × 1250 × 2500', uom: 'kg',
    jobworkerName: 'Shree Laser', process: 'Laser cutting',
    qtySent: 420, sentOn: '2026-09-02', dueBack: '2026-09-08',
    expectedYield: 0.94, rate: 62, purpose: 'JOB-4471 · enclosure 800×600',
    status: 'out',
  },
  {
    id: 'JW-02', challanNo: 'JC-3147', floor: 'fabrication', asOf: TODAY_FABRICATION,
    itemId: 'RM-ANG-405', itemName: 'MS angle 40 × 40 × 5', uom: 'kg',
    jobworkerName: 'Perfect Bending Works', process: 'Press bending',
    qtySent: 380, sentOn: '2026-09-05', dueBack: '2026-09-09',
    expectedYield: 0.99, rate: 56, purpose: 'JOB-4473 · equipment frame 1200',
    status: 'out',
  },
  {
    id: 'JW-03', challanNo: 'JC-3128', floor: 'fabrication', asOf: TODAY_FABRICATION,
    itemId: 'RM-ZNC-999', itemName: 'Zinc ingot 99.99%', uom: 'MT',
    jobworkerName: 'Anand Galvanising', process: 'Hot-dip galvanising',
    qtySent: 1.1, sentOn: '2026-08-28', dueBack: '2026-09-04',
    expectedYield: 1.04, rate: 267200, purpose: 'JOB-4482 · galvanised frame set',
    status: 'out',
  },
]

export const challanById = (id: string) => challans.find((c) => c.id === id)

/* ---------------------------------------------------------- INB-01 · the GRNs */

/**
 * Five receipts waiting at the gate on 02 Sep, and the closed history behind
 * them. The closed GRNs are what the trailing rejection rate is an average OF:
 * each vendor's seeded `trailingRejectionRate` in §9.1 is reproduced by its own
 * receipts here, so the desk's rejection allowance and this queue are the same
 * fact seen twice.
 */
/**
 * Invented on the five PURCHASE receipts only: `orderedQty` and `promisedDate`.
 * §9.1 records neither, and without them OTIF cannot be measured at all — "on
 * time" needs a promise to be late against, and "in full" needs a quantity to
 * fall short of. Jobwork returns deliberately carry neither: a challan coming
 * back is not a supplier delivery and does not belong in a supplier's OTIF.
 */
export const grns: Grn[] = [
  /* ---------------------------------------------------------------- waiting -- */
  {
    id: 'GRN-1187', grnNo: 'GRN-1187', itemId: 'EL-TUB-INC85',
    itemName: 'Incoloy 800 sheathed element tube Ø8.5', uom: 'm',
    vendorName: 'Nirmal Alloy Tubes', poNo: 'PO-2596', poLineId: 'POL-H1',
    receivedOn: '2026-09-01', qtyReceived: 500, againstVersion: 1,
    rate: 212, status: 'open',
  },
  {
    id: 'GRN-1188', grnNo: 'GRN-1188', itemId: 'RM-MGO-EG',
    itemName: 'MgO powder, electrical grade', uom: 'kg',
    vendorName: 'Nirmal Minerals', poNo: 'PO-2604',
    receivedOn: '2026-08-31', qtyReceived: 200,
    rate: 142, status: 'open',
  },
  {
    id: 'GRN-1189', grnNo: 'GRN-1189', itemId: 'SN-RTD-6150',
    itemName: 'PT100 RTD sensor 6 × 150', uom: 'nos',
    vendorName: 'Precision Sensors', poNo: 'PO-2612',
    receivedOn: '2026-08-29', qtyReceived: 100,
    rate: 412, status: 'open',
  },
  {
    id: 'GRN-1190', grnNo: 'GRN-1190', itemId: 'RM-CRC-120',
    itemName: 'CRCA sheet 1.2 mm × 1250 — laser-cut blanks', uom: 'MT',
    vendorName: 'Shree Laser Works', challanId: 'JC-2198',
    receivedOn: '2026-09-02', qtyReceived: 0.52,
    rate: 61400, status: 'open',
  },
  {
    id: 'GRN-1192', grnNo: 'GRN-1192', itemId: 'IN-MWL-050',
    itemName: 'Mineral wool insulation 50 mm', uom: 'm²',
    vendorName: 'Bharat Insulations', poNo: 'PO-2599',
    receivedOn: '2026-09-02', qtyReceived: 250,
    rate: 164, status: 'open',
  },

  /* ----------------------------------------------------------------- closed -- */
  {
    id: 'GRN-1179', grnNo: 'GRN-1179', itemId: 'RM-CRC-120',
    itemName: 'CRCA sheet 1.2 mm × 1250 — laser-cut blanks', uom: 'MT',
    vendorName: 'Shree Laser Works', challanId: 'JC-2198',
    receivedOn: '2026-08-26', qtyReceived: 0.62, rate: 61400,
    status: 'closed', acceptedQty: 0.62, rejectedQty: 0,
    inspector: INSPECTOR, closedAt: '2026-08-26',
  },
  {
    id: 'GRN-1173', grnNo: 'GRN-1173', itemId: 'HW-GLD-M20',
    itemName: 'Cable gland M20, brass — nickel plated', uom: 'nos',
    vendorName: 'Bright Plating Co.', challanId: 'JC-2190',
    receivedOn: '2026-08-22', qtyReceived: 700, rate: 35.8,
    status: 'closed', acceptedQty: 700, rejectedQty: 0,
    inspector: INSPECTOR, closedAt: '2026-08-22',
  },
  {
    id: 'GRN-1168', grnNo: 'GRN-1168', itemId: 'HW-GLD-M20',
    itemName: 'Cable gland M20, brass — nickel plated', uom: 'nos',
    vendorName: 'Bright Plating Co.', challanId: 'JC-2190',
    receivedOn: '2026-08-18', qtyReceived: 1150, rate: 35.8,
    status: 'closed', acceptedQty: 1150, rejectedQty: 0,
    inspector: INSPECTOR, closedAt: '2026-08-18',
  },
  {
    id: 'GRN-1162', grnNo: 'GRN-1162', itemId: 'RM-NCR-8020',
    itemName: 'Nichrome 80/20 wire Ø0.5 — wound coils', uom: 'kg',
    vendorName: 'Precision Wire Co.', challanId: 'JC-2186',
    receivedOn: '2026-08-11', qtyReceived: 39.2, rate: 1198,
    status: 'closed', acceptedQty: 39.2, rejectedQty: 0,
    inspector: INSPECTOR, closedAt: '2026-08-11',
  },
  {
    id: 'GRN-1160', grnNo: 'GRN-1160', itemId: 'EL-TUB-INC85',
    itemName: 'Incoloy 800 sheathed element tube Ø8.5', uom: 'm',
    vendorName: 'Nirmal Alloy Tubes', poNo: 'PO-2571',
    receivedOn: '2026-08-08', qtyReceived: 500, rate: 212,
    orderedQty: 500, promisedDate: '2026-08-06',  // two days late, full quantity
    status: 'closed', acceptedQty: 491, rejectedQty: 9,
    failedCheckIds: ['SC-TUB-OD'], inspector: INSPECTOR, closedAt: '2026-08-08',
  },
  {
    id: 'GRN-1155', grnNo: 'GRN-1155', itemId: 'RM-CRC-120',
    itemName: 'CRCA sheet 1.2 mm × 1250', uom: 'MT',
    vendorName: 'Mahalaxmi Steel', poNo: 'PO-2566',
    receivedOn: '2026-08-04', qtyReceived: 1.5, rate: 61400,
    orderedQty: 1.5, promisedDate: '2026-08-05',  // a day early, full quantity
    status: 'closed', acceptedQty: 1.4775, rejectedQty: 0.0225,
    failedCheckIds: ['SC-CRC-SURF'], inspector: INSPECTOR, closedAt: '2026-08-05',
  },
  {
    id: 'GRN-1149', grnNo: 'GRN-1149', itemId: 'RM-MGO-EG',
    itemName: 'MgO powder, electrical grade', uom: 'kg',
    vendorName: 'Nirmal Minerals', poNo: 'PO-2558',
    receivedOn: '2026-07-28', qtyReceived: 400, rate: 142,
    orderedQty: 400, promisedDate: '2026-07-29',  // a day early, full quantity
    status: 'closed', acceptedQty: 393.6, rejectedQty: 6.4,
    failedCheckIds: ['SC-MGO-MOIST'], inspector: INSPECTOR, closedAt: '2026-07-29',
  },
  {
    id: 'GRN-1142', grnNo: 'GRN-1142', itemId: 'HW-GLD-M20',
    itemName: 'Cable gland M20, brass', uom: 'nos',
    vendorName: 'Krishna Electricals', poNo: 'PO-2547',
    receivedOn: '2026-07-21', qtyReceived: 2000, rate: 35.8,
    orderedQty: 2000, promisedDate: '2026-07-21',  // on the day, full quantity
    status: 'closed', acceptedQty: 1974, rejectedQty: 26,
    failedCheckIds: ['SC-GLD-THR'], inspector: INSPECTOR, closedAt: '2026-07-21',
  },
  {
    id: 'GRN-1137', grnNo: 'GRN-1137', itemId: 'CM-TRB-2W',
    itemName: 'Ceramic terminal block 2-way 30 A', uom: 'nos',
    vendorName: 'Krishna Ceramics', poNo: 'PO-2540',
    receivedOn: '2026-07-14', qtyReceived: 5000, rate: 19.8,
    orderedQty: 5000, promisedDate: '2026-07-12',  // two days late, full quantity
    status: 'closed', acceptedQty: 4915, rejectedQty: 85,
    failedCheckIds: ['SC-TRB-VIS'], inspector: INSPECTOR, closedAt: '2026-07-15',
  },
]
