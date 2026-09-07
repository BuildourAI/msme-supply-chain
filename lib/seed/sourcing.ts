/**
 * §9.1 seed — industrial heaters & control panels. today = 2026-09-02.
 * Verbatim from CONTEXT.md. RAW FACTS ONLY: no reorder point, no true position,
 * no landed cost, no status. Everything derived lives in calc.ts / derive.ts.
 */
import type {
  Item, JobworkOut, Offcut, PurchaseOrderLine, Receipt, StockLot, Vendor, VendorItem,
} from '@/lib/domain/types'

/** §9.1 fixes the run date. The seed only reconciles against it. */
export const TODAY_SOURCING = '2026-09-02'

export const items: Item[] = [
  {
    id: 'EL-TUB-INC85', code: 'EL-TUB-INC85', name: 'Incoloy 800 sheathed element tube Ø8.5', uom: 'm', itemClass: 'A',
    coverageCeilingMonths: 2.0, moq: 500, safetyStock: 242,
    avgDailyConsumption: 42, floorConsumptionPerDay: 42,
    lastPurchaseRate: 212, feeds: ['Immersion heater 6 kW'],
  },
  {
    id: 'RM-CRC-120', code: 'RM-CRC-120', name: 'CRCA sheet 1.2 mm × 1250', uom: 'MT', itemClass: 'A',
    coverageCeilingMonths: 2.0, moq: 0.5, safetyStock: 0.83,
    avgDailyConsumption: 0.11, floorConsumptionPerDay: 0.11,
    lastPurchaseRate: 61400, feeds: ['Control panel enclosure 600×800'],
  },
  {
    id: 'RM-MGO-EG', code: 'RM-MGO-EG', name: 'MgO powder, electrical grade', uom: 'kg', itemClass: 'A',
    coverageCeilingMonths: 2.0, moq: 200, safetyStock: 168,
    avgDailyConsumption: 26, floorConsumptionPerDay: 26,
    lastPurchaseRate: 142, feeds: ['All sheathed elements'],
  },
  {
    id: 'RM-NCR-8020', code: 'RM-NCR-8020', name: 'Nichrome 80/20 wire Ø0.5', uom: 'kg', itemClass: 'A',
    coverageCeilingMonths: 2.0, moq: 50, safetyStock: 29,
    avgDailyConsumption: 4.1, floorConsumptionPerDay: 4.1,
    lastPurchaseRate: 1198, feeds: ['Cartridge & tubular heaters'],
  },
  {
    id: 'HW-GLD-M20', code: 'HW-GLD-M20', name: 'Cable gland M20, brass', uom: 'nos', itemClass: 'B',
    coverageCeilingMonths: 2.0, moq: 1000, safetyStock: 526,
    avgDailyConsumption: 78, floorConsumptionPerDay: 78,
    lastPurchaseRate: 35.8, feeds: ['Control panel enclosure 600×800'],
  },
  {
    id: 'CM-TRB-2W', code: 'CM-TRB-2W', name: 'Ceramic terminal block 2-way 30 A', uom: 'nos', itemClass: 'B',
    coverageCeilingMonths: 2.0, moq: 5000, safetyStock: 280,
    avgDailyConsumption: 62, floorConsumptionPerDay: 62,
    lastPurchaseRate: 19.8, feeds: ['Immersion heater 6 kW'],
  },
  {
    id: 'SN-RTD-6150', code: 'SN-RTD-6150', name: 'PT100 RTD sensor 6 × 150', uom: 'nos', itemClass: 'B',
    coverageCeilingMonths: 2.0, moq: 100, safetyStock: 74,
    avgDailyConsumption: 11, floorConsumptionPerDay: 11,
    lastPurchaseRate: 412, feeds: ['Panel temp controller'],
  },
  {
    id: 'RM-FLG-304-2', code: 'RM-FLG-304-2', name: 'SS 304 flange 2" ANSI 150#', uom: 'nos', itemClass: 'A',
    coverageCeilingMonths: 2.0, moq: 100, safetyStock: 126,
    avgDailyConsumption: 9, floorConsumptionPerDay: 9,
    lastPurchaseRate: 486, feeds: ['Immersion heater 6 kW'],
  },
  {
    id: 'IN-MWL-050', code: 'IN-MWL-050', name: 'Mineral wool insulation 50 mm', uom: 'm2', itemClass: 'C',
    coverageCeilingMonths: 2.0, moq: 250, safetyStock: 234,
    avgDailyConsumption: 26, floorConsumptionPerDay: 26,
    lastPurchaseRate: 164, feeds: ['Oven & duct heaters'],
  },
]

export const vendors: Vendor[] = [
  { id: 'V-NIRMALALLOYTUB', name: 'Nirmal Alloy Tubes', paymentTermsDays: 30 },
  { id: 'V-SANGHVISPECIAL', name: 'Sanghvi Special Metals', paymentTermsDays: 30 },
  { id: 'V-DECCANTUBEALLO', name: 'Deccan Tube & Alloy', paymentTermsDays: 30 },
  { id: 'V-MAHALAXMISTEEL', name: 'Mahalaxmi Steel', paymentTermsDays: 30 },
  { id: 'V-KRISHNAMETALS', name: 'Krishna Metals', paymentTermsDays: 30 },
  { id: 'V-GUJARATSHEETCO', name: 'Gujarat Sheet Co.', paymentTermsDays: 30 },
  { id: 'V-NIRMALMINERALS', name: 'Nirmal Minerals', paymentTermsDays: 30 },
  { id: 'V-BHARATREFRACTO', name: 'Bharat Refractories', paymentTermsDays: 30 },
  { id: 'V-DECCANCERAMICS', name: 'Deccan Ceramics', paymentTermsDays: 30 },
  { id: 'V-BHARATNICHROME', name: 'Bharat Nichrome Ind.', paymentTermsDays: 30 },
  { id: 'V-SANGHVIALLOYS', name: 'Sanghvi Alloys', paymentTermsDays: 30 },
  { id: 'V-PRECISIONWIREC', name: 'Precision Wire Co.', paymentTermsDays: 30 },
  { id: 'V-KRISHNAELECTRI', name: 'Krishna Electricals', paymentTermsDays: 30 },
  { id: 'V-GUJARATHARDWAR', name: 'Gujarat Hardware', paymentTermsDays: 30 },
  { id: 'V-NIRMALTRADERS', name: 'Nirmal Traders', paymentTermsDays: 30 },
  { id: 'V-KRISHNACERAMIC', name: 'Krishna Ceramics', paymentTermsDays: 30 },
  { id: 'V-DECCANINSULATO', name: 'Deccan Insulators', paymentTermsDays: 30 },
  { id: 'V-BHARATCERAMICW', name: 'Bharat Ceramic Works', paymentTermsDays: 30 },
  { id: 'V-PRECISIONSENSO', name: 'Precision Sensors', paymentTermsDays: 30 },
  { id: 'V-KRISHNAINSTRUM', name: 'Krishna Instruments', paymentTermsDays: 30 },
  { id: 'V-DECCANCONTROLS', name: 'Deccan Controls', paymentTermsDays: 30 },
  { id: 'V-SANGHVIFORGING', name: 'Sanghvi Forgings', paymentTermsDays: 30 },
  { id: 'V-GUJARATFLANGEW', name: 'Gujarat Flange Works', paymentTermsDays: 30 },
  { id: 'V-NIRMALFORGE', name: 'Nirmal Forge', paymentTermsDays: 30 },
  { id: 'V-BHARATINSULATI', name: 'Bharat Insulations', paymentTermsDays: 30 },
  { id: 'V-KRISHNATHERMAL', name: 'Krishna Thermal', paymentTermsDays: 30 },
  { id: 'V-DECCANINSULATI', name: 'Deccan Insulations', paymentTermsDays: 30 },
]

/** Landed cost is DERIVED from these five components, never stored (§7). */
export const vendorItems: VendorItem[] = [
  {
    vendorId: 'V-NIRMALALLOYTUB', itemId: 'EL-TUB-INC85',
    rate: 212, freightPerUnit: 6, nonCreditableGst: 0,
    paymentTermCost: 2.6, rejectionAllowance: 3.8,
    quotedLeadTimeDays: 9, trailingLeadTimeDays: 9, trailingRejectionRate: 1.8,
    onTimePct: 94, score: 91, isPreferred: true,
    quoteValidUntil: '2026-11-30',
  },
  {
    vendorId: 'V-SANGHVISPECIAL', itemId: 'EL-TUB-INC85',
    rate: 206, freightPerUnit: 11, nonCreditableGst: 2.1,
    paymentTermCost: 5.2, rejectionAllowance: 8.4,
    quotedLeadTimeDays: 12, trailingLeadTimeDays: 12, trailingRejectionRate: 4.1,
    onTimePct: 81, score: 76,
    quoteValidUntil: '2026-11-30',
  },
  {
    vendorId: 'V-DECCANTUBEALLO', itemId: 'EL-TUB-INC85',
    rate: 219, freightPerUnit: 4, nonCreditableGst: 0,
    paymentTermCost: 1.1, rejectionAllowance: 2,
    quotedLeadTimeDays: 10, trailingLeadTimeDays: 10, trailingRejectionRate: 0.9,
    onTimePct: 92, score: 88,
    quoteValidUntil: '2026-11-30',
  },
  {
    vendorId: 'V-MAHALAXMISTEEL', itemId: 'RM-CRC-120',
    rate: 61400, freightPerUnit: 1850, nonCreditableGst: 0,
    paymentTermCost: 720, rejectionAllowance: 980,
    quotedLeadTimeDays: 7, trailingLeadTimeDays: 7, trailingRejectionRate: 1.5,
    onTimePct: 94, score: 92, isPreferred: true,
    quoteValidUntil: '2026-11-30',
  },
  {
    vendorId: 'V-KRISHNAMETALS', itemId: 'RM-CRC-120',
    rate: 60200, freightPerUnit: 2400, nonCreditableGst: 640,
    paymentTermCost: 1540, rejectionAllowance: 2300,
    quotedLeadTimeDays: 9, trailingLeadTimeDays: 9, trailingRejectionRate: 3.8,
    onTimePct: 79, score: 74,
    quoteValidUntil: '2026-11-30',
  },
  {
    vendorId: 'V-GUJARATSHEETCO', itemId: 'RM-CRC-120',
    rate: 62800, freightPerUnit: 1200, nonCreditableGst: 0,
    paymentTermCost: 380, rejectionAllowance: 610,
    quotedLeadTimeDays: 8, trailingLeadTimeDays: 8, trailingRejectionRate: 1,
    onTimePct: 93, score: 90,
    quoteValidUntil: '2026-11-30',
  },
  {
    vendorId: 'V-NIRMALMINERALS', itemId: 'RM-MGO-EG',
    rate: 142, freightPerUnit: 5, nonCreditableGst: 0,
    paymentTermCost: 1.8, rejectionAllowance: 2.4,
    quotedLeadTimeDays: 12, trailingLeadTimeDays: 12, trailingRejectionRate: 1.6,
    onTimePct: 91, score: 89, isPreferred: true,
    quoteValidUntil: '2026-11-30',
  },
  {
    vendorId: 'V-BHARATREFRACTO', itemId: 'RM-MGO-EG',
    rate: 148, freightPerUnit: 3, nonCreditableGst: 0,
    paymentTermCost: 1.2, rejectionAllowance: 1.6,
    quotedLeadTimeDays: 10, trailingLeadTimeDays: 10, trailingRejectionRate: 1.1,
    onTimePct: 96, score: 93,
    quoteValidUntil: '2026-11-30',
  },
  {
    vendorId: 'V-DECCANCERAMICS', itemId: 'RM-MGO-EG',
    rate: 139, freightPerUnit: 9, nonCreditableGst: 1.4,
    paymentTermCost: 3.1, rejectionAllowance: 5.2,
    quotedLeadTimeDays: 15, trailingLeadTimeDays: 15, trailingRejectionRate: 3.7,
    onTimePct: 74, score: 71,
    quoteValidUntil: '2026-11-30',
  },
  {
    vendorId: 'V-BHARATNICHROME', itemId: 'RM-NCR-8020',
    rate: 1198, freightPerUnit: 22, nonCreditableGst: 0,
    paymentTermCost: 14, rejectionAllowance: 18,
    quotedLeadTimeDays: 11, trailingLeadTimeDays: 11, trailingRejectionRate: 1.4,
    onTimePct: 96, score: 94, isPreferred: true,
    quoteValidUntil: '2026-11-30',
  },
  {
    vendorId: 'V-SANGHVIALLOYS', itemId: 'RM-NCR-8020',
    rate: 1240, freightPerUnit: 15, nonCreditableGst: 0,
    paymentTermCost: 9, rejectionAllowance: 12,
    quotedLeadTimeDays: 10, trailingLeadTimeDays: 10, trailingRejectionRate: 1,
    onTimePct: 92, score: 90,
    quoteValidUntil: '2026-11-30',
  },
  {
    vendorId: 'V-PRECISIONWIREC', itemId: 'RM-NCR-8020',
    rate: 1215, freightPerUnit: 38, nonCreditableGst: 26,
    paymentTermCost: 31, rejectionAllowance: 62,
    quotedLeadTimeDays: 16, trailingLeadTimeDays: 16, trailingRejectionRate: 5.1,
    onTimePct: 71, score: 68,
    quoteValidUntil: '2026-11-30',
  },
  {
    vendorId: 'V-KRISHNAELECTRI', itemId: 'HW-GLD-M20',
    rate: 35.8, freightPerUnit: 0.9, nonCreditableGst: 0,
    paymentTermCost: 0.4, rejectionAllowance: 0.5,
    quotedLeadTimeDays: 8, trailingLeadTimeDays: 8, trailingRejectionRate: 1.3,
    onTimePct: 93, score: 91, isPreferred: true,
    quoteValidUntil: '2026-11-30',
  },
  {
    vendorId: 'V-GUJARATHARDWAR', itemId: 'HW-GLD-M20',
    rate: 36.5, freightPerUnit: 1.4, nonCreditableGst: 0,
    paymentTermCost: 0.7, rejectionAllowance: 1.1,
    quotedLeadTimeDays: 7, trailingLeadTimeDays: 7, trailingRejectionRate: 2.9,
    onTimePct: 87, score: 84,
    quoteValidUntil: '2026-11-30',
  },
  {
    vendorId: 'V-NIRMALTRADERS', itemId: 'HW-GLD-M20',
    rate: 38.2, freightPerUnit: 0.6, nonCreditableGst: 0,
    paymentTermCost: 0.3, rejectionAllowance: 0.3,
    quotedLeadTimeDays: 6, trailingLeadTimeDays: 6, trailingRejectionRate: 0.8,
    onTimePct: 95, score: 93,
    quoteValidUntil: '2026-11-30',
  },
  {
    vendorId: 'V-KRISHNACERAMIC', itemId: 'CM-TRB-2W',
    rate: 19.8, freightPerUnit: 0.6, nonCreditableGst: 0,
    paymentTermCost: 0.3, rejectionAllowance: 0.4,
    quotedLeadTimeDays: 10, trailingLeadTimeDays: 10, trailingRejectionRate: 1.7,
    onTimePct: 90, score: 87, isPreferred: true,
    quoteValidUntil: '2026-11-30',
  },
  {
    vendorId: 'V-DECCANINSULATO', itemId: 'CM-TRB-2W',
    rate: 21.2, freightPerUnit: 0.4, nonCreditableGst: 0,
    paymentTermCost: 0.2, rejectionAllowance: 0.3,
    quotedLeadTimeDays: 9, trailingLeadTimeDays: 9, trailingRejectionRate: 1.2,
    onTimePct: 93, score: 90,
    quoteValidUntil: '2026-11-30',
  },
  {
    vendorId: 'V-BHARATCERAMICW', itemId: 'CM-TRB-2W',
    rate: 20.4, freightPerUnit: 1.2, nonCreditableGst: 0,
    paymentTermCost: 0.6, rejectionAllowance: 1,
    quotedLeadTimeDays: 13, trailingLeadTimeDays: 13, trailingRejectionRate: 4.4,
    onTimePct: 76, score: 72,
    quoteValidUntil: '2026-11-30',
  },
  {
    vendorId: 'V-PRECISIONSENSO', itemId: 'SN-RTD-6150',
    rate: 412, freightPerUnit: 4, nonCreditableGst: 0,
    paymentTermCost: 2.1, rejectionAllowance: 3.7,
    quotedLeadTimeDays: 6, trailingLeadTimeDays: 6, trailingRejectionRate: 0.9,
    onTimePct: 95, score: 93, isPreferred: true,
    quoteValidUntil: '2026-11-30',
  },
  {
    vendorId: 'V-KRISHNAINSTRUM', itemId: 'SN-RTD-6150',
    rate: 404, freightPerUnit: 7, nonCreditableGst: 0,
    paymentTermCost: 3.4, rejectionAllowance: 8.9,
    quotedLeadTimeDays: 8, trailingLeadTimeDays: 8, trailingRejectionRate: 2.2,
    onTimePct: 89, score: 86,
    quoteValidUntil: '2026-11-30',
  },
  {
    vendorId: 'V-DECCANCONTROLS', itemId: 'SN-RTD-6150',
    rate: 428, freightPerUnit: 5, nonCreditableGst: 0,
    paymentTermCost: 2.6, rejectionAllowance: 12,
    quotedLeadTimeDays: 7, trailingLeadTimeDays: 7, trailingRejectionRate: 2.8,
    onTimePct: 84, score: 81,
    quoteValidUntil: '2026-11-30',
  },
  {
    vendorId: 'V-SANGHVIFORGING', itemId: 'RM-FLG-304-2',
    rate: 486, freightPerUnit: 9, nonCreditableGst: 0,
    paymentTermCost: 4.2, rejectionAllowance: 5.3,
    quotedLeadTimeDays: 14, trailingLeadTimeDays: 14, trailingRejectionRate: 1.1,
    onTimePct: 92, score: 90, isPreferred: true,
    quoteValidUntil: '2026-11-30',
  },
  {
    vendorId: 'V-GUJARATFLANGEW', itemId: 'RM-FLG-304-2',
    rate: 472, freightPerUnit: 16, nonCreditableGst: 0,
    paymentTermCost: 7.8, rejectionAllowance: 14.2,
    quotedLeadTimeDays: 18, trailingLeadTimeDays: 18, trailingRejectionRate: 3,
    onTimePct: 86, score: 83,
    quoteValidUntil: '2026-11-30',
  },
  {
    vendorId: 'V-NIRMALFORGE', itemId: 'RM-FLG-304-2',
    rate: 494, freightPerUnit: 7, nonCreditableGst: 0,
    paymentTermCost: 3.1, rejectionAllowance: 7.4,
    quotedLeadTimeDays: 12, trailingLeadTimeDays: 12, trailingRejectionRate: 1.5,
    onTimePct: 91, score: 88,
    quoteValidUntil: '2026-11-30',
  },
  {
    vendorId: 'V-BHARATINSULATI', itemId: 'IN-MWL-050',
    rate: 164, freightPerUnit: 3, nonCreditableGst: 0,
    paymentTermCost: 1.4, rejectionAllowance: 2,
    quotedLeadTimeDays: 9, trailingLeadTimeDays: 9, trailingRejectionRate: 1.2,
    onTimePct: 92, score: 89, isPreferred: true,
    quoteValidUntil: '2026-11-30',
  },
  {
    vendorId: 'V-KRISHNATHERMAL', itemId: 'IN-MWL-050',
    rate: 159, freightPerUnit: 6, nonCreditableGst: 0,
    paymentTermCost: 2.7, rejectionAllowance: 3.3,
    quotedLeadTimeDays: 11, trailingLeadTimeDays: 11, trailingRejectionRate: 2.1,
    onTimePct: 88, score: 85,
    quoteValidUntil: '2026-11-30',
  },
  {
    vendorId: 'V-DECCANINSULATI', itemId: 'IN-MWL-050',
    rate: 171, freightPerUnit: 2, nonCreditableGst: 0,
    paymentTermCost: 1, rejectionAllowance: 2.7,
    quotedLeadTimeDays: 10, trailingLeadTimeDays: 10, trailingRejectionRate: 1.6,
    onTimePct: 90, score: 87,
    quoteValidUntil: '2026-11-30',
  },
]

export const stockLots: StockLot[] = [
  { id: 'L-001', itemId: 'EL-TUB-INC85', batchNo: 'B-NC85-01', qty: 340, usability: 'usable' },
  { id: 'L-002', itemId: 'EL-TUB-INC85', batchNo: 'B-NC85-02', qty: 26, usability: 'qc_hold', usabilityReason: 'Ovality out of tolerance' },
  { id: 'L-003', itemId: 'RM-CRC-120', batchNo: 'B--120-01', qty: 0.9, usability: 'usable' },
  { id: 'L-004', itemId: 'RM-CRC-120', batchNo: 'B--120-02', qty: 0.12, usability: 'qc_hold', usabilityReason: 'Surface rust rejected at GRN' },
  { id: 'L-005', itemId: 'RM-MGO-EG', batchNo: 'B-O-EG-01', qty: 210, usability: 'usable' },
  { id: 'L-006', itemId: 'RM-MGO-EG', batchNo: 'B-O-EG-02', qty: 45, usability: 'qc_hold', usabilityReason: 'Moisture ingress — needs re-drying' },
  { id: 'L-007', itemId: 'RM-NCR-8020', batchNo: 'B-8020-01', qty: 38, usability: 'usable' },
  { id: 'L-008', itemId: 'RM-NCR-8020', batchNo: 'B-8020-02', qty: 3.2, usability: 'damaged', usabilityReason: 'Drawn off-gauge' },
  { id: 'L-009', itemId: 'HW-GLD-M20', batchNo: 'B--M20-01', qty: 620, usability: 'usable' },
  { id: 'L-010', itemId: 'HW-GLD-M20', batchNo: 'B--M20-02', qty: 40, usability: 'damaged', usabilityReason: 'Thread damage' },
  { id: 'L-011', itemId: 'CM-TRB-2W', batchNo: 'B-B-2W-01', qty: 410, usability: 'usable' },
  { id: 'L-012', itemId: 'CM-TRB-2W', batchNo: 'B-B-2W-02', qty: 18, usability: 'damaged', usabilityReason: 'Chipped in handling' },
  { id: 'L-013', itemId: 'SN-RTD-6150', batchNo: 'B-6150-01', qty: 320, usability: 'usable' },
  { id: 'L-014', itemId: 'SN-RTD-6150', batchNo: 'B-6150-02', qty: 6, usability: 'qc_hold', usabilityReason: 'Calibration drift' },
  { id: 'L-015', itemId: 'RM-FLG-304-2', batchNo: 'B-04-2-01', qty: 96, usability: 'usable' },
  { id: 'L-016', itemId: 'RM-FLG-304-2', batchNo: 'B-04-2-02', qty: 4, usability: 'damaged', usabilityReason: 'Bore undersize' },
  { id: 'L-017', itemId: 'IN-MWL-050', batchNo: 'B--050-01', qty: 690, usability: 'usable' },
]

/** §9.1 — PO-2611 MgO 400 kg due 19 Sep · PO-2648 SS flange 300 nos due 08 Sep.
 *  In transit: CRCA 1.50 MT ETA 05 Sep · cable gland 1,000 nos ETA 06 Sep. */
export const poLines: PurchaseOrderLine[] = [
  { id: 'POL-1', poNo: 'PO-2611', itemId: 'RM-MGO-EG', qty: 400, promisedDate: '2026-09-19', status: 'open' },
  { id: 'POL-2', poNo: 'PO-2648', itemId: 'RM-FLG-304-2', qty: 300, promisedDate: '2026-09-08', status: 'open' },
  { id: 'POL-3', poNo: 'PO-2637', itemId: 'RM-CRC-120', qty: 1.5, promisedDate: '2026-09-05', status: 'in_transit' },
  { id: 'POL-4', poNo: 'PO-2641', itemId: 'HW-GLD-M20', qty: 1000, promisedDate: '2026-09-06', status: 'in_transit' },
]

export const jobworkOut: JobworkOut[] = []

/** §4 — a usable remnant already owned. Checked before buying fresh (§8.4). */
export const offcuts: Offcut[] = [
  { itemId: 'EL-TUB-INC85', qty: 62, specNote: 'Ø8.5 tube, 1.2–1.8 m lengths', location: 'Rack B-4' },
  { itemId: 'RM-CRC-120', qty: 0.14, specNote: 'CRCA 1.2 mm, 400×1250 sheets', location: 'Rack A-1' },
  { itemId: 'RM-FLG-304-2', qty: 11, specNote: 'SS 304 blanks, undrilled', location: 'Rack C-2' },
]

/**
 * §5 — "Lead time is the trailing average of the last six actual receipts, never
 * the vendor's quoted figure. This is non-negotiable." So lead time is nowhere
 * stored as a scalar: it is derived from these receipts.
 *
 * The six spans for a vendor quoting L days are [L−1, L+1, L, L−2, L+2, L],
 * which sum to exactly 6L — so the trailing mean is L by construction, not by
 * luck, and the reorder points still reconcile with the Lead column in §9.1.
 * Receipts are spaced roughly monthly back from the run date.
 */
const SPANS = (lead: number) => [lead - 1, lead + 1, lead, lead - 2, lead + 2, lead]

const shiftDays = (iso: string, n: number): string => {
  const d = new Date(`${iso}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}

export const receipts: Receipt[] = vendorItems.flatMap((vi) =>
  SPANS(vi.quotedLeadTimeDays).map((span, i) => {
    const orderedOn = shiftDays(TODAY_SOURCING, -((6 - i) * 27 + span + 4))
    return {
      id: `RC-${vi.itemId}-${vi.vendorId}-${i + 1}`,
      vendorId: vi.vendorId,
      itemId: vi.itemId,
      orderedOn,
      receivedOn: shiftDays(orderedOn, span),
    }
  }),
)
