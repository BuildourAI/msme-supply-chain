'use client'
import { useEffect, useState } from 'react'
import { Dialog } from '@/components/ui/Dialog'
import { Field, NumberInput, Select, TextInput } from '@/components/ui/Field'
import { Icon } from '@/components/ui/icons'
import { useWorkspace } from '@/components/workspace/store'
import { money, num } from '@/lib/domain/format'
import {
  cutLot, cutProblem, isUsableRemnant, minRemnantOf, piecesQty, recordCut, scrapRemnant,
  scrapRemnantProblem, useRemnant, useRemnantProblem, type CutInput,
} from '@/lib/workspace/cutting'
import { jobWordCap, openJobs } from '@/lib/workspace/jobs'
import { fifo, isRemnant, lotOf, round3 } from '@/lib/workspace/ledger'
import { scrapRateOf } from '@/lib/workspace/losses'
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

/**
 * The job select — open job cards only, the same as the issue form. A cut
 * for a style nobody has opened yet waits for Production to open it: the
 * store never invents a job card.
 */
function JobPick({ id, value, onChange, none }: {
  id: string; value: string; onChange: (v: string) => void; none?: string
}) {
  const { workspace } = useWorkspace()
  if (!workspace) return null
  const word = jobWordCap(workspace)
  const jobs = openJobs(workspace)
  return (
    <Select id={id} value={value} onChange={onChange}
      placeholder={!none && jobs.length === 0 ? `No ${word.many.toLowerCase()} open — open one on Production › ${word.many}` : undefined}
      options={[
        ...(none ? [{ value: '', label: none }] : []),
        ...jobs.map((j) => ({ value: j.id, label: `${j.no}${j.name ? ` — ${j.name}` : ''}` })),
      ]} />
  )
}

interface RemnantDraft { size: string; pieces: string; spec: string }
const BLANK: RemnantDraft = { size: '', pieces: '', spec: '' }

/**
 * A cut, recorded at the table.
 *
 * What went on it, what came off as parts, what the blade took, and what was
 * left — with the balance said live, because a cut that does not add up is
 * refused rather than saved approximately. A remnant under the material's
 * smallest usable piece is shown as scrap before it is written, so nobody is
 * surprised to find it on the loss ledger rather than on a rack.
 */
export function CutForm({ open, onClose, preset }: {
  open: boolean
  onClose: () => void
  preset?: { itemId?: string; jobId?: string }
}) {
  const { workspace, update, today, session } = useWorkspace()
  const [itemId, setItemId] = useState('')
  const [lotId, setLotId] = useState('')
  const [jobId, setJobId] = useState('')
  const [input, setInput] = useState('')
  const [planned, setPlanned] = useState('')
  const [parts, setParts] = useState('')
  const [count, setCount] = useState('')
  const [kerf, setKerf] = useState('')
  const [rems, setRems] = useState<RemnantDraft[]>([])
  const [rack, setRack] = useState('')
  const [operator, setOperator] = useState('')
  const [tried, setTried] = useState(false)

  useEffect(() => {
    if (!open || !workspace) return
    const jobs = openJobs(workspace)
    const first = workspace.items.find((i) => fifo(workspace, i.id).length > 0) ?? workspace.items[0]
    setItemId(preset?.itemId ?? first?.id ?? '')
    setJobId(preset?.jobId ?? jobs[jobs.length - 1]?.id ?? '')
    setLotId(''); setInput(''); setPlanned(''); setParts(''); setCount(''); setKerf('')
    setRems([]); setRack(''); setOperator(''); setTried(false)
  }, [open]) // eslint-disable-line react-hooks/exhaustive-deps

  if (!open || !workspace) return null
  const ws = workspace
  const item = ws.items.find((i) => i.id === itemId)
  const uom = item?.uom ?? ''
  const rackName = (id?: string) => (id ? (ws.racks ?? []).find((r) => r.id === id)?.name : undefined)
  // full lots oldest first, then any remnant of it — a lay can be cut from a remnant too
  const lots = itemId ? [
    ...fifo(ws, itemId),
    ...ws.stockLots.filter((l) => l.itemId === itemId && isRemnant(l) && l.qty > 0 && l.usability === 'usable'),
  ] : []

  const remnants = rems
    .filter((r) => r.size.trim() !== '' || r.pieces.trim() !== '')
    .map((r) => ({ size: n(r.size), pieces: n(r.pieces), spec: r.spec.trim() }))
  const partsQty = n(parts)
  const c: CutInput = {
    itemId, lotId: lotId || undefined, jobId: jobId || undefined, on: today,
    inputQty: n(input),
    // no plan written down is a cut judged against itself, never below it
    plannedPartsQty: planned.trim() === '' ? partsQty : n(planned),
    partsQty,
    partsCount: count.trim() === '' ? 0 : n(count),
    kerfQty: kerf.trim() === '' ? 0 : n(kerf),
    remnants,
    rack: rack || undefined,
    operator: operator.trim() || session.actor,
  }
  const problem = cutProblem(ws, c)
  const lot = Number.isFinite(c.inputQty) ? cutLot(ws, c) : undefined
  const min = minRemnantOf(ws, itemId)

  const remQty = remnants.reduce((a, r) => a + (Number.isFinite(r.size * r.pieces) ? r.size * r.pieces : 0), 0)
  const sum = round3((Number.isFinite(partsQty) ? partsQty : 0) + (Number.isFinite(c.kerfQty) ? c.kerfQty : 0) + remQty)
  const gap = Number.isFinite(c.inputQty) ? round3(c.inputQty - sum) : null
  const anyUsable = remnants.some((r) => r.size > 0 && isUsableRemnant(ws, itemId, r.size))

  const save = () => {
    setTried(true)
    if (problem) return
    update((w) => recordCut(w, c)[0])
    onClose()
  }

  const setRem = (i: number, patch: Partial<RemnantDraft>) =>
    setRems((xs) => xs.map((x, j) => (j === i ? { ...x, ...patch } : x)))

  return (
    <Dialog open onClose={onClose} title="Record a cut"
      sub="What went on the table, what came off it, and what was left. The lay comes off its lot as it is recorded — it needs no issue slip as well.">
      <div className="space-y-3 px-4 py-4">
        <div className="grid grid-cols-[minmax(0,3fr)_minmax(0,2fr)] gap-2">
          <Field label="Material" htmlFor="cu-item">
            <Select id="cu-item" value={itemId} onChange={(v) => { setItemId(v); setLotId('') }}
              options={ws.items.map((it) => ({ value: it.id, label: it.name }))} />
          </Field>
          <Field label="On the table" htmlFor="cu-input" hint="The whole lay.">
            <NumberInput id="cu-input" value={input} onChange={setInput} unit={uom} autoFocus />
          </Field>
        </div>
        <Field label="Cut from" htmlFor="cu-lot">
          <Select id="cu-lot" value={lotId} onChange={setLotId}
            options={[
              { value: '', label: 'The oldest lot with enough on it' },
              ...lots.map((l) => ({
                value: l.id,
                label: `${l.batchNo}${l.remnant ? ' (remnant)' : ''}${rackName(l.rack) ? ` · ${rackName(l.rack)}` : ''} · ${num(l.qty, 3)} ${uom}`,
              })),
            ]} />
        </Field>
        {lot && !lotId && (
          <p className="text-[12px] text-ink-3">
            Off <span className="mono">{lot.batchNo}</span>{rackName(lot.rack) && <> on <strong className="text-ink">{rackName(lot.rack)}</strong></>}.
          </p>
        )}
        <Field label={jobWordCap(ws).one} htmlFor="cu-job" hint="What it was cut for. A cut for no job is floor stock.">
          <JobPick id="cu-job" value={jobId} onChange={setJobId} none="Not for one — floor stock" />
        </Field>

        <div className="grid grid-cols-2 items-end gap-2">
          <Field label="Parts" htmlFor="cu-parts">
            <NumberInput id="cu-parts" value={parts} onChange={setParts} unit={uom} />
          </Field>
          <Field label="How many parts" htmlFor="cu-count">
            <NumberInput id="cu-count" value={count} onChange={setCount} step="1" />
          </Field>
          <Field label="The plan" htmlFor="cu-planned" hint="Parts the marker planned. Blank is no plan.">
            <NumberInput id="cu-planned" value={planned} onChange={setPlanned} unit={uom} />
          </Field>
          <Field label="Kerf and trim" htmlFor="cu-kerf" hint="The blade and the edges — on the loss ledger.">
            <NumberInput id="cu-kerf" value={kerf} onChange={setKerf} unit={uom} />
          </Field>
        </div>

        <fieldset className="rounded-lg border border-line px-3 pb-3 pt-2">
          <legend className="px-1 text-[12.5px] font-semibold text-ink">Remnants</legend>
          <p className="mb-2 text-[11.5px] text-ink-3">
            {min > 0
              ? `A piece under ${num(min, 3)} ${uom} is scrap at the cut; anything bigger goes back on a rack.`
              : 'Every piece goes back on a rack. Set the smallest usable piece in the store rules and smaller ones are scrap at the cut.'}
          </p>
          <ul className="space-y-2">
            {rems.map((r, i) => {
              const size = n(r.size)
              const scrap = size > 0 && !isUsableRemnant(ws, itemId, size)
              return (
                <li key={i} className="grid grid-cols-[minmax(0,2fr)_minmax(0,1.3fr)_minmax(0,2.5fr)_auto] items-end gap-2">
                  <Field label="Size of a piece" htmlFor={`cu-rem-size-${i}`}>
                    <NumberInput id={`cu-rem-size-${i}`} value={r.size} onChange={(v) => setRem(i, { size: v })} unit={uom} />
                  </Field>
                  <Field label="Pieces" htmlFor={`cu-rem-pieces-${i}`}>
                    <NumberInput id={`cu-rem-pieces-${i}`} value={r.pieces} onChange={(v) => setRem(i, { pieces: v })} step="1" />
                  </Field>
                  <Field label="What it is" htmlFor={`cu-rem-spec-${i}`}>
                    <TextInput id={`cu-rem-spec-${i}`} value={r.spec} onChange={(v) => setRem(i, { spec: v })} placeholder="1.4 m × full width" />
                  </Field>
                  <button type="button" onClick={() => setRems((xs) => xs.filter((_, j) => j !== i))}
                    aria-label={`Remove remnant ${i + 1}`}
                    className="press mb-1 grid size-8 place-items-center rounded-md text-ink-3 hover:bg-surface-2 hover:text-ink">
                    <Icon name="close" className="size-3.5" />
                  </button>
                  {scrap && <p className="col-span-4 -mt-1 text-[11.5px] text-warn">Under the smallest usable piece — scrap at the cut.</p>}
                </li>
              )
            })}
          </ul>
          <button type="button" onClick={() => setRems((xs) => [...xs, BLANK])}
            className="press mt-2 inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-[12.5px] font-medium text-accent-ink hover:bg-surface-2">
            <Icon name="plus" className="size-3.5" /> Add a remnant
          </button>
          {anyUsable && (
            <Field label="Which rack they go on" htmlFor="cu-rack" className="mt-2">
              <RackSelect id="cu-rack" value={rack} onChange={setRack} />
            </Field>
          )}
        </fieldset>

        {gap !== null && (
          <p role="status" className={`rounded-md border px-2.5 py-2 text-[12.5px] ${
            gap === 0 ? 'border-good/30 bg-good-soft text-good' : 'border-warn/30 bg-warn-soft text-warn'}`}>
            Parts + kerf + remnants = <span className="num font-semibold">{num(sum, 3)} {uom}</span> of{' '}
            <span className="num font-semibold">{num(c.inputQty, 3)} {uom}</span> on the table
            {gap === 0 ? ' — it adds up.' : gap > 0 ? ` — ${num(gap, 3)} ${uom} not accounted for.` : ` — ${num(-gap, 3)} ${uom} more than went on.`}
          </p>
        )}

        <Field label="Cut by" htmlFor="cu-operator" hint="Blank is you." error={tried ? problem ?? undefined : undefined}>
          <TextInput id="cu-operator" value={operator} onChange={setOperator} onEnter={save} placeholder="Cutting master" />
        </Field>
      </div>
      <Foot onClose={onClose} onSave={save} label="Record the cut" />
    </Dialog>
  )
}

/** Remnant pieces into a job — the buy it saves. */
export function UseRemnantDialog({ lotId, onClose }: { lotId: string | null; onClose: () => void }) {
  const { workspace, update, today, session } = useWorkspace()
  const [jobId, setJobId] = useState('')
  const [pieces, setPieces] = useState('')
  const [tried, setTried] = useState(false)

  useEffect(() => {
    if (!lotId || !workspace) return
    const jobs = openJobs(workspace)
    const lot = lotOf(workspace, lotId)
    setJobId(jobs[jobs.length - 1]?.id ?? '')
    setPieces(lot?.pieces ? String(lot.pieces) : '1'); setTried(false)
  }, [lotId]) // eslint-disable-line react-hooks/exhaustive-deps

  if (!lotId || !workspace) return null
  const lot = lotOf(workspace, lotId)
  if (!lot) return null
  const item = workspace.items.find((i) => i.id === lot.itemId)
  const uom = item?.uom ?? ''
  const u = { lotId, pieces: n(pieces), jobId, on: today, actor: session.actor }
  const problem = useRemnantProblem(workspace, u)
  const qty = Number.isInteger(u.pieces) && u.pieces > 0 ? Math.min(piecesQty(lot, u.pieces), lot.qty) : null

  const save = () => {
    setTried(true)
    if (problem) return
    update((w) => useRemnant(w, u)[0])
    onClose()
  }

  return (
    <Dialog open onClose={onClose} title="Use in a job"
      sub={`${item?.name ?? 'Remnant'} · ${lot.batchNo} · ${lot.pieces ? `${lot.pieces} pieces, ` : ''}${num(lot.qty, 3)} ${uom}`}>
      <div className="space-y-3 px-4 py-4">
        <Field label={jobWordCap(workspace).one} htmlFor="ur-job">
          <JobPick id="ur-job" value={jobId} onChange={setJobId} />
        </Field>
        <Field label="How many pieces" htmlFor="ur-pieces" error={tried ? problem ?? undefined : undefined}
          hint={qty !== null ? `${num(qty, 3)} ${uom} — written on an issue slip, like any material to the floor.` : undefined}>
          <NumberInput id="ur-pieces" value={pieces} onChange={setPieces} step="1" autoFocus />
        </Field>
      </div>
      <Foot onClose={onClose} onSave={save} label="Use it" />
    </Dialog>
  )
}

/** Remnant pieces off the book, by decision, with what the dealer pays for them. */
export function ScrapRemnantDialog({ lotId, onClose }: { lotId: string | null; onClose: () => void }) {
  const { workspace, update, today, session } = useWorkspace()
  const [pieces, setPieces] = useState('')
  const [why, setWhy] = useState('')
  const [tried, setTried] = useState(false)

  useEffect(() => {
    if (!lotId || !workspace) return
    const lot = lotOf(workspace, lotId)
    setPieces(lot?.pieces ? String(lot.pieces) : '1'); setWhy(''); setTried(false)
  }, [lotId]) // eslint-disable-line react-hooks/exhaustive-deps

  if (!lotId || !workspace) return null
  const lot = lotOf(workspace, lotId)
  if (!lot) return null
  const item = workspace.items.find((i) => i.id === lot.itemId)
  const uom = item?.uom ?? ''
  const s = { lotId, pieces: n(pieces), on: today, actor: session.actor, note: why }
  const problem = scrapRemnantProblem(workspace, s)
  const qty = Number.isInteger(s.pieces) && s.pieces > 0 ? Math.min(piecesQty(lot, s.pieces), lot.qty) : null
  const rate = scrapRateOf(workspace, lot.itemId)

  const save = () => {
    setTried(true)
    if (problem) return
    update((w) => scrapRemnant(w, s)[0])
    onClose()
  }

  return (
    <Dialog open onClose={onClose} title="Scrap it"
      sub={`${item?.name ?? 'Remnant'} · ${lot.batchNo} · ${lot.pieces ? `${lot.pieces} pieces, ` : ''}${num(lot.qty, 3)} ${uom}`}>
      <div className="space-y-3 px-4 py-4">
        <Field label="How many pieces" htmlFor="sx-pieces"
          hint={qty !== null ? `${num(qty, 3)} ${uom} off the book, onto the loss ledger as scrap at the cut${
            rate > 0 ? ` — booked at ${money(qty * rate)} from the scrap dealer` : ', a dead loss: no scrap rate is set for it'}.` : undefined}>
          <NumberInput id="sx-pieces" value={pieces} onChange={setPieces} step="1" />
        </Field>
        <Field label="Why" htmlFor="sx-why" error={tried ? problem ?? undefined : undefined}>
          <TextInput id="sx-why" value={why} onChange={setWhy} onEnter={save} placeholder="Too old to use, too small, damaged" autoFocus />
        </Field>
      </div>
      <Foot onClose={onClose} onSave={save} label="Scrap it" />
    </Dialog>
  )
}
