/**
 * A request for quotation, as a piece of paper.
 *
 * One addressed copy per supplier, as separate files. That is not a detail: a
 * single document with four pages, shared to the first supplier, tells them you
 * also asked the other three. In a market where price is settled on a
 * relationship, that is a real commercial harm, and it would be caused by a
 * convenience nobody asked for.
 *
 * What a page is made of — the substitution table, the letterhead block, the
 * measuring — lives in `render.ts`, shared with the purchase order.
 */
import { fieldsFor, valueOf } from '@/lib/workspace/fields'
import type { Item, Vendor } from '@/lib/domain/types'
import type { Rfq, Workspace } from '@/lib/workspace/types'
import {
  MARGIN, addressee, dmy, fileName, head, letterhead, page, problemsIn,
  type DocLine, type Letterhead, type Problem,
} from './render'
import type { Sendable } from './share'

export { forPrint, undrawable } from './render'
export type { DocLine } from './render'

export interface RfqDoc {
  /** the supplier this copy is addressed to; null for an unaddressed copy */
  vendor: Vendor | null
  company: Letterhead
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
  problems: Problem[]
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

  const extras: DocLine[] = fieldsFor(ws, 'rfq')
    .filter((f) => f.onDoc)
    .map((f) => ({ label: f.label, value: valueOf(ws, rfq.id, f.id) }))
    .filter((l) => l.value !== '')

  const terms: DocLine[] = [
    { label: 'Please quote by', value: dmy(quoteByDate(rfq, today)) },
    { label: 'Quote against', value: rfq.no },
  ]
  if (ws.company.address) terms.push({ label: 'Deliver to', value: ws.company.address })

  const company = letterhead(ws.company)
  const doc: RfqDoc = {
    vendor,
    company,
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

  doc.problems = problemsIn([
    ['your company name', company.name],
    ['your company details', company.lines.join(' ')],
    ['the supplier name', vendor?.name ?? ''],
    ['the material', doc.item],
    ['the note', doc.spec],
    ['your contact line', doc.contact],
    ...doc.extras.map((e) => [e.label, e.value] as [string, string]),
  ])

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

export async function renderPdf(doc: RfqDoc): Promise<Blob> {
  const p = await page()
  head(p, doc.company, 'REQUEST FOR QUOTATION', doc.no, `Raised ${doc.raisedOn}`)
  p.rule()

  if (doc.vendor) addressee(p, doc.vendor.name, undefined)

  p.paragraph('We would like your best price and earliest delivery for the following.',
    MARGIN, p.right - MARGIN)
  p.y += 10

  /*
   * Column edges, with the last one wide enough for a full date. Worth being
   * deliberate about: at the obvious widths "15 Oct 2026" wraps onto two lines
   * in the narrowest column, which reads as a mistake on a document going to
   * somebody else.
   */
  const col = [MARGIN, MARGIN + 180, MARGIN + 320, MARGIN + 420]
  const width = (i: number) => (i === col.length - 1 ? p.right - col[i] : col[i + 1] - col[i] - 14)

  p.fill(MARGIN, p.right - MARGIN, 20)
  for (const [i, h] of ['Material', 'Specification', 'Quantity', 'Needed by'].entries()) {
    p.text(h, col[i], { size: 8.5, grey: true, bold: true })
  }
  p.y += 20

  const cellTop = p.y
  let deepest = p.y
  const cell = (s: string, i: number) => {
    p.y = cellTop
    p.paragraph(s || '-', col[i], width(i), 10)
    deepest = Math.max(deepest, p.y)
  }
  cell(doc.item, 0)
  cell(doc.spec, 1)
  cell(doc.qty, 2)
  cell(doc.neededBy, 3)
  p.y = deepest + 6

  if (doc.extras.length > 0) {
    p.y += 4
    for (const e of doc.extras) {
      p.text(e.label, MARGIN, { size: 9, grey: true })
      p.paragraph(e.value, MARGIN + 120, p.right - MARGIN - 120, 10)
      p.y += 2
    }
  }

  p.rule(8)

  // terms, two to a row
  for (let i = 0; i < doc.terms.length; i += 2) {
    const row = doc.terms.slice(i, i + 2)
    const top = p.y
    row.forEach((t, k) => {
      p.y = top
      const x = k === 0 ? MARGIN : MARGIN + 260
      p.text(t.label, x, { size: 9, grey: true })
      p.y += 12
      p.paragraph(t.value, x, 230, 10)
    })
    p.y = Math.max(p.y, top + 26)
  }

  p.rule(8)

  p.text(doc.contact, MARGIN, { size: 9.5 })
  p.y += 13
  /*
   * §11 on the paper itself. The system has never placed an order or contacted
   * a supplier, and the document somebody receives should say which of the two
   * things it is — a price enquiry is not a commitment to buy.
   */
  p.text('This is a request for prices. It is not a purchase order.', MARGIN, { size: 8.5, grey: true })

  return p.blob()
}

/** What the file is called when it lands in somebody's downloads. */
export const fileNameFor = (doc: RfqDoc): string => fileName(doc.no, doc.vendor?.name)

/* ----------------------------------------------------------- in words -- */

/**
 * The request as a message.
 *
 * On a phone the realistic outcome is that this gets sent and the PDF does
 * not, so it has to stand on its own: a supplier can quote from four lines
 * naming the material, the quantity and the date.
 */
export function messageFor(doc: RfqDoc): string {
  const lines = [
    `${doc.company.name} — request for quotation ${doc.no}`,
    '',
    `Material: ${doc.item}`,
    `Quantity: ${doc.qty}`,
    `Needed by: ${doc.neededBy}`,
  ]
  if (doc.spec) lines.push(`Spec: ${doc.spec}`)
  for (const e of doc.extras) lines.push(`${e.label}: ${e.value}`)
  const quoteBy = doc.terms.find((t) => t.label === 'Please quote by')
  if (quoteBy) lines.push('', `Please send your price and earliest delivery by ${quoteBy.value}.`)
  lines.push('', doc.contact)
  return lines.join('\n')
}

export const subjectFor = (doc: RfqDoc): string =>
  `Request for quotation ${doc.no} — ${doc.item}`

/** The document, as far as handing it over is concerned. */
export const sendableFor = (doc: RfqDoc): Sendable => ({
  vendor: doc.vendor,
  subject: subjectFor(doc),
  message: messageFor(doc),
})
