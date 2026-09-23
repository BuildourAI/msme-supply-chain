/**
 * An issue slip, as a piece of paper.
 *
 * What left the store, for which job, off which lots and racks, and who took
 * it — or, for a return, what came back and where it went. It is the page
 * the cutting master signs for, and the one the store files. Nobody outside
 * the company is sent it, so it has no addressee: it is printed, downloaded
 * or copied into a message a person sends to their own floor.
 */
import { num } from '@/lib/domain/format'
import { jobWordCap } from '@/lib/workspace/jobs'
import type { Workspace } from '@/lib/workspace/types'
import {
  MARGIN, dmy, fileName, head, letterhead, page, problemsIn, type Letterhead, type Problem,
} from './render'
import type { Sendable } from './share'

export interface IssueDoc {
  no: string
  kind: 'issue' | 'return'
  company: Letterhead
  /** "Style ST-4521 — Slim-fit jeans" */
  job: string
  material: string
  unit: string
  lines: { batch: string; rack: string; qty: string }[]
  total: string
  on: string
  /** who took it from the store, or brought it back */
  takenBy: string
  /** who wrote the slip */
  issuedBy: string
  remnant: boolean
  note?: string
  problems: Problem[]
}

export function buildIssueSlip(ws: Workspace, slipId: string): IssueDoc | null {
  const slip = (ws.issues ?? []).find((s) => s.id === slipId)
  if (!slip) return null
  const job = (ws.jobs ?? []).find((j) => j.id === slip.jobId)
  const itemId = slip.lines[0]?.itemId
  const item = ws.items.find((i) => i.id === itemId)
  const uom = item?.uom ?? ''
  const word = jobWordCap(ws).one
  const lotOf = (id: string) => ws.stockLots.find((l) => l.id === id)
  const rackName = (id?: string) => (id ? (ws.racks ?? []).find((r) => r.id === id)?.name : undefined) ?? '—'
  const total = slip.lines.reduce((a, l) => a + l.qty, 0)
  const doc: IssueDoc = {
    no: slip.no,
    kind: slip.kind,
    company: letterhead(ws.company),
    job: job ? `${word} ${job.no}${job.name ? ` — ${job.name}` : ''}` : word,
    material: item?.name ?? 'Unknown material',
    unit: uom,
    lines: slip.lines.map((l) => ({
      batch: lotOf(l.lotId)?.batchNo ?? l.lotId,
      rack: rackName(lotOf(l.lotId)?.rack),
      qty: `${num(l.qty, 3)} ${uom}`.trim(),
    })),
    total: `${num(total, 3)} ${uom}`.trim(),
    on: dmy(slip.on),
    takenBy: slip.takenBy,
    issuedBy: slip.actor,
    remnant: slip.kind === 'return' && slip.lines.some((l) => lotOf(l.lotId)?.remnant),
    note: slip.note,
    problems: [],
  }
  doc.problems = problemsIn([
    ['your company name', doc.company.name],
    ['your company details', doc.company.lines.join(' ')],
    ['the job', doc.job],
    ['the material', doc.material],
    ['who took it', doc.takenBy],
    ['the note', doc.note ?? ''],
  ])
  return doc
}

export async function renderIssueSlip(doc: IssueDoc): Promise<Blob> {
  const p = await page()
  head(p, doc.company, doc.kind === 'issue' ? 'ISSUE SLIP' : 'RETURN TO STORE', doc.no, doc.on)
  p.rule()

  p.text(doc.kind === 'issue' ? 'For' : 'Back from', MARGIN, { size: 9, grey: true })
  p.text(doc.job, MARGIN + 60, { size: 11, bold: true })
  p.y += 14
  p.text('Material', MARGIN, { size: 9, grey: true })
  p.text(doc.material, MARGIN + 60, { size: 11 })
  p.y += 10
  p.rule(6)

  p.fill(MARGIN, p.right - MARGIN, 20)
  p.text(doc.kind === 'issue' ? 'Off lot' : doc.remnant ? 'Into remnant' : 'Onto lot', MARGIN, { size: 8.5, grey: true, bold: true })
  p.text('Rack', MARGIN + 260, { size: 8.5, grey: true, bold: true })
  p.text('Quantity', p.right, { size: 8.5, grey: true, bold: true, align: 'right' })
  p.y += 20
  for (const l of doc.lines) {
    p.text(l.batch, MARGIN)
    p.text(l.rack, MARGIN + 260)
    p.text(l.qty, p.right, { align: 'right' })
    p.y += 15
  }
  p.rule(4)
  p.text('Total', MARGIN, { bold: true })
  p.text(doc.total, p.right, { bold: true, align: 'right' })
  p.y += 6

  if (doc.note) {
    p.rule(6)
    p.text('Note', MARGIN, { size: 9, grey: true })
    p.y += 12
    p.paragraph(doc.note, MARGIN, p.right - MARGIN, 10)
  }

  p.rule(8)
  p.text(doc.kind === 'issue' ? 'Taken by' : 'Brought back by', MARGIN, { size: 9, grey: true })
  p.text('Written by', MARGIN + 260, { size: 9, grey: true })
  p.y += 12
  p.text(doc.takenBy, MARGIN)
  p.text(doc.issuedBy, MARGIN + 260)
  p.y += 34
  p.text('Signature', MARGIN, { size: 8.5, grey: true })
  p.text('Signature', MARGIN + 260, { size: 8.5, grey: true })

  return p.blob()
}

export const issueFileName = (doc: IssueDoc): string => fileName(doc.no, doc.job.split(' — ')[0])

/** The slip in words, for pasting into a message to the floor. */
export function issueMessageFor(doc: IssueDoc): string {
  return [
    `${doc.company.name} — ${doc.kind === 'issue' ? 'issue slip' : 'return to store'} ${doc.no}, ${doc.on}`,
    '',
    `${doc.kind === 'issue' ? 'For' : 'Back from'} ${doc.job}`,
    `${doc.material}: ${doc.total}`,
    ...doc.lines.map((l) => `  ${l.batch}${l.rack !== '—' ? ` (${l.rack})` : ''} · ${l.qty}`),
    '',
    `${doc.kind === 'issue' ? 'Taken by' : 'Brought back by'} ${doc.takenBy}`,
  ].join('\n')
}

export const issueSendableFor = (doc: IssueDoc): Sendable => ({
  vendor: null,
  subject: `${doc.kind === 'issue' ? 'Issue slip' : 'Return'} ${doc.no} — ${doc.job}`,
  message: issueMessageFor(doc),
})
