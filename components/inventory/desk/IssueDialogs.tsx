'use client'
import { useEffect, useMemo, useState } from 'react'
import { Dialog } from '@/components/ui/Dialog'
import { Chips, Field, NumberInput, Select, TextInput } from '@/components/ui/Field'
import { PaperDialog, type Paper } from '@/components/sourcing/PaperDialog'
import { useWorkspace } from '@/components/workspace/store'
import { money, num, shortDate } from '@/lib/domain/format'
import { buildIssueSlip, issueFileName, issueSendableFor, renderIssueSlip } from '@/lib/paper/issue'
import {
  addJob, issueMaterial, issueProblem, jobProblem, jobRows, jobWordCap, lastDrawnLot, nextJobNo,
  onJob, openJobs, returnProblem, returnToStore, updateJob, wasteOnJob, wasteProblem,
} from '@/lib/workspace/jobs'
import { fifo, usableOnHand } from '@/lib/workspace/ledger'
import { linesMadeOn, linkableLines, madeForProblem, madeForText, salesLineLabel, setMadeFor } from '@/lib/workspace/sales'
import type { Job } from '@/lib/workspace/types'
import { RackSelect } from './RackSelect'

const n = (v: string) => (v.trim() === '' ? NaN : Number(v.replace(/,/g, '')))

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

/** A job opened, or its details changed. */
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
  const word = jobWordCap(workspace).one
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
    <Dialog open onClose={onClose} title={job ? `${word} ${job.no}` : `Open a ${word.toLowerCase()}`}>
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

/**
 * Material out of the store, against a job.
 *
 * The lot it comes off is the oldest first unless somebody picks one; the
 * form says which lots and racks that will be before it is written, so the
 * storeman knows where to walk.
 */
export function IssueForm({ open, onClose, preset, onIssued }: {
  open: boolean
  onClose: () => void
  preset?: { jobId?: string; itemId?: string }
  onIssued?: (jobId: string) => void
}) {
  const { workspace, update, today, session } = useWorkspace()
  const [jobId, setJobId] = useState('')
  const [itemId, setItemId] = useState('')
  const [qty, setQty] = useState('')
  const [lotId, setLotId] = useState('')
  const [takenBy, setTakenBy] = useState('')
  const [pendingNo, setPendingNo] = useState<string | null>(null)
  const [tried, setTried] = useState(false)

  // a job opened from here is picked as soon as it exists
  useEffect(() => {
    if (!pendingNo || !workspace) return
    const made = (workspace.jobs ?? []).find((j) => j.no === pendingNo)
    if (made) { setJobId(made.id); setPendingNo(null) }
  }, [pendingNo, workspace])

  useEffect(() => {
    if (!open || !workspace) return
    const jobs = openJobs(workspace)
    setJobId(preset?.jobId ?? jobs[jobs.length - 1]?.id ?? '')
    setItemId(preset?.itemId ?? workspace.items.find((i) => usableOnHand(workspace, i.id) > 0)?.id ?? workspace.items[0]?.id ?? '')
    setQty(''); setLotId(''); setTakenBy(''); setTried(false)
  }, [open]) // eslint-disable-line react-hooks/exhaustive-deps

  if (!open || !workspace) return null
  const ws = workspace
  const word = jobWordCap(ws)
  const item = ws.items.find((i) => i.id === itemId)
  const uom = item?.uom ?? ''
  const lots = itemId ? fifo(ws, itemId) : []
  const rackName = (id?: string) => (id ? (ws.racks ?? []).find((r) => r.id === id)?.name : undefined)
  const i = { jobId, itemId, qty: n(qty), on: today, takenBy, actor: session.actor, lotId: lotId || undefined }
  const problem = issueProblem(ws, i)

  // which lots it will come off, before it is written
  let left = Number.isFinite(i.qty) ? i.qty : 0
  const plan = lotId
    ? lots.filter((l) => l.id === lotId).map((l) => ({ l, take: Math.min(l.qty, left) }))
    : lots.map((l) => { const take = Math.min(l.qty, left); left -= take; return { l, take } }).filter((x) => x.take > 0)

  const save = () => {
    setTried(true)
    if (problem) return
    update((w) => issueMaterial(w, i)[0])
    onIssued?.(jobId)
    onClose()
  }

  return (
    <>
      <Dialog open onClose={onClose} title="Issue material" sub={`Out of the store, against a ${word.one.toLowerCase()}.`}>
        <div className="space-y-3 px-4 py-4">
          <Field label={word.one} htmlFor="is-job">
            <Select id="is-job" value={jobId} onChange={setJobId}
              placeholder={openJobs(ws).length ? undefined : `No ${word.many.toLowerCase()} open yet`}
              options={openJobs(ws).map((j) => ({ value: j.id, label: `${j.no}${j.name ? ` — ${j.name}` : ''}` }))}
              addLabel={`New ${word.one.toLowerCase()} number, e.g. ${nextJobNo(ws)}`}
              onAdd={(no) => {
                // opened on the spot by its number; the rest can be filled in on the list
                update((w) => addJob(w, { no, openedOn: today })[0])
                setPendingNo(no.trim())
              }} />
          </Field>
          <div className="grid grid-cols-[minmax(0,3fr)_minmax(0,2fr)] gap-2">
            <Field label="Material" htmlFor="is-item">
              <Select id="is-item" value={itemId} onChange={(v) => { setItemId(v); setLotId('') }}
                options={ws.items.map((it) => ({ value: it.id, label: it.name }))} />
            </Field>
            <Field label="How much" htmlFor="is-qty">
              <NumberInput id="is-qty" value={qty} onChange={setQty} unit={uom} autoFocus />
            </Field>
          </div>
          {item && <p className="text-[12px] text-ink-3">{num(usableOnHand(ws, itemId), 3)} {uom} usable on the shelf.</p>}
          <Field label="Off which lot" htmlFor="is-lot">
            <Select id="is-lot" value={lotId} onChange={setLotId}
              options={[
                { value: '', label: 'The oldest first' },
                ...lots.map((l) => ({ value: l.id, label: `${l.batchNo}${rackName(l.rack) ? ` · ${rackName(l.rack)}` : ''} · ${num(l.qty, 3)} ${uom}` })),
              ]} />
          </Field>
          {plan.length > 0 && !problem && (
            <ul className="rounded-md border border-line bg-surface-2 px-2.5 py-2 text-[12px] text-ink-2">
              {plan.map(({ l, take }) => (
                <li key={l.id}>
                  {num(take, 3)} {uom} off <span className="mono">{l.batchNo}</span>
                  {rackName(l.rack) && <> on <strong className="text-ink">{rackName(l.rack)}</strong></>}
                </li>
              ))}
            </ul>
          )}
          <Field label="Taken by" htmlFor="is-taken" hint="Who took it from the store. Blank is you."
            error={tried ? problem ?? undefined : undefined}>
            <TextInput id="is-taken" value={takenBy} onChange={setTakenBy} onEnter={save} placeholder="Cutting master" />
          </Field>
        </div>
        <Foot onClose={onClose} onSave={save} label="Issue it" />
      </Dialog>
    </>
  )
}

/** Material back into the store from a job — onto its lot, or as a remnant. */
export function ReturnForm({ open, onClose, preset }: {
  open: boolean
  onClose: () => void
  preset?: { jobId?: string; itemId?: string }
}) {
  const { workspace, update, today, session } = useWorkspace()
  const [jobId, setJobId] = useState('')
  const [itemId, setItemId] = useState('')
  const [qty, setQty] = useState('')
  const [how, setHow] = useState<'lot' | 'remnant'>('lot')
  const [pieces, setPieces] = useState('')
  const [rack, setRack] = useState('')
  const [note, setNote] = useState('')
  const [tried, setTried] = useState(false)

  useEffect(() => {
    if (!open || !workspace) return
    const withSlips = (workspace.jobs ?? []).filter((j) => (workspace.issues ?? []).some((s) => s.jobId === j.id))
    const j = preset?.jobId ?? withSlips[withSlips.length - 1]?.id ?? ''
    setJobId(j)
    const drawn = (workspace.issues ?? []).filter((s) => s.jobId === j).flatMap((s) => s.lines.map((l) => l.itemId))
    setItemId(preset?.itemId ?? drawn[drawn.length - 1] ?? '')
    setQty(''); setHow('lot'); setPieces(''); setRack(''); setNote(''); setTried(false)
  }, [open]) // eslint-disable-line react-hooks/exhaustive-deps

  if (!open || !workspace) return null
  const ws = workspace
  const word = jobWordCap(ws)
  const jobs = (ws.jobs ?? []).filter((j) => (ws.issues ?? []).some((s) => s.jobId === j.id && s.kind === 'issue'))
  const drawnItems = [...new Set((ws.issues ?? []).filter((s) => s.jobId === jobId && s.kind === 'issue')
    .flatMap((s) => s.lines.map((l) => l.itemId)))]
  const item = ws.items.find((i) => i.id === itemId)
  const uom = item?.uom ?? ''
  const left = jobId && itemId ? onJob(ws, jobId, itemId).withJob : 0
  const back = jobId && itemId ? lastDrawnLot(ws, jobId, itemId) : undefined
  const r = {
    jobId, itemId, qty: n(qty), on: today, actor: session.actor, note,
    asRemnant: how === 'remnant', pieces: how === 'remnant' && pieces.trim() ? n(pieces) : undefined,
    rack: rack || undefined,
  }
  const problem = returnProblem(ws, r)

  const save = () => {
    setTried(true)
    if (problem) return
    update((w) => returnToStore(w, r)[0])
    onClose()
  }

  return (
    <Dialog open onClose={onClose} title="Return slip" sub={`Material back to the store from a ${word.one.toLowerCase()}.`}>
      <div className="space-y-3 px-4 py-4">
        {jobs.length === 0 ? (
          <p className="text-[12.5px] text-ink-3">Nothing has been issued yet, so nothing can come back.</p>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-2">
              <Field label={word.one} htmlFor="rt-job">
                <Select id="rt-job" value={jobId} onChange={(v) => { setJobId(v); setItemId('') }}
                  options={jobs.map((j) => ({ value: j.id, label: j.no }))} />
              </Field>
              <Field label="Material" htmlFor="rt-item">
                <Select id="rt-item" value={itemId} onChange={setItemId} placeholder="Pick one"
                  options={drawnItems.map((id) => ({ value: id, label: ws.items.find((i) => i.id === id)?.name ?? id }))} />
              </Field>
            </div>
            {itemId && <p className="text-[12px] text-ink-3">{num(left, 3)} {uom} of it is still with the {word.one.toLowerCase()}.</p>}
            <Field label="How much is coming back" htmlFor="rt-qty">
              <NumberInput id="rt-qty" value={qty} onChange={setQty} unit={uom} autoFocus />
            </Field>
            <Field label="As what">
              <Chips value={how} onChange={(v) => setHow(v as typeof how)} options={[
                { value: 'lot', label: 'Onto the lot it came from', hint: back ? `Back onto ${ws.stockLots.find((l) => l.id === back)?.batchNo}` : undefined },
                { value: 'remnant', label: 'As a remnant — short pieces', hint: 'A lot of its own, never counted as cover' },
              ]} />
            </Field>
            {how === 'remnant' && (
              <div className="grid grid-cols-2 gap-2">
                <Field label="How many pieces" htmlFor="rt-pieces">
                  <NumberInput id="rt-pieces" value={pieces} onChange={setPieces} unit="pieces" step="1" />
                </Field>
                {(ws.racks ?? []).length > 0 && (
                  <Field label="Onto which rack" htmlFor="rt-rack">
                    <RackSelect id="rt-rack" value={rack} onChange={setRack} />
                  </Field>
                )}
              </div>
            )}
            <Field label="Note" htmlFor="rt-note" error={tried ? problem ?? undefined : undefined}>
              <TextInput id="rt-note" value={note} onChange={setNote} onEnter={save} placeholder="Lay finished short" />
            </Field>
          </>
        )}
      </div>
      <Foot onClose={onClose} onSave={save} label="Put it back" />
    </Dialog>
  )
}

/** Wasted on a job — a mis-cut, a stain, end bits. A loss with its cause; nothing moves. */
export function WasteForm({ open, onClose, preset }: {
  open: boolean
  onClose: () => void
  preset?: { jobId?: string; itemId?: string }
}) {
  const { workspace, update, today, session } = useWorkspace()
  const [jobId, setJobId] = useState('')
  const [itemId, setItemId] = useState('')
  const [qty, setQty] = useState('')
  const [note, setNote] = useState('')
  const [tried, setTried] = useState(false)

  useEffect(() => {
    if (!open || !workspace) return
    const withSlips = (workspace.jobs ?? []).filter((j) => (workspace.issues ?? []).some((s) => s.jobId === j.id))
    const j = preset?.jobId ?? withSlips[withSlips.length - 1]?.id ?? ''
    setJobId(j)
    const drawn = (workspace.issues ?? []).filter((s) => s.jobId === j).flatMap((s) => s.lines.map((l) => l.itemId))
    setItemId(preset?.itemId ?? drawn[drawn.length - 1] ?? '')
    setQty(''); setNote(''); setTried(false)
  }, [open]) // eslint-disable-line react-hooks/exhaustive-deps

  if (!open || !workspace) return null
  const ws = workspace
  const word = jobWordCap(ws)
  const jobs = (ws.jobs ?? []).filter((j) => (ws.issues ?? []).some((s) => s.jobId === j.id && s.kind === 'issue'))
  const drawnItems = [...new Set((ws.issues ?? []).filter((s) => s.jobId === jobId && s.kind === 'issue')
    .flatMap((s) => s.lines.map((l) => l.itemId)))]
  const item = ws.items.find((i) => i.id === itemId)
  const rate = ws.scrapRate?.[itemId] ?? 0
  const x = { jobId, itemId, qty: n(qty), on: today, actor: session.actor, note }
  const problem = wasteProblem(ws, x)

  const save = () => {
    setTried(true)
    if (problem) return
    update((w) => wasteOnJob(w, x)[0])
    onClose()
  }

  return (
    <Dialog open onClose={onClose} title="Record wastage" sub={`Material that went bad on a ${word.one.toLowerCase()}.`}>
      <div className="space-y-3 px-4 py-4">
        {jobs.length === 0 ? (
          <p className="text-[12.5px] text-ink-3">Nothing has been issued yet, so nothing can have been wasted on a job.</p>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-2">
              <Field label={word.one} htmlFor="ws-job">
                <Select id="ws-job" value={jobId} onChange={(v) => { setJobId(v); setItemId('') }}
                  options={jobs.map((j) => ({ value: j.id, label: j.no }))} />
              </Field>
              <Field label="Material" htmlFor="ws-item">
                <Select id="ws-item" value={itemId} onChange={setItemId} placeholder="Pick one"
                  options={drawnItems.map((id) => ({ value: id, label: ws.items.find((i) => i.id === id)?.name ?? id }))} />
              </Field>
            </div>
            <Field label="How much" htmlFor="ws-qty">
              <NumberInput id="ws-qty" value={qty} onChange={setQty} unit={item?.uom} autoFocus />
            </Field>
            <Field label="What happened" htmlFor="ws-note" error={tried ? problem ?? undefined : undefined}>
              <TextInput id="ws-note" value={note} onChange={setNote} onEnter={save} placeholder="Two panels mis-cut on the lay" />
            </Field>
            <p className="text-[12px] text-ink-3">
              {rate > 0 ? `Scrap fetches ₹${num(rate, 2)} per ${item?.uom ?? 'unit'} — it goes on the loss ledger as recovery owed.`
                : 'Nothing is recovered — it goes on the loss ledger as dead loss. A scrap rate can be set in the store rules.'}
            </p>
          </>
        )}
      </div>
      <Foot onClose={onClose} onSave={save} label="Record it" />
    </Dialog>
  )
}

/** Everything a job has had, by material: issued, back, wasted, used, and what it was worth. */
export function JobSheet({ jobId, onClose }: { jobId: string | null; onClose: () => void }) {
  const { workspace } = useWorkspace()
  if (!jobId || !workspace) return null
  const row = jobRows(workspace).find((r) => r.job.id === jobId)
  if (!row) return null
  const word = jobWordCap(workspace).one
  // slips and, where material is cut, the cuts made for it — in the order they happened
  const history = [
    ...(workspace.issues ?? []).filter((s) => s.jobId === jobId).map((s) => ({ kind: 'slip' as const, on: s.on, id: s.id, s })),
    ...(workspace.cuts ?? []).filter((c) => c.jobId === jobId).map((c) => ({ kind: 'cut' as const, on: c.on, id: c.id, c })),
  ].sort((a, b) => a.on.localeCompare(b.on) || a.id.localeCompare(b.id))
  const itemOf = (id?: string) => workspace.items.find((i) => i.id === id)

  return (
    <Dialog open onClose={onClose} wide title={`${word} ${row.job.no}${row.job.name ? ` — ${row.job.name}` : ''}`}
      sub={`Opened ${shortDate(row.job.openedOn)}${madeForText(workspace, row.job) ? ` · for ${madeForText(workspace, row.job)}` : ''}${row.job.closedOn ? ` · closed ${shortDate(row.job.closedOn)}` : ''}`}>
      <div className="space-y-4 px-4 py-4">
        {row.materials.length === 0 ? (
          <p className="text-[12.5px] text-ink-3">Nothing has been issued against it yet.</p>
        ) : (
          <div className="scroll-x overflow-x-auto rounded-lg border border-line">
            <table className="w-full border-collapse text-[12.5px]">
              <thead>
                <tr className="border-b border-line text-left text-[12px] text-ink-3">
                  <th className="px-3 py-2 font-medium">Material</th>
                  <th className="px-3 py-2 text-right font-medium">Issued</th>
                  <th className="px-3 py-2 text-right font-medium">Back</th>
                  <th className="px-3 py-2 text-right font-medium">Wasted</th>
                  <th className="px-3 py-2 text-right font-medium">Used</th>
                  <th className="px-3 py-2 text-right font-medium">Worth</th>
                </tr>
              </thead>
              <tbody>
                {row.materials.map((m) => (
                  <tr key={m.itemId} className="border-b border-line-soft last:border-0">
                    <td className="px-3 py-2 font-medium text-ink">{m.name}</td>
                    <td className="num px-3 py-2 text-right">{num(m.issued, 3)} {m.uom}</td>
                    <td className="num px-3 py-2 text-right">{m.returned ? `${num(m.returned, 3)} ${m.uom}` : '—'}</td>
                    <td className={`num px-3 py-2 text-right ${m.wasted ? 'text-critical' : ''}`}>{m.wasted ? `${num(m.wasted, 3)} ${m.uom}` : '—'}</td>
                    <td className="num px-3 py-2 text-right font-semibold">{num(m.used, 3)} {m.uom}</td>
                    <td className="num px-3 py-2 text-right">{m.value > 0 ? money(m.value) : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="text-[12px] text-ink-3">
          Used is what was issued less what came back — waste included, because wasted material went into
          the {word.toLowerCase()} too. Worth is at the last purchase price.
        </p>
        {history.length > 0 && (
          <ul className="space-y-1 text-[12.5px] text-ink-2">
            {history.map((h) => (h.kind === 'slip' ? (
              <li key={h.s.id}>
                <span className="mono">{h.s.no}</span> · {shortDate(h.s.on)} · {h.s.kind === 'issue' ? 'issued' : 'back'}{' '}
                {num(h.s.lines.reduce((a, l) => a + l.qty, 0), 3)} {itemOf(h.s.lines[0]?.itemId)?.uom ?? ''}{' '}
                of {itemOf(h.s.lines[0]?.itemId)?.name ?? 'material'}{h.s.takenBy ? ` · ${h.s.takenBy}` : ''}
              </li>
            ) : (
              <li key={h.c.id}>
                <span className="mono">{h.c.cutNo}</span> · {shortDate(h.c.on)} · cut {num(h.c.inputQty, 3)} {itemOf(h.c.itemId)?.uom ?? ''}{' '}
                of {itemOf(h.c.itemId)?.name ?? 'material'} into {num(h.c.partsQty, 3)} of parts
                {h.c.operator ? ` · ${h.c.operator}` : ''}
              </li>
            )))}
          </ul>
        )}
      </div>
    </Dialog>
  )
}

/** The slip as paper — print it, download it, or copy it into a message to the floor. */
export function IssueDocument({ slipId, onClose }: { slipId: string | null; onClose: () => void }) {
  const { workspace } = useWorkspace()
  const papers = useMemo<Paper[]>(() => {
    if (!workspace || !slipId) return []
    const doc = buildIssueSlip(workspace, slipId)
    if (!doc) return []
    return [{
      vendor: null,
      problems: doc.problems,
      fileName: issueFileName(doc),
      sendable: issueSendableFor(doc),
      render: () => renderIssueSlip(doc),
    }]
  }, [workspace, slipId])
  if (!slipId || !workspace || papers.length === 0) return null
  const slip = (workspace.issues ?? []).find((s) => s.id === slipId)
  return (
    <PaperDialog open onClose={onClose}
      title={`${slip?.no ?? ''} — ${slip?.kind === 'return' ? 'return slip' : 'issue slip'}`}
      papers={papers} sentTo={new Set()} onSent={() => {}} />
  )
}
