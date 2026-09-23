/**
 * A delivery challan, as a piece of paper.
 *
 * What left the bay against which order, for whom and to where, on whose
 * authority and with which carrier — the page that travels with the goods and
 * that the customer's store signs. Under it, the values the accounts package
 * needs to raise the tax invoice and the e-way bill: the taxable value at the
 * order's rates, the place of supply, whether the supply is inside the state
 * or across it, and whether the value crosses the e-way bill threshold. The
 * invoice itself is raised there, not here.
 *
 * One note, one file. It hands you the file and the words; it does not send.
 */
import { money, num } from '@/lib/domain/format'
import { CARRIER_MODE } from '@/lib/workspace/customers'
import { handoff, type Handoff } from '@/lib/workspace/dispatch-notes'
import { consignmentOf } from '@/lib/workspace/consignments'
import type { Workspace } from '@/lib/workspace/types'
import { UOM_LABEL } from '@/lib/workspace/defaults'
import {
  MARGIN, addressee, dmy, fileName, head, letterhead, page, problemsIn,
  type Letterhead, type Problem,
} from './render'
import type { Sendable } from './share'

export interface DeliveryLine {
  product: string
  code: string
  hsn: string
  qty: string
  rate: string
  value: string
}

export interface DeliveryDoc {
  no: string
  on: string
  company: Letterhead
  customer: { name: string; gstin?: string; state?: string; shipTo?: string }
  order: string
  lines: DeliveryLine[]
  totalQty: string
  weight?: string
  carrier?: string
  docket?: string
  expected?: string
  authorisedBy: string
  note?: string
  handoff: Handoff
  /** the hand-off values, in words, as they are printed and sent */
  handoffLines: string[]
  problems: Problem[]
}

const SUPPLY: Record<'intra' | 'inter', string> = {
  intra: 'Inside the state (CGST + SGST)',
  inter: 'Across states (IGST)',
}

export function handoffLines(h: Handoff): string[] {
  return [
    `Taxable value ${h.taxable > 0 ? money(h.taxable) : 'not known — the order carries no rate'}`,
    `Place of supply ${h.placeOfSupply ?? 'not known — put in the customer’s GSTIN or state'}`,
    h.supply ? SUPPLY[h.supply] : `Supply type not known — ${h.from ? 'the customer’s state is missing' : 'set your own state in the dispatch rules'}`,
    h.ewayNeeded === null ? 'E-way bill: no value to judge it by'
      : h.ewayNeeded ? `E-way bill needed — the value is at or over ${money(h.threshold)}`
        : `No e-way bill needed — under ${money(h.threshold)}`,
  ]
}

export function buildDelivery(ws: Workspace, noteId: string): DeliveryDoc | null {
  const note = (ws.dispatchNotes ?? []).find((n) => n.id === noteId)
  if (!note) return null
  const order = (ws.customerOrders ?? []).find((o) => o.id === note.orderId)
  const customer = (ws.customers ?? []).find((c) => c.id === note.customerId)
  const consignment = consignmentOf(ws, note.id)
  const carrier = consignment ? (ws.carriers ?? []).find((c) => c.id === consignment.carrierId) : undefined
  const h = handoff(ws, note.id)
  const lines: DeliveryLine[] = note.lines.map((l) => {
    const p = (ws.products ?? []).find((x) => x.id === l.productId)
    const rate = order?.lines.find((x) => x.productId === l.productId)?.rate ?? 0
    const unit = p ? UOM_LABEL[p.uom].toLowerCase() : ''
    return {
      product: p?.name ?? 'Unknown product',
      code: p?.code ?? '',
      hsn: p?.hsn ?? '',
      qty: `${num(l.qty, 0)} ${unit}`.trim(),
      rate: rate > 0 ? money(rate, rate < 100 ? 2 : 0) : '—',
      value: rate > 0 ? money(l.qty * rate) : '—',
    }
  })
  const units = note.lines.reduce((a, l) => a + l.qty, 0)
  const doc: DeliveryDoc = {
    no: note.no,
    on: dmy(note.on),
    company: letterhead(ws.company),
    customer: {
      name: customer?.name ?? 'Unknown customer',
      gstin: customer?.gstin, state: h.placeOfSupply, shipTo: customer?.shipTo,
    },
    order: order ? `${order.no}, taken ${dmy(order.takenOn)}` : 'an order no longer on the book',
    lines,
    totalQty: num(units, 0),
    weight: note.weightKg ? `${num(note.weightKg, 1)} kg` : undefined,
    carrier: carrier ? `${carrier.name}${carrier.mode !== 'other' ? ` (${CARRIER_MODE[carrier.mode].toLowerCase()})` : ''}` : undefined,
    docket: consignment?.lrNo,
    expected: consignment ? dmy(consignment.promisedDate) : undefined,
    authorisedBy: note.authorisedBy,
    note: note.note,
    handoff: h,
    handoffLines: handoffLines(h),
    problems: [],
  }
  doc.problems = problemsIn([
    ['your company name', doc.company.name],
    ['your company details', doc.company.lines.join(' ')],
    ['the customer', doc.customer.name],
    ['the ship-to address', doc.customer.shipTo ?? ''],
    ['a product name', doc.lines.map((l) => l.product).join(' ')],
    ['the carrier', doc.carrier ?? ''],
    ['who authorised it', doc.authorisedBy],
    ['the note', doc.note ?? ''],
  ])
  return doc
}

export async function renderDelivery(doc: DeliveryDoc): Promise<Blob> {
  const p = await page()
  head(p, doc.company, 'DELIVERY CHALLAN', doc.no, doc.on)
  p.rule()

  addressee(p, doc.customer.name, doc.customer.shipTo)
  const id = [doc.customer.gstin ? `GSTIN ${doc.customer.gstin}` : '', doc.customer.state ?? ''].filter(Boolean).join(' · ')
  if (id) { p.text(id, MARGIN + 44, { size: 9, grey: true }); p.y += 14 }
  p.text('Against', MARGIN, { size: 9, grey: true })
  p.text(`Order ${doc.order}`, MARGIN + 44, { size: 10 })
  p.y += 8
  p.rule(6)

  /** right edges of the quantity and rate columns; the value is flush right */
  const X = { hsn: MARGIN + 200, qty: MARGIN + 310, rate: MARGIN + 395 }
  p.fill(MARGIN, p.right - MARGIN, 20)
  p.text('Product', MARGIN, { size: 8.5, grey: true, bold: true })
  p.text('HSN', X.hsn, { size: 8.5, grey: true, bold: true })
  p.text('Quantity', X.qty, { size: 8.5, grey: true, bold: true, align: 'right' })
  p.text('Rate', X.rate, { size: 8.5, grey: true, bold: true, align: 'right' })
  p.text('Value', p.right, { size: 8.5, grey: true, bold: true, align: 'right' })
  p.y += 20
  for (const l of doc.lines) {
    p.text(l.code ? `${l.product} · ${l.code}` : l.product, MARGIN)
    p.text(l.hsn || '—', X.hsn)
    p.text(l.qty, X.qty, { align: 'right' })
    p.text(l.rate, X.rate, { align: 'right' })
    p.text(l.value, p.right, { align: 'right' })
    p.y += 15
  }
  p.rule(4)
  p.text('Total pieces', MARGIN, { bold: true })
  p.text(doc.totalQty, X.qty, { bold: true, align: 'right' })
  if (doc.handoff.taxable > 0) p.text(money(doc.handoff.taxable), p.right, { bold: true, align: 'right' })
  p.y += 6
  p.rule(6)

  const pairs: [string, string][] = [
    ['Weight', doc.weight ?? '—'],
    ['Carrier', doc.carrier ?? 'not booked yet'],
    ['Docket', doc.docket ?? '—'],
    ['Expected by', doc.expected ?? '—'],
  ]
  for (const [k, v] of pairs) {
    p.text(k, MARGIN, { size: 9, grey: true })
    p.text(v, MARGIN + 80, { size: 10 })
    p.y += 13
  }

  p.rule(6)
  p.text('For the tax invoice and the e-way bill', MARGIN, { size: 9, grey: true, bold: true })
  p.y += 13
  for (const line of doc.handoffLines) {
    p.text(line, MARGIN, { size: 9.5 })
    p.y += 12
  }
  p.text('Not a tax invoice. The invoice is raised in your accounts package from these values.', MARGIN, { size: 8.5, grey: true })
  p.y += 6

  if (doc.note) {
    p.rule(6)
    p.text('Note', MARGIN, { size: 9, grey: true })
    p.y += 12
    p.paragraph(doc.note, MARGIN, p.right - MARGIN, 10)
  }

  p.rule(8)
  p.text('Authorised by', MARGIN, { size: 9, grey: true })
  p.text('Received in good condition by', MARGIN + 260, { size: 9, grey: true })
  p.y += 12
  p.text(doc.authorisedBy, MARGIN)
  p.y += 34
  p.text('Signature', MARGIN, { size: 8.5, grey: true })
  p.text('Signature and stamp', MARGIN + 260, { size: 8.5, grey: true })

  return p.blob()
}

export const deliveryFileName = (doc: DeliveryDoc): string => fileName(doc.no, doc.customer.name)

/** The challan in words, the hand-off values last. */
export function deliveryMessageFor(doc: DeliveryDoc): string {
  return [
    `${doc.company.name} — delivery challan ${doc.no}, ${doc.on}`,
    '',
    `To ${doc.customer.name}${doc.customer.shipTo ? `, ${doc.customer.shipTo}` : ''}`,
    `Against order ${doc.order}`,
    ...doc.lines.map((l) => `  ${l.product} · ${l.qty}${l.value !== '—' ? ` · ${l.value}` : ''}`),
    doc.weight ? `Weight ${doc.weight}` : '',
    doc.carrier ? `With ${doc.carrier}${doc.docket ? `, docket ${doc.docket}` : ''}${doc.expected ? `, expected by ${doc.expected}` : ''}` : '',
    '',
    ...doc.handoffLines,
    '',
    `Authorised by ${doc.authorisedBy}`,
  ].filter((l, i, all) => l !== '' || (all[i - 1] ?? '') !== '').join('\n')
}

export const deliverySendableFor = (doc: DeliveryDoc): Sendable => ({
  vendor: { name: doc.customer.name },
  subject: `Delivery challan ${doc.no} — ${doc.order.split(',')[0]}`,
  message: deliveryMessageFor(doc),
})
