'use client'
import { useEffect, useMemo, useState } from 'react'
import { Dialog } from '@/components/ui/Dialog'
import { Field, NumberInput, Select, TextInput } from '@/components/ui/Field'
import { useWorkspace } from '@/components/workspace/store'
import { num, shortDate } from '@/lib/domain/format'
import { addJob, jobWordCap, nextJobNo, openJobs } from '@/lib/workspace/jobs'
import { lineWatch, type NeedRow } from '@/lib/workspace/linewatch'
import {
  bookOutput, countFinished, countFinishedProblem, outputProblem,
} from '@/lib/workspace/output'
import {
  defaultPerDay, floorOf, isPlanned, jobPlanRow, planJob, planProblem, plannedJobs, workingDaysBetween,
} from '@/lib/workspace/plan'
import { fgOnHand, needsFor, productOf } from '@/lib/workspace/products'
import { DATE, n } from './ProductForm'

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

/**
 * A style planned, or planned again: what it makes, how many, when, and at
 * what pace — and what it needs, worked out from the product and adjustable
 * where the floor knows better (a heavier lay, a smaller size run).
 */
export function PlanForm({ jobId, onClose }: {
  /** undefined is closed; null asks which job; an id plans that one */
  jobId: string | null | undefined
  onClose: () => void
}) {
  const { workspace, update, today } = useWorkspace()
  const [pick, setPick] = useState('')
  const [productId, setProductId] = useState('')
  const [qty, setQty] = useState('')
  const [start, setStart] = useState('')
  const [finish, setFinish] = useState('')
  const [perDay, setPerDay] = useState('')
  const [paceTouched, setPaceTouched] = useState(false)
  const [overrides, setOverrides] = useState<Record<string, string>>({})
  const [pendingNo, setPendingNo] = useState<string | null>(null)
  const [tried, setTried] = useState(false)

  useEffect(() => {
    if (!pendingNo || !workspace) return
    const made = (workspace.jobs ?? []).find((j) => j.no === pendingNo)
    if (made) { setPick(made.id); setPendingNo(null) }
  }, [pendingNo, workspace])

  useEffect(() => {
    if (jobId === undefined || !workspace) return
    const open = openJobs(workspace)
    const id = jobId ?? open.find((j) => !isPlanned(j))?.id ?? open[open.length - 1]?.id ?? ''
    setPick(id)
    const job = (workspace.jobs ?? []).find((j) => j.id === id)
    const pid = job?.productId ?? (workspace.products ?? [])[0]?.id ?? ''
    setProductId(pid)
    setQty(job?.qty ? String(job.qty) : '')
    setStart(job?.plannedStart ?? today)
    setFinish(job?.plannedFinish ?? '')
    setPerDay(job?.perDay ? String(job.perDay) : '')
    setPaceTouched(Boolean(job?.perDay))
    // the job's own needs, where they differ from what the product says
    const computed = job?.productId && job.qty ? needsFor(workspace, job.productId, job.qty) : []
    const o: Record<string, string> = {}
    for (const nd of job?.needs ?? []) {
      const c = computed.find((x) => x.itemId === nd.itemId)
      if (!c || c.qty !== nd.qty) o[nd.itemId] = String(nd.qty)
    }
    setOverrides(o)
    setTried(false)
  }, [jobId]) // eslint-disable-line react-hooks/exhaustive-deps

  const floor = workspace ? floorOf(workspace) : undefined
  const q = n(qty)
  const computedPace = floor && Number.isFinite(q) && start && finish && finish >= start
    ? defaultPerDay(q, start, finish, floor) : null
  const computed = useMemo(
    () => (workspace && productId && Number.isFinite(q) && q > 0 ? needsFor(workspace, productId, q) : []),
    [workspace, productId, q],
  )

  if (jobId === undefined || !workspace) return null
  const ws = workspace
  const word = jobWordCap(ws)
  const job = (ws.jobs ?? []).find((j) => j.id === pick)
  const products = ws.products ?? []
  const needs = computed.map((c) => ({ ...c, qty: overrides[c.itemId] !== undefined ? n(overrides[c.itemId]) : c.qty }))
  const input = {
    productId, qty: q, plannedStart: start, plannedFinish: finish,
    perDay: paceTouched && perDay.trim() !== '' ? n(perDay) : computedPace ?? undefined,
    needs,
  }
  const problem = !pick ? `Pick the ${word.one.toLowerCase()} to plan.` : planProblem(ws, pick, input)
  const days = floor && start && finish && finish >= start ? workingDaysBetween(start, finish, floor) : 0

  const save = () => {
    setTried(true)
    if (problem) return
    update((w) => planJob(w, pick, input))
    onClose()
  }

  return (
    <Dialog open onClose={onClose} title={job?.productId ? `Re-plan ${job.no}` : `Plan ${job ? job.no : `a ${word.one.toLowerCase()}`}`}
      sub="What it makes, how many, and when. Line watch judges it from this.">
      <div className="space-y-3 px-4 py-4">
        {jobId === null && (
          <Field label={word.one} htmlFor="pl-job">
            <Select id="pl-job" value={pick} onChange={setPick}
              placeholder={openJobs(ws).length ? undefined : `No ${word.many.toLowerCase()} open yet`}
              options={openJobs(ws).map((j) => ({
                value: j.id, label: `${j.no}${j.name ? ` — ${j.name}` : ''}${isPlanned(j) ? ' (planned)' : ''}`,
              }))}
              addLabel={`New ${word.one.toLowerCase()} number, e.g. ${nextJobNo(ws)}`}
              onAdd={(no) => { update((w) => addJob(w, { no, openedOn: today })[0]); setPendingNo(no.trim()) }} />
          </Field>
        )}
        <div className="grid grid-cols-[minmax(0,3fr)_minmax(0,2fr)] gap-2">
          <Field label="What it makes" htmlFor="pl-product">
            {products.length === 0
              ? <p className="rounded-md border border-line bg-surface-2 px-2.5 py-2 text-[12.5px] text-ink-2">Add a product first — Production › More › Products.</p>
              : <Select id="pl-product" value={productId} onChange={(v) => { setProductId(v); setOverrides({}) }}
                options={products.map((p) => ({ value: p.id, label: p.name }))} />}
          </Field>
          <Field label="How many" htmlFor="pl-qty">
            <NumberInput id="pl-qty" value={qty} onChange={(v) => { setQty(v); setOverrides({}) }}
              unit={productOf(ws, productId)?.uom ?? ''} step="1" autoFocus />
          </Field>
        </div>
        <div className="grid grid-cols-3 gap-2">
          <Field label="Starts" htmlFor="pl-start">
            <input id="pl-start" type="date" value={start} onChange={(e) => setStart(e.target.value)} className={DATE} />
          </Field>
          <Field label="Finishes" htmlFor="pl-finish">
            <input id="pl-finish" type="date" value={finish} min={start || undefined}
              onChange={(e) => setFinish(e.target.value)} className={DATE} />
          </Field>
          <Field label="A day" htmlFor="pl-perday" hint={days ? `${days} working day${days === 1 ? '' : 's'}` : undefined}>
            <NumberInput id="pl-perday" value={paceTouched ? perDay : computedPace ? String(computedPace) : ''}
              onChange={(v) => { setPerDay(v); setPaceTouched(v.trim() !== '') }} step="1" />
          </Field>
        </div>

        {computed.length > 0 && (
          <fieldset className="rounded-lg border border-line px-3 pb-3 pt-2">
            <legend className="px-1 text-[12.5px] font-semibold text-ink">What it needs</legend>
            <p className="mb-2 text-[11.5px] text-ink-3">Worked out from the product. Change a quantity where this style takes more or less.</p>
            <ul className="space-y-1.5">
              {computed.map((c) => {
                const item = ws.items.find((i) => i.id === c.itemId)
                return (
                  <li key={c.itemId} className="grid grid-cols-[minmax(0,1fr)_9rem] items-center gap-2">
                    <label htmlFor={`pl-need-${c.itemId}`} className="truncate text-[12.5px] text-ink-2">{item?.name ?? c.itemId}</label>
                    <NumberInput id={`pl-need-${c.itemId}`} unit={item?.uom ?? ''}
                      value={overrides[c.itemId] ?? String(c.qty)}
                      onChange={(v) => setOverrides((o) => ({ ...o, [c.itemId]: v }))} />
                  </li>
                )
              })}
            </ul>
          </fieldset>
        )}
        {productId && Number.isFinite(q) && q > 0 && computed.length === 0 && (
          <p className="rounded-md border border-warn/30 bg-warn-soft px-2.5 py-2 text-[12.5px] text-warn">
            {productOf(ws, productId)?.name} has no quantities on its material list, so this plan needs nothing from the store.
            Fill them in on Products and plan it again.
          </p>
        )}
        {tried && problem && <p role="alert" className="text-[12.5px] text-critical">{problem}</p>}
      </div>
      <Foot onClose={onClose} onSave={save} label={job?.productId ? 'Save the plan' : 'Plan it'} />
    </Dialog>
  )
}

/** Pieces off a job, good and rejected, for a day. */
export function OutputForm({ open, preset, onClose }: {
  open: boolean
  preset?: { jobId?: string }
  onClose: () => void
}) {
  const { workspace, update, today, session } = useWorkspace()
  const [jobId, setJobId] = useState('')
  const [on, setOn] = useState('')
  const [good, setGood] = useState('')
  const [rejected, setRejected] = useState('')
  const [reason, setReason] = useState('')
  const [note, setNote] = useState('')
  const [tried, setTried] = useState(false)

  useEffect(() => {
    if (!open || !workspace) return
    const jobs = plannedJobs(workspace)
    setJobId(preset?.jobId ?? jobs.find((j) => j.plannedStart! <= today)?.id ?? jobs[0]?.id ?? '')
    setOn(today); setGood(''); setRejected(''); setNote(''); setTried(false)
    setReason(floorOf(workspace).rejectReasons[0] ?? '')
  }, [open]) // eslint-disable-line react-hooks/exhaustive-deps

  if (!open || !workspace) return null
  const ws = workspace
  const jobs = plannedJobs(ws)
  const job = (ws.jobs ?? []).find((j) => j.id === jobId)
  const row = job ? jobPlanRow(ws, job, today) : undefined
  const g = good.trim() === '' ? 0 : n(good)
  const r = rejected.trim() === '' ? 0 : n(rejected)
  const x = { jobId, on, good: g, rejected: r, reason: r > 0 ? reason : undefined, actor: session.actor, note }
  const problem = outputProblem(ws, x, today)
  const reasons = floorOf(ws).rejectReasons

  const save = () => {
    setTried(true)
    if (problem) return
    update((w) => bookOutput(w, x, today)[0])
    onClose()
  }

  return (
    <Dialog open onClose={onClose} title="Book output" sub="What came off the floor. Good pieces go into finished stock.">
      <div className="space-y-3 px-4 py-4">
        <div className="grid grid-cols-[minmax(0,3fr)_minmax(0,2fr)] gap-2">
          <Field label={jobWordCap(ws).one} htmlFor="op-job">
            <Select id="op-job" value={jobId} onChange={setJobId}
              placeholder={jobs.length ? undefined : 'Nothing planned yet'}
              options={jobs.map((j) => ({ value: j.id, label: `${j.no}${productOf(ws, j.productId) ? ` — ${productOf(ws, j.productId)!.name}` : ''}` }))} />
          </Field>
          <Field label="Day" htmlFor="op-on">
            <input id="op-on" type="date" value={on} max={today} onChange={(e) => setOn(e.target.value)} className={DATE} />
          </Field>
        </div>
        {row && (
          <p className="text-[12px] text-ink-3">
            {row.made} of {row.job.qty} made so far · {row.target} due by today at {row.job.perDay} a day
            {row.vsTarget < 0 ? ` · ${-row.vsTarget} behind` : row.vsTarget > 0 ? ` · ${row.vsTarget} ahead` : ''}
          </p>
        )}
        <div className="grid grid-cols-2 gap-2">
          <Field label="Good" htmlFor="op-good">
            <NumberInput id="op-good" value={good} onChange={setGood} step="1" unit={productOf(ws, job?.productId)?.uom ?? ''} autoFocus />
          </Field>
          <Field label="Rejected" htmlFor="op-rejected">
            <NumberInput id="op-rejected" value={rejected} onChange={setRejected} step="1" />
          </Field>
        </div>
        {r > 0 && (
          <Field label="Why rejected" htmlFor="op-reason">
            <Select id="op-reason" value={reason} onChange={setReason}
              options={reasons.map((x) => ({ value: x, label: x }))} />
          </Field>
        )}
        <Field label="Note" htmlFor="op-note" error={tried ? problem ?? undefined : undefined}>
          <TextInput id="op-note" value={note} onChange={setNote} onEnter={save} placeholder="Optional — a shift, a line, a size" />
        </Field>
      </div>
      <Foot onClose={onClose} onSave={save} label="Book it" />
    </Dialog>
  )
}

/**
 * What a job needs, what has gone to it, and where the rest is coming from —
 * the table alone, so Line watch's dialog and the job card show one thing.
 */
export function NeedsTable({ needs, reasons = [], onIssue }: {
  needs: NeedRow[]
  reasons?: string[]
  onIssue?: (itemId: string) => void
}) {
  return (
    <div className="space-y-3">
      {needs.length === 0 ? (
        <p className="text-[12.5px] text-ink-3">Nothing on its material list has a quantity, so it needs nothing from the store.</p>
      ) : (
        <div className="scroll-x relative overflow-x-auto rounded-lg border border-line">
          <table className="w-full border-collapse text-[12.5px]">
            <thead>
              <tr className="border-b border-line text-left text-[12px] text-ink-3">
                <th className="px-3 py-2 font-medium">Material</th>
                <th className="px-3 py-2 text-right font-medium">Needs</th>
                <th className="px-3 py-2 text-right font-medium">Gone to it</th>
                <th className="px-3 py-2 text-right font-medium">From the shelf</th>
                <th className="px-3 py-2 font-medium">Still to come</th>
                <th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody>
              {needs.map((nd) => (
                <tr key={nd.itemId} className="border-b border-line-soft last:border-0 align-top">
                  <td className="px-3 py-2 font-medium text-ink">{nd.item?.name ?? nd.itemId}</td>
                  <td className="num px-3 py-2 text-right">{num(nd.need, 3)} {nd.uom}</td>
                  <td className="num px-3 py-2 text-right">{nd.gone ? `${num(nd.gone, 3)} ${nd.uom}` : '—'}</td>
                  <td className="num px-3 py-2 text-right">{nd.fromShelf ? `${num(nd.fromShelf, 3)} ${nd.uom}` : '—'}</td>
                  <td className="px-3 py-2">
                    {nd.claims.map((c, i) => (
                      <span key={i} className={`block ${c.late ? 'text-warn' : 'text-ink-2'}`}>
                        {num(c.qty, 3)} {nd.uom} · {c.what} · {shortDate(c.on)}
                      </span>
                    ))}
                    {nd.short > 0 && <span className="block font-semibold text-critical">{num(nd.short, 3)} {nd.uom} covered by nothing</span>}
                    {nd.claims.length === 0 && nd.short === 0 && <span className="text-ink-4">—</span>}
                  </td>
                  <td className="px-3 py-2 text-right">
                    {onIssue && nd.fromShelf > 0 && (
                      <button type="button" onClick={() => onIssue(nd.itemId)}
                        className="press rounded-md border border-line bg-surface px-2 py-1 text-[12px] font-medium hover:bg-surface-2">
                        Issue {nd.item?.name ?? 'it'}
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {reasons.length > 0 && (
        <ul className="space-y-1 text-[12.5px] text-ink-2">
          {reasons.map((r, i) => <li key={i}>{r}</li>)}
        </ul>
      )}
    </div>
  )
}

/** What a job needs, what has gone to it, and where the rest is coming from. */
export function NeedsDialog({ jobId, onClose, onIssue }: {
  jobId: string | null
  onClose: () => void
  onIssue?: (itemId: string) => void
}) {
  const { workspace, today } = useWorkspace()
  if (!jobId || !workspace) return null
  const w = lineWatch(workspace, today).find((x) => x.job.id === jobId)
  if (!w) return null
  return (
    <Dialog open onClose={onClose} wide title={`What ${w.job.no} needs`}
      sub={`${w.product?.name ?? ''} · ${w.job.qty} to make, ${shortDate(w.job.plannedStart!)} – ${shortDate(w.job.plannedFinish!)}`}>
      <div className="px-4 py-4">
        <NeedsTable needs={w.needs} reasons={w.reasons} onIssue={onIssue} />
      </div>
    </Dialog>
  )
}

/** Finished stock counted on the shelf — the book follows the count, as one movement. */
export function CountFinishedDialog({ productId, onClose }: { productId: string | null; onClose: () => void }) {
  const { workspace, update, today, session } = useWorkspace()
  const [pid, setPid] = useState('')
  const [qty, setQty] = useState('')
  const [tried, setTried] = useState(false)

  useEffect(() => {
    if (productId === null || !workspace) return
    setPid(productId || (workspace.products ?? [])[0]?.id || ''); setQty(''); setTried(false)
  }, [productId]) // eslint-disable-line react-hooks/exhaustive-deps

  if (productId === null || !workspace) return null
  const ws = workspace
  const c = { productId: pid, qty: n(qty), on: today, actor: session.actor }
  const problem = countFinishedProblem(ws, c)
  const book = pid ? fgOnHand(ws, pid) : 0
  const save = () => {
    setTried(true)
    if (problem) return
    update((w) => countFinished(w, c))
    onClose()
  }
  return (
    <Dialog open onClose={onClose} title="Count finished stock" sub="What is on the shelf now. The book follows the count.">
      <div className="space-y-3 px-4 py-4">
        <Field label="Product" htmlFor="cf-product">
          <Select id="cf-product" value={pid} onChange={setPid}
            options={(ws.products ?? []).map((p) => ({ value: p.id, label: p.name }))} />
        </Field>
        <Field label="On the shelf" htmlFor="cf-qty" hint={`The book says ${num(book, 3)}.`}
          error={tried ? problem ?? undefined : undefined}>
          <NumberInput id="cf-qty" value={qty} onChange={setQty} unit={productOf(ws, pid)?.uom ?? ''} autoFocus />
        </Field>
      </div>
      <Foot onClose={onClose} onSave={save} label="Save the count" />
    </Dialog>
  )
}
