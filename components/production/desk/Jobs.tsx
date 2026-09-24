'use client'
import { useEffect, useState } from 'react'
import { ListPage } from '@/components/ui/ListPage'
import { DataTable, StatePill } from '@/components/ui/DataTable'
import { Icon } from '@/components/ui/icons'
import { Tabs } from '@/components/ui/Tabs'
import { DeskTools } from '@/components/sheet/DeskTools'
import { buildColumns, type DrawnColumn } from '@/components/sheet/columns'
import { ConfirmDelete } from '@/components/sourcing/ConfirmDelete'
import { useWorkspace } from '@/components/workspace/store'
import { IssueForm, ReturnForm, WasteForm } from '@/components/inventory/desk/IssueDialogs'
import { SendOutForm } from '@/components/inventory/desk/JobworkDialogs'
import { addDays } from '@/lib/domain/calc'
import { num, shortDate } from '@/lib/domain/format'
import { closeJob, jobProblemToRemove, jobWordCap, removeJob, reopenJob } from '@/lib/workspace/jobs'
import { outputRows, removeOutput, removeOutputProblem, type OutputRow } from '@/lib/workspace/output'
import {
  PLAN_STATE_TONE, PLAN_STATE_WORD, floorOf, isWorkingDay, jobPlanRows, type JobPlanRow, type PlanState,
} from '@/lib/workspace/plan'
import { madeForText } from '@/lib/workspace/sales'
import type { Job } from '@/lib/workspace/types'
import { JobCard, JobForm, type CardAct } from './JobDialogs'
import { OutputForm, PlanForm } from './PlanDialogs'

type View = 'jobs' | 'log' | 'days'

function Count({ n }: { n: number }) {
  return n > 0 ? <span className="mono rounded-full bg-surface-3 px-1.5 text-[10.5px] leading-[17px] text-ink-3">{n}</span> : null
}

const pct = (v: number | null) => (v === null ? '—' : `${num(v, 1)}%`)

/**
 * One home for a job card: opened here, planned here, and from its card
 * material goes to the floor or out on a challan — the slip and the challan
 * land in the store's lists.
 *
 * Every style with the sales order it is for, its quantity, its dates and
 * its pace, and what has been booked against it: made, rejected, right first
 * time, and how far ahead or behind the target to date it is. The output log
 * is every booking; by day is the floor's own week, target against what came
 * off. A sales order, a dashboard card or a figure lands on one card with
 * ?card=<id>.
 */
export function Jobs() {
  const { workspace, update, today } = useWorkspace()
  const [view, setView] = useState<View>('jobs')
  const [card, setCard] = useState<string | null>(null)
  // the card a form was opened from, to come back to when the form closes
  const [returnTo, setReturnTo] = useState<string | null>(null)
  const [pendingNo, setPendingNo] = useState<string | null>(null)
  const [opening, setOpening] = useState<Job | null | undefined>(undefined)
  const [planning, setPlanning] = useState<string | null | undefined>(undefined)
  const [booking, setBooking] = useState<{ jobId?: string } | null>(null)
  const [issuing, setIssuing] = useState<{ jobId: string; itemId?: string } | null>(null)
  const [returning, setReturning] = useState<{ jobId: string } | null>(null)
  const [wasting, setWasting] = useState<{ jobId: string } | null>(null)
  const [sending, setSending] = useState<{ jobId: string } | null>(null)
  const [deletingJob, setDeletingJob] = useState<JobPlanRow | null>(null)
  const [deleting, setDeleting] = useState<OutputRow | null>(null)

  useEffect(() => {
    // a sales order line, a dashboard card or a figure links here with ?card=<job>
    const id = new URLSearchParams(window.location.search).get('card')
    if (id) setCard(id)
  }, [])

  useEffect(() => {
    // a job card just opened is shown as soon as it exists
    if (!pendingNo || !workspace) return
    const made = (workspace.jobs ?? []).find((j) => j.no === pendingNo)
    if (made) { setCard(made.id); setPendingNo(null) }
  }, [pendingNo, workspace])

  if (!workspace) return null
  const ws = workspace
  const word = jobWordCap(ws)
  const rows = jobPlanRows(ws, today)
  const log = outputRows(ws)
  const floor = floorOf(ws)

  // the card steps aside for a form, and comes back when the form closes
  const leave = (id: string) => { setCard(null); setReturnTo(id) }
  const back = () => { if (returnTo) { setCard(returnTo); setReturnTo(null) } }
  const act = (kind: CardAct, id: string, itemId?: string) => {
    if (kind === 'close') { update((w) => closeJob(w, id, today)); return }
    if (kind === 'reopen') { update((w) => reopenJob(w, id)); return }
    leave(id)
    if (kind === 'edit') setOpening((ws.jobs ?? []).find((j) => j.id === id) ?? null)
    else if (kind === 'plan') setPlanning(id)
    else if (kind === 'output') setBooking({ jobId: id })
    else if (kind === 'issue') setIssuing({ jobId: id, itemId })
    else if (kind === 'return') setReturning({ jobId: id })
    else if (kind === 'waste') setWasting({ jobId: id })
    else if (kind === 'sendout') setSending({ jobId: id })
  }

  const logDrawn: Record<string, DrawnColumn<OutputRow>> = {
    on: { cell: (r) => shortDate(r.output.on), text: (r) => r.output.on },
    job: { cell: (r) => <span className="mono text-[12px]">{r.job?.no ?? '—'}</span>, text: (r) => r.job?.no ?? '' },
    product: { cell: (r) => <span className="font-medium text-ink">{r.product?.name ?? '—'}</span>, text: (r) => r.product?.name ?? '' },
    good: { align: 'right', cell: (r) => <span className="text-good">{r.output.good}</span>, text: (r) => String(r.output.good) },
    rejected: {
      align: 'right',
      cell: (r) => (r.output.rejected ? <span className="text-critical">{r.output.rejected}</span> : <span className="text-ink-4">—</span>),
      text: (r) => String(r.output.rejected),
    },
    reason: { cell: (r) => <span className="text-ink-2">{r.output.reason ?? ''}</span>, text: (r) => r.output.reason ?? '' },
    actor: { cell: (r) => r.output.actor || <span className="text-ink-4">—</span>, text: (r) => r.output.actor },
  }
  const logKit = buildColumns<OutputRow>(ws, 'output', (r) => r.output.id, logDrawn)

  // the floor's last fourteen days, working days only, oldest first
  const days = Array.from({ length: 14 }, (_, i) => addDays(today, i - 13)).filter((d) => isWorkingDay(d, floor))
  const dayRows = days.map((d) => {
    const target = (ws.jobs ?? []).filter((j) => j.productId && j.plannedStart && j.plannedFinish
      && j.plannedStart <= d && j.plannedFinish >= d && (!j.closedOn || j.closedOn >= d))
      .reduce((a, j) => a + (j.perDay ?? 0), 0)
    const booked = (ws.outputs ?? []).filter((o) => o.on === d)
    return {
      day: d,
      target,
      good: booked.reduce((a, o) => a + o.good, 0),
      rejected: booked.reduce((a, o) => a + o.rejected, 0),
      any: booked.length > 0,
    }
  })
  const most = Math.max(1, ...dayRows.map((d) => Math.max(d.target, d.good + d.rejected)))

  return (
    <>
      <ListPage
        title={word.many} noun={word.one.toLowerCase()} rows={rows}
        search={(r) => `${r.job.no} ${r.job.name ?? ''} ${r.product?.name ?? ''} ${madeForText(ws, r.job)} ${PLAN_STATE_WORD[r.state]}`}
        filter={{
          label: 'Every state',
          options: (Object.keys(PLAN_STATE_WORD) as PlanState[])
            .filter((s) => rows.some((r) => r.state === s))
            .map((s) => ({ value: s, label: PLAN_STATE_WORD[s] })),
          of: (r) => r.state,
        }}
        action={{ label: `Open a ${word.one.toLowerCase()}`, icon: 'plus', onClick: () => setOpening(null) }}
        tools={
          <>
            <button type="button" onClick={() => setBooking({})}
              className="press inline-flex items-center gap-1.5 rounded-lg border border-line bg-surface px-3 py-2 text-[13px] font-medium hover:bg-surface-2">
              <Icon name="check" className="size-3.5" /> Book output
            </button>
            {view === 'log' && <DeskTools entity="output" noun="booking" title="Output log" rows={() => logKit.toRows(log)} />}
          </>
        }
        empty={{
          line: `No ${word.one.toLowerCase()} yet. Open one — for a sales order or for stock — plan it, and issue its material from its card.`,
          cta: `Open a ${word.one.toLowerCase()}`,
        }}>
        {(shown) => {
          const ids = new Set(shown.map((r) => r.job.id))
          const shownLog = log.filter((r) => ids.has(r.output.jobId))
          return (
            <div className="space-y-3">
              <Tabs<View> label={`${word.many}, output log or by day`} value={view} onChange={setView}
                items={[
                  { id: 'jobs', label: word.many, badge: <Count n={shown.filter((r) => r.state === 'behind' || r.state === 'late').length} /> },
                  { id: 'log', label: 'Output log', badge: <Count n={shownLog.length} /> },
                  { id: 'days', label: 'By day' },
                ]} />

              {view === 'jobs' && (
                <DataTable rows={shown} keyOf={(r) => r.job.id}
                  columns={[
                    {
                      key: 'no', head: word.one,
                      cell: (r) => (
                        <span className="min-w-0">
                          <span className="mono block whitespace-nowrap font-semibold text-ink">{r.job.no}</span>
                          <span className="block text-[11.5px] text-ink-3">{r.product?.name ?? 'no product yet'}</span>
                        </span>
                      ),
                    },
                    {
                      key: 'for', head: 'For sales order',
                      cell: (r) => {
                        const t = madeForText(ws, r.job)
                        return t ? <span className="text-ink-2">{t}</span> : <span className="text-ink-4">For stock</span>
                      },
                    },
                    { key: 'qty', head: 'Planned', align: 'right', cell: (r) => (r.planned ? num(r.job.qty!, 0) : '—') },
                    {
                      key: 'dates', head: 'When',
                      cell: (r) => (r.planned ? (
                        <span className="whitespace-nowrap text-ink-2">
                          {shortDate(r.job.plannedStart!)} – {shortDate(r.job.plannedFinish!)}
                          <span className="block text-[11.5px] text-ink-3">{num(r.job.perDay ?? 0, 0)} a day</span>
                        </span>
                      ) : '—'),
                    },
                    {
                      key: 'made', head: 'Made', align: 'right',
                      cell: (r) => (
                        <span>
                          <strong className="text-ink">{r.made}</strong>
                          {r.rejected > 0 && <span className="block whitespace-nowrap text-[11.5px] text-critical">{r.rejected} rejected</span>}
                        </span>
                      ),
                    },
                    { key: 'first', head: 'Right first time', align: 'right', cell: (r) => pct(r.firstPass) },
                    { key: 'att', head: 'Of plan', align: 'right', cell: (r) => pct(r.attainment) },
                    {
                      key: 'vs', head: 'Against target', align: 'right',
                      cell: (r) => (!r.planned || r.target === 0 ? <span className="text-ink-4">—</span>
                        : r.vsTarget < 0 ? <span className="text-critical">{r.vsTarget}</span>
                          : <span className="text-good">+{r.vsTarget}</span>),
                    },
                    { key: 'state', head: 'State', cell: (r) => <StatePill label={PLAN_STATE_WORD[r.state]} tone={PLAN_STATE_TONE[r.state]} /> },
                  ]}
                  extra={{
                    icon: 'doc',
                    label: (r) => `${word.one} card ${r.job.no}`,
                    onClick: (r) => setCard(r.job.id),
                  }}
                  extra2={{
                    icon: 'plus',
                    label: (r) => (r.planned && !r.job.closedOn ? `Book output on ${r.job.no}` : 'Nothing to book'),
                    onClick: (r) => { if (r.planned && !r.job.closedOn) setBooking({ jobId: r.job.id }) },
                  }}
                  onEdit={(r) => { if (!r.job.closedOn) setPlanning(r.job.id) }}
                  editLabel={(r) => (r.planned ? `Re-plan ${r.job.no}` : `Plan ${r.job.no}`)}
                  onDelete={(r) => setDeletingJob(r)}
                  deleteLabel={(r) => `Delete ${r.job.no}`} />
              )}

              {view === 'log' && (shownLog.length === 0
                ? <p className="rounded-xl border border-line bg-surface px-6 py-10 text-center text-[13px] text-ink-2">
                  Nothing booked yet. Book what comes off a {word.one.toLowerCase()} each day; the good pieces go into finished stock.
                </p>
                : <DataTable columns={logKit.columns} rows={shownLog} keyOf={(r) => r.output.id}
                  onDelete={(r) => setDeleting(r)}
                  deleteLabel={(r) => `Take back the booking on ${r.job?.no ?? ''} for ${shortDate(r.output.on)}`} />)}

              {view === 'days' && (
                <div className="rounded-xl border border-line bg-surface p-4">
                  <p className="mb-3 text-[12px] text-ink-3">
                    The last two weeks’ working days: the day’s target — the pace of every job planned to run that day — against what came off.
                    A day with nothing booked shows as nothing booked, not as nought made.
                  </p>
                  <ul className="space-y-1.5">
                    {dayRows.map((d) => (
                      <li key={d.day} className="grid grid-cols-[5.5rem_minmax(0,1fr)_7.5rem] items-center gap-3 text-[12.5px]">
                        <span className="text-ink-2">{shortDate(d.day)}</span>
                        <span className="relative block h-3 rounded-full bg-surface-3" aria-hidden>
                          {d.target > 0 && (
                            <span className="absolute inset-y-0 left-0 rounded-full border border-dashed border-ink-3"
                              style={{ width: `${(d.target / most) * 100}%` }} />
                          )}
                          <span className="absolute inset-y-0 left-0 rounded-full bg-good" style={{ width: `${(d.good / most) * 100}%` }} />
                          <span className="absolute inset-y-0 rounded-full bg-critical"
                            style={{ left: `${(d.good / most) * 100}%`, width: `${(d.rejected / most) * 100}%` }} />
                        </span>
                        <span className="num text-right text-ink">
                          {d.any ? <>{d.good}{d.rejected ? <span className="text-critical"> +{d.rejected}</span> : null}</> : <span className="text-ink-4">nothing booked</span>}
                          <span className="text-ink-3"> / {d.target}</span>
                        </span>
                      </li>
                    ))}
                  </ul>
                  <p className="mt-3 text-[11.5px] text-ink-3">Green is good pieces, red rejected, the dashed line the day’s target.</p>
                </div>
              )}
            </div>
          )
        }}
      </ListPage>

      <JobCard jobId={card} onClose={() => setCard(null)} onAct={act} />
      <JobForm job={opening} onSaved={(no) => setPendingNo(no)} onClose={() => { setOpening(undefined); back() }} />
      <PlanForm jobId={planning} onClose={() => { setPlanning(undefined); back() }} />
      <OutputForm open={booking !== null} preset={booking ?? undefined} onClose={() => { setBooking(null); back() }} />
      <IssueForm open={issuing !== null} preset={issuing ?? undefined} onClose={() => { setIssuing(null); back() }} />
      <ReturnForm open={returning !== null} preset={returning ?? undefined} onClose={() => { setReturning(null); back() }} />
      <WasteForm open={wasting !== null} preset={wasting ?? undefined} onClose={() => { setWasting(null); back() }} />
      <SendOutForm open={sending !== null} preset={sending ?? undefined} onClose={() => { setSending(null); back() }} />
      <ConfirmDelete
        open={deletingJob !== null}
        what={deletingJob ? `${word.one.toLowerCase()} ${deletingJob.job.no}` : ''}
        impact={{ clean: true, losses: [] }}
        blocked={deletingJob ? jobProblemToRemove(ws, deletingJob.job.id) : null}
        onClose={() => setDeletingJob(null)}
        onConfirm={() => { if (deletingJob) update((w) => removeJob(w, deletingJob.job.id)) }}
      />
      <ConfirmDelete
        open={deleting !== null}
        what={deleting ? `the booking on ${deleting.job?.no ?? ''}` : ''}
        impact={{
          clean: false,
          losses: deleting && deleting.output.good > 0 ? [`${deleting.output.good} good pieces come off finished stock`] : [],
        }}
        blocked={deleting ? removeOutputProblem(ws, deleting.output.id) : null}
        onClose={() => setDeleting(null)}
        onConfirm={() => { if (deleting) update((w) => removeOutput(w, deleting.output.id)) }}
      />
    </>
  )
}
