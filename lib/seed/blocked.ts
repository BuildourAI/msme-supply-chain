/**
 * §9.1 blocked capital — ₹18.4 L, cross-tabbed by age AND by cause.
 * §8.4: "The cause column is the point: if MOQ is the top cause the fix is a
 * vendor negotiation, not a software change."
 *
 * Both marginals foot to ₹18.4 L:
 *   by age    0–90 ₹6.2 L · 90–180 ₹5.1 L · 180+ ₹7.1 L
 *   by cause  MOQ forced ₹5.8 L · spec change ₹4.6 L · over-buy ₹3.9 L
 *             · cancelled ₹2.4 L · wrong purchase ₹1.7 L
 *
 * Note this is a different population from non-usable stock (₹29,308): blocked
 * capital is mostly material that is perfectly usable but *wrong* — §2's "blocked
 * stock in wrong-make material". One is not a subset of the other.
 */
import type { BlockedStock } from '@/lib/domain/types'

export const blockedStock: BlockedStock[] = [
  // ---- 0–90 days ---------------------------------------------------- ₹6.2 L
  { id: 'BS-01', itemCode: 'RM-CRC-140', itemName: 'CRCA sheet 1.4 mm × 1250', qty: 4.2, uom: 'MT', value: 260000, ageBucket: '0_90', cause: 'moq_forced', owner: 'A. Nandy · Buyer', route: 'alternate', deadline: '2026-10-15' },
  { id: 'BS-02', itemCode: 'EL-TUB-INC65', itemName: 'Incoloy 800 tube Ø6.5 — superseded spec', qty: 610, uom: 'm', value: 140000, ageBucket: '0_90', cause: 'spec_change', owner: 'R. Iyer · Design', route: 'resell', deadline: '2026-10-31' },
  { id: 'BS-03', itemCode: 'IN-MWL-025', itemName: 'Mineral wool insulation 25 mm', qty: 720, uom: 'm²', value: 120000, ageBucket: '0_90', cause: 'over_buy', owner: 'A. Nandy · Buyer', route: 'alternate', deadline: '2026-11-30' },
  { id: 'BS-04', itemCode: 'SN-RTD-6100', itemName: 'PT100 RTD sensor 6 × 100', qty: 140, uom: 'nos', value: 60000, ageBucket: '0_90', cause: 'cancelled_order', owner: 'S. Rao · Sales', route: 'resell', deadline: '2026-10-20' },
  { id: 'BS-05', itemCode: 'HW-GLD-M25', itemName: 'Cable gland M25 — ordered against a M20 drawing', qty: 900, uom: 'nos', value: 40000, ageBucket: '0_90', cause: 'wrong_purchase', owner: 'A. Nandy · Buyer', route: 'return', deadline: '2026-09-30' },

  // ---- 90–180 days -------------------------------------------------- ₹5.1 L
  { id: 'BS-06', itemCode: 'CM-TRB-4W', itemName: 'Ceramic terminal block 4-way 30 A', qty: 8200, uom: 'nos', value: 190000, ageBucket: '90_180', cause: 'moq_forced', owner: 'A. Nandy · Buyer', route: 'alternate', deadline: '2026-11-15' },
  { id: 'BS-07', itemCode: 'RM-FLG-316-2', itemName: 'SS 316 flange 2" — grade changed to 304', qty: 260, uom: 'nos', value: 150000, ageBucket: '90_180', cause: 'spec_change', owner: 'R. Iyer · Design', route: 'alternate', deadline: '2026-12-15' },
  { id: 'BS-08', itemCode: 'RM-NCR-6015', itemName: 'Nichrome 60/15 wire Ø0.5', qty: 62, uom: 'kg', value: 90000, ageBucket: '90_180', cause: 'over_buy', owner: 'A. Nandy · Buyer', route: 'resell', deadline: '2026-11-30' },
  { id: 'BS-09', itemCode: 'EL-TUB-SS-10', itemName: 'SS 321 tube Ø10 — order cancelled after cut', qty: 380, uom: 'm', value: 50000, ageBucket: '90_180', cause: 'cancelled_order', owner: 'S. Rao · Sales', route: 'scrap', deadline: '2026-10-31' },
  { id: 'BS-10', itemCode: 'PT-EPX-9010', itemName: 'Epoxy powder RAL 9010 — wrong sheen', qty: 180, uom: 'kg', value: 30000, ageBucket: '90_180', cause: 'wrong_purchase', owner: 'M. Shah · Stores', route: 'return', deadline: '2026-09-25' },

  // ---- over 180 days ------------------------------------------------ ₹7.1 L
  { id: 'BS-11', itemCode: 'RM-CRC-200', itemName: 'CRCA sheet 2.0 mm × 1250', qty: 2.1, uom: 'MT', value: 130000, ageBucket: 'over_180', cause: 'moq_forced', owner: 'A. Nandy · Buyer', route: 'alternate', deadline: '2026-12-31' },
  { id: 'BS-12', itemCode: 'CM-INS-BUSH', itemName: 'Steatite bush — obsolete element design', qty: 14200, uom: 'nos', value: 170000, ageBucket: 'over_180', cause: 'spec_change', owner: 'R. Iyer · Design', route: 'scrap', deadline: '2026-10-31' },
  { id: 'BS-13', itemCode: 'RM-MGO-TG', itemName: 'MgO powder, thermal grade', qty: 1250, uom: 'kg', value: 180000, ageBucket: 'over_180', cause: 'over_buy', owner: 'A. Nandy · Buyer', route: 'alternate', deadline: '2026-11-30' },
  { id: 'BS-14', itemCode: 'HW-ENC-800', itemName: 'Enclosure shell 800×600 — order withdrawn', qty: 46, uom: 'nos', value: 130000, ageBucket: 'over_180', cause: 'cancelled_order', owner: 'S. Rao · Sales', route: 'resell', deadline: '2026-12-15' },
  { id: 'BS-15', itemCode: 'SL-GSK-SIL', itemName: 'Silicone gasket — specified EPDM', qty: 1900, uom: 'm', value: 100000, ageBucket: 'over_180', cause: 'wrong_purchase', owner: 'M. Shah · Stores', route: 'resell', deadline: '2026-10-15' },
]

export const AGE_LABEL: Record<string, string> = {
  '0_90': '0–90 days', '90_180': '90–180 days', 'over_180': 'Over 180 days',
}
export const CAUSE_LABEL: Record<string, string> = {
  moq_forced: 'MOQ forced', spec_change: 'Spec change', over_buy: 'Over-buy',
  cancelled_order: 'Cancelled order', wrong_purchase: 'Wrong purchase',
}
export const ROUTE_LABEL: Record<string, string> = {
  return: 'Return to vendor', resell: 'Resell', alternate: 'Use on an alternate job', scrap: 'Scrap',
}
