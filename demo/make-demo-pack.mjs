/*
 * The demo pack: everything a presenter brings into a fresh workspace through
 * the app's own Import and Upload document buttons, for Indigo Loom Apparel —
 * a made-up jeans factory in Narol, Ahmedabad. Every supplier, customer,
 * GSTIN, phone number and price is invented.
 *
 * The pack is dated from the day it is generated, so an order that should be
 * "at the gate today" is at the gate today. Run it again on the morning of
 * the demo:
 *
 *   node demo/make-demo-pack.mjs              → demo/pack/ and demo/indigo-loom-demo-pack.zip
 *   node demo/make-demo-pack.mjs --today=2026-10-03   (a fixed day, for a repeatable pack)
 *
 * It also renders demo/DEMO.md — the presenter's script — into the pack as a
 * PDF, so the script travels with the files.
 */
import { createRequire } from 'node:module'
import { mkdirSync, writeFileSync, readFileSync, readdirSync, statSync, existsSync, rmSync } from 'node:fs'
import { join, relative, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import zlib from 'node:zlib'

const require = createRequire(import.meta.url)
const { jsPDF } = require('jspdf')
const { createCanvas } = require('@napi-rs/canvas')

const HERE = dirname(fileURLToPath(import.meta.url))
const OUT = join(HERE, 'pack')
const ZIP = join(HERE, 'indigo-loom-demo-pack.zip')

/* ------------------------------------------------------------------ days -- */

const todayArg = process.argv.find((a) => a.startsWith('--today='))?.slice(8)
const TODAY = todayArg ? new Date(`${todayArg}T00:00:00Z`) : new Date()
if (Number.isNaN(TODAY.getTime())) throw new Error(`--today must be YYYY-MM-DD, got ${todayArg}`)
/** n days from today, as a Date */
const day = (n) => new Date(Date.UTC(TODAY.getUTCFullYear(), TODAY.getUTCMonth(), TODAY.getUTCDate() + n))
const pad = (n) => String(n).padStart(2, '0')
/** dd/mm/yyyy — the way an Indian sheet writes a date, and the way the import reads one */
const dmy = (n) => { const d = day(n); return `${pad(d.getUTCDate())}/${pad(d.getUTCMonth() + 1)}/${d.getUTCFullYear()}` }
/** yyyy-mm-dd */
const iso = (n) => day(n).toISOString().slice(0, 10)
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
/** "7 Oct" */
const short = (n) => { const d = day(n); return `${d.getUTCDate()} ${MON[d.getUTCMonth()]}` }
/** "3 October 2026" */
const long = (n) => { const d = day(n); return `${d.getUTCDate()} ${['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'][d.getUTCMonth()]} ${d.getUTCFullYear()}` }

/* ------------------------------------------------------------------ data -- */

export const COMPANY = {
  name: 'Indigo Loom Apparel Pvt Ltd',
  makes: 'Denim jeans - 5-pocket, about 600 pairs a day',
  address: 'Plot 17, Narol-Vatva Road, Narol, Ahmedabad 382405',
  gstin: '24AAFCI4821K1Z3',
  phone: '+91 98790 11045',
  email: 'purchase@indigoloom.example',
}

// code, name, group, unit (as written in the sheet), last paid, on hand, used per day, days of cushion, smallest order
export const MATERIALS = [
  ['DNM-12R', 'Denim 12 oz rigid indigo 147 cm', 'Fabric', 'Mtr', 245, 16000, 500, 7, 3000],
  ['DNM-10S', 'Denim 10 oz stretch indigo 142 cm', 'Fabric', 'Mtr', 268, 4500, 250, 7, 2000],
  ['PKT-110', 'Pocketing fabric 110 cm white', 'Fabric', 'Mtr', 48, 5200, 210, 5, 2000],
  ['WBI-40', 'Waistband interlining 40 mm fusible', 'Fabric', 'Mtr', 14, 2600, 60, 10, 1000],
  ['THR-SEW', 'Sewing thread 40/2 poly 5000 m cone', 'Thread', 'Pcs', 118, 420, 24, 10, 100],
  ['THR-TOP', 'Topstitch thread 20/3 gold 3000 m cone', 'Thread', 'Pcs', 142, 260, 30, 10, 100],
  ['BTN-SHK', 'Shank button 17 mm antique brass', 'Trims', 'Pcs', 3.4, 14000, 600, 10, 5000],
  ['RVT-CU', 'Copper rivet 9 mm', 'Trims', 'Pcs', 0.85, 70000, 3600, 7, 20000],
  ['ZIP-18', 'Metal zip 18 cm brass teeth', 'Trims', 'Pcs', 11.5, 13000, 600, 10, 2000],
  ['PCH-JAC', 'Jacron patch 7 x 5 cm', 'Trims', 'Pcs', 4.2, 3000, 600, 7, 5000],
  ['LBL-MAIN', 'Main label woven 5 x 2.5 cm', 'Labels', 'Pcs', 1.6, 18000, 600, 15, 10000],
  ['LBL-CARE', 'Care label printed satin', 'Labels', 'Pcs', 0.55, 20000, 600, 15, 10000],
  ['TAG-HANG', 'Hang tag 300 gsm with string', 'Labels', 'Pcs', 2.1, 8000, 600, 15, 5000],
  ['PKG-POLY', 'Poly bag 12 x 16 in with warning print', 'Packing', 'Pcs', 1.35, 15000, 600, 10, 10000],
  ['PKG-CTN', 'Carton 5-ply 60 x 40 x 40 cm', 'Packing', 'Pcs', 62, 600, 25, 10, 200],
]
const M = Object.fromEntries(MATERIALS.map((m) => [m[0], m]))

// supplier, type, payment days, phone, email
export const SUPPLIERS = [
  ['Sabarmati Denim Mills', 'Raw material', 45, '+91 98250 41120', 'sales@sabarmatidenim.example'],
  ['Gomti Textiles', 'Raw material', 30, '+91 94260 55310', 'orders@gomtitex.example'],
  ['Narol Pocketing Mills', 'Raw material', 30, '+91 98980 22761', 'narolpocketing@example.com'],
  ['Kalol Pocketing Co', 'Raw material', 30, '+91 97250 88412', 'kalolpocketing@example.com'],
  ['Metro Trims and Accessories', 'Trims', 30, '+91 99099 31277', 'metro.trims@example.com'],
  ['Surat Trim Traders', 'Trims', 60, '+91 98241 60088', 'surattrim@example.com'],
  ['Kalupur Label House', 'Trims', 30, '+91 98795 12030', 'kalupurlabels@example.com'],
  ['Amba Thread Company', 'Consumable', 30, '+91 94084 77120', 'ambathread@example.com'],
  ['Vatva Packaging Industries', 'Consumable', 15, '+91 99798 40216', 'vatvapack@example.com'],
  ['Blue Wash Laundry', 'Jobworker', 15, '+91 98250 90731', 'bluewash@example.com'],
  ['Shree Embroidery Works', 'Jobworker', 15, '+91 97129 45510', 'shreeembroidery@example.com'],
  ['Rangoli Screen Printers', 'Jobworker', 30, '+91 90990 63187', 'rangoliprint@example.com'],
]

/*
 * Quotations sent as documents. Each line names the material by its code and
 * its full name, so the reader matches it outright. Delivery and payment are
 * printed the way the reader looks for them. Dated a fortnight or so back,
 * good for six months.
 */
const VALID = dmy(180)
export const QUOTES = [
  {
    file: 'quotes/Q1-Sabarmati-Denim-Mills.pdf', kind: 'pdf',
    head: 'SABARMATI DENIM MILLS PVT LTD',
    addr: 'Survey No. 212, Santej-Vadsar Road, Kalol, Gandhinagar 382721',
    contact: 'GSTIN 24AADCS7716M1ZQ  |  sales@sabarmatidenim.example  |  +91 98250 41120',
    no: 'SDM/QTN/0418', date: dmy(-16), valid: VALID,
    pay: 'Payment terms: 45 days from invoice.', lead: 'Delivery: 21 days from PO.',
    lines: [['DNM-12R', 6000, 242], ['DNM-10S', 3000, 265]],
    freight: 18500,
  },
  {
    file: 'quotes/Q2-Gomti-Textiles.pdf', kind: 'pdf',
    head: 'GOMTI TEXTILES',
    addr: '14 Ring Road Textile Market, Surat 395002',
    contact: 'GSTIN 24AAKFG3920R1Z6  |  orders@gomtitex.example  |  +91 94260 55310',
    no: 'GT/Q/1187', date: dmy(-14), valid: VALID,
    pay: 'Payment terms: 30 days from invoice.', lead: 'Delivery: 12 days from PO.',
    lines: [['DNM-12R', 6000, 251], ['DNM-10S', 3000, 272]],
    freight: 12000,
  },
  {
    file: 'quotes/Q3-Metro-Trims.pdf', kind: 'pdf',
    head: 'METRO TRIMS AND ACCESSORIES',
    addr: 'Shop 41, Relief Road Trims Bazaar, Ahmedabad 380001',
    contact: 'GSTIN 24ABMFM5528J1Z1  |  metro.trims@example.com  |  +91 99099 31277',
    no: 'MTA/0932', date: dmy(-15), valid: VALID,
    pay: 'Payment terms: 30 days from invoice.', lead: 'Delivery: 10 days from PO.',
    lines: [['BTN-SHK', 20000, 3.35], ['RVT-CU', 100000, 0.82], ['ZIP-18', 10000, 11.2], ['PCH-JAC', 15000, 4.1]],
  },
  {
    file: 'quotes/Q4-Kalupur-Label-House.pdf', kind: 'pdf',
    head: 'KALUPUR LABEL HOUSE',
    addr: '3rd Floor, Swaminarayan Complex, Kalupur, Ahmedabad 380002',
    contact: 'GSTIN 24AAPFK6120D1ZC  |  kalupurlabels@example.com  |  +91 98795 12030',
    no: 'KLH/Q/077', date: dmy(-15), valid: VALID,
    pay: 'Payment terms: 30 days from invoice.', lead: 'Delivery: 7-10 days after artwork approval.',
    lines: [['LBL-MAIN', 30000, 1.55], ['LBL-CARE', 30000, 0.52], ['TAG-HANG', 20000, 2.05]],
  },
  {
    file: 'quotes/Q5-Amba-Thread.jpg', kind: 'jpg',
    head: 'AMBA THREAD COMPANY',
    addr: 'Dudheshwar Road, Ahmedabad 380004',
    no: 'ATC/Q/0551', date: dmy(-13), valid: VALID,
    pay: 'Payment terms: 30 days', lead: 'Delivery: 5 days',
    lines: [['THR-SEW', 500, 116], ['THR-TOP', 400, 140]],
  },
  {
    file: 'quotes/Q6-Vatva-Packaging.png', kind: 'png',
    head: 'VATVA PACKAGING INDUSTRIES',
    addr: 'Phase IV, GIDC Vatva, Ahmedabad 382445',
    no: 'VPI/QTN/310', date: dmy(-13), valid: VALID,
    pay: 'Payment terms: 15 days', lead: 'Delivery: 7 days',
    lines: [['PKG-POLY', 30000, 1.3], ['PKG-CTN', 1000, 60]],
  },
  {
    file: 'quotes/Q7-Narol-Pocketing.gif', kind: 'gif',
    head: 'NAROL POCKETING MILLS',
    addr: 'Narol Industrial Estate, Ahmedabad 382405',
    no: 'NPM/Q/064', date: dmy(-12), valid: VALID,
    pay: 'Payment terms: 30 days', lead: 'Delivery: 10 days',
    lines: [['PKT-110', 5000, 47], ['WBI-40', 3000, 13.5]],
  },
]

// quotes that came as a spreadsheet: supplier, material, price, smallest order, takes (days), ref, quoted on, valid until
export const SHEET_QUOTES = [
  ['Surat Trim Traders', M['BTN-SHK'][1], 3.1, 50000, 25, 'STT/0922', dmy(-13), VALID],
  ['Surat Trim Traders', M['RVT-CU'][1], 0.74, 200000, 25, 'STT/0922', dmy(-13), VALID],
  ['Surat Trim Traders', M['ZIP-18'][1], 10.4, 20000, 25, 'STT/0922', dmy(-13), VALID],
  ['Kalol Pocketing Co', M['PKT-110'][1], 45.5, 5000, 18, 'KPC-Q-118', dmy(-14), VALID],
  ['Kalol Pocketing Co', M['WBI-40'][1], 12.8, 5000, 18, 'KPC-Q-118', dmy(-14), VALID],
]

/*
 * Three purchase orders already with suppliers: one still to come, one whose
 * lorry is at the gate today, and one that should have landed two days ago.
 * supplier, material, qty, rate, ordered, expected, status
 */
export const ORDERS = [
  ['Sabarmati Denim Mills', M['DNM-10S'][1], 3000, 265, dmy(-17), dmy(4), 'confirmed'],
  ['Metro Trims and Accessories', M['PCH-JAC'][1], 15000, 4.1, dmy(-15), dmy(0), 'shipped'],
  ['Amba Thread Company', M['THR-TOP'][1], 400, 140, dmy(-14), dmy(-2), 'confirmed'],
]

// material, check, how, from, to, unit, if it fails, reason, must be marked
const C = (code, check, how, from, to, unit, fail, reason, must = 'Yes') =>
  [M[code][1], check, how, from, to, unit, fail, reason, must]
export const CHECKS = [
  C('DNM-12R', 'Weight', 'reading', 395, 420, 'gsm', 'hold', 'Outside the 12 oz band - hold for a mill claim'),
  C('DNM-12R', 'Width', 'reading', 147, 152, 'cm', 'hold', 'Narrow width raises fabric per pair'),
  C('DNM-12R', 'Shrinkage after wash', 'reading', 0, 3, '%', 'reject', 'Shrinks more than 3% after wash'),
  C('DNM-12R', 'Shade vs approved lab dip', 'look', '', '', '', 'hold', 'Shade off the approved band'),
  C('DNM-10S', 'Weight', 'reading', 330, 350, 'gsm', 'hold', 'Outside the 10 oz band'),
  C('DNM-10S', 'Stretch recovery', 'reading', 90, 100, '%', 'reject', 'Bags at the knee after wear'),
  C('DNM-10S', 'Mill test certificate', 'document', '', '', '', 'hold', 'No test certificate with the lot'),
  C('PKT-110', 'Width', 'reading', 110, 113, 'cm', 'hold', 'Too narrow for the pocket marker'),
  C('PKT-110', 'Holes and stains', 'look', '', '', '', 'usable', 'Minor - cut around it', 'No'),
  C('WBI-40', 'Width', 'reading', 39, 41, 'mm', 'reject', 'Will not sit in the waistband'),
  C('WBI-40', 'Fusing bond', 'look', '', '', '', 'reject', 'Peels after pressing'),
  C('THR-SEW', 'Cones in the box', 'count', '', '', '', 'hold', 'Short count against the challan'),
  C('THR-SEW', 'Shade', 'look', '', '', '', 'hold', 'Shade does not match the denim'),
  C('THR-TOP', 'Gold shade vs standard', 'look', '', '', '', 'hold', 'Topstitch shade off standard'),
  C('THR-TOP', 'Tensile test report', 'document', '', '', '', 'hold', 'No tensile report', 'No'),
  C('BTN-SHK', 'Shank height', 'reading', 5, 6, 'mm', 'reject', 'Will not close through two layers'),
  C('BTN-SHK', 'Plating finish', 'look', '', '', '', 'reject', 'Plating peeling or spotted'),
  C('RVT-CU', 'Pieces per bag', 'count', '', '', '', 'hold', 'Short count against the challan'),
  C('RVT-CU', 'Copper finish', 'look', '', '', '', 'reject', 'Finish not copper'),
  C('ZIP-18', 'Length', 'reading', 17.5, 18.5, 'cm', 'reject', 'Wrong length for the fly'),
  C('ZIP-18', 'Slider runs and locks', 'look', '', '', '', 'reject', 'Slider sticks or will not lock'),
  C('PCH-JAC', 'Size', 'reading', 69, 71, 'mm', 'hold', 'Patch size off the artwork'),
  C('PCH-JAC', 'Print legible', 'look', '', '', '', 'reject', 'Logo print smudged'),
  C('LBL-MAIN', 'Spelling and logo', 'look', '', '', '', 'reject', 'Wrong brand text'),
  C('LBL-CARE', 'Wash-care symbols', 'look', '', '', '', 'reject', 'Wrong wash instructions'),
  C('TAG-HANG', 'Board weight', 'reading', 290, 310, 'gsm', 'hold', 'Board too thin'),
  C('TAG-HANG', 'Print and barcode', 'look', '', '', '', 'reject', 'Barcode will not scan'),
  C('PKG-POLY', 'Thickness', 'reading', 50, 60, 'micron', 'hold', 'Too thin for export'),
  C('PKG-POLY', 'Suffocation warning printed', 'look', '', '', '', 'reject', 'Warning missing'),
  C('PKG-CTN', 'Burst strength certificate', 'document', '', '', '', 'hold', 'No burst test with the lot'),
  C('PKG-CTN', 'Length', 'reading', 59, 61, 'cm', 'hold', 'Carton size off the spec'),
]

/*
 * The customers — two in Gujarat, so a challan to them carries CGST and SGST,
 * and three outside it, so theirs carry IGST and need an e-way bill once the
 * value is over the rule. The state is read off the GSTIN, so the sheet does
 * not say it. customer, GSTIN, ship to, payment days, phone, email, km
 */
export const CUSTOMERS = [
  ['Deccan Denim Retail', '27AAECD4412P1ZQ', 'Gala 12, Bhiwandi Textile Park, Thane 421302', 30, '+91 98200 44120', 'buying@deccandenim.example', 530],
  ['Rajkot Garment House', '24AAHFR8821C1ZF', 'Plot 9, Aji GIDC, Rajkot 360003', 30, '+91 98240 17765', 'rajkotgarment@example.com', 225],
  ['Capital Apparel Traders', '07AADCC9034E1ZK', 'B-14, Gandhi Nagar Market, Delhi 110031', 45, '+91 98110 23890', 'capitalapparel@example.com', 950],
  ['Bengaluru Denim Co', '29AAFCB1290L1ZV', 'No. 42, Peenya 2nd Stage, Bengaluru 560058', 45, '+91 98450 61234', 'orders@bengalurudenim.example', 1500],
  ['Surat Fashion Mart', '24AAJFS3310H1ZD', 'Ring Road, Surat 395002', 15, '+91 98250 77001', 'suratfashion@example.com', 265],
]
const GSTIN = /^\d{2}[A-Z]{5}\d{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/
for (const c of CUSTOMERS) if (!GSTIN.test(c[1])) throw new Error(`${c[0]}: ${c[1]} is not in the GSTIN shape`)

// carrier, how they carry it, rate per kg per km, phone
export const CARRIERS = [
  ['Our own tempo', 'Own vehicle', '', '+91 98790 11046'],
  ['Saurashtra Roadways', 'Part load', 0.012, '+91 98250 30311'],
  ['Western Freight Carriers', 'Full truck', 0.009, '+91 99090 55120'],
  ['Swift Parcel Express', 'Courier', 0.03, '+91 98980 20019'],
]

/* --------------------------------------------------------------- helpers -- */

/** Indian digit grouping, with the given decimals */
function inr(n, dp = 2) {
  const [int, dec] = Math.abs(n).toFixed(dp).split('.')
  const last3 = int.slice(-3)
  const rest = int.slice(0, -3)
  const grouped = rest ? `${rest.replace(/\B(?=(\d{2})+(?!\d))/g, ',')},${last3}` : last3
  return `${n < 0 ? '-' : ''}${grouped}${dp ? `.${dec}` : ''}`
}
const round2 = (n) => Math.round(n * 100) / 100
const unitOf = (code) => (M[code][3] === 'Mtr' ? 'Mtr' : 'Pcs')

/* ----------------------------------------------------------------- xlsx -- */

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
const colName = (i) => { let s = ''; i += 1; while (i > 0) { const m = (i - 1) % 26; s = String.fromCharCode(65 + m) + s; i = Math.floor((i - 1) / 26) } return s }

function sheetXml(rows, widths) {
  const cols = widths.map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`).join('')
  const body = rows.map((r, ri) => `<row r="${ri + 1}">${r.map((v, ci) => {
    const ref = `${colName(ci)}${ri + 1}`
    const style = ri === 0 ? ' s="1"' : ''
    if (v === '' || v === null || v === undefined) return ''
    if (typeof v === 'number') return `<c r="${ref}"${style}><v>${v}</v></c>`
    return `<c r="${ref}"${style} t="inlineStr"><is><t xml:space="preserve">${esc(v)}</t></is></c>`
  }).join('')}</row>`).join('')
  return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
    + '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">'
    + '<sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>'
    + `<cols>${cols}</cols><sheetData>${body}</sheetData></worksheet>`
}

/** A zip with no dependency: files are [{ name, data: Buffer }]. */
function zip(files) {
  const locals = []; const central = []; let offset = 0
  for (const f of files) {
    const name = Buffer.from(f.name, 'utf8')
    const raw = f.data
    const deflated = zlib.deflateRawSync(raw, { level: 9 })
    const crc = zlib.crc32(raw)
    const lh = Buffer.alloc(30)
    lh.writeUInt32LE(0x04034b50, 0); lh.writeUInt16LE(20, 4); lh.writeUInt16LE(0x0800, 6); lh.writeUInt16LE(8, 8)
    lh.writeUInt16LE(0, 10); lh.writeUInt16LE(0x5921, 12)
    lh.writeUInt32LE(crc >>> 0, 14); lh.writeUInt32LE(deflated.length, 18); lh.writeUInt32LE(raw.length, 22)
    lh.writeUInt16LE(name.length, 26); lh.writeUInt16LE(0, 28)
    locals.push(lh, name, deflated)
    const ch = Buffer.alloc(46)
    ch.writeUInt32LE(0x02014b50, 0); ch.writeUInt16LE(20, 4); ch.writeUInt16LE(20, 6); ch.writeUInt16LE(0x0800, 8)
    ch.writeUInt16LE(8, 10); ch.writeUInt16LE(0, 12); ch.writeUInt16LE(0x5921, 14)
    ch.writeUInt32LE(crc >>> 0, 16); ch.writeUInt32LE(deflated.length, 20); ch.writeUInt32LE(raw.length, 24)
    ch.writeUInt16LE(name.length, 28); ch.writeUInt16LE(0, 30); ch.writeUInt16LE(0, 32); ch.writeUInt16LE(0, 34)
    ch.writeUInt16LE(0, 36); ch.writeUInt32LE(0, 38); ch.writeUInt32LE(offset, 42)
    central.push(ch, name)
    offset += 30 + name.length + deflated.length
  }
  const cd = Buffer.concat(central)
  const end = Buffer.alloc(22)
  end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(0, 4); end.writeUInt16LE(0, 6)
  end.writeUInt16LE(files.length, 8); end.writeUInt16LE(files.length, 10)
  end.writeUInt32LE(cd.length, 12); end.writeUInt32LE(offset, 16); end.writeUInt16LE(0, 20)
  return Buffer.concat([...locals, cd, end])
}

function xlsx(sheetName, rows, widths) {
  const b = (s) => Buffer.from(s, 'utf8')
  return zip([
    { name: '[Content_Types].xml', data: b('<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>') },
    { name: '_rels/.rels', data: b('<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>') },
    { name: 'xl/workbook.xml', data: b(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="${esc(sheetName)}" sheetId="1" r:id="rId1"/></sheets></workbook>`) },
    { name: 'xl/_rels/workbook.xml.rels', data: b('<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>') },
    { name: 'xl/styles.xml', data: b('<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts><fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FFDCE6F2"/><bgColor indexed="64"/></patternFill></fill></fills><borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="2"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1"/></cellXfs></styleSheet>') },
    { name: 'xl/worksheets/sheet1.xml', data: b(sheetXml(rows, widths)) },
  ])
}

/* ------------------------------------------------------------ the sheets -- */

if (existsSync(OUT)) rmSync(OUT, { recursive: true })
for (const d of ['', 'quotes', 'confirmations']) mkdirSync(join(OUT, d), { recursive: true })

writeFileSync(join(OUT, '01-suppliers.xlsx'), xlsx('Suppliers', [
  ['Supplier', 'Type', 'Payment', 'Phone', 'Email'],
  ...SUPPLIERS,
], [30, 14, 10, 18, 32]))

writeFileSync(join(OUT, '02-materials.xlsx'), xlsx('Materials', [
  ['Code', 'Material', 'Group', 'Bought in', 'Last paid', 'On hand', 'Used per day', 'Days of cushion', 'Smallest order'],
  ...MATERIALS,
], [11, 40, 10, 10, 10, 10, 13, 15, 14]))

writeFileSync(join(OUT, '03-quotes-from-sheet.xlsx'), xlsx('Quotes', [
  ['Supplier', 'Material', 'Price', 'Smallest order', 'Takes', 'Their reference', 'Quoted on', 'Valid until'],
  ...SHEET_QUOTES,
], [22, 36, 8, 14, 8, 16, 12, 12]))

writeFileSync(join(OUT, '04-open-orders.xlsx'), xlsx('Orders', [
  ['Supplier', 'Material', 'Qty', 'Rate', 'Ordered', 'Expected', 'Status'],
  ...ORDERS,
], [28, 36, 8, 8, 12, 12, 11]))

writeFileSync(join(OUT, '05-checks.xlsx'), xlsx('Checks', [
  ['Material', 'Check', 'How', 'From', 'To', 'Unit', 'If it fails', 'Reason', 'Must be marked'],
  ...CHECKS,
], [38, 28, 10, 7, 7, 8, 12, 40, 15]))

writeFileSync(join(OUT, '06-customers.xlsx'), xlsx('Customers', [
  ['Customer', 'GSTIN', 'Ship to', 'Payment terms', 'Phone', 'Email', 'Distance (km)'],
  ...CUSTOMERS,
], [26, 18, 44, 14, 18, 32, 13]))

writeFileSync(join(OUT, '07-carriers.xlsx'), xlsx('Carriers', [
  ['Carrier', 'How', 'Rate per kg km', 'Phone'],
  ...CARRIERS,
], [26, 14, 15, 18]))

/* ---------------------------------------------------------- PDF quotes -- */

function pdfQuote(q) {
  const d = new jsPDF({ unit: 'pt', format: 'a4' })
  const L = 48
  let y = 60
  d.setFont('helvetica', 'bold'); d.setFontSize(15)
  d.text(q.head, L, y)
  d.setFont('helvetica', 'normal'); d.setFontSize(9)
  y += 14; d.text(q.addr, L, y)
  y += 12; d.text(q.contact, L, y)

  y += 26; d.setFont('helvetica', 'bold'); d.setFontSize(11)
  d.text('QUOTATION', L, y)
  d.setFont('helvetica', 'normal'); d.setFontSize(9)
  d.text(`Quotation No. ${q.no}`, 340, y)
  y += 13; d.text(`Date: ${q.date}`, 340, y)
  y += 13; d.text(`Valid until: ${q.valid}`, 340, y)
  y += 20; d.text(`To: ${COMPANY.name}, ${COMPANY.address}`, L, y)

  y += 26
  const col = [L, L + 262, L + 318, L + 368, L + 440]
  d.setFont('helvetica', 'bold'); d.setFontSize(9)
  ;['Description', 'Qty', 'Unit', 'Rate', 'Amount'].forEach((h, i) => d.text(h, col[i], y))
  d.setLineWidth(0.5); d.line(L, y + 4, 548, y + 4)
  d.setFont('helvetica', 'normal')
  y += 18
  let total = 0
  for (const [code, qty, rate] of q.lines) {
    const amt = round2(qty * rate)
    total += amt
    const cells = [`${code} ${M[code][1]}`, inr(qty, 0), unitOf(code), inr(rate), inr(amt)]
    cells.forEach((c, i) => d.text(c, col[i], y))
    y += 16
  }
  d.line(L, y - 6, 548, y - 6)
  total = round2(total)
  const cgst = round2(total * 0.025), sgst = round2(total * 0.025)
  const rowsBelow = [['Total', total], ['CGST 2.5%', cgst], ['SGST 2.5%', sgst]]
  if (q.freight) rowsBelow.push(['Freight', q.freight])
  rowsBelow.push(['Grand Total', round2(total + cgst + sgst + (q.freight ?? 0))])
  for (const [label, v] of rowsBelow) {
    d.setFont('helvetica', label.startsWith('Grand') || label === 'Total' ? 'bold' : 'normal')
    d.text(label, col[0], y + 6); d.text(inr(v), col[4], y + 6)
    y += 14
  }
  y += 22; d.setFont('helvetica', 'normal'); d.setFontSize(9)
  d.text(q.pay, L, y)
  y += 13; d.text(q.lead, L, y)
  y += 13; d.text('Prices ex-mill. GST extra as applicable. Subject to Ahmedabad jurisdiction.', L, y)
  y += 30; d.setFontSize(8); d.setTextColor(120)
  d.text('SAMPLE DOCUMENT - invented company and figures, for a demonstration.', L, y)
  writeFileSync(join(OUT, q.file), Buffer.from(d.output('arraybuffer')))
}

/* ------------------------------------------------------- image quotes -- */

/** A quotation as a photograph or a scan — the JPG is a little off square, like a phone shot. */
function imageQuote(q) {
  const W = 1600, H = 1180
  const c = createCanvas(W, H); const g = c.getContext('2d')
  const paper = q.kind === 'jpg' ? '#f6f2e8' : '#ffffff'
  g.fillStyle = q.kind === 'jpg' ? '#d9d4c7' : '#ffffff'; g.fillRect(0, 0, W, H)
  g.save()
  if (q.kind === 'jpg') { g.translate(W / 2, H / 2); g.rotate(-0.3 * Math.PI / 180); g.translate(-W / 2, -H / 2) }
  g.fillStyle = paper; g.fillRect(30, 30, W - 60, H - 60)
  g.fillStyle = '#141414'
  const text = (s, x, y, size = 30, bold = false) => { g.font = `${bold ? 'bold ' : ''}${size}px "DejaVu Sans"`; g.fillText(s, x, y) }
  const L = 90
  text(q.head, L, 130, 46, true)
  text(q.addr, L, 185, 28)
  text('QUOTATION', L, 270, 34, true)
  text(`Quotation No. ${q.no}`, 900, 270, 30)
  text(`Date: ${q.date}`, 900, 318, 30)
  text(`Valid until: ${q.valid}`, 900, 366, 30)
  const col = [L, 1020, 1210, 1380]
  let y = 470
  ;['Description', 'Qty', 'Unit', 'Rate'].forEach((h, i) => text(h, col[i], y, 32, true))
  g.fillRect(L, y + 18, W - 2 * L, 3)
  y += 90
  for (const [code, qty, rate] of q.lines) {
    text(`${code} ${M[code][1]}`, col[0], y, 32)
    text(String(qty), col[1], y, 32)
    text(unitOf(code), col[2], y, 32)
    text(String(rate), col[3], y, 32)
    y += 80
  }
  g.fillRect(L, y - 40, W - 2 * L, 2)
  y += 60
  text(q.pay, L, y, 30)
  text(q.lead, L, y + 52, 30)
  g.fillStyle = '#8a8a8a'
  text('SAMPLE DOCUMENT - invented company and figures', L, H - 90, 22)
  g.restore()
  return c
}

/* ------------------------------------------------ the confirmation shot -- */

/** The denim mill confirming the changed order, as a screenshot of a chat. */
function whatsapp() {
  const W = 720, H = 1280
  const c = createCanvas(W, H); const g = c.getContext('2d')
  g.fillStyle = '#efe7de'; g.fillRect(0, 0, W, H)
  g.fillStyle = '#075e54'; g.fillRect(0, 0, W, 120)
  g.fillStyle = '#ffffff'; g.font = 'bold 34px sans-serif'; g.fillText('Sabarmati Denim Mills', 110, 62)
  g.font = '24px sans-serif'; g.fillText('online', 110, 98)
  g.fillStyle = '#cfd8dc'; g.beginPath(); g.arc(60, 60, 34, 0, Math.PI * 2); g.fill()
  const bubble = (lines, x, y, mine, time) => {
    g.font = '27px sans-serif'
    const w = Math.max(...lines.map((l) => g.measureText(l).width)) + 48
    const h = lines.length * 38 + 50
    const bx = mine ? W - w - 24 : 24
    g.fillStyle = mine ? '#dcf8c6' : '#ffffff'
    g.beginPath(); g.roundRect(bx, y, w, h, 14); g.fill()
    g.fillStyle = '#111'
    lines.forEach((l, i) => g.fillText(l, bx + 24, y + 44 + i * 38))
    g.fillStyle = '#8a8a8a'; g.font = '20px sans-serif'
    g.fillText(time, bx + w - 80, y + h - 12)
    return y + h + 22
  }
  let y = 180
  y = bubble(['Namaste. Revised PO sent for', 'Denim 10 oz stretch - now', '3500 mtr instead of 3000.', 'Please confirm.'], 0, y, true, '11:02')
  y = bubble(['Received sir.', 'Confirmed: 3500 mtr', 'Denim 10 oz stretch 142 cm.', `Dispatch by ${short(4)} as per PO.`], 0, y, false, '11:26')
  y = bubble(['Thank you'], 0, y, true, '11:27')
  g.fillStyle = '#8a8a8a'; g.font = '20px sans-serif'
  g.fillText('SAMPLE - invented conversation, for a demonstration', 24, H - 40)
  return c
}

/* ------------------------------------------------- the script, as a PDF -- */

/**
 * DEMO.md rendered plainly: headings, paragraphs, bullets, numbered steps,
 * **bold** runs and `labels`. Enough for a presenter to hold in one hand.
 */
function scriptPdf(md) {
  const d = new jsPDF({ unit: 'pt', format: 'a4' })
  const L = 50, R = 545, BOTTOM = 790
  let y = 60
  const page = (need = 0) => { if (y + need > BOTTOM) { d.addPage(); y = 60 } }
  // a line of text with **bold** runs and `labels`, wrapped at a width
  // the built-in fonts know WinAnsi only, so the few symbols outside it are said
  // another way — the star is drawn from ZapfDingbats, where it is the letter H
  const STAR = '\u0001'
  const ansi = (s) => s.replaceAll('★', STAR).replaceAll('→', '›').replaceAll('₹', 'Rs ').replaceAll('✓', 'yes')
  const run = (text, x, width, size, color = 20, allBold = false) => {
    d.setFontSize(size); d.setTextColor(color)
    const parts = ansi(text).split(/(\*\*[^*]+\*\*|\*[^*\s][^*]*\*|`[^`]+`)/).filter(Boolean)
    const words = []
    for (const part of parts) {
      const bold = allBold || part.startsWith('**'), code = part.startsWith('`')
      const italic = !part.startsWith('**') && !code && part.startsWith('*') && part.length > 2
      const plain = part.startsWith('**') ? part.slice(2, -2) : code || italic ? part.slice(1, -1) : part
      plain.split(/(\s+)/).filter((w) => w.length).forEach((w) => words.push({ w, bold, code, italic }))
    }
    const lh = size * 1.42
    let cx = x
    page(lh)
    for (const { w, bold, code, italic } of words) {
      const star = w === STAR
      if (star) d.setFont('zapfdingbats', 'normal')
      else d.setFont(code ? 'courier' : 'helvetica', bold && italic ? 'bolditalic' : bold ? 'bold' : italic ? 'italic' : 'normal')
      const glyph = star ? 'H' : w
      const ww = d.getTextWidth(glyph)
      if (/^\s+$/.test(w)) { if (cx > x) cx += ww; continue }
      if (cx + ww > x + width && cx > x) { y += lh; page(lh); cx = x }
      d.text(glyph, cx, y); cx += ww
    }
    y += lh
  }
  const lines = md.replace(/\r/g, '').split('\n')
  let para = []
  const flush = () => { if (para.length) { run(para.join(' '), L, R - L, 10); y += 4; para = [] } }
  for (const raw of lines) {
    const line = raw.replace(/<[^>]+>/g, '')
    if (!line.trim()) { flush(); continue }
    let m
    if ((m = /^(#{1,3})\s+(.*)/.exec(line))) {
      flush()
      const lvl = m[1].length
      y += lvl === 1 ? 6 : lvl === 2 ? 14 : 8
      page(30)
      run(m[2], L, R - L, lvl === 1 ? 19 : lvl === 2 ? 13.5 : 11.5, lvl === 3 ? 60 : 10, true)
      if (lvl === 2) { d.setDrawColor(200); d.setLineWidth(0.5); d.line(L, y - 8, R, y - 8) }
      y += 2
    } else if ((m = /^\s*[-*]\s+(.*)/.exec(line))) {
      flush()
      d.setFont('helvetica', 'normal'); d.setFontSize(10); d.setTextColor(20)
      page(14); d.text('•', L + 8, y)
      run(m[1], L + 22, R - L - 22, 10)
    } else if ((m = /^\s*(\d+)\.\s+(.*)/.exec(line))) {
      flush()
      d.setFont('helvetica', 'bold'); d.setFontSize(10); d.setTextColor(20)
      page(14); d.text(`${m[1]}.`, L + 2, y)
      run(m[2], L + 24, R - L - 24, 10)
    } else if (/^\s*\|/.test(line)) {
      // a table row: cells separated by |, the ruler row skipped
      if (/^\s*\|\s*-/.test(line)) continue
      flush()
      const cells = line.split('|').slice(1, -1).map((c) => c.trim())
      const cw = (R - L) / cells.length
      const startY = y
      let maxY = y
      cells.forEach((c, i) => { y = startY; run(c, L + i * cw + 2, cw - 6, 9); maxY = Math.max(maxY, y) })
      y = maxY
    } else if (/^>\s?/.test(line)) {
      flush()
      run(line.replace(/^>\s?/, ''), L + 14, R - L - 14, 10, 90)
    } else if (/^---+$/.test(line.trim())) {
      flush(); y += 4
    } else {
      para.push(line.trim())
    }
  }
  flush()
  return Buffer.from(d.output('arraybuffer'))
}

/* --------------------------------------------------------------- write -- */

for (const q of QUOTES) {
  if (q.kind === 'pdf') { pdfQuote(q); continue }
  const c = imageQuote(q)
  const buf = q.kind === 'jpg' ? await c.encode('jpeg', 88) : q.kind === 'png' ? await c.encode('png') : await c.encode('gif')
  writeFileSync(join(OUT, q.file), buf)
}
writeFileSync(join(OUT, 'confirmations/Sabarmati-WhatsApp-confirmation.png'), await whatsapp().encode('png'))

const script = readFileSync(join(HERE, 'DEMO.md'), 'utf8')
writeFileSync(join(OUT, '00-DEMO-script.pdf'), scriptPdf(script))
writeFileSync(join(OUT, '00-DEMO-script.md'), script)
writeFileSync(join(OUT, 'README.txt'), [
  `Indigo Loom demo pack — generated for ${long(0)}.`,
  '',
  'Open 00-DEMO-script.pdf and follow it. Every file here is brought into the app',
  'through its own Import or Upload document button; nothing is pre-loaded.',
  '',
  'The dates in 04-open-orders.xlsx are relative to the day the pack was made',
  `(one order lands today, one landed ${short(-2)}, one is due ${short(4)}). To re-date the`,
  'pack for another day, run: node demo/make-demo-pack.mjs',
  '',
  'All companies, GSTINs, phone numbers and prices are invented.',
].join('\n'))

// everything in one download
const walk = (dir) => readdirSync(dir).flatMap((n) => {
  const p = join(dir, n)
  return statSync(p).isDirectory() ? walk(p) : [p]
})
const all = walk(OUT).sort()
writeFileSync(ZIP, zip(all.map((p) => ({ name: `indigo-loom-demo-pack/${relative(OUT, p)}`, data: readFileSync(p) }))))
console.log(`pack for ${long(0)}:`)
console.log(all.map((p) => `  ${relative(OUT, p)}  ${statSync(p).size}`).join('\n'))
console.log(`  → ${relative(process.cwd(), ZIP)}  ${statSync(ZIP).size}`)
