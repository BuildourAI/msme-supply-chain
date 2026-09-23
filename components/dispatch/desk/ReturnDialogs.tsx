'use client'
import { useEffect, useState } from 'react'
import { Dialog } from '@/components/ui/Dialog'
import { Field, NumberInput, Select, TextInput } from '@/components/ui/Field'
import { useWorkspace } from '@/components/workspace/store'
import { DATE, n } from '@/components/production/desk/ProductForm'
import { shortDate } from '@/lib/domain/format'
import { productOf } from '@/lib/workspace/products'
import {
  authoriseReturn, dueByOf, receiveProblem, receiveReturn, returnProblem, returnableNotes, returnableOn, rmaOf,
  type ReturnInput,
} from '@/lib/workspace/returns'

const Footer = ({ onClose, onSave, label }: { onClose: () => void; onSave: () => void; label: string }) => (
  <footer className="flex items-center justify-end gap-2 border-t border-line-soft px-4 py-3">
    <button type="button" onClick={onClose}
      className="press rounded-lg px-2.5 py-2 text-[13px] text-ink-2 hover:text-ink">Cancel</button>
    <button type="button" onClick={onSave}
      className="press rounded-lg border border-accent-ink bg-accent-ink px-3.5 py-2 text-[13px] font-semibold text-on-accent hover:bg-accent">
      {label}
    </button>
  </footer>
)

/**
 * A return agreed with a customer: against the note it went out on, never
 * more than went on it, with a reason and the day it is due back.
 */
export function ReturnForm({ noteId, onClose }: {
  /** undefined is closed; null is "pick the note" */
  noteId: string | null | undefined
  onClose: () => void
}) {
  const { workspace, update, today, session } = useWorkspace()
  const [pick, setPick] = useState('')
  const [productId, setProductId] = useState('')
  const [qty, setQty] = useState('')
  const [reason, setReason] = useState('')
  const [raisedOn, setRaisedOn] = useState('')
  const [dueBy, setDueBy] = useState('')
  const [dueTouched, setDueTouched] = useState(false)
  const [owner, setOwner] = useState('')
  const [tried, setTried] = useState(false)

  useEffect(() => {
    if (noteId === undefined || !workspace) return
    const note = (workspace.dispatchNotes ?? []).find((x) => x.id === noteId)
    setPick(noteId ?? ''); setProductId(note?.lines[0]?.productId ?? ''); setQty(''); setReason('')
    setRaisedOn(today); setDueBy(''); setDueTouched(false); setOwner(session?.actor || workspace.owner.name); setTried(false)
  }, [noteId]) // eslint-disable-line react-hooks/exhaustive-deps

  if (noteId === undefined || !workspace) return null
  const ws = workspace
  const notes = returnableNotes(ws)
  const note = (ws.dispatchNotes ?? []).find((x) => x.id === pick)
  const due = dueTouched ? dueBy : raisedOn ? dueByOf(ws, raisedOn) : ''
  const input: ReturnInput = { noteId: pick, productId, qty: n(qty), reason, raisedOn, dueBy: due, owner }
  const problem = returnProblem(ws, input, today)
  const can = note && productId ? returnableOn(ws, note.id, productId) : 0
  const name = (id: string) => (ws.customers ?? []).find((c) => c.id === id)?.name ?? 'customer'

  const save = () => {
    setTried(true)
    if (problem) return
    update((w) => authoriseReturn(w, input, today)[0])
    onClose()
  }

  return (
    <Dialog open onClose={onClose} title={note ? `A return against ${note.no}` : 'Authorise a return'}
      sub="What the customer is sending back, why, and by when. Nothing goes back on the shelf until it is checked in.">
      <div className="space-y-3 px-4 py-4">
        <Field label="Went out on" htmlFor="rf-note">
          <Select id="rf-note" value={pick}
            onChange={(v) => { setPick(v); setProductId((ws.dispatchNotes ?? []).find((x) => x.id === v)?.lines[0]?.productId ?? '') }}
            placeholder={notes.length ? 'Pick the dispatch note' : 'No delivered note to return against'}
            options={[...(note && !notes.some((x) => x.id === note.id) ? [note] : []), ...notes].map((x) => ({
              value: x.id, label: `${x.no} — ${name(x.customerId)} · ${shortDate(x.on)}`,
            }))} />
        </Field>
        {note && (
          <div className="grid grid-cols-[minmax(0,2fr)_minmax(0,1fr)] items-end gap-2">
            <Field label="Product" htmlFor="rf-product">
              <Select id="rf-product" value={productId} onChange={setProductId}
                options={[...new Set(note.lines.map((l) => l.productId))].map((pid) => ({ value: pid, label: productOf(ws, pid)?.name ?? pid }))} />
            </Field>
            <Field label="How many" htmlFor="rf-qty" hint={`Up to ${can}`}>
              <NumberInput id="rf-qty" value={qty} onChange={setQty} step="1" autoFocus />
            </Field>
          </div>
        )}
        <Field label="Why" htmlFor="rf-reason">
          <TextInput id="rf-reason" value={reason} onChange={setReason} placeholder="Wrong wash on 12 pieces" />
        </Field>
        <div className="grid grid-cols-3 items-end gap-2">
          <Field label="Agreed on" htmlFor="rf-on">
            <input id="rf-on" type="date" value={raisedOn} max={today} onChange={(e) => setRaisedOn(e.target.value)} className={DATE} />
          </Field>
          <Field label="Due back by" htmlFor="rf-due">
            <input id="rf-due" type="date" value={due} min={raisedOn || undefined}
              onChange={(e) => { setDueBy(e.target.value); setDueTouched(true) }} className={DATE} />
          </Field>
          <Field label="Agreed by" htmlFor="rf-owner">
            <TextInput id="rf-owner" value={owner} onChange={setOwner} />
          </Field>
        </div>
        {tried && problem && <p role="alert" className="text-[12.5px] text-critical">{problem}</p>}
      </div>
      <Footer onClose={onClose} onSave={save} label="Authorise the return" />
    </Dialog>
  )
}

/**
 * A return at the gate: checked, the good ones back on the finished-goods
 * shelf against its number, the damaged ones kept off it with what is wrong.
 */
export function ReceiveReturnDialog({ rmaId, onClose }: { rmaId: string | null; onClose: () => void }) {
  const { workspace, update, today, session } = useWorkspace()
  const [on, setOn] = useState('')
  const [by, setBy] = useState('')
  const [good, setGood] = useState('')
  const [damaged, setDamaged] = useState('')
  const [why, setWhy] = useState('')
  const [tried, setTried] = useState(false)

  useEffect(() => {
    if (!rmaId || !workspace) return
    const r = rmaOf(workspace, rmaId)
    setOn(today); setBy(session?.actor || workspace.owner.name); setGood(r ? String(r.qty) : ''); setDamaged('0'); setWhy(''); setTried(false)
  }, [rmaId]) // eslint-disable-line react-hooks/exhaustive-deps

  if (!rmaId || !workspace) return null
  const r = rmaOf(workspace, rmaId)
  if (!r) return null
  const product = productOf(workspace, r.productId)
  const x = { on, checkedBy: by, good: good.trim() === '' ? 0 : n(good), damaged: damaged.trim() === '' ? 0 : n(damaged), damageNote: why }
  const problem = receiveProblem(workspace, rmaId, x, today)

  const save = () => {
    setTried(true)
    if (problem) return
    update((w) => receiveReturn(w, rmaId, x, today))
    onClose()
  }

  return (
    <Dialog open onClose={onClose} title={`Book in ${r.no}`}
      sub={`${r.qty} ${product?.name ?? 'pieces'} agreed on ${shortDate(r.raisedOn)} — ${r.reason}.`}>
      <div className="space-y-3 px-4 py-4">
        <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,2fr)] items-end gap-2">
          <Field label="Came back on" htmlFor="rr-on">
            <input id="rr-on" type="date" value={on} min={r.raisedOn} max={today} onChange={(e) => setOn(e.target.value)} className={DATE} />
          </Field>
          <Field label="Checked by" htmlFor="rr-by">
            <TextInput id="rr-by" value={by} onChange={setBy} />
          </Field>
        </div>
        <div className="grid grid-cols-2 items-end gap-2">
          <Field label="Fit to sell again" htmlFor="rr-good" hint="Back on the finished-goods shelf">
            <NumberInput id="rr-good" value={good} onChange={setGood} step="1" />
          </Field>
          <Field label="Damaged" htmlFor="rr-damaged" hint="Kept off the shelf">
            <NumberInput id="rr-damaged" value={damaged} onChange={setDamaged} step="1" />
          </Field>
        </div>
        {x.damaged > 0 && (
          <Field label="What is wrong with them" htmlFor="rr-why">
            <TextInput id="rr-why" value={why} onChange={setWhy} placeholder="Torn at the seam in transit" />
          </Field>
        )}
        {x.good + x.damaged > 0 && x.good + x.damaged < r.qty && (
          <p className="text-[12.5px] text-warn">{r.qty - x.good - x.damaged} of the {r.qty} agreed did not come back.</p>
        )}
        {tried && problem && <p role="alert" className="text-[12.5px] text-critical">{problem}</p>}
      </div>
      <Footer onClose={onClose} onSave={save} label="Book it in" />
    </Dialog>
  )
}
