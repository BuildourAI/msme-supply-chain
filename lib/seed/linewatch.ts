/**
 * §9.2 seed — sheet-metal fabricator. today = Mon 2026-09-07.
 *
 * §9.2 quotes two totals but no unit rates. One consistent, realistic rate set
 * reproduces both exactly, and the test asserts them:
 *   ₹36,516 unusable across 5 materials · ₹7.60 L cash needed for reorders
 */
import type { JobworkOut, ProductionJob, SalesOrder } from '@/lib/domain/types'

export const TODAY_LINEWATCH = '2026-09-07'

export interface LineMaterial {
  id: string
  name: string
  uom: string
  batchNo: string
  usable: number
  qcHold: number
  damaged: number
  expired: number
  /** Neither on the shelf nor consumed — must never be double-counted (§4). */
  withJobworker: number
  jobworkerName?: string
  onOrder: number
  /** Inbound quantity reserved for a named job — not free stock (§4). */
  earmarkedFor?: string
  /** What the shop actually draws on a working day (§4). */
  floorPerDay: number
  leadTimeDays: number
  reorderQty: number
  freight: number
  /** ₹ per uom — last purchase price, the single valuation basis (§13-1). */
  rate: number
  offcutQty: number
  scrapPct: number
  scrapTargetPct: number
  feeds: string[]
  /**
   * §8.5 requires a supplier dropdown on every card. §13-2: Line Watch defaults
   * to the preferred supplier while the buyer's desk defaults to lowest landed
   * cost — a stated, configurable policy rather than an accident of two codebases.
   * The preferred supplier's rate is the material's `rate`, so the seeded totals
   * hold on first load.
   */
  suppliers: { name: string; rate: number; leadTimeDays: number; preferred?: boolean }[]
}

export const materials: LineMaterial[] = [
  { id: 'HW-HNG-180', name: 'Concealed hinge 180° SS', uom: 'nos', batchNo: 'HG-0824',
    usable: 340, qcHold: 0, damaged: 26, expired: 0, withJobworker: 0, onOrder: 0,
    floorPerDay: 96, leadTimeDays: 9, reorderQty: 2000, freight: 1100, rate: 95,
    offcutQty: 0, scrapPct: 1.2, scrapTargetPct: 1.5,
    feeds: ['Control panel enclosure 800×600'],
    suppliers: [
      { name: 'Krishna Hardware', rate: 95, leadTimeDays: 9, preferred: true },
      { name: 'Gujarat Fittings', rate: 92, leadTimeDays: 13 },
      { name: 'Nirmal Hinges', rate: 101, leadTimeDays: 7 },
    ] },

  { id: 'SM-CRCA-16', name: 'CRCA sheet 1.6 × 1250 × 2500', uom: 'kg', batchNo: 'HEAT-2216/A',
    usable: 1240, qcHold: 180, damaged: 95, expired: 0,
    withJobworker: 420, jobworkerName: 'Shree Laser', onOrder: 2000, earmarkedFor: 'JOB-4471',
    floorPerDay: 310, leadTimeDays: 7, reorderQty: 3000, freight: 4200, rate: 62,
    offcutQty: 168, scrapPct: 6.8, scrapTargetPct: 5.0,
    feeds: ['Control panel enclosure 800×600', 'Junction box IP65'],
    suppliers: [
      { name: 'Mahalaxmi Steel', rate: 62, leadTimeDays: 7, preferred: true },
      { name: 'Krishna Metals', rate: 59, leadTimeDays: 11 },
      { name: 'Gujarat Sheet Co.', rate: 64, leadTimeDays: 6 },
    ] },

  { id: 'PT-PC-7035', name: 'Powder coat RAL 7035', uom: 'kg', batchNo: 'PC-2608-B',
    usable: 165, qcHold: 0, damaged: 0, expired: 40, withJobworker: 0,
    onOrder: 250, earmarkedFor: 'JOB-4468',
    floorPerDay: 22, leadTimeDays: 5, reorderQty: 250, freight: 900, rate: 280,
    offcutQty: 0, scrapPct: 11.4, scrapTargetPct: 8.0,
    feeds: ['Control panel enclosure 800×600', 'Junction box IP65', 'Equipment frame 1200'],
    suppliers: [
      { name: 'Deccan Coatings', rate: 280, leadTimeDays: 5, preferred: true },
      { name: 'Bharat Powder', rate: 271, leadTimeDays: 9 },
      { name: 'Krishna Paints', rate: 294, leadTimeDays: 4 },
    ] },

  { id: 'RM-ANG-405', name: 'MS angle 40 × 40 × 5', uom: 'kg', batchNo: 'HEAT-2190/C',
    usable: 2180, qcHold: 0, damaged: 0, expired: 0,
    withJobworker: 380, jobworkerName: 'Perfect Bending Works', onOrder: 0,
    floorPerDay: 260, leadTimeDays: 6, reorderQty: 3000, freight: 3800, rate: 56,
    offcutQty: 240, scrapPct: 3.1, scrapTargetPct: 3.0,
    feeds: ['Equipment frame 1200', 'Panel base frame', 'Galvanised frame set'],
    suppliers: [
      { name: 'Sanghvi Steel', rate: 56, leadTimeDays: 6, preferred: true },
      { name: 'Bharat Rolling', rate: 54, leadTimeDays: 10 },
      { name: 'Nirmal Sections', rate: 59, leadTimeDays: 5 },
    ] },

  { id: 'RM-ZNC-999', name: 'Zinc ingot 99.99%', uom: 'MT', batchNo: 'ZN-2208',
    usable: 0.48, qcHold: 0, damaged: 0, expired: 0,
    withJobworker: 1.10, jobworkerName: 'Anand Galvanising', onOrder: 0,
    floorPerDay: 0.03, leadTimeDays: 15, reorderQty: 0.5, freight: 2400, rate: 267200,
    offcutQty: 0, scrapPct: 4.6, scrapTargetPct: 4.0,
    feeds: ['Galvanised frame set'],
    suppliers: [
      { name: 'Bharat Metals', rate: 267200, leadTimeDays: 15, preferred: true },
      { name: 'Deccan Zinc', rate: 261000, leadTimeDays: 22 },
      { name: 'Krishna Alloys', rate: 274500, leadTimeDays: 11 },
    ] },

  { id: 'SL-GSK-105', name: 'EPDM gasket 10 × 5', uom: 'm', batchNo: 'EP-2231',
    usable: 620, qcHold: 90, damaged: 0, expired: 0, withJobworker: 0, onOrder: 0,
    floorPerDay: 48, leadTimeDays: 6, reorderQty: 1000, freight: 700, rate: 48.4,
    offcutQty: 0, scrapPct: 2.4, scrapTargetPct: 3.0,
    feeds: ['Junction box IP65', 'Control panel enclosure 800×600'],
    suppliers: [
      { name: 'Nirmal Rubber', rate: 48.4, leadTimeDays: 6, preferred: true },
      { name: 'Deccan Polymers', rate: 46.2, leadTimeDays: 10 },
    ] },

  { id: 'SM-SS304-12', name: 'SS 304 sheet 1.2 mm', uom: 'kg', batchNo: 'SS-2204',
    usable: 320, qcHold: 0, damaged: 0, expired: 0, withJobworker: 0, onOrder: 0,
    floorPerDay: 18, leadTimeDays: 12, reorderQty: 400, freight: 1600, rate: 284,
    offcutQty: 46, scrapPct: 4.2, scrapTargetPct: 4.0,
    feeds: ['Food-grade enclosure'],
    suppliers: [
      { name: 'Sanghvi Special Metals', rate: 284, leadTimeDays: 12, preferred: true },
      { name: 'Gujarat Steel', rate: 277, leadTimeDays: 16 },
    ] },

  { id: 'HW-GLD-M20', name: 'Cable gland M20 brass', uom: 'nos', batchNo: 'CG-1142',
    usable: 1850, qcHold: 0, damaged: 40, expired: 0, withJobworker: 0, onOrder: 0,
    floorPerDay: 78, leadTimeDays: 8, reorderQty: 2000, freight: 600, rate: 36,
    offcutQty: 0, scrapPct: 0.9, scrapTargetPct: 1.0,
    feeds: ['Junction box IP65'],
    suppliers: [
      { name: 'Krishna Electricals', rate: 36, leadTimeDays: 8, preferred: true },
      { name: 'Gujarat Hardware', rate: 37.5, leadTimeDays: 6 },
    ] },
]

export const jobwork: JobworkOut[] = [
  { id: 'JW-01', itemId: 'SM-CRCA-16', vendorName: 'Shree Laser', qty: 420, process: 'Laser cutting', sentOn: '2026-09-02', dueBack: '2026-09-08', status: 'out' },
  { id: 'JW-02', itemId: 'RM-ANG-405', vendorName: 'Perfect Bending Works', qty: 380, process: 'Press bending', sentOn: '2026-09-05', dueBack: '2026-09-09', status: 'out' },
  { id: 'JW-03', itemId: 'RM-ZNC-999', vendorName: 'Anand Galvanising', qty: 1.10, process: 'Hot-dip galvanising', sentOn: '2026-08-28', dueBack: '2026-09-04', status: 'out' },
]

export const jobs: ProductionJob[] = [
  { jobNo: 'JOB-4468', product: 'Junction box IP65', qty: 60, startOffset: 0, durationDays: 2, needs: ['SL-GSK-105', 'HW-GLD-M20', 'PT-PC-7035'] },
  { jobNo: 'JOB-4471', product: 'Control panel enclosure 800×600', qty: 40, startOffset: 1, durationDays: 3, needs: ['SM-CRCA-16', 'HW-HNG-180', 'SL-GSK-105', 'PT-PC-7035'] },
  { jobNo: 'JOB-4473', product: 'Equipment frame 1200', qty: 25, startOffset: 2, durationDays: 2, needs: ['RM-ANG-405'] },
  { jobNo: 'JOB-4476', product: 'Junction box IP65', qty: 80, startOffset: 3, durationDays: 2, needs: ['SL-GSK-105', 'HW-GLD-M20'] },
  { jobNo: 'JOB-4479', product: 'Control panel enclosure 800×600', qty: 30, startOffset: 4, durationDays: 2, needs: ['SM-CRCA-16', 'HW-HNG-180'] },
  { jobNo: 'JOB-4482', product: 'Galvanised frame set', qty: 15, startOffset: 4, durationDays: 2, needs: ['RM-ANG-405', 'RM-ZNC-999'] },
]

/** §8.5 — customer orders appear ONLY on at-risk materials. */
export const salesOrders: SalesOrder[] = [
  { soNo: 'SO-2291', customer: 'Bharat Infra Ltd', description: '40 enclosures', value: 3840000, promisedDate: '2026-09-18', atRiskFrom: ['SM-CRCA-16', 'HW-HNG-180'] },
  { soNo: 'SO-2304', customer: 'Deccan Auto Parts', description: '120 frames', value: 1420000, promisedDate: '2026-09-14', atRiskFrom: ['HW-HNG-180'] },
  { soNo: 'SO-2311', customer: 'KGN Structurals', description: '15 galvanised frame sets', value: 980000, promisedDate: '2026-09-22', atRiskFrom: ['RM-ZNC-999'] },
]
