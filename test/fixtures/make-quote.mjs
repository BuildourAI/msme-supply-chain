/**
 * The fixture PDFs, built rather than committed as bytes.
 *
 * A quote from a supplier who has never heard of this factory's item codes —
 * their wording, their column order, their Indian number grouping — so the
 * reader is tested against a real file with a real font and a real text layer,
 * not against a string somebody typed to make the test pass.
 *
 *   node test/fixtures/make-quote.mjs test/fixtures/quote.pdf
 *   node test/fixtures/make-quote.mjs test/fixtures/quote-hsn.pdf --hsn
 *
 * `--hsn` puts two columns on it that this build has no field for — an HSN
 * code and a brand. Kept as a second file rather than added to the first,
 * because the first is what the reader's own suite is pinned against and a
 * fixture that changes under a test is a test nobody trusts.
 */
import { jsPDF } from 'jspdf'
import { writeFileSync } from 'node:fs'

const d = new jsPDF({ unit: 'pt', format: 'a4' })
const M = 48
let y = 64

d.setFont('helvetica', 'bold'); d.setFontSize(15)
d.text('SHAH METALS & ALLOYS', M, y)
d.setFont('helvetica', 'normal'); d.setFontSize(9)
y += 14; d.text('Plot 44, GIDC Phase II, Vatva, Ahmedabad 382445', M, y)
y += 12; d.text('GSTIN 24AABCS1429L1Z8  |  sales@shahmetals.in  |  +91 98250 11234', M, y)

y += 26; d.setFont('helvetica', 'bold'); d.setFontSize(11)
d.text('QUOTATION', M, y)
d.setFont('helvetica', 'normal'); d.setFontSize(9)
d.text('No. SMA/Q/2026/1184', 340, y)
y += 13; d.text('Date: 12/09/2026', 340, y)
y += 13; d.text('Valid until: 15/10/2026', 340, y)

const hsn = process.argv.includes('--hsn')

y += 26
const col = hsn
  ? [M, M + 212, M + 262, M + 312, M + 368, M + 440]
  : [M, M + 250, M + 320, M + 390, M + 462]
const heads = hsn
  ? ['Description', 'HSN', 'Qty', 'Unit', 'Rate', 'Amount']
  : ['Description', 'Qty', 'Unit', 'Rate', 'Amount']
d.setFont('helvetica', 'bold'); d.setFontSize(9)
heads.forEach((h, i) => d.text(h, col[i], y))
d.setLineWidth(0.5); d.line(M, y + 4, 548, y + 4)

const plain = [
  ['C.R.C.A. SHEET 1.2MM 1250 WIDE (PRIME)', '12', 'MT', '62,800.00', '7,53,600.00'],
  ['INCOLOY-800 SHEATH TUBE 8.5MM OD', '1,000', 'm', '212.00', '2,12,000.00'],
  ['MAGNESIUM OXIDE ELECT GRADE', '600', 'kg', '148.50', '89,100.00'],
  ['TERMINAL BLK CERAMIC 2WAY 30A', '5,000', 'nos', '19.80', '99,000.00'],
  ['BRASS CABLE GLAND 20MM', '800', 'nos', '46.00', '36,800.00'],
  ['ROCKWOOL SLAB 50MM 100KG/M3', '250', 'm2', '164.00', '41,000.00'],
]
const codes = ['7209', '7507', '2519', '8547', '7412', '6806']
const rows = hsn
  ? plain.map((r, i) => [r[0], codes[i], ...r.slice(1)])
  : plain
d.setFont('helvetica', 'normal')
y += 18
for (const r of rows) {
  r.forEach((cell, i) => d.text(cell, col[i], y))
  y += 16
}
d.line(M, y - 6, 548, y - 6)
d.setFont('helvetica', 'bold')
d.text('Total', col[0], y + 6); d.text('12,31,500.00', col[col.length - 1], y + 6)

y += 34; d.setFont('helvetica', 'normal'); d.setFontSize(8.5)
d.text('Terms: 30 days from invoice. Freight extra at actuals. Delivery 10-14 days ex-works.', M, y)

const out = process.argv[2] ?? 'test/fixtures/quote.pdf'
writeFileSync(out, Buffer.from(d.output('arraybuffer')))
console.log('wrote', out)
