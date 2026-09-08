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
