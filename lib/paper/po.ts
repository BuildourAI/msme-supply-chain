/**
 * A purchase order, as a piece of paper.
 *
 * The document is the point. An order that exists only in this app is not an
 * order — the supplier needs something with your GSTIN on it, the rate you
 * agreed, the quantity and the date you expect it. Until now the build could
 * record an order and not put it on paper, which is a notebook with extra
 * steps.
 *
 * One document per supplier, many lines, exactly as an order book works: the
 * lines you placed with one supplier in one go share a number and print as one
 * page. The same file-per-supplier rule as the request carries over and matters
 * more here, not less — an order naming four suppliers, shared to the first,
 * tells them who else you buy from.
 *
 * And §11 holds on this one too. It hands you the file. It does not send.
 */
import { money, num } from '@/lib/domain/format'
import { fieldsFor, valueOf } from '@/lib/workspace/fields'
import type { Vendor } from '@/lib/domain/types'
import { latestOf } from '@/lib/workspace/orders'
import type { PurchaseOrder, Workspace } from '@/lib/workspace/types'
import {
  MARGIN, addressee, dmy, fileName, head, letterhead, page, problemsIn,
  type DocLine, type Letterhead, type Problem,
} from './render'
import type { Sendable } from './share'

export interface PoRow {
  material: string
  qty: string
  /** its own column, the way every Indian quotation sets one */
  unit: string
  rate: string
  amount: string
  /** the amount as a figure, so the total is summed rather than re-derived */
  value: number
}

export interface PoDoc {
  vendor: Vendor | null
  /** where to send it, when the owner has recorded one */
  vendorAddress?: string
  company: Letterhead
  no: string
  orderedOn: string
  expectedOn: string
  rows: PoRow[]
  total: string
  terms: DocLine[]
  extras: DocLine[]
  contact: string
  problems: Problem[]
  /** materials on it that have no quantity — it is not ready to hand over */
  blanks: string[]
  /**
   * What changed since the supplier last confirmed, when anything has. The
   * revised order IS the change notice: sending it tells the supplier, and
   * the page says plainly what moved and why, so nobody has to spot it.
   */
  revision?: { version: number; changes: string[]; reason: string }
}

/** Every line of one order — the rows sharing a number, in the order placed. */
export const linesOf = (ws: Workspace, no: string): PurchaseOrder[] =>
  ws.orders.filter((o) => o.no === no)

/**
 * The order somebody pressed the button on, as a document.
 *
 * Built from the number rather than from one row, because the number is what
 * makes several lines one order. Cancelled lines are left off: a supplier
 * should not be handed a page with a line on it you have called off.
 */
export function buildPo(ws: Workspace, no: string): PoDoc | null {
  const lines = linesOf(ws, no).filter((o) => o.state !== 'cancelled')
  if (lines.length === 0) return null

  const first = lines[0]
  const vendor = ws.vendors.find((v) => v.id === first.vendorId) ?? null
  const company = letterhead(ws.company)

  const rows: PoRow[] = lines.map((o) => {
    const item = ws.items.find((i) => i.id === o.itemId)
    const value = Math.round(o.qty * o.unitPrice * 100) / 100
    /*
     * Bare figures, with the currency named once in the column head. That is
     * how Indian business paper sets a table, and it is also the difference
     * between a column of numbers and a column of strings — "Rs.61,400.00" in
     * every cell reads as noise and parses as nothing.
     */
    return {
      material: item?.name ?? '—',
      qty: num(o.qty, 3),
      unit: item?.uom ?? '',
      rate: num(o.unitPrice, 2),
      amount: num(value, 2),
      value,
    }
  })

  const total = rows.reduce((a, r) => a + r.value, 0)

  /*
   * The latest date on the order, not the first. A page headed with the
   * earliest of three expected dates promises the supplier something the other
   * two lines were never going to meet.
   */
  const expected = lines.reduce((a, o) => (o.expectedOn > a ? o.expectedOn : a), lines[0].expectedOn)

  const terms: DocLine[] = []
  if (vendor) {
    terms.push({
      label: 'Payment',
      value: vendor.paymentTermsDays > 0
        ? `${vendor.paymentTermsDays} days from invoice`
        : 'Against delivery',
    })
  }
  terms.push({ label: 'Delivery by', value: dmy(expected) })
  if (ws.company.address) terms.push({ label: 'Deliver to', value: ws.company.address })
  if (ws.company.gstin) terms.push({ label: 'Our GSTIN', value: ws.company.gstin })

  /*
   * Columns the owner marked for the document. Taken off the FIRST line,
   * because a custom field on an order is nearly always something about the
   * order — a project number, a works reference — rather than about one
   * material on it.
   */
  const extras: DocLine[] = fieldsFor(ws, 'order')
    .filter((f) => f.onDoc)
    .map((f) => ({ label: f.label, value: valueOf(ws, first.id, f.id) }))
    .filter((l) => l.value !== '')

  const doc: PoDoc = {
    vendor,
    vendorAddress: vendor ? ws.vendorContact[vendor.id]?.address : undefined,
    company,
    no,
    orderedOn: dmy(first.orderedOn),
    expectedOn: dmy(expected),
    rows,
    total: money(total),
    terms,
    extras,
    contact: [ws.owner.name, ws.company.phone ?? ws.owner.contact].filter(Boolean).join(' · '),
    problems: [],
    blanks: [],
  }

  /*
   * Lines changed since the supplier confirmed. Compared against the
   * CONFIRMED version, not the previous one — two changes in a week are one
   * change as far as the supplier is concerned, from what they agreed to what
   * we now want.
   */
  const changed = lines.filter((o) => {
    const latest = latestOf(o)
    return latest && (o.ackedVersion ?? 1) < latest.version
  })
  if (changed.length > 0) {
    const item = (o: PurchaseOrder) => ws.items.find((i) => i.id === o.itemId)
    doc.revision = {
      version: Math.max(...changed.map((o) => latestOf(o)!.version)),
      changes: changed.map((o) => {
        const was = o.revisions!.find((r) => r.version === (o.ackedVersion ?? 1)) ?? o.revisions![0]
        const now = latestOf(o)!
        const uom = item(o)?.uom ?? ''
        const parts: string[] = []
        if (was.qty !== now.qty) parts.push(`${num(was.qty, 3)} ${uom} -> ${num(now.qty, 3)} ${uom}`)
        if (was.promisedDate !== now.promisedDate) parts.push(`by ${dmy(was.promisedDate)} -> ${dmy(now.promisedDate)}`)
        return `${item(o)?.name ?? 'a line'}: ${parts.join(', ')}`
      }),
      reason: [...new Set(changed.map((o) => latestOf(o)!.reason))].join('; '),
    }
  }

  doc.problems = problemsIn([
    ['your company name', company.name],
    ['your company details', company.lines.join(' ')],
    ['the supplier name', vendor?.name ?? ''],
    ['the supplier address', doc.vendorAddress ?? ''],
    ['your contact line', doc.contact],
    ...rows.map((r, i) => [`line ${i + 1}`, r.material] as [string, string]),
    ...extras.map((e) => [e.label, e.value] as [string, string]),
  ])

  /*
   * Lines nobody has put a quantity on. Kept apart from `problems`, which is
   * about characters the page cannot draw — the two read nothing like each
   * other and sharing a panel would produce "line 1 contains no quantity".
   */
  doc.blanks = lines
    .map((o, i) => (o.qty > 0 ? '' : rows[i].material))
    .filter(Boolean)

  return doc
}

/* ------------------------------------------------------------- the paper -- */

export async function renderPo(doc: PoDoc): Promise<Blob> {
  const p = await page()
  head(p, doc.company, doc.revision ? 'REVISED PURCHASE ORDER' : 'PURCHASE ORDER',
    doc.revision ? `${doc.no} (rev. ${doc.revision.version})` : doc.no, `Dated ${doc.orderedOn}`)
  p.rule()

  if (doc.vendor) addressee(p, doc.vendor.name, doc.vendorAddress)

  if (doc.revision) {
    /*
     * The change first, above the table, because it is the reason this page
     * exists. A supplier who files a revised order under the old one without
     * reading it makes the old quantity.
     */
    p.text('This order has changed since you confirmed it', MARGIN, { bold: true })
    p.y += 14
    for (const c of doc.revision.changes) {
      p.paragraph(c, MARGIN + 12, p.right - MARGIN - 12, 10)
    }
    p.paragraph(`Why: ${doc.revision.reason}`, MARGIN + 12, p.right - MARGIN - 12, 9.5)
    p.y += 4
    p.paragraph('Please confirm you have this and are making to the revised figures.', MARGIN, p.right - MARGIN, 10)
    p.y += 10
  } else {
    p.paragraph('Please supply the following against this order.', MARGIN, p.right - MARGIN)
    p.y += 10
  }

  /*
   * Material, quantity, unit, rate, amount — the order every Indian quotation
   * sets a table in, and the one this build's own reader is tuned for. The
   * unit has a column of its own rather than riding along in the quantity
   * cell: "12 MT" in one cell is a string, "12" and "MT" in two is a figure
   * and its unit, and a system at the other end can do something with it.
   *
   * The three figure columns are right-aligned to fixed edges, so a
   * seven-figure amount lines its digits up with a five-figure one instead of
   * running into the column beside it.
   */
  const nameAt = MARGIN
  const qtyAt = MARGIN + 284
  // far enough from the quantity that a reader treats them as two cells: at
  // twelve points apart "12" and "MT" join back into one, which is what the
  // unit column was split out to stop
  const unitAt = MARGIN + 312
  const rateAt = MARGIN + 424
  const amountAt = p.right
  const wide = qtyAt - nameAt - 60

  p.fill(MARGIN, p.right - MARGIN, 20)
  p.text('Material', nameAt, { size: 8.5, grey: true, bold: true })
  p.text('Quantity', qtyAt, { size: 8.5, grey: true, bold: true, align: 'right' })
  p.text('Unit', unitAt, { size: 8.5, grey: true, bold: true })
  p.text('Rate (Rs.)', rateAt, { size: 8.5, grey: true, bold: true, align: 'right' })
  p.text('Amount (Rs.)', amountAt, { size: 8.5, grey: true, bold: true, align: 'right' })
  p.y += 20

  for (const r of doc.rows) {
    const top = p.y
    p.paragraph(r.material, nameAt, wide, 10)
    const deepest = p.y
    p.y = top
    p.text(r.qty, qtyAt, { align: 'right' })
    p.text(r.unit, unitAt)
    p.text(r.rate, rateAt, { align: 'right' })
    p.text(r.amount, amountAt, { align: 'right' })
    p.y = Math.max(deepest, top + 14)
  }

  p.rule(6)
  p.text('Total', MARGIN, { bold: true })
  p.text(doc.total, p.right, { bold: true, align: 'right' })
  p.y += 6

  if (doc.extras.length > 0) {
    p.y += 6
    for (const e of doc.extras) {
      p.text(e.label, MARGIN, { size: 9, grey: true })
      p.paragraph(e.value, MARGIN + 120, p.right - MARGIN - 120, 10)
      p.y += 2
    }
  }

  p.rule(8)

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
  p.text(`For ${doc.company.name}`, MARGIN, { size: 8.5, grey: true })

  return p.blob()
}

export const poFileName = (doc: PoDoc): string => fileName(doc.no, doc.vendor?.name)

/* ----------------------------------------------------------- in words -- */

export function poMessageFor(doc: PoDoc): string {
  const lines = doc.revision ? [
    `${doc.company.name} — REVISED purchase order ${doc.no} (rev. ${doc.revision.version})`,
    '',
    'Changed since you confirmed it:',
    ...doc.revision.changes.map((c) => `• ${c.replace(/ -> /g, ' → ')}`),
    `Why: ${doc.revision.reason}`,
    'Please confirm you are making to the revised figures.',
    '',
  ] : [
    `${doc.company.name} — purchase order ${doc.no}`,
    '',
    ...doc.rows.map((r) => `${r.material} — ${r.qty} ${r.unit} @ ${r.rate} = ${r.amount}`),
    '',
    `Total: ${doc.total}`,
    `Delivery by: ${doc.expectedOn}`,
  ]
  for (const t of doc.terms) {
    if (t.label !== 'Delivery by') lines.push(`${t.label}: ${t.value}`)
  }
  lines.push('', doc.contact)
  return lines.join('\n')
}

export const poSubjectFor = (doc: PoDoc): string =>
  `${doc.revision ? 'Revised purchase order' : 'Purchase order'} ${doc.no}${
    doc.vendor ? ` — ${doc.company.name}` : ''}`

export const poSendableFor = (doc: PoDoc): Sendable => ({
  vendor: doc.vendor,
  subject: poSubjectFor(doc),
  message: poMessageFor(doc),
})
