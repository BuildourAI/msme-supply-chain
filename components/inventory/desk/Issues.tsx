'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { ListPage } from '@/components/ui/ListPage'
import { DataTable, StatePill, Tag } from '@/components/ui/DataTable'
import { Tabs } from '@/components/ui/Tabs'
import { DeskTools } from '@/components/sheet/DeskTools'
import { buildColumns, type DrawnColumn } from '@/components/sheet/columns'
import { ConfirmDelete } from '@/components/sourcing/ConfirmDelete'
import { useWorkspace } from '@/components/workspace/store'
import { money, num, shortDate } from '@/lib/domain/format'
import {
  jobRows, jobWordCap, removeSlip, removeSlipProblem, slipRows, type JobRow, type SlipRow,
} from '@/lib/workspace/jobs'
import { madeForText } from '@/lib/workspace/sales'
import { IssueDocument, IssueForm, JobSheet, ReturnForm, WasteForm } from './IssueDialogs'

type View = 'jobs' | 'slips'

function Count({ n }: { n: number }) {
  return n > 0 ? <span className="mono rounded-full bg-surface-3 px-1.5 text-[10.5px] leading-[17px] text-ink-3">{n}</span> : null
}

/**
 * Issued to floor: what left the store for your own floor, and for what.
 *
 * Named for where the material went, like Sent for jobwork beside it on the
 * rail — material sent to somebody else's floor on a challan. A style or job
 * card is opened in Production; here is what the store issued against it.
 * Two views: each job card with what it has used, and every slip that moved
 * material, out or back. A slip is the only way material leaves the store
 * for the floor, so a job's consumption here is a sum of slips rather than a
 * figure somebody keeps — and the store never invents a job card, so when
 * none is open the screen says where one is opened.
 */
export function Issues() {
  const { workspace, update } = useWorkspace()
  const router = useRouter()
  const [view, setView] = useState<View>('jobs')
  const [issuing, setIssuing] = useState<{ jobId?: string } | null>(null)
  const [returning, setReturning] = useState<{ jobId?: string } | null>(null)
  const [wasting, setWasting] = useState<{ jobId?: string } | null>(null)
  const [sheet, setSheet] = useState<string | null>(null)
  const [paper, setPaper] = useState<string | null>(null)
  const [deletingSlip, setDeletingSlip] = useState<SlipRow | null>(null)

  if (!workspace) return null
  const ws = workspace
  const word = jobWordCap(ws)
  const jobs = jobRows(ws)
  const slips = slipRows(ws)

  const jobDrawn: Record<string, DrawnColumn<JobRow>> = {
    no: { cell: (r) => <span className="mono font-semibold text-ink">{r.job.no}</span>, text: (r) => r.job.no },
    name: { cell: (r) => <span className="text-ink">{r.job.name ?? ''}</span>, text: (r) => r.job.name ?? '' },
    customer: {
      cell: (r) => <span className="text-ink-2">{madeForText(ws, r.job)}</span>,
      text: (r) => madeForText(ws, r.job),
    },
    opened: { cell: (r) => shortDate(r.job.openedOn), text: (r) => r.job.openedOn },
    state: {
      cell: (r) => (r.open ? <StatePill label="Open" tone="info" />
        : <StatePill label={`Closed ${shortDate(r.job.closedOn!)}`} tone="neutral" />),
      text: (r) => (r.open ? 'Open' : `Closed ${r.job.closedOn}`),
    },
    materials: {
      cell: (r) => (r.materials.length === 0 ? <span className="text-ink-4">nothing yet</span>
        : (
          <span className="block text-[12.5px] leading-snug">
            {r.materials.map((m) => (
              <span key={m.itemId} className="block">
                <span className="text-ink">{m.name}</span>{' '}
                <span className="num text-ink-2">{num(m.used, 3)} {m.uom}</span>
                {m.returned > 0 && <span className="text-ink-3"> · {num(m.returned, 3)} back</span>}
              </span>
            ))}
          </span>
        )),
      text: (r) => r.materials.map((m) => `${m.name} ${m.used} ${m.uom}`).join('; '),
    },
    consumption: {
      align: 'right',
      cell: (r) => (r.consumption > 0 ? money(r.consumption) : <span className="text-ink-4">—</span>),
      text: (r) => String(r.consumption),
    },
    wasted: {
      align: 'right',
      cell: (r) => (r.materials.some((m) => m.wasted > 0)
        ? <span className="text-critical">{r.materials.filter((m) => m.wasted > 0).map((m) => `${num(m.wasted, 3)} ${m.uom}`).join(', ')}</span>
        : <span className="text-ink-4">—</span>),
      text: (r) => r.materials.filter((m) => m.wasted > 0).map((m) => `${m.wasted} ${m.uom}`).join('; '),
    },
  }
  const jobKit = buildColumns<JobRow>(ws, 'job', (r) => r.job.id, jobDrawn)

  const slipDrawn: Record<string, DrawnColumn<SlipRow>> = {
    no: { cell: (r) => <span className="mono font-semibold text-ink">{r.slip.no}</span>, text: (r) => r.slip.no },
    on: { cell: (r) => shortDate(r.slip.on), text: (r) => r.slip.on },
    kind: {
      cell: (r) => (r.slip.kind === 'issue' ? <StatePill label="Issued" tone="info" />
        : <StatePill label={r.remnant ? 'Back as remnant' : 'Back'} tone="good" />),
      text: (r) => (r.slip.kind === 'issue' ? 'Issued' : 'Back'),
    },
    job: { cell: (r) => <span className="mono text-[12px]">{r.job?.no ?? '—'}</span>, text: (r) => r.job?.no ?? '' },
    item: { cell: (r) => <span className="font-medium text-ink">{r.item}</span>, text: (r) => r.item },
    qty: {
      align: 'right',
      cell: (r) => <span className={r.slip.kind === 'issue' ? 'text-ink' : 'text-good'}>{num(r.qty, 3)} <span className="text-ink-3">{r.uom}</span></span>,
      text: (r) => String(r.qty),
    },
    lots: {
      cell: (r) => (
        <span className="inline-flex flex-wrap gap-1">
          {r.lots.map((l, i) => <Tag key={i}>{l.batch}{l.rack ? ` · ${l.rack}` : ''}</Tag>)}
        </span>
      ),
      text: (r) => r.lots.map((l) => `${l.batch}${l.rack ? ` (${l.rack})` : ''} ${l.qty}`).join('; '),
    },
    takenBy: { cell: (r) => r.slip.takenBy || <span className="text-ink-4">—</span>, text: (r) => r.slip.takenBy },
  }
  const slipKit = buildColumns<SlipRow>(ws, 'issue', (r) => r.slip.id, slipDrawn)

  return (
    <>
      <ListPage
        title="Issued to floor" noun={word.one.toLowerCase()} rows={jobs}
        search={(r) => `${r.job.no} ${r.job.name ?? ''} ${madeForText(ws, r.job)} ${r.materials.map((m) => m.name).join(' ')} ${jobKit.searchText(r)}`}
        filter={{
          label: 'Open and closed',
          options: [{ value: 'open', label: 'Open' }, { value: 'closed', label: 'Closed' }],
          of: (r) => (r.open ? 'open' : 'closed'),
        }}
        action={{ label: 'Issue material', icon: 'arrow-right', onClick: () => setIssuing({}) }}
        tools={
          <DeskTools entity={view === 'jobs' ? 'job' : 'issue'} noun={view === 'jobs' ? word.one.toLowerCase() : 'slip'}
            title={view === 'jobs' ? word.many : 'Issue slips'}
            rows={() => (view === 'jobs' ? jobKit.toRows(jobs) : slipKit.toRows(slips))} />
        }
        empty={{
          // nothing to issue against yet: the job card is opened on the floor, never here
          line: ws.jobNumbering
            ? `No ${word.one.toLowerCase()} yet. Open one on Production › ${word.many}, then issue material against it — every metre that leaves the store is then somebody’s.`
            : 'Production sets up its job numbers and opens the first style or job card; material is issued against it here, and every issue slip names one.',
          second: { label: 'Open one on Production', onClick: () => router.push('/production/jobs') },
        }}>
        {(shown) => {
          const ids = new Set(shown.map((r) => r.job.id))
          const shownSlips = slips.filter((s) => ids.has(s.slip.jobId))
          return (
            <div className="space-y-3">
              <div className="flex flex-wrap items-end gap-x-3 gap-y-2">
                <Tabs<View> label={`${word.many} or slips`} value={view} onChange={setView} className="mb-0 flex-1"
                  items={[
                    { id: 'jobs', label: word.many, badge: <Count n={shown.filter((r) => r.open).length} /> },
                    { id: 'slips', label: 'Issue slips', badge: <Count n={shownSlips.length} /> },
                  ]} />
                <span className="mb-2 flex gap-1.5">
                  <button type="button" onClick={() => setReturning({})}
                    className="press rounded-lg border border-line bg-surface px-2.5 py-1.5 text-[12.5px] font-medium hover:bg-surface-2">
                    Return slip
                  </button>
                  <button type="button" onClick={() => setWasting({})}
                    className="press rounded-lg border border-line bg-surface px-2.5 py-1.5 text-[12.5px] font-medium hover:bg-surface-2">
                    Record wastage
                  </button>
                </span>
              </div>

              {view === 'jobs' ? (
                <DataTable
                  columns={jobKit.columns} rows={shown} keyOf={(r) => r.job.id}
                  extra={{ icon: 'doc', label: (r) => `${word.one} sheet for ${r.job.no}`, onClick: (r) => setSheet(r.job.id) }}
                  extra2={{
                    icon: 'arrow-right',
                    label: (r) => (r.open ? `Issue material for ${r.job.no}` : `${r.job.no} is closed`),
                    onClick: (r) => { if (r.open) setIssuing({ jobId: r.job.id }) },
                  }}
                />
              ) : shownSlips.length === 0 ? (
                <p className="rounded-xl border border-line bg-surface px-6 py-10 text-center text-[13px] text-ink-2">
                  No slips yet. Issue material and the slip is written here, with the lots and racks it came off.
                </p>
              ) : (
                <DataTable
                  columns={slipKit.columns} rows={shownSlips} keyOf={(r) => r.slip.id}
                  extra={{ icon: 'doc', label: (r) => `The slip ${r.slip.no}`, onClick: (r) => setPaper(r.slip.id) }}
                  onDelete={(r) => setDeletingSlip(r)}
                  deleteLabel={(r) => `Take back ${r.slip.no}`}
                />
              )}
            </div>
          )
        }}
      </ListPage>

      <IssueForm open={issuing !== null} preset={issuing ?? undefined} onClose={() => setIssuing(null)} />
      <ReturnForm open={returning !== null} preset={returning ?? undefined} onClose={() => setReturning(null)} />
      <WasteForm open={wasting !== null} preset={wasting ?? undefined} onClose={() => setWasting(null)} />
      <JobSheet jobId={sheet} onClose={() => setSheet(null)} />
      <IssueDocument slipId={paper} onClose={() => setPaper(null)} />
      <ConfirmDelete
        open={deletingSlip !== null}
        what={deletingSlip?.slip.no ?? ''}
        impact={{
          clean: false,
          losses: deletingSlip ? [deletingSlip.slip.kind === 'issue'
            ? `${num(deletingSlip.qty, 3)} ${deletingSlip.uom} goes back onto the lots it came off`
            : `${num(deletingSlip.qty, 3)} ${deletingSlip.uom} comes off the store again`] : [],
        }}
        blocked={deletingSlip ? removeSlipProblem(ws, deletingSlip.slip.id) : null}
        onClose={() => setDeletingSlip(null)}
        onConfirm={() => { if (deletingSlip) update((w) => removeSlip(w, deletingSlip.slip.id)) }}
      />
    </>
  )
}
