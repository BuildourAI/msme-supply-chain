/**
 * Seed for the five Dispatch systems — the masters and documents Stage 5 needs
 * and no client in the source set keeps today.
 *
 * Same factory as §9.1 and §9.2: industrial heaters, control panels and
 * fabricated frames. The run date is Line Watch's Monday, because finished
 * goods only exist once the floor has built them.
 *
 * WHAT IS NOT INVENTED. The three at-risk customer orders — SO-2291, SO-2304
 * and SO-2311 — come from §8.5 verbatim, and this file adds their line items
 * without touching their numbers: the lines below multiply out to exactly the
 * order values Line Watch already shows. The products are the six jobs on the
 * Line Watch schedule, under their own codes. The four at-risk materials keep
 * the codes they carry everywhere else.
 *
 * WHAT IS INVENTED, and named as such on the page: the finished-goods rates,
 * the customer GSTINs and ship-to addresses, the carriers and their freight
 * bills, the delivery dates, and the order history before SO-2288. All of it
 * is the shape a real despatch table takes, filled with sample data — never
 * any client's real trading data.
 */
import type {
  Carrier, Consignment, Customer, DespatchNote, FgItem, FgMovement, Rma, SalesOrderLine,
} from '@/lib/domain/types'

/** The fabrication floor's Monday — the same date Line Watch runs on. */
export const TODAY_DISPATCH = '2026-09-07'

export const DESPATCHER = 'A. Pawar · Stores'
export const SALES = 'R. Menon · Sales'

/* ------------------------------------------------ the finished-goods master */

/**
 * The gap that gates the whole stage: the ledger models raw material and work
 * in progress, and the thing that actually leaves the building had no identity
 * at all. These are the six products the Line Watch jobs produce, given a code,
 * a unit and a standard cost so a despatch can be valued.
 *
 * `builtBy` is the job that makes it, so a despatch note can be traced back
 * through production to the material that went into it.
 */
export const fgItems: FgItem[] = [
  { id: 'FG-JB-IP65', code: 'FG-JB-IP65', name: 'Junction box IP65', uom: 'nos',
    standardCost: 3180, builtBy: ['JOB-4468', 'JOB-4476'], hsn: '8538' },
  { id: 'FG-CPE-800', code: 'FG-CPE-800', name: 'Control panel enclosure 800×600', uom: 'nos',
    standardCost: 61400, builtBy: ['JOB-4471', 'JOB-4479'], hsn: '8537' },
  { id: 'FG-EQF-1200', code: 'FG-EQF-1200', name: 'Equipment frame 1200', uom: 'nos',
    standardCost: 7450, builtBy: ['JOB-4473'], hsn: '7308' },
  { id: 'FG-GFS-STD', code: 'FG-GFS-STD', name: 'Galvanised frame set', uom: 'nos',
    standardCost: 41200, builtBy: ['JOB-4482'], hsn: '7308' },
]

/* -------------------------------------------------------- customer master -- */

/**
 * A challan and an e-way bill both need a ship-to and a GSTIN, and neither is
 * anywhere in this build today. Distance is what a freight rate is quoted per
 * kilometre against; the state is what decides IGST against CGST plus SGST,
 * which is the accounting package's business and not this one's.
 */
export const customers: Customer[] = [
  { id: 'CU-BHARAT', name: 'Bharat Infra Ltd', gstin: '27AABCB1429R1ZQ', state: 'Maharashtra',
    shipTo: 'Plot 44, MIDC Chakan, Pune 410501', distanceKm: 38, paymentTerms: 45 },
  { id: 'CU-DECCAN', name: 'Deccan Auto Parts', gstin: '27AAGCD8821K1Z4', state: 'Maharashtra',
    shipTo: 'Gat 210, Sanaswadi, Pune 412208', distanceKm: 52, paymentTerms: 60 },
  { id: 'CU-KGN', name: 'KGN Structurals', gstin: '24AAFCK6610M1ZP', state: 'Gujarat',
    shipTo: 'Survey 88/2, Vatva GIDC, Ahmedabad 382445', distanceKm: 664, paymentTerms: 30 },
  { id: 'CU-VIDARBHA', name: 'Vidarbha Switchgear', gstin: '27AACCV2288J1ZB', state: 'Maharashtra',
    shipTo: 'W-12, MIDC Hingna, Nagpur 440016', distanceKm: 712, paymentTerms: 45 },
  { id: 'CU-SAHYADRI', name: 'Sahyadri Electricals', gstin: '27AAJCS5512F1ZN', state: 'Maharashtra',
    shipTo: 'Shed 6, Satpur MIDC, Nashik 422007', distanceKm: 186, paymentTerms: 30 },
]

/* ----------------------------------------------------------------- carriers */

/** Four ways goods leave, including the one nobody logs: the owner's own tempo. */
export const carriers: Carrier[] = [
  { id: 'CR-VRL', name: 'VRL Logistics', mode: 'Part load', ratePerKgKm: 0.0042 },
  { id: 'CR-TCI', name: 'TCI Freight', mode: 'Part load', ratePerKgKm: 0.0039 },
  { id: 'CR-GATI', name: 'Gati', mode: 'Surface express', ratePerKgKm: 0.0051 },
  { id: 'CR-OWN', name: 'Own vehicle', mode: 'Own tempo', ratePerKgKm: 0.0028 },
]

/* ------------------------------------------------------------- the order book */

/**
 * Sales-order lines. §8.5 carries three orders as a customer name, a value and
 * a promised date — enough to say an order is at risk, nowhere near enough to
 * despatch against. These add the line items, and for those three the lines
 * multiply out to the published value to the rupee: 40 × 96,000 on SO-2291;
 * 100 × 12,000 plus a negotiated 20 × 11,000 on SO-2304; 10 × 66,000 plus
 * 5 × 64,000 on SO-2311.
 */
export const orderLines: SalesOrderLine[] = [
  // — the three §8.5 orders, given their lines
  { id: 'SOL-2291-1', soNo: 'SO-2291', fgId: 'FG-CPE-800', qty: 40, rate: 96000 },
  { id: 'SOL-2304-1', soNo: 'SO-2304', fgId: 'FG-EQF-1200', qty: 100, rate: 12000 },
  { id: 'SOL-2304-2', soNo: 'SO-2304', fgId: 'FG-EQF-1200', qty: 20, rate: 11000,
    note: 'balance quantity at a negotiated rate' },
  { id: 'SOL-2311-1', soNo: 'SO-2311', fgId: 'FG-GFS-STD', qty: 10, rate: 66000 },
  { id: 'SOL-2311-2', soNo: 'SO-2311', fgId: 'FG-GFS-STD', qty: 5, rate: 64000,
    note: 'volume break on the balance five' },
  // — the orders this stage adds, so there is something to actually ship
  { id: 'SOL-2261-1', soNo: 'SO-2261', fgId: 'FG-JB-IP65', qty: 150, rate: 4850 },
  { id: 'SOL-2265-1', soNo: 'SO-2265', fgId: 'FG-EQF-1200', qty: 60, rate: 12000 },
  { id: 'SOL-2268-1', soNo: 'SO-2268', fgId: 'FG-JB-IP65', qty: 80, rate: 4950 },
  { id: 'SOL-2271-1', soNo: 'SO-2271', fgId: 'FG-CPE-800', qty: 8, rate: 98000 },
  { id: 'SOL-2274-1', soNo: 'SO-2274', fgId: 'FG-GFS-STD', qty: 6, rate: 66000 },
  { id: 'SOL-2276-1', soNo: 'SO-2276', fgId: 'FG-JB-IP65', qty: 120, rate: 4850 },
  { id: 'SOL-2281-1', soNo: 'SO-2281', fgId: 'FG-JB-IP65', qty: 60, rate: 4950 },
  { id: 'SOL-2288-1', soNo: 'SO-2288', fgId: 'FG-EQF-1200', qty: 40, rate: 12000 },
  { id: 'SOL-2296-1', soNo: 'SO-2296', fgId: 'FG-CPE-800', qty: 6, rate: 98000 },
  { id: 'SOL-2302-1', soNo: 'SO-2302', fgId: 'FG-JB-IP65', qty: 200, rate: 4800 },
]

/**
 * The orders §8.5 does not carry, because §8.5 only shows orders at risk from
 * short material. An order book with nothing shippable in it cannot demonstrate
 * a despatch, and a factory whose every order is in trouble is not a factory.
 */
export const extraOrders: { soNo: string; customerId: string; takenOn: string; promisedDate: string; description: string }[] = [
  { soNo: 'SO-2261', customerId: 'CU-SAHYADRI', takenOn: '2026-08-06', promisedDate: '2026-08-20', description: '150 junction boxes' },
  { soNo: 'SO-2265', customerId: 'CU-DECCAN', takenOn: '2026-08-10', promisedDate: '2026-08-24', description: '60 equipment frames' },
  { soNo: 'SO-2268', customerId: 'CU-VIDARBHA', takenOn: '2026-08-12', promisedDate: '2026-08-26', description: '80 junction boxes' },
  { soNo: 'SO-2271', customerId: 'CU-KGN', takenOn: '2026-08-14', promisedDate: '2026-08-28', description: '8 control panel enclosures' },
  { soNo: 'SO-2274', customerId: 'CU-BHARAT', takenOn: '2026-08-17', promisedDate: '2026-08-31', description: '6 galvanised frame sets' },
  { soNo: 'SO-2276', customerId: 'CU-BHARAT', takenOn: '2026-08-19', promisedDate: '2026-09-05', description: '120 junction boxes' },
  { soNo: 'SO-2281', customerId: 'CU-VIDARBHA', takenOn: '2026-08-21', promisedDate: '2026-09-03', description: '60 junction boxes' },
  { soNo: 'SO-2288', customerId: 'CU-DECCAN', takenOn: '2026-08-25', promisedDate: '2026-09-09', description: '40 equipment frames' },
  { soNo: 'SO-2296', customerId: 'CU-KGN', takenOn: '2026-08-28', promisedDate: '2026-09-11', description: '6 control panel enclosures' },
  { soNo: 'SO-2302', customerId: 'CU-SAHYADRI', takenOn: '2026-08-31', promisedDate: '2026-09-16', description: '200 junction boxes' },
]

/** Which customer each §8.5 order belongs to, by the name §8.5 already gives. */
export const AT_RISK_ORDER_CUSTOMER: Record<string, string> = {
  'SO-2291': 'CU-BHARAT', 'SO-2304': 'CU-DECCAN', 'SO-2311': 'CU-KGN',
}
export const AT_RISK_ORDER_TAKEN: Record<string, string> = {
  'SO-2291': '2026-08-24', 'SO-2304': '2026-08-26', 'SO-2311': '2026-08-29',
}

/* -------------------------------------------------------- finished-goods stock */

/**
 * The finished-goods balance, as a sum of movements rather than a stored
 * number — the same rule INV-01 holds the raw-material ledger to, for the same
 * reason: a quantity you can edit is a quantity nobody can audit.
 *
 * Opening balances are what was on the despatch bay when this window opens;
 * production entries are jobs the floor closed; the despatch entries are
 * generated below from the notes themselves, so a note and its movement can
 * never disagree.
 *
 * These are deliberately thin. A factory that ships holds its value in raw
 * material and work in progress, not sitting finished on a bay — and a bay
 * that could fill every open order would have nothing to say about the
 * constraint the despatch screen exists to show. What is on the bay here
 * covers the next shipment and not the one after it, which is the ordinary
 * state of a job shop.
 */
export const fgOpening: FgMovement[] = [
  { id: 'FGM-OP-1', fgId: 'FG-JB-IP65', on: '2026-08-01', kind: 'opening', qty: 132, sourceRef: 'OPENING', actor: DESPATCHER },
  { id: 'FGM-OP-2', fgId: 'FG-CPE-800', on: '2026-08-01', kind: 'opening', qty: 6, sourceRef: 'OPENING', actor: DESPATCHER },
  { id: 'FGM-OP-3', fgId: 'FG-EQF-1200', on: '2026-08-01', kind: 'opening', qty: 16, sourceRef: 'OPENING', actor: DESPATCHER },
  { id: 'FGM-OP-4', fgId: 'FG-GFS-STD', on: '2026-08-01', kind: 'opening', qty: 3, sourceRef: 'OPENING', actor: DESPATCHER },
]

/** Jobs the floor closed and booked to the despatch bay. */
export const fgProduction: FgMovement[] = [
  { id: 'FGM-PR-1', fgId: 'FG-JB-IP65', on: '2026-08-18', kind: 'production', qty: 160, sourceRef: 'JOB-4468', actor: DESPATCHER },
  { id: 'FGM-PR-2', fgId: 'FG-EQF-1200', on: '2026-08-21', kind: 'production', qty: 70, sourceRef: 'JOB-4473', actor: DESPATCHER },
  { id: 'FGM-PR-3', fgId: 'FG-CPE-800', on: '2026-08-24', kind: 'production', qty: 14, sourceRef: 'JOB-4471', actor: DESPATCHER },
  { id: 'FGM-PR-4', fgId: 'FG-JB-IP65', on: '2026-08-27', kind: 'production', qty: 140, sourceRef: 'JOB-4476', actor: DESPATCHER },
  { id: 'FGM-PR-5', fgId: 'FG-GFS-STD', on: '2026-08-30', kind: 'production', qty: 4, sourceRef: 'JOB-4482', actor: DESPATCHER },
  { id: 'FGM-PR-6', fgId: 'FG-CPE-800', on: '2026-09-03', kind: 'production', qty: 14, sourceRef: 'JOB-4479', actor: DESPATCHER },
  { id: 'FGM-PR-7', fgId: 'FG-EQF-1200', on: '2026-09-05', kind: 'production', qty: 15, sourceRef: 'JOB-4473', actor: DESPATCHER },
]

/** The one return already back on the shelf, through the inbound gate. */
export const fgReturns: FgMovement[] = [
  { id: 'FGM-RT-1', fgId: 'FG-JB-IP65', on: '2026-09-01', kind: 'return_in', qty: 2, sourceRef: 'RMA-013', note: 'wrong variant, back through GRN-1186', actor: DESPATCHER },
]

/* ------------------------------------------------------------ despatch notes */

/**
 * Ten notes. Two are short against the order — the thing a despatch table makes
 * visible and a phone call does not — and the rest went in full.
 */
export const despatchNotes: DespatchNote[] = [
  { id: 'DN-1036', dnNo: 'DN-1036', soNo: 'SO-2261', customerId: 'CU-SAHYADRI', despatchedOn: '2026-08-18',
    lines: [{ fgId: 'FG-JB-IP65', qty: 150 }], weightKg: 468, authorisedBy: SALES, actor: DESPATCHER },
  { id: 'DN-1037', dnNo: 'DN-1037', soNo: 'SO-2265', customerId: 'CU-DECCAN', despatchedOn: '2026-08-21',
    lines: [{ fgId: 'FG-EQF-1200', qty: 60 }], weightKg: 1740, authorisedBy: SALES, actor: DESPATCHER },
  { id: 'DN-1038', dnNo: 'DN-1038', soNo: 'SO-2268', customerId: 'CU-VIDARBHA', despatchedOn: '2026-08-22',
    lines: [{ fgId: 'FG-JB-IP65', qty: 80 }], weightKg: 250, authorisedBy: SALES, actor: DESPATCHER },
  { id: 'DN-1039', dnNo: 'DN-1039', soNo: 'SO-2271', customerId: 'CU-KGN', despatchedOn: '2026-08-25',
    lines: [{ fgId: 'FG-CPE-800', qty: 8 }], weightKg: 512, authorisedBy: SALES, actor: DESPATCHER },
  { id: 'DN-1040', dnNo: 'DN-1040', soNo: 'SO-2274', customerId: 'CU-BHARAT', despatchedOn: '2026-08-28',
    lines: [{ fgId: 'FG-GFS-STD', qty: 6 }], weightKg: 930, authorisedBy: SALES, actor: DESPATCHER },
  { id: 'DN-1041', dnNo: 'DN-1041', soNo: 'SO-2276', customerId: 'CU-BHARAT', despatchedOn: '2026-09-02',
    lines: [{ fgId: 'FG-JB-IP65', qty: 120 }], weightKg: 374, authorisedBy: SALES, actor: DESPATCHER },
  { id: 'DN-1042', dnNo: 'DN-1042', soNo: 'SO-2281', customerId: 'CU-VIDARBHA', despatchedOn: '2026-09-01',
    lines: [{ fgId: 'FG-JB-IP65', qty: 60 }], weightKg: 187, authorisedBy: SALES, actor: DESPATCHER },
  { id: 'DN-1043', dnNo: 'DN-1043', soNo: 'SO-2288', customerId: 'CU-DECCAN', despatchedOn: '2026-09-04',
    lines: [{ fgId: 'FG-EQF-1200', qty: 25 }], weightKg: 725, authorisedBy: SALES, actor: DESPATCHER,
    note: 'part shipment — 15 frames still to build' },
  { id: 'DN-1044', dnNo: 'DN-1044', soNo: 'SO-2296', customerId: 'CU-KGN', despatchedOn: '2026-09-05',
    lines: [{ fgId: 'FG-CPE-800', qty: 6 }], weightKg: 384, authorisedBy: SALES, actor: DESPATCHER },
  { id: 'DN-1045', dnNo: 'DN-1045', soNo: 'SO-2291', customerId: 'CU-BHARAT', despatchedOn: '2026-09-06',
    lines: [{ fgId: 'FG-CPE-800', qty: 18 }], weightKg: 1152, authorisedBy: SALES, actor: DESPATCHER,
    note: 'part shipment — the balance 22 wait on CRCA sheet' },
]

/* ------------------------------------------------------------- consignments */

/**
 * Eight delivered, two still out. Two of the eight arrived after the date the
 * customer was given, which is the whole reason this record exists: without a
 * delivered date, late and on time are the same event.
 */
export const consignments: Consignment[] = [
  { id: 'CN-1036', dnNo: 'DN-1036', carrierId: 'CR-GATI', lrNo: 'GTI-884120', promisedDate: '2026-08-20',
    deliveredOn: '2026-08-20', freight: 3640, confirmedBy: 'Signed POD, Sahyadri stores' },
  { id: 'CN-1037', dnNo: 'DN-1037', carrierId: 'CR-VRL', lrNo: 'VRL-551902', promisedDate: '2026-08-24',
    deliveredOn: '2026-08-23', freight: 3800, confirmedBy: 'Signed POD, Deccan gate' },
  { id: 'CN-1038', dnNo: 'DN-1038', carrierId: 'CR-TCI', lrNo: 'TCI-330451', promisedDate: '2026-08-26',
    deliveredOn: '2026-08-29', freight: 6940, confirmedBy: 'Carrier delivery sheet' },
  { id: 'CN-1039', dnNo: 'DN-1039', carrierId: 'CR-VRL', lrNo: 'VRL-552884', promisedDate: '2026-08-28',
    deliveredOn: '2026-08-28', freight: 14280, confirmedBy: 'Signed POD, KGN Vatva' },
  { id: 'CN-1040', dnNo: 'DN-1040', carrierId: 'CR-OWN', lrNo: 'MH12-KP-4471', promisedDate: '2026-08-31',
    deliveredOn: '2026-08-31', freight: 990, confirmedBy: 'Driver returned the signed copy' },
  { id: 'CN-1041', dnNo: 'DN-1041', carrierId: 'CR-VRL', lrNo: 'VRL-554013', promisedDate: '2026-09-05',
    deliveredOn: '2026-09-04', freight: 1180, confirmedBy: 'Signed POD, Bharat Chakan' },
  { id: 'CN-1042', dnNo: 'DN-1042', carrierId: 'CR-TCI', lrNo: 'TCI-331778', promisedDate: '2026-09-03',
    deliveredOn: '2026-09-06', freight: 5190, confirmedBy: 'Carrier delivery sheet' },
  { id: 'CN-1043', dnNo: 'DN-1043', carrierId: 'CR-GATI', lrNo: 'GTI-889006', promisedDate: '2026-09-09',
    deliveredOn: '2026-09-07', freight: 1920, confirmedBy: 'Signed POD, Deccan gate' },
  { id: 'CN-1044', dnNo: 'DN-1044', carrierId: 'CR-VRL', lrNo: 'VRL-556201', promisedDate: '2026-09-11',
    freight: 10700 },
  { id: 'CN-1045', dnNo: 'DN-1045', carrierId: 'CR-OWN', lrNo: 'MH12-KP-4471', promisedDate: '2026-09-14',
    freight: 1230 },
]

/* ------------------------------------------------------------------ returns */

/**
 * Two authorisations. One is closed — the goods came back through the INB-01
 * gate and are on the shelf again. The other is open and past the date the
 * customer was given, which is the state a phone call cannot hold.
 */
export const rmas: Rma[] = [
  { id: 'RMA-013', rmaNo: 'RMA-013', soNo: 'SO-2268', dnNo: 'DN-1038', customerId: 'CU-VIDARBHA',
    fgId: 'FG-JB-IP65', qty: 2, reason: 'Wrong variant shipped — IP65 plain against IP65 glanded',
    raisedOn: '2026-08-30', dueBy: '2026-09-06', owner: SALES, state: 'closed',
    receivedOn: '2026-09-01', grnRef: 'GRN-1186' },
  { id: 'RMA-014', rmaNo: 'RMA-014', soNo: 'SO-2276', dnNo: 'DN-1041', customerId: 'CU-BHARAT',
    fgId: 'FG-JB-IP65', qty: 3, reason: 'Enclosures dented in transit',
    raisedOn: '2026-09-05', dueBy: '2026-09-06', owner: SALES, state: 'authorised' },
]
