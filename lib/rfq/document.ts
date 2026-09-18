/**
 * A request for quotation, as a piece of paper.
 *
 * One addressed copy per supplier, as separate files. That is not a detail: a
 * single document with four pages, shared to the first supplier, tells them you
 * also asked the other three. In a market where price is settled on a
 * relationship, that is a real commercial harm, and it would be caused by a
 * convenience nobody asked for.
 *
 * The layout is built in one pass and measured as it goes, because jsPDF does
 * not flow text — a long note or a handful of custom fields would otherwise run
 * off the bottom of the page in silence.
 */
import type { Item, Vendor } from '@/lib/domain/types'
import { fieldsFor, valueOf } from '@/lib/workspace/fields'
import type { Rfq, Workspace } from '@/lib/workspace/types'

/* ------------------------------------------------------------- characters -- */

/**
 * What the built-in fonts cannot draw, and what to draw instead.
 *
 * jsPDF's standard fonts are cp1252. The temptation is to test `charCode > 255`
 * and refuse anything above it, but cp1252 fills 0x80–0x9F with exactly the
 * characters people paste out of Word — curly quotes, en and em dashes,
 * ellipsis — so that test refuses documents that would have printed perfectly.
 *
 * Substituting first is both kinder and more accurate. "Rs." is what Indian
 * business paper prints anyway, and a curly apostrophe reads the same straight.
 * Only what survives this is genuinely undrawable.
 */
const SUBSTITUTE: [RegExp, string][] = [
  [/₹/g, 'Rs.'],
  [/[‘’‛]/g, "'"],
  [/[“”‟]/g, '"'],
  [/[–—−]/g, '-'],
  [/…/g, '...'],
  [/ /g, ' '],
  [/[×✕]/g, 'x'],
  [/•/g, '-'],
  [/[✅✓✔]/g, 'Yes'],
]

export function forPrint(text: string): string {
  return SUBSTITUTE.reduce((s, [re, to]) => s.replace(re, to), text ?? '')
}

/**
 * Whether a string can be drawn once substitution has had its turn.
 *
 * cp1252 is Latin-1 plus a filled 0x80–0x9F range, so the test is: after
 * substitution, is every character either below 0x100 or one of the handful
 * cp1252 adds? Anything else — Devanagari, Gujarati, Tamil — genuinely cannot
 * be drawn by a built-in font, and the person is told which field rather than
 * being handed a document with holes in it.
 */
const CP1252_EXTRA = new Set([
  0x20ac, 0x201a, 0x0192, 0x201e, 0x2020, 0x2021, 0x02c6, 0x2030,
  0x0160, 0x2039, 0x0152, 0x017d, 0x2122, 0x0161, 0x203a, 0x0153, 0x017e, 0x0178,
])

export const undrawable = (text: string): string[] => {
  const out = new Set<string>()
  for (const ch of forPrint(text)) {
    const code = ch.codePointAt(0)!
    if (code > 0xff && !CP1252_EXTRA.has(code)) out.add(ch)
  }
  return [...out]
}

/* ------------------------------------------------------------- the model -- */

export interface DocLine {
  label: string
  value: string
}

export interface RfqDoc {
  /** the supplier this copy is addressed to; null for an unaddressed copy */
  vendor: Vendor | null
  company: { name: string; lines: string[] }
  no: string
  raisedOn: string
  item: string
  spec: string
  qty: string
  neededBy: string
  terms: DocLine[]
  extras: DocLine[]
  contact: string
  /** characters no built-in font can draw, with the field each came from */
  problems: { where: string; chars: string[] }[]
}

const dmy = (iso: string) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return iso
  const [y, m, d] = iso.split('-')
  const month = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
    'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][Number(m) - 1]
  return `${Number(d)} ${month} ${y}`
}

/** A sensible date to ask for prices by: a week out, but never after it is needed. */
export function quoteByDate(rfq: Rfq, today: string): string {
  const week = new Date(`${today}T00:00:00Z`)
  week.setUTCDate(week.getUTCDate() + 7)
  const iso = week.toISOString().slice(0, 10)
  return rfq.neededBy && rfq.neededBy < iso ? rfq.neededBy : iso
}

export function buildDoc(
  ws: Workspace,
  rfq: Rfq,
  vendor: Vendor | null,
  today: string,
): RfqDoc {
  const item: Item | undefined = ws.items.find((i) => i.id === rfq.itemId)

  const companyLines = [
    ws.company.address ?? '',
    [ws.company.gstin ? `GSTIN ${ws.company.gstin}` : '', ws.company.phone ?? '']
      .filter(Boolean).join(' · '),
    ws.company.email ?? '',
  ].filter((l) => l.trim() !== '')

  const extras: DocLine[] = fieldsFor(ws, 'rfq')
    .filter((f) => f.onDoc)
    .map((f) => ({ label: f.label, value: valueOf(ws, rfq.id, f.id) }))
    .filter((l) => l.value !== '')

  const terms: DocLine[] = [
    { label: 'Please quote by', value: dmy(quoteByDate(rfq, today)) },
    { label: 'Quote against', value: rfq.no },
  ]
  if (ws.company.address) terms.push({ label: 'Deliver to', value: ws.company.address })

  const doc: RfqDoc = {
    vendor,
    company: { name: ws.company.name, lines: companyLines },
    no: rfq.no,
    raisedOn: dmy(rfq.raisedOn),
    item: item?.name ?? '—',
    spec: rfq.note ?? '',
    qty: `${rfq.qty}${item ? ` ${item.uom}` : ''}`,
    neededBy: dmy(rfq.neededBy),
    terms,
    extras,
    contact: [ws.owner.name, ws.company.phone ?? ws.owner.contact].filter(Boolean).join(' · '),
    problems: [],
  }

  // every string that reaches the page, checked once, named where it came from
  const check: [string, string][] = [
    ['your company name', doc.company.name],
    ['your company details', doc.company.lines.join(' ')],
    ['the supplier name', vendor?.name ?? ''],
    ['the material', doc.item],
    ['the note', doc.spec],
    ['your contact line', doc.contact],
    ...doc.extras.map((e) => [e.label, e.value] as [string, string]),
  ]
  doc.problems = check
    .map(([where, text]) => ({ where, chars: undrawable(text) }))
    .filter((p) => p.chars.length > 0)

  return doc
}

/** One document per supplier asked, or a single unaddressed copy if none was. */
export function docsFor(ws: Workspace, rfq: Rfq, today: string): RfqDoc[] {
  const vendors = rfq.vendorIds
    .map((id) => ws.vendors.find((v) => v.id === id))
    .filter(Boolean) as Vendor[]
  if (vendors.length === 0) return [buildDoc(ws, rfq, null, today)]
  return vendors.map((v) => buildDoc(ws, rfq, v, today))
}

/* ------------------------------------------------------------- the paper -- */

const A4 = { w: 595.28, h: 841.89 }
const M = 48                 // margin
const RULE = '#d8dbe0'

/**
 * Draw it.
 *
 * jsPDF is imported here and only here, and the import is dynamic, so no other
 * route in the build carries a third of a megabyte it never uses.
 */
export async function renderPdf(doc: RfqDoc): Promise<Blob> {
  const { jsPDF } = await import('jspdf')
  const d = new jsPDF({ unit: 'pt', format: 'a4' })
  const right = A4.w - M
  let y = M + 8

  const text = (s: string, x: number, opts?: { size?: number; bold?: boolean; align?: 'left' | 'right'; grey?: boolean }) => {
    d.setFont('helvetica', opts?.bold ? 'bold' : 'normal')
    d.setFontSize(opts?.size ?? 10)
    d.setTextColor(opts?.grey ? 110 : 20)
    d.text(forPrint(s), x, y, { align: opts?.align ?? 'left' })
  }

  const rule = (gap = 10) => {
    y += gap
    d.setDrawColor(RULE)
    d.setLineWidth(0.7)
    d.line(M, y, right, y)
    y += gap + 4
  }

  /** wrapped body text that knows how tall it became */
  const paragraph = (s: string, x: number, width: number, size = 10) => {
    d.setFont('helvetica', 'normal')
    d.setFontSize(size)
    d.setTextColor(20)
    const lines = d.splitTextToSize(forPrint(s), width) as string[]
    for (const line of lines) {
      if (y > A4.h - M - 40) { d.addPage(); y = M }
      d.text(line, x, y)
      y += size + 3
    }
  }

  // ---- letterhead, and the title opposite it
  text(doc.company.name.toUpperCase(), M, { size: 15, bold: true })
  text('REQUEST FOR QUOTATION', right, { size: 12, bold: true, align: 'right' })
  y += 15
  for (const line of doc.company.lines) {
    text(line, M, { size: 9, grey: true })
    y += 11
  }
  // the number and date sit against the first two letterhead lines
  const back = y
  y = M + 8 + 15
  text(doc.no, right, { size: 11, bold: true, align: 'right' })
  y += 12
  text(`Raised ${doc.raisedOn}`, right, { size: 9, grey: true, align: 'right' })
  y = Math.max(back, y + 4)

  rule()

  // ---- who it is for
  if (doc.vendor) {
    text('To', M, { size: 9, grey: true })
    text(doc.vendor.name, M + 44, { size: 11, bold: true })
    y += 22
  }

  paragraph('We would like your best price and earliest delivery for the following.', M, right - M)
  y += 10

  // ---- the ask
  /*
   * Column edges, with the last one wide enough for a full date. Worth being
   * deliberate about: at the obvious widths "15 Oct 2026" wraps onto two lines
   * in the narrowest column, which reads as a mistake on a document going to
   * somebody else.
   */
  const col = [M, M + 180, M + 320, M + 420]
  const width = (i: number) => (i === col.length - 1 ? right - col[i] : col[i + 1] - col[i] - 14)

  d.setFillColor(246, 247, 249)
  d.rect(M, y - 11, right - M, 20, 'F')
  for (const [i, head] of ['Material', 'Specification', 'Quantity', 'Needed by'].entries()) {
    text(head, col[i], { size: 8.5, grey: true, bold: true })
  }
  y += 20

  const cellTop = y
  let deepest = y
  const cell = (s: string, i: number) => {
    y = cellTop
    paragraph(s || '-', col[i], width(i), 10)
    deepest = Math.max(deepest, y)
  }
  cell(doc.item, 0)
  cell(doc.spec, 1)
  cell(doc.qty, 2)
  cell(doc.neededBy, 3)
  y = deepest + 6

  // ---- anything the owner marked to print
  if (doc.extras.length > 0) {
    y += 4
    for (const e of doc.extras) {
      text(e.label, M, { size: 9, grey: true })
      paragraph(e.value, M + 120, right - M - 120, 10)
      y += 2
    }
  }

  rule(8)

  // ---- terms, two to a row
  for (let i = 0; i < doc.terms.length; i += 2) {
    const row = doc.terms.slice(i, i + 2)
    const top = y
    row.forEach((t, k) => {
      y = top
      const x = k === 0 ? M : M + 260
      text(t.label, x, { size: 9, grey: true })
      y += 12
      paragraph(t.value, x, 230, 10)
    })
    y = Math.max(y, top + 26)
  }

  rule(8)

  text(doc.contact, M, { size: 9.5 })
  y += 13
  /*
   * §11 on the paper itself. The system has never placed an order or contacted
   * a supplier, and the document somebody receives should say which of the two
   * things it is — a price enquiry is not a commitment to buy.
   */
  text('This is a request for prices. It is not a purchase order.', M, { size: 8.5, grey: true })

  return d.output('blob')
}

/** What the file is called when it lands in somebody's downloads. */
export const fileNameFor = (doc: RfqDoc): string => {
  const who = doc.vendor ? `-${doc.vendor.name.replace(/[^A-Za-z0-9]+/g, '-')}` : ''
  return `${doc.no}${who}.pdf`.replace(/-+/g, '-')
}
