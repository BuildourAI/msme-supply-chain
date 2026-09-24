'use client'
import { useEffect, useState } from 'react'
import { Dialog } from '@/components/ui/Dialog'
import { StatePill } from '@/components/ui/DataTable'
import { Field, Select, TextInput } from '@/components/ui/Field'
import { useWorkspace } from '@/components/workspace/store'
import { JobHistory, JobMaterials } from '@/components/inventory/desk/IssueDialogs'
import { statePill } from '@/components/inventory/desk/Jobwork'
import { longDate, num, shortDate } from '@/lib/domain/format'
import { challanRows } from '@/lib/workspace/inbound'
import { JOB_CARD, addJob, jobProblem, jobRows, nextJobNo, updateJob } from '@/lib/workspace/jobs'
import { jobworkers } from '@/lib/workspace/jobwork'
import { lineWatch } from '@/lib/workspace/linewatch'
import { PLAN_STATE_TONE, PLAN_STATE_WORD, jobPlanRow } from '@/lib/workspace/plan'
import { linesMadeOn, linkableLines, madeForProblem, madeForText, salesLineLabel, setMadeFor } from '@/lib/workspace/sales'
import type { Job } from '@/lib/workspace/types'
import { NeedsTable } from './PlanDialogs'

/*
 * The job card is the floor's planning record: opened here, for a sales
 * order or for stock, and everything that happens to it starts from its card.
 */

function Foot({ onClose, label, onSave }: { onClose: () => void; label: string; onSave: () => void }) {
  return (
    <footer className="flex items-center justify-end gap-2 border-t border-line-soft px-4 py-3">
      <button type="button" onClick={onClose}
        className="press rounded-lg px-2.5 py-2 text-[13px] text-ink-2 hover:text-ink">Cancel</button>
      <button type="button" onClick={onSave}
        className="press rounded-lg border border-accent-ink bg-accent-ink px-3.5 py-2 text-[13px] font-semibold text-on-accent hover:bg-accent">
        {label}
      </button>
    </footer>
  )
}

/** A job opened, or its details changed: its number, what it is, and the sales order line it is made for. */
export function JobForm({ job, onClose, onSaved }: {
  /** undefined is closed; null is a new one */
  job: Job | null | undefined
  onClose: () => void
  onSaved?: (no: string) => void
}) {
  const { workspace, update, today } = useWorkspace()
  const [no, setNo] = useState('')
  const [name, setName] = useState('')
  const [lineId, setLineId] = useState('')
  const [was, setWas] = useState<string | undefined>(undefined)
  const [tried, setTried] = useState(false)

  useEffect(() => {
    if (job === undefined || !workspace) return
    setNo(job?.no ?? nextJobNo(workspace)); setName(job?.name ?? '')
    // the line it is made for now, which a change here moves it off
    const on = job ? linesMadeOn(workspace, job.id)[0]?.line.id : undefined
    setLineId(on ?? ''); setWas(on)
    setTried(false)
  }, [job]) // eslint-disable-line react-hooks/exhaustive-deps

  if (job === undefined || !workspace) return null
  const word = JOB_CARD.one
  const lines = linkableLines(workspace, job?.id)
  const picked = lines.find((r) => r.line.id === lineId)
  const input = {
    no, name, openedOn: job?.openedOn ?? today,
    // kept for an old one whose customer was typed; a new one's is its sales order's
    customer: picked?.customer?.name ?? job?.customer,
  }
  const problem = jobProblem(workspace, input, job?.id) ?? madeForProblem(workspace, job?.id, lineId)

  const save = () => {
    setTried(true)
    if (problem) return
    update((w) => {
      if (job) return setMadeFor(updateJob(w, job.id, input), job.id, was, lineId)
      const [w1, id] = addJob(w, input)
      return id && lineId ? setMadeFor(w1, id, undefined, lineId) : w1
    })
    onSaved?.(no.trim())
    onClose()
  }

  return (
    <Dialog open onClose={onClose} title={job ? `${word} ${job.no}` : `Open a ${word.toLowerCase()}`}
      sub={job ? undefined : 'For a sales order, or for stock. Plan it and issue its material from its card.'}>
      <div className="space-y-3 px-4 py-4">
        <Field label={`${word} number`} htmlFor="jf-no" error={tried ? problem ?? undefined : undefined}>
          <TextInput id="jf-no" value={no} onChange={setNo} autoFocus onEnter={save} invalid={tried && !!problem} />
        </Field>
        <Field label="What it is" htmlFor="jf-name">
          <TextInput id="jf-name" value={name} onChange={setName} onEnter={save} placeholder="Slim-fit jeans, 14 oz indigo" />
        </Field>
        <Field label="For sales order" htmlFor="jf-for"
          hint={lines.length === 0 ? 'No open sales order line to make it for — it is made for stock.' : 'Blank is made for stock.'}>
          <Select id="jf-for" value={lineId} onChange={setLineId}
            options={[
              { value: '', label: 'For stock — no sales order' },
              ...lines.map((r) => ({ value: r.line.id, label: salesLineLabel(r) })),
            ]} />
        </Field>
        {!lineId && job?.customer && (
          <p className="text-[12px] text-ink-3">Typed before it could name a sales order: “{job.customer}”.</p>
        )}
      </div>
      <Foot onClose={onClose} onSave={save} label={job ? 'Save' : `Open the ${word.toLowerCase()}`} />
    </Dialog>
  )
}

/** What a person can start from the card. The screen closes the card, opens the form, and brings the card back after. */
export type CardAct = 'edit' | 'plan' | 'output' | 'issue' | 'return' | 'waste' | 'sendout' | 'close' | 'reopen' | 'slip' | 'takeback'

function Section({ title, actions, children }: { title: string; actions?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="space-y-2">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
        <h3 className="text-[11px] font-semibold uppercase tracking-[0.07em] text-ink-3">{title}</h3>
        {actions && <span className="ml-auto flex flex-wrap gap-1.5">{actions}</span>}
      </div>
      {children}
    </section>
  )
}

function Quiet({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  return (
    <button type="button" onClick={onClick}
      className="press rounded-md border border-line bg-surface px-2 py-1 text-[12px] font-medium hover:bg-surface-2">
      {children}
    </button>
  )
}

/**
 * The job card, whole: which sales order it is for, its plan and what has
 * come off it, what material has gone to it and what is still to come, what
 * is out at a jobworker, and every slip. This order → this card → material
 * here, material there → what came back — on one screen.
 *
 * The card never stacks on a form: a Dialog listens for Escape on its own,
 * so two open at once would both close on one press. The screen closes the
 * card, opens the form, and reopens the card when the form closes.
 */
export function JobCard({ jobId, onClose, onAct }: {
  jobId: string | null
  onClose: () => void
  /** the third argument is the material to issue, or the slip to open or take back */
  onAct: (kind: CardAct, jobId: string, ref?: string) => void
}) {
  const { workspace, today } = useWorkspace()
  if (!jobId || !workspace) return null
  const ws = workspace
  const job = (ws.jobs ?? []).find((j) => j.id === jobId)
  if (!job) return null
  const word = JOB_CARD.one
  const row = jobPlanRow(ws, job, today)
  const store = jobRows(ws).find((r) => r.job.id === jobId)
  // built from the planned, open jobs — a closed or unplanned one has no line to watch
  const watch = lineWatch(ws, today).find((w) => w.job.id === jobId)
  const challans = challanRows(ws, today).filter((r) => r.challan.jobId === jobId)
  const madeFor = madeForText(ws, job)
  const open = !job.closedOn
  const hasSlips = (store?.materials.length ?? 0) > 0
  const uom = row.product?.uom ?? ''
  const act = (kind: CardAct, ref?: string) => onAct(kind, jobId, ref)

  return (
    <Dialog open onClose={onClose} wide title={`${word} ${job.no}${job.name ? ` — ${job.name}` : ''}`}
      sub={`Opened ${longDate(job.openedOn)} · ${madeFor ? `for ${madeFor}` : 'for stock'}${job.closedOn ? ` · closed ${longDate(job.closedOn)}` : ''}`}>
      <div className="space-y-5 px-4 py-4" data-job-card={job.no}>
        <Section title="Plan" actions={open && (
          <>
            <Quiet onClick={() => act('plan')}>{row.planned ? 'Re-plan' : 'Plan it'}</Quiet>
            {row.planned && <Quiet onClick={() => act('output')}>Book output</Quiet>}
          </>
        )}>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[12.5px]">
            <StatePill label={PLAN_STATE_WORD[row.state]} tone={PLAN_STATE_TONE[row.state]} />
            {row.planned ? (
              <span className="text-ink-2">
                <strong className="text-ink">{row.product?.name ?? 'no product'}</strong> · {num(job.qty!, 0)} {uom} ·{' '}
                {shortDate(job.plannedStart!)} – {shortDate(job.plannedFinish!)} · {num(job.perDay ?? 0, 0)} a day
              </span>
            ) : (
              <span className="text-ink-2">No plan yet — say what it makes, how many and when. Line watch cannot judge it until then.</span>
            )}
          </div>
          {row.planned && (
            <p className="text-[12px] text-ink-3">
              <strong className="num text-ink">{row.made}</strong> made
              {row.rejected > 0 && <>, <span className="num text-critical">{row.rejected}</span> rejected</>}
              {row.target > 0 && <> · {row.target} due by today{row.vsTarget < 0 ? ` · ${-row.vsTarget} behind` : row.vsTarget > 0 ? ` · ${row.vsTarget} ahead` : ''}</>}
            </p>
          )}
        </Section>

        <Section title="Material" actions={open && (
          <>
            <Quiet onClick={() => act('issue')}>Issue material</Quiet>
            {hasSlips && <Quiet onClick={() => act('return')}>Return slip</Quiet>}
            {hasSlips && <Quiet onClick={() => act('waste')}>Record wastage</Quiet>}
          </>
        )}>
          {watch
            ? <NeedsTable needs={watch.needs} reasons={watch.reasons} onIssue={open ? (itemId) => act('issue', itemId) : undefined} />
            : <JobMaterials materials={store?.materials ?? []} word={word} />}
        </Section>

        <Section title="At jobworkers" actions={open && jobworkers(ws).length > 0 && (
          <Quiet onClick={() => act('sendout')}>Send for jobwork</Quiet>
        )}>
          {challans.length === 0 ? (
            <p className="text-[12.5px] text-ink-3">Nothing has gone out for it.</p>
          ) : (
            <ul className="space-y-1.5 text-[12.5px]" data-job-challans>
              {challans.map((r) => {
                const pill = statePill(r)
                const back = r.acct.returned.value + r.acct.inQc.value
                return (
                  <li key={r.challan.id} className="flex flex-wrap items-center gap-x-2 gap-y-1">
                    <span className="mono font-semibold text-ink">{r.challan.no}</span>
                    <span className="text-ink-2">
                      {r.vendor?.name ?? 'a jobworker'} · {num(r.challan.qtySent, 3)} {r.uom} of {r.item?.name ?? 'material'} out
                      {back > 0 ? ` · ${num(back, 3)} ${r.uom} back` : ''} · due {shortDate(r.challan.dueBack)}
                    </span>
                    <StatePill label={pill.label} tone={pill.tone} />
                  </li>
                )
              })}
            </ul>
          )}
        </Section>

        {hasSlips && (
          <Section title="Slips and cuts">
            <JobHistory jobId={jobId} onSlip={(id) => act('slip', id)} onTakeBack={(id) => act('takeback', id)} />
          </Section>
        )}
      </div>
      <footer className="flex flex-wrap items-center gap-2 border-t border-line-soft px-4 py-3">
        <Quiet onClick={() => act('edit')}>Edit</Quiet>
        <Quiet onClick={() => act(open ? 'close' : 'reopen')}>{open ? `Close the ${word.toLowerCase()}` : 'Reopen'}</Quiet>
        <button type="button" onClick={onClose}
          className="press ml-auto rounded-lg border border-accent-ink bg-accent-ink px-3.5 py-2 text-[13px] font-semibold text-on-accent hover:bg-accent">
          Done
        </button>
      </footer>
    </Dialog>
  )
}
