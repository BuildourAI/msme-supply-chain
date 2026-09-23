/**
 * A goods receipt note, as a piece of paper.
 *
 * The gate's record of what came off the lorry and what became of it: how
 * much arrived, how much was accepted, how much was rejected and why — every
 * check with its reading and its result. It is the page a supplier is handed
 * when part of their delivery is turned back, and the basis of whatever
 * conversation follows. (A debit note is that conversation's next step; this
 * build holds no invoices, so it stops at the record.)
 *
 * Only a CLOSED receipt has one. An open receipt has no verdict to print, and
 * a page that said "received, inspection pending" would be read as passed.
 *
 * One receipt, one file — the same rule as every document here. And §11 holds:
 * it hands you the file and the message. It does not send.
 */
import { num } from '@/lib/domain/format'
import type { CheckOutcome, Vendor } from '@/lib/domain/types'
import { KIND_LABEL, checksFor } from '@/lib/workspace/checks'
import type { Workspace } from '@/lib/workspace/types'
import {
  MARGIN, addressee, dmy, fileName, head, letterhead, page, problemsIn,
  type Letterhead, type Problem,
} from './render'
import type { Sendable } from './share'

export interface GrnCheckRow {
  label: string
  how: string
  /** what it had to be — "1.15 – 1.25 mm", "present" */
  spec: string
  /** what it was — the reading, or blank for a mark */
  reading: string
  result: 'Pass' | 'Fail' | 'Not marked'
}

export interface GrnDoc {
  no: string
  company: Letterhead
  /** the supplier, or the jobworker a return came back from */
  vendor: Vendor | null
  vendorAddress?: string
  /** "Order PO-1", "Challan JW-1" */
  against: string
  material: string
  unit: string
  receivedOn: string
  closedOn: string
  received: string
  accepted: string
  rejected: string
  checks: GrnCheckRow[]
  /** why what was rejected was rejected — the failed check's reason, or the inspector's */
  rejectedBecause?: string
  /** why a failed check was let through, when it was */
  deviation?: string
  /** no checks were written for this material; it was received unchecked */
  unchecked: boolean
  inspector: string
  note?: string
  contact: string
  problems: Problem[]
}

const RESULT: Record<CheckOutcome, GrnCheckRow['result']> = {
  pass: 'Pass', fail: 'Fail', not_checked: 'Not marked',
}

export function buildGrn(ws: Workspace, receiptId: string): GrnDoc | null {
  const r = (ws.receipts ?? []).find((x) => x.id === receiptId)
  if (!r || r.status === 'open') return null

  const item = ws.items.find((i) => i.id === r.itemId)
  const vendor = ws.vendors.find((v) => v.id === r.vendorId) ?? null
  const order = r.orderId ? ws.orders.find((o) => o.id === r.orderId) : undefined
  const challan = r.challanId ? (ws.challans ?? []).find((c) => c.id === r.challanId) : undefined
  const uom = item?.uom ?? ''
  const company = letterhead(ws.company)

  /*
   * The checks as they were marked on the day. A check written since is not
   * on this receipt's page, and one taken off the list since still is, from
   * its result — the page is a record of that inspection, not of today's list.
   */
  const now = checksFor(ws, r.itemId)
  const marked = (r.results ?? []).map((res) => ({ res, check: now.find((c) => c.id === res.checkId) }))
  const unmarked = now.filter((c) => !(r.results ?? []).some((res) => res.checkId === c.id))
  const checks: GrnCheckRow[] = [
    ...marked.filter((m) => m.check).map(({ res, check }) => {
      const c = check!
      const band = c.kind !== 'measure' ? (c.kind === 'document' ? 'present' : 'acceptable')
        : c.min != null && c.max != null ? `${num(c.min, 3)} – ${num(c.max, 3)} ${c.unit ?? ''}`
          : c.min != null ? `at least ${num(c.min, 3)} ${c.unit ?? ''}` : `at most ${num(c.max!, 3)} ${c.unit ?? ''}`
      return {
        label: c.label,
        how: KIND_LABEL[c.kind],
        spec: band.trim(),
        reading: res.measured != null ? `${num(res.measured, 3)} ${c.unit ?? ''}`.trim() : '',
        result: RESULT[res.outcome],
      }
    }),
    // a check that was optional and left unmarked still belongs on the page
    ...unmarked.filter((c) => !c.mandatory && r.closedAt).map((c) => ({
      label: c.label, how: KIND_LABEL[c.kind], spec: '', reading: '', result: 'Not marked' as const,
    })),
  ]

  const lot = ws.stockLots.find((l) => l.id === `LOT-${r.id}-NU`)
  const doc: GrnDoc = {
    no: r.id,
    company,
    vendor,
    vendorAddress: vendor ? ws.vendorContact[vendor.id]?.address : undefined,
    against: order ? `Order ${order.no}` : challan ? `Challan ${challan.no}` : '—',
    material: item?.name ?? 'Unknown material',
    unit: uom,
    receivedOn: dmy(r.receivedOn),
    closedOn: dmy(r.closedAt ?? r.receivedOn),
    received: `${num(r.qty, 3)} ${uom}`.trim(),
    accepted: `${num(r.accepted, 3)} ${uom}`.trim(),
    rejected: `${num(r.rejected, 3)} ${uom}`.trim(),
    checks,
    rejectedBecause: r.rejected > 0 ? (lot?.usabilityReason ?? r.rejectReason) : undefined,
    deviation: r.deviationReason,
    unchecked: Boolean(r.noSpec),
    inspector: r.inspector && r.inspector !== 'unchecked' ? r.inspector : 'received without inspection',
    note: r.note,
    contact: [ws.owner.name, ws.company.phone ?? ws.owner.contact].filter(Boolean).join(' · '),
    problems: [],
  }
  doc.problems = problemsIn([
    ['your company name', company.name],
    ['your company details', company.lines.join(' ')],
    ['the supplier name', vendor?.name ?? ''],
    ['the material', doc.material],
    ['the note', doc.note ?? ''],
    ['the rejection reason', doc.rejectedBecause ?? ''],
    ['the deviation reason', doc.deviation ?? ''],
    ...checks.map((c) => [`the check ${c.label}`, `${c.label} ${c.spec} ${c.reading}`] as [string, string]),
  ])
  return doc
}

/* ------------------------------------------------------------- the paper -- */

export async function renderGrn(doc: GrnDoc): Promise<Blob> {
  const p = await page()
  head(p, doc.company, 'GOODS RECEIPT NOTE', doc.no, `Received ${doc.receivedOn}`)
  p.rule()

  if (doc.vendor) addressee(p, doc.vendor.name, doc.vendorAddress)

  // what arrived, as one line of five figures
  const cols = [
    { head: 'Material', x: MARGIN },
    { head: 'Against', x: MARGIN + 210 },
    { head: 'Received', x: MARGIN + 330, right: true },
    { head: 'Accepted', x: MARGIN + 415, right: true },
    { head: 'Rejected', x: p.right, right: true },
  ]
  p.fill(MARGIN, p.right - MARGIN, 20)
  for (const c of cols) p.text(c.head, c.x, { size: 8.5, grey: true, bold: true, align: c.right ? 'right' : 'left' })
  p.y += 20
  const top = p.y
  p.paragraph(doc.material, MARGIN, 200, 10)
  const deepest = p.y
  p.y = top
  p.text(doc.against, MARGIN + 210)
  p.text(doc.received, MARGIN + 330, { align: 'right' })
  p.text(doc.accepted, MARGIN + 415, { align: 'right' })
  p.text(doc.rejected, p.right, { align: 'right', bold: doc.rejected.startsWith('0') === false })
  p.y = Math.max(deepest, top + 14)

  p.rule(8)

  if (doc.unchecked) {
    p.paragraph('No checks were written for this material. It was received unchecked.', MARGIN, p.right - MARGIN, 10)
    p.y += 4
  } else if (doc.checks.length > 0) {
    p.text('Inspection', MARGIN, { size: 10, bold: true })
    p.y += 14
    p.fill(MARGIN, p.right - MARGIN, 20)
    p.text('Check', MARGIN, { size: 8.5, grey: true, bold: true })
    p.text('How', MARGIN + 180, { size: 8.5, grey: true, bold: true })
    p.text('Required', MARGIN + 260, { size: 8.5, grey: true, bold: true })
    p.text('Found', MARGIN + 390, { size: 8.5, grey: true, bold: true })
    p.text('Result', p.right, { size: 8.5, grey: true, bold: true, align: 'right' })
    p.y += 20
    for (const c of doc.checks) {
      const t = p.y
      p.paragraph(c.label, MARGIN, 170, 10)
      const d = p.y
      p.y = t
      p.text(c.how, MARGIN + 180, { size: 9.5 })
      p.text(c.spec, MARGIN + 260, { size: 9.5 })
      p.text(c.reading, MARGIN + 390, { size: 9.5 })
      p.text(c.result, p.right, { align: 'right', bold: c.result === 'Fail' })
      p.y = Math.max(d, t + 14)
    }
    p.y += 4
  }

  if (doc.rejectedBecause) {
    p.rule(6)
    p.text('Rejected because', MARGIN, { size: 9, grey: true })
    p.y += 12
    p.paragraph(doc.rejectedBecause, MARGIN, p.right - MARGIN, 10)
  }
  if (doc.deviation) {
    p.rule(6)
    p.text('Accepted despite a failed check, because', MARGIN, { size: 9, grey: true })
    p.y += 12
    p.paragraph(doc.deviation, MARGIN, p.right - MARGIN, 10)
  }
  if (doc.note) {
    p.rule(6)
    p.text('Noted at the gate', MARGIN, { size: 9, grey: true })
    p.y += 12
    p.paragraph(doc.note, MARGIN, p.right - MARGIN, 10)
  }

  p.rule(8)
  p.text('Inspected by', MARGIN, { size: 9, grey: true })
  p.text('Closed on', MARGIN + 260, { size: 9, grey: true })
  p.y += 12
  p.text(doc.inspector, MARGIN)
  p.text(doc.closedOn, MARGIN + 260)
  p.y += 6

  p.rule(8)
  p.text(doc.contact, MARGIN, { size: 9.5 })
  p.y += 13
  p.text(`For ${doc.company.name}`, MARGIN, { size: 8.5, grey: true })

  return p.blob()
}

export const grnFileName = (doc: GrnDoc): string => fileName(`GRN-${doc.no}`, doc.vendor?.name)

/* ----------------------------------------------------------- in words -- */

/**
 * The receipt in words, for the message a phone will actually send. A
 * supplier can act on these few lines without opening anything.
 */
export function grnMessageFor(doc: GrnDoc): string {
  const lines = [
    `${doc.company.name} — goods receipt ${doc.no}`,
    '',
    `${doc.material}, received ${doc.receivedOn}${doc.against !== '—' ? ` against ${doc.against.toLowerCase()}` : ''}`,
    `Received ${doc.received} · accepted ${doc.accepted} · rejected ${doc.rejected}`,
  ]
  if (doc.rejectedBecause) lines.push(`Rejected because: ${doc.rejectedBecause}`)
  const failed = doc.checks.filter((c) => c.result === 'Fail')
  if (failed.length > 0) {
    lines.push(`Failed: ${failed.map((c) => `${c.label}${c.reading ? ` ${c.reading}` : ''}${c.spec ? ` (needed ${c.spec})` : ''}`).join('; ')}`)
  }
  if (doc.deviation) lines.push(`Accepted as it stands: ${doc.deviation}`)
  lines.push('', `Inspected by ${doc.inspector}, ${doc.closedOn}`, doc.contact)
  return lines.join('\n')
}

export const grnSendableFor = (doc: GrnDoc): Sendable => ({
  vendor: doc.vendor,
  subject: `Goods receipt ${doc.no} — ${doc.material}`,
  message: grnMessageFor(doc),
})
