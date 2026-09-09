/**
 * §8.2 SRC-02 — supplier intake. One inbox and one WhatsApp number.
 * 14 documents · 11 auto-filed · 3 in review (§9.1).
 *
 * "The mapping table is the deliverable, not the parser." A vendor writes
 * "TERMINAL BLK CERAMIC 2WAY 30A"; we call it CM-TRB-2W. Accepting a match writes
 * an item_alias so that vendor's spelling resolves automatically from then on.
 */
import type { SupplierDocLine, SupplierDocument } from '@/lib/domain/types'

export const supplierDocuments: SupplierDocument[] = [
  { id: 'DOC-01', vendorName: 'Nirmal Alloy Tubes', kind: 'quote', receivedAt: '2026-09-01', channel: 'email', fileName: 'NAT-Q-4471.pdf', lineCount: 3, status: 'auto' },
  { id: 'DOC-02', vendorName: 'Sanghvi Special Metals', kind: 'quote', receivedAt: '2026-09-01', channel: 'email', fileName: 'SSM_quote_sep.xlsx', lineCount: 2, status: 'auto' },
  { id: 'DOC-03', vendorName: 'Mahalaxmi Steel', kind: 'price_list', receivedAt: '2026-08-31', channel: 'email', fileName: 'CRCA-pricelist-Sep26.pdf', lineCount: 12, status: 'auto' },
  { id: 'DOC-04', vendorName: 'Krishna Ceramics', kind: 'quote', receivedAt: '2026-08-31', channel: 'whatsapp', fileName: 'IMG-20260831-WA0007.jpg', lineCount: 4, status: 'pending' },
  { id: 'DOC-05', vendorName: 'Bharat Nichrome Ind.', kind: 'quote', receivedAt: '2026-08-30', channel: 'email', fileName: 'BNI-QT-2261.pdf', lineCount: 2, status: 'auto' },
  { id: 'DOC-06', vendorName: 'Deccan Ceramics', kind: 'proforma', receivedAt: '2026-08-29', channel: 'email', fileName: 'DC-PI-8890.pdf', lineCount: 1, status: 'auto' },
  { id: 'DOC-07', vendorName: 'Gujarat Sheet Co.', kind: 'quote', receivedAt: '2026-08-29', channel: 'whatsapp', fileName: 'IMG-20260829-WA0012.jpg', lineCount: 3, status: 'pending' },
  { id: 'DOC-08', vendorName: 'Precision Sensors', kind: 'quote', receivedAt: '2026-08-28', channel: 'email', fileName: 'PS-quote-RTD.pdf', lineCount: 2, status: 'auto' },
  { id: 'DOC-09', vendorName: 'Nirmal Minerals', kind: 'price_list', receivedAt: '2026-08-28', channel: 'email', fileName: 'NM-rates-Q3.pdf', lineCount: 6, status: 'auto' },
  { id: 'DOC-10', vendorName: 'Krishna Electricals', kind: 'quote', receivedAt: '2026-08-27', channel: 'email', fileName: 'KE-4412.pdf', lineCount: 5, status: 'auto' },
  { id: 'DOC-11', vendorName: 'Sanghvi Forgings', kind: 'test_cert', receivedAt: '2026-08-27', channel: 'email', fileName: 'SF-MTC-304-2211.pdf', lineCount: 1, status: 'auto' },
  { id: 'DOC-12', vendorName: 'Bharat Insulations', kind: 'quote', receivedAt: '2026-08-26', channel: 'whatsapp', fileName: 'IMG-20260826-WA0003.jpg', lineCount: 2, status: 'pending' },
  { id: 'DOC-13', vendorName: 'Deccan Tube & Alloy', kind: 'quote', receivedAt: '2026-08-26', channel: 'email', fileName: 'DTA-Q-1180.pdf', lineCount: 3, status: 'auto' },
  { id: 'DOC-14', vendorName: 'Gujarat Hardware', kind: 'price_list', receivedAt: '2026-08-25', channel: 'email', fileName: 'GH-list-aug.xlsx', lineCount: 9, status: 'auto' },
]

/** The three lines the parser could not resolve on its own. */
export const reviewQueue: SupplierDocLine[] = [
  {
    id: 'DL-01', documentId: 'DOC-04', vendorName: 'Krishna Ceramics',
    rawItemText: 'TERMINAL BLK CERAMIC 2WAY 30A', rate: 19.8, uom: 'nos',
    suggestedItemId: 'CM-TRB-2W', confidence: 0.86, reviewStatus: 'pending',
  },
  {
    id: 'DL-02', documentId: 'DOC-07', vendorName: 'Gujarat Sheet Co.',
    rawItemText: 'C.R.C.A. SHT 1.2MM 1250W (PRIME)', rate: 62800, uom: 'MT',
    suggestedItemId: 'RM-CRC-120', confidence: 0.79, reviewStatus: 'pending',
  },
  {
    id: 'DL-03', documentId: 'DOC-12', vendorName: 'Bharat Insulations',
    rawItemText: 'ROCKWOOL SLAB 50MM 100KG/M3', rate: 164, uom: 'm²',
    suggestedItemId: 'IN-MWL-050', confidence: 0.64, reviewStatus: 'pending',
  },
]

/**
 * §8.2 — "accepting writes an item_alias so that vendor's spelling resolves
 * automatically from then on." This is the resolver the queue runs before it
 * asks a person: a raw supplier string from a vendor with a confirmed alias
 * never reaches the review queue again. Matching is case- and space-insensitive
 * because supplier text arrives typed by hand.
 */
export function resolveAlias(
  aliases: { itemId: string; vendorName: string; rawText: string }[],
  vendorName: string, rawText: string,
): string | null {
  const norm = (s: string) => s.toLowerCase().replace(/[\s.\-_/]+/g, '')
  const hit = aliases.find((a) => a.vendorName === vendorName && norm(a.rawText) === norm(rawText))
  return hit ? hit.itemId : null
}

/** Already-confirmed mappings — what the queue produces over time. */
export const seededAliases = [
  { itemId: 'EL-TUB-INC85', vendorName: 'Nirmal Alloy Tubes', rawText: 'INCOLOY-800 SHEATH TUBE 8.5MM', confirmedBy: 'A. Nandy · Buyer', confirmedAt: '2026-08-14' },
  { itemId: 'RM-MGO-EG', vendorName: 'Nirmal Minerals', rawText: 'MAGNESIUM OXIDE ELECT GRADE', confirmedBy: 'A. Nandy · Buyer', confirmedAt: '2026-08-09' },
  { itemId: 'HW-GLD-M20', vendorName: 'Krishna Electricals', rawText: 'BRASS CABLE GLAND 20MM', confirmedBy: 'A. Nandy · Buyer', confirmedAt: '2026-07-28' },
]

/* ========================================================================== */
/* What is actually inside each document                                      */
/* ========================================================================== */

/**
 * §8.2 again, one level down. A document in the list is not a filename — it is
 * a page with lines on it, and the whole claim of SRC-02 is that those lines
 * become searchable price history instead of an attachment nobody opens again.
 * So the list opens the document.
 *
 * Two rules hold this data honest:
 *
 *   Rates agree with the vendor master. Where a line maps to an item this
 *   factory buys, its rate is the rate the landed-cost comparison uses for that
 *   supplier. A quote that says one thing and a comparison that says another
 *   would be two demos, not one.
 *
 *   A price list is mostly things you do not buy. Mahalaxmi quotes twelve CRCA
 *   gauges and this factory buys one of them; the other eleven resolve to
 *   nothing and are filed as reference. Pretending every line maps would make
 *   the alias table look easier than it is.
 */

export interface DocLineDetail {
  id: string
  /** the supplier's own wording, exactly as it arrived */
  rawText: string
  qty?: number
  uom: string
  rate: number
  /** what it resolved to in the item master, where it resolved to anything */
  itemId?: string
  confidence?: number
  /**
   * alias    — a confirmed mapping for this vendor's wording; never asked again
   * matched  — the parser was above the floor and filed it
   * review   — below the floor, so it went to a person (the review queue)
   * unmapped — nothing in the item master corresponds; kept as price history
   */
  via: 'alias' | 'matched' | 'review' | 'unmapped'
}

export interface DocMeta {
  /** the supplier's own reference on the page */
  docNo: string
  /** what the page says about terms, in the supplier's words */
  terms: string
  validUntil?: string
  /** for a WhatsApp photograph — what the picture is of */
  photoNote?: string
}

export const docMeta: Record<string, DocMeta> = {
  'DOC-01': { docNo: 'NAT/Q/4471', terms: '30 days from invoice · ex-works Ahmedabad', validUntil: '2026-11-30' },
  'DOC-02': { docNo: 'SSM-Q-2026-0912', terms: '30 days · freight extra at actuals', validUntil: '2026-11-30' },
  'DOC-03': { docNo: 'MS/PL/SEP-26', terms: '30 days · rates per MT ex-mill, subject to revision', validUntil: '2026-09-30' },
  'DOC-04': { docNo: 'KC-441', terms: '30 days', validUntil: '2026-10-31',
    photoNote: 'A photograph of a hand-filled quotation pad, taken on the shop counter and sent to the WhatsApp number.' },
  'DOC-05': { docNo: 'BNI/QT/2261', terms: '30 days · minimum 25 kg per grade', validUntil: '2026-11-30' },
  'DOC-06': { docNo: 'DC/PI/8890', terms: 'Proforma · payment before despatch' },
  'DOC-07': { docNo: 'GSC-Q-1177', terms: '30 days · loading extra', validUntil: '2026-10-15',
    photoNote: 'A photograph of a printed quotation, slightly skewed, with the header partly cut off — which is why one line came back at 79%.' },
  'DOC-08': { docNo: 'PS/Q/RTD/318', terms: '30 days · calibration certificate included', validUntil: '2026-12-31' },
  'DOC-09': { docNo: 'NM-Q3-RATES', terms: '30 days · rates per kg, packed in 25 kg bags', validUntil: '2026-09-30' },
  'DOC-10': { docNo: 'KE-4412', terms: '30 days · box quantities only', validUntil: '2026-11-30' },
  'DOC-11': { docNo: 'SF/MTC/304/2211', terms: 'Mill test certificate — heat no. 2211, EN 10204 3.1' },
  'DOC-12': { docNo: 'BI-Q-0826', terms: '30 days · rates per m²', validUntil: '2026-10-31',
    photoNote: 'A photograph of a quotation written on a letterhead, taken at an angle in poor light — legible, but the material description is abbreviated.' },
  'DOC-13': { docNo: 'DTA/Q/1180', terms: '30 days · freight paid to Ahmedabad', validUntil: '2026-11-30' },
  'DOC-14': { docNo: 'GH/LIST/AUG26', terms: '30 days · hardware rates per piece', validUntil: '2026-09-30' },
}

const L = (
  id: string, rawText: string, uom: string, rate: number,
  via: DocLineDetail['via'], itemId?: string, confidence?: number, qty?: number,
): DocLineDetail => ({ id, rawText, uom, rate, via, itemId, confidence, qty })

/**
 * 55 lines across 14 documents — the figure the page header quotes, so the two
 * cannot drift. Line ids are document-scoped: DOC-03 line 4 is `DOC-03/4`.
 */
export const documentLines: Record<string, DocLineDetail[]> = {
  'DOC-01': [
    L('DOC-01/1', 'INCOLOY-800 SHEATH TUBE 8.5MM', 'm', 212, 'alias', 'EL-TUB-INC85', 1, 1000),
    L('DOC-01/2', 'INCOLOY-800 SHEATH TUBE 6.5MM', 'm', 196, 'unmapped'),
    L('DOC-01/3', 'SS-321 SHEATH TUBE 8.5MM', 'm', 141, 'unmapped'),
  ],
  'DOC-02': [
    L('DOC-02/1', 'SHEATHING TUBE INCOLOY 800 OD 8.5', 'm', 206, 'matched', 'EL-TUB-INC85', 0.91, 1000),
    L('DOC-02/2', 'SHEATHING TUBE INCOLOY 800 OD 10.0', 'm', 231, 'unmapped'),
  ],
  'DOC-03': [
    L('DOC-03/1', 'CRCA SHEET 0.8MM X 1250 X 2500', 'MT', 60900, 'unmapped'),
    L('DOC-03/2', 'CRCA SHEET 1.0MM X 1250 X 2500', 'MT', 61100, 'unmapped'),
    L('DOC-03/3', 'CRCA SHEET 1.2MM X 1250 X 2500', 'MT', 61400, 'matched', 'RM-CRC-120', 0.94, 2.5),
    L('DOC-03/4', 'CRCA SHEET 1.4MM X 1250 X 2500', 'MT', 61300, 'unmapped'),
    L('DOC-03/5', 'CRCA SHEET 1.6MM X 1250 X 2500', 'MT', 61200, 'unmapped'),
    L('DOC-03/6', 'CRCA SHEET 2.0MM X 1250 X 2500', 'MT', 61000, 'unmapped'),
    L('DOC-03/7', 'CRCA SHEET 2.5MM X 1250 X 2500', 'MT', 60800, 'unmapped'),
    L('DOC-03/8', 'GP SHEET 0.8MM X 1220 X 2440', 'MT', 68400, 'unmapped'),
    L('DOC-03/9', 'GP SHEET 1.0MM X 1220 X 2440', 'MT', 68100, 'unmapped'),
    L('DOC-03/10', 'HR PLATE 3.0MM X 1250 X 2500', 'MT', 54600, 'unmapped'),
    L('DOC-03/11', 'HR PLATE 5.0MM X 1250 X 2500', 'MT', 54200, 'unmapped'),
    L('DOC-03/12', 'SS-304 SHEET 1.2MM X 1250 X 2500', 'MT', 244000, 'unmapped'),
  ],
  'DOC-04': [
    L('DOC-04/1', 'TERMINAL BLK CERAMIC 2WAY 30A', 'nos', 19.8, 'review', 'CM-TRB-2W', 0.86, 5000),
    L('DOC-04/2', 'TERMINAL BLK CERAMIC 3WAY 30A', 'nos', 26.4, 'unmapped'),
    L('DOC-04/3', 'CERAMIC BEAD 6MM', 'nos', 1.9, 'unmapped'),
    L('DOC-04/4', 'STEATITE BUSH 8MM', 'nos', 3.4, 'unmapped'),
  ],
  'DOC-05': [
    L('DOC-05/1', 'NICHROME 80/20 WIRE DIA 0.50MM', 'kg', 1198, 'matched', 'RM-NCR-8020', 0.93, 100),
    L('DOC-05/2', 'NICHROME 60/15 WIRE DIA 0.50MM', 'kg', 1042, 'unmapped'),
  ],
  'DOC-06': [
    L('DOC-06/1', 'MAGNESIUM OXIDE POWDER ELECTRICAL GR', 'kg', 139, 'matched', 'RM-MGO-EG', 0.88, 400),
  ],
  'DOC-07': [
    L('DOC-07/1', 'C.R.C.A. SHT 1.2MM 1250W (PRIME)', 'MT', 62800, 'review', 'RM-CRC-120', 0.79, 2.5),
    L('DOC-07/2', 'C.R.C.A. SHT 1.6MM 1250W (PRIME)', 'MT', 62600, 'unmapped'),
    L('DOC-07/3', 'CUTTING & SLITTING CHARGES PER MT', 'MT', 1450, 'unmapped'),
  ],
  'DOC-08': [
    L('DOC-08/1', 'RTD PT-100 SENSOR 6MM X 150MM', 'nos', 412, 'matched', 'SN-RTD-6150', 0.9, 200),
    L('DOC-08/2', 'RTD PT-100 SENSOR 6MM X 250MM', 'nos', 468, 'unmapped'),
  ],
  'DOC-09': [
    L('DOC-09/1', 'MAGNESIUM OXIDE ELECT GRADE', 'kg', 142, 'alias', 'RM-MGO-EG', 1, 400),
    L('DOC-09/2', 'MAGNESIUM OXIDE THERMAL GRADE', 'kg', 118, 'unmapped'),
    L('DOC-09/3', 'MAGNESIUM OXIDE FUSED 200 MESH', 'kg', 156, 'unmapped'),
    L('DOC-09/4', 'ALUMINA POWDER 99.5%', 'kg', 214, 'unmapped'),
    L('DOC-09/5', 'SILICA POWDER 300 MESH', 'kg', 46, 'unmapped'),
    L('DOC-09/6', 'ZIRCON FLOUR', 'kg', 132, 'unmapped'),
  ],
  'DOC-10': [
    L('DOC-10/1', 'BRASS CABLE GLAND 20MM', 'nos', 35.8, 'alias', 'HW-GLD-M20', 1, 2000),
    L('DOC-10/2', 'BRASS CABLE GLAND 25MM', 'nos', 48.2, 'unmapped'),
    L('DOC-10/3', 'BRASS CABLE GLAND 32MM', 'nos', 71.5, 'unmapped'),
    L('DOC-10/4', 'NYLON CABLE GLAND 20MM', 'nos', 9.4, 'unmapped'),
    L('DOC-10/5', 'GLAND LOCK NUT BRASS 20MM', 'nos', 6.2, 'unmapped'),
  ],
  'DOC-11': [
    L('DOC-11/1', 'SS 304 FLANGE 2" ANSI 150# — HEAT 2211', 'nos', 486, 'matched', 'RM-FLG-304-2', 0.87, 60),
  ],
  'DOC-12': [
    L('DOC-12/1', 'ROCKWOOL SLAB 50MM 100KG/M3', 'm²', 164, 'review', 'IN-MWL-050', 0.64, 600),
    L('DOC-12/2', 'ROCKWOOL SLAB 25MM 100KG/M3', 'm²', 96, 'unmapped'),
  ],
  'DOC-13': [
    L('DOC-13/1', 'INCOLOY 800 TUBE 8.5 OD X 0.6 WT', 'm', 219, 'matched', 'EL-TUB-INC85', 0.89, 1000),
    L('DOC-13/2', 'INCOLOY 800 TUBE 6.5 OD X 0.5 WT', 'm', 201, 'unmapped'),
    L('DOC-13/3', 'INCONEL 600 TUBE 8.5 OD X 0.6 WT', 'm', 388, 'unmapped'),
  ],
  'DOC-14': [
    L('DOC-14/1', 'CABLE GLAND BRASS M20', 'nos', 36.5, 'matched', 'HW-GLD-M20', 0.84, 2000),
    L('DOC-14/2', 'CABLE GLAND BRASS M25', 'nos', 49.8, 'unmapped'),
    L('DOC-14/3', 'HEX BOLT M8 X 25 SS304', 'nos', 4.2, 'unmapped'),
    L('DOC-14/4', 'HEX NUT M8 SS304', 'nos', 1.6, 'unmapped'),
    L('DOC-14/5', 'SPRING WASHER M8 SS304', 'nos', 0.7, 'unmapped'),
    L('DOC-14/6', 'SELF TAP SCREW 8 X 12 ZP', 'nos', 0.5, 'unmapped'),
    L('DOC-14/7', 'RIVET 4 X 10 ALU', 'nos', 0.4, 'unmapped'),
    L('DOC-14/8', 'HINGE CONCEALED 180 DEG SS', 'nos', 96, 'unmapped'),
    L('DOC-14/9', 'CAM LOCK 20MM CHROME', 'nos', 74, 'unmapped'),
  ],
}
