'use client'
import { useEffect, useState } from 'react'
import { Dialog } from '@/components/ui/Dialog'
import { Chips, Field, Select, TextInput } from '@/components/ui/Field'
import { useWorkspace } from '@/components/workspace/store'
import { shortDate } from '@/lib/domain/format'
import { HALT_CAUSES, haltProblem, recordHalt, resumeHalt, resumeProblem } from '@/lib/workspace/halts'
import { jobWordCap } from '@/lib/workspace/jobs'
import { HALT_WORD, openHaltOf } from '@/lib/workspace/linewatch'
import { plannedJobs } from '@/lib/workspace/plan'
import { productOf } from '@/lib/workspace/products'
import type { HaltCause } from '@/lib/workspace/types'
import { DATE } from './ProductForm'

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

/** The floor stopped on a job: since when, and why. */
export function HaltForm({ open, preset, onClose }: { open: boolean; preset?: { jobId?: string }; onClose: () => void }) {
  const { workspace, update, today, session } = useWorkspace()
  const [jobId, setJobId] = useState('')
  const [on, setOn] = useState('')
  const [cause, setCause] = useState<HaltCause>('machine')
  const [note, setNote] = useState('')
  const [tried, setTried] = useState(false)

  useEffect(() => {
    if (!open || !workspace) return
    const running = plannedJobs(workspace).filter((j) => !openHaltOf(workspace, j.id))
    setJobId(preset?.jobId ?? running.find((j) => j.plannedStart! <= today)?.id ?? running[0]?.id ?? '')
    setOn(today); setCause('machine'); setNote(''); setTried(false)
  }, [open]) // eslint-disable-line react-hooks/exhaustive-deps

  if (!open || !workspace) return null
  const ws = workspace
  const jobs = plannedJobs(ws).filter((j) => !openHaltOf(ws, j.id) || j.id === jobId)
  const h = { jobId, on, cause, note, actor: session.actor }
  const problem = haltProblem(ws, h, today)
  const save = () => {
    setTried(true)
    if (problem) return
    update((w) => recordHalt(w, h, today)[0])
    onClose()
  }
  return (
    <Dialog open onClose={onClose} title="Record a halt" sub="The floor stopped on a job. Say why, and when it starts again say that too.">
      <div className="space-y-3 px-4 py-4">
        <div className="grid grid-cols-[minmax(0,3fr)_minmax(0,2fr)] gap-2">
          <Field label={jobWordCap(ws).one} htmlFor="hl-job">
            <Select id="hl-job" value={jobId} onChange={setJobId}
              placeholder={jobs.length ? undefined : 'Nothing planned'}
              options={jobs.map((j) => ({ value: j.id, label: `${j.no}${productOf(ws, j.productId) ? ` — ${productOf(ws, j.productId)!.name}` : ''}` }))} />
          </Field>
          <Field label="Stopped on" htmlFor="hl-on">
            <input id="hl-on" type="date" value={on} max={today} onChange={(e) => setOn(e.target.value)} className={DATE} />
          </Field>
        </div>
        <Field label="Why">
          <Chips value={cause} onChange={(v) => setCause(v as HaltCause)}
            options={HALT_CAUSES.map((c) => ({ value: c, label: HALT_WORD[c] }))} />
        </Field>
        <Field label="What happened" htmlFor="hl-note" error={tried ? problem ?? undefined : undefined}
          hint={cause === 'other' ? 'Needed when the cause is other.' : 'Optional — the machine, who is off, the fault.'}>
          <TextInput id="hl-note" value={note} onChange={setNote} onEnter={save} placeholder="Overlock 3 needle broke" />
        </Field>
      </div>
      <Foot onClose={onClose} onSave={save} label="Record it" />
    </Dialog>
  )
}

/** The floor started again on a halted job. */
export function ResumeDialog({ haltId, onClose }: { haltId: string | null; onClose: () => void }) {
  const { workspace, update, today } = useWorkspace()
  const [on, setOn] = useState('')
  const [tried, setTried] = useState(false)

  useEffect(() => { if (haltId) { setOn(today); setTried(false) } }, [haltId]) // eslint-disable-line react-hooks/exhaustive-deps

  if (!haltId || !workspace) return null
  const h = (workspace.halts ?? []).find((x) => x.id === haltId)
  if (!h) return null
  const job = (workspace.jobs ?? []).find((j) => j.id === h.jobId)
  const problem = resumeProblem(workspace, haltId, on, today)
  const save = () => {
    setTried(true)
    if (problem) return
    update((w) => resumeHalt(w, haltId, on, today))
    onClose()
  }
  return (
    <Dialog open onClose={onClose} title={`${job?.no ?? 'The job'} has resumed`}
      sub={`Stopped ${shortDate(h.on)} — ${HALT_WORD[h.cause].toLowerCase()}${h.note ? `: ${h.note}` : ''}`}>
      <div className="space-y-3 px-4 py-4">
        <Field label="Started again on" htmlFor="rs-on" error={tried ? problem ?? undefined : undefined}>
          <input id="rs-on" type="date" value={on} min={h.on} max={today} onChange={(e) => setOn(e.target.value)} className={DATE} />
        </Field>
      </div>
      <Foot onClose={onClose} onSave={save} label="It has resumed" />
    </Dialog>
  )
}
