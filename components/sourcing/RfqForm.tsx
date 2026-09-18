'use client'
import { useEffect, useState } from 'react'
import { Dialog } from '@/components/ui/Dialog'
import { Chips, Field, NumberInput, Select, TextInput } from '@/components/ui/Field'
import { useWorkspace } from '@/components/workspace/store'
import { issueId } from '@/lib/workspace/defaults'
import { nextNo } from '@/lib/workspace/sourcing'
import type { Rfq, RfqState } from '@/lib/workspace/types'

/**
 * Asking suppliers for a price.
 *
 * The record, not the sending. §11 has said since the first commit that the
 * system never contacts a supplier, and nothing here does — this is the note
 * that says you asked, so that a price arriving next week has something to
 * attach itself to and a week of silence is visible.
 *
 * Asking nobody is allowed. A draft with a quantity and a date is a useful
 * thing to have written down before you know who to ring.
 */
const STATES: { value: RfqState; label: string }[] = [
  { value: 'draft', label: 'Draft' },
  { value: 'sent', label: 'Sent' },
  { value: 'closed', label: 'Closed' },
]

export function RfqForm({ open, onClose, editing }: {
  open: boolean
  onClose: () => void
  editing: Rfq | null
}) {
  const { workspace, update, today } = useWorkspace()
  const [itemId, setItemId] = useState('')
  const [qty, setQty] = useState('')
  const [neededBy, setNeededBy] = useState('')
  const [vendorIds, setVendorIds] = useState<string[]>([])
  const [state, setState] = useState<RfqState>('sent')
  const [note, setNote] = useState('')
  const [tried, setTried] = useState(false)

  useEffect(() => {
    if (!open || !workspace) return
    setTried(false)
    if (editing) {
      setItemId(editing.itemId); setQty(String(editing.qty))
      setNeededBy(editing.neededBy); setVendorIds(editing.vendorIds)
      setState(editing.state === 'quoted' || editing.state === 'awarded' ? 'sent' : editing.state)
      setNote(editing.note ?? '')
    } else {
      setItemId(workspace.items[0]?.id ?? '')
      setQty(''); setNeededBy(''); setVendorIds([]); setState('sent'); setNote('')
    }
  }, [open, editing]) // eslint-disable-line react-hooks/exhaustive-deps

  if (!open || !workspace) return null
  const ws = workspace

  const qtyN = qty.trim() === '' ? NaN : Number(qty)
  const itemOk = Boolean(itemId)
  const qtyOk = Number.isFinite(qtyN) && qtyN > 0
  const dateOk = neededBy.length === 10
  const ok = itemOk && qtyOk && dateOk

  const toggle = (id: string) =>
    setVendorIds((v) => (v.includes(id) ? v.filter((x) => x !== id) : [...v, id]))

  const save = () => {
    setTried(true)
    if (!ok) return
    update((w0) => {
      const [w, id] = editing ? [w0, editing.id] : issueId(w0, 'RF')
      const rfq: Rfq = {
        id,
        no: editing?.no ?? nextNo('RFQ', w.rfqs),
        itemId,
        qty: qtyN,
        neededBy,
        vendorIds,
        // a request the data has moved on keeps where it got to
        state: editing && (editing.state === 'quoted' || editing.state === 'awarded') && state === 'sent'
          ? editing.state : state,
        raisedOn: editing?.raisedOn ?? today,
        note: note.trim() || undefined,
      }
      return {
        ...w,
        rfqs: editing ? w.rfqs.map((r) => (r.id === id ? rfq : r)) : [...w.rfqs, rfq],
      }
    })
    onClose()
  }

  if (ws.items.length === 0) {
    return (
      <Dialog open onClose={onClose} title="Ask for a price">
        <div className="px-4 py-5">
          <p className="rounded-lg border border-warn/30 bg-warn-soft px-3 py-2.5 text-[13px] leading-relaxed text-ink-2">
            Add a material first — a request has to be for something.
          </p>
        </div>
        <footer className="flex justify-end border-t border-line-soft px-4 py-3">
          <button type="button" onClick={onClose}
            className="press rounded-lg border border-line bg-surface px-3 py-2 text-[13px] font-medium hover:bg-surface-2">
            Close
          </button>
        </footer>
      </Dialog>
    )
  }

  return (
    <Dialog open onClose={onClose} wide
      title={editing ? `Edit ${editing.no}` : 'Ask for a price'}>
      <div className="space-y-4 px-4 py-4">
        <div className="grid gap-4 sm:grid-cols-[2fr_1fr_1fr]">
          <Field label="Material" htmlFor="rf-item">
            <Select id="rf-item" value={itemId} onChange={setItemId}
              options={ws.items.map((i) => ({ value: i.id, label: i.name }))} />
          </Field>
          <Field label="How much" htmlFor="rf-qty"
            error={tried && !qtyOk ? 'Put in a quantity.' : null}>
            <NumberInput id="rf-qty" value={qty} onChange={setQty}
              unit={ws.items.find((i) => i.id === itemId)?.uom} invalid={tried && !qtyOk} />
          </Field>
          <Field label="Needed by" htmlFor="rf-date"
            error={tried && !dateOk ? 'Pick a date.' : null}>
            <input id="rf-date" type="date" value={neededBy}
              onChange={(e) => setNeededBy(e.target.value)}
              className={`num w-full rounded-md border bg-surface px-2.5 py-2 text-[13px] outline-none ${
                tried && !dateOk ? 'border-critical' : 'border-line focus:border-accent'}`} />
          </Field>
        </div>

        <Field label="Who are you asking?"
          hint={ws.vendors.length ? 'Leave it empty if you have not decided yet.' : undefined}>
          {ws.vendors.length === 0 ? (
            <p className="text-[12.5px] text-ink-3">
              No suppliers yet. You can still write the request down and add them later.
            </p>
          ) : (
            <div className="flex flex-wrap gap-1.5">
              {ws.vendors.map((v) => (
                <button key={v.id} type="button" onClick={() => toggle(v.id)}
                  aria-pressed={vendorIds.includes(v.id)}
                  className={`press rounded-full border px-2.5 py-1 text-[12px] transition-colors ${
                    vendorIds.includes(v.id)
                      ? 'border-accent-ink bg-accent-ink text-on-accent'
                      : 'border-line text-ink-2 hover:bg-surface-2'}`}>
                  {v.name}
                </button>
              ))}
            </div>
          )}
        </Field>

        <div className="grid gap-4 sm:grid-cols-[1fr_2fr]">
          <Field label="Status">
            <Chips value={state} onChange={(v) => setState(v as RfqState)} options={STATES} />
          </Field>
          <Field label="Note" hint="Optional — a spec, a tolerance, anything you told them.">
            <TextInput value={note} onChange={setNote} placeholder="Half-hard temper" />
          </Field>
        </div>
      </div>

      <footer className="flex items-center gap-2 border-t border-line-soft px-4 py-3">
        <button type="button" onClick={onClose}
          className="press rounded-lg px-2.5 py-2 text-[13px] text-ink-2 hover:text-ink">Cancel</button>
        <span className="ml-auto" />
        <button type="button" onClick={save}
          className="press rounded-lg border border-accent-ink bg-accent-ink px-3.5 py-2 text-[13px] font-semibold text-on-accent hover:bg-accent">
          {editing ? 'Save changes' : 'Create request'}
        </button>
      </footer>
    </Dialog>
  )
}
