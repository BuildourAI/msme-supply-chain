'use client'
import { useEffect, useState } from 'react'
import { QuoteStanding } from '@/components/sourcing/BestLanded'
import { Dialog } from '@/components/ui/Dialog'
import { Field, NumberInput, Select, TextInput } from '@/components/ui/Field'
import { useWorkspace } from '@/components/workspace/store'
import { issueId } from '@/lib/workspace/defaults'
import { syncRfqStates } from '@/lib/workspace/sourcing'
import type { Quote } from '@/lib/workspace/types'

/**
 * A price somebody gave you.
 *
 * The request it answers is optional and sits last, because in practice the
 * price usually arrives first — on the phone, in a WhatsApp photo of a
 * letterhead — and being made to create a request before you can write down a
 * number is how a system gets bypassed. Picking one links them and moves the
 * request along by itself.
 */
export function QuoteForm({ open, onClose, editing, forRfqId }: {
  open: boolean
  onClose: () => void
  editing: Quote | null
  /** opened from a request's own card */
  forRfqId?: string
}) {
  const { workspace, update, today } = useWorkspace()
  const [vendorId, setVendorId] = useState('')
  const [itemId, setItemId] = useState('')
  const [price, setPrice] = useState('')
  const [moq, setMoq] = useState('')
  const [leadDays, setLeadDays] = useState('')
  const [ref, setRef] = useState('')
  const [rfqId, setRfqId] = useState('')
  const [tried, setTried] = useState(false)

  useEffect(() => {
    if (!open || !workspace) return
    setTried(false)
    if (editing) {
      setVendorId(editing.vendorId); setItemId(editing.itemId)
      setPrice(String(editing.unitPrice)); setMoq(String(editing.moq))
      setLeadDays(String(editing.leadDays)); setRef(editing.ref ?? '')
      setRfqId(editing.rfqId ?? '')
    } else {
      const rfq = forRfqId ? workspace.rfqs.find((r) => r.id === forRfqId) : undefined
      setVendorId(rfq?.vendorIds[0] ?? workspace.vendors[0]?.id ?? '')
      setItemId(rfq?.itemId ?? workspace.items[0]?.id ?? '')
      setPrice(''); setMoq(''); setLeadDays(''); setRef('')
      setRfqId(forRfqId ?? '')
    }
  }, [open, editing, forRfqId]) // eslint-disable-line react-hooks/exhaustive-deps

  if (!open || !workspace) return null
  const ws = workspace

  const n = (v: string) => (v.trim() === '' ? NaN : Number(v))
  const priceN = n(price)
  const moqN = moq.trim() === '' ? 0 : Number(moq)
  const leadN = n(leadDays)
  const vendorOk = Boolean(vendorId)
  const itemOk = Boolean(itemId)
  const priceOk = Number.isFinite(priceN) && priceN > 0
  const leadOk = Number.isFinite(leadN) && leadN > 0
  const ok = vendorOk && itemOk && priceOk && leadOk

  const blocked = ws.vendors.length === 0 || ws.items.length === 0
  if (blocked) {
    return (
      <Dialog open onClose={onClose} title="Record a quote">
        <div className="px-4 py-5">
          <p className="rounded-lg border border-warn/30 bg-warn-soft px-3 py-2.5 text-[13px] leading-relaxed text-ink-2">
            {ws.vendors.length === 0
              ? 'Add a supplier first — a quote comes from somebody.'
              : 'Add a material first — a quote is for something.'}
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

  const save = () => {
    setTried(true)
    if (!ok) return
    update((w0) => {
      const [w, id] = editing ? [w0, editing.id] : issueId(w0, 'QT')
      const quote: Quote = {
        id,
        rfqId: rfqId || undefined,
        vendorId, itemId,
        unitPrice: priceN,
        moq: moqN,
        leadDays: leadN,
        ref: ref.trim() || undefined,
        state: editing?.state ?? 'received',
        on: editing?.on ?? today,
      }
      return syncRfqStates({
        ...w,
        quotes: editing ? w.quotes.map((q) => (q.id === id ? quote : q)) : [...w.quotes, quote],
      })
    })
    onClose()
  }

  const uom = ws.items.find((i) => i.id === itemId)?.uom

  return (
    <Dialog open onClose={onClose} wide
      title={editing ? 'Edit quote' : 'Record a quote'}>
      <div className="space-y-4 px-4 py-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Who quoted it" htmlFor="qf-vendor">
            <Select id="qf-vendor" value={vendorId} onChange={setVendorId}
              options={ws.vendors.map((v) => ({ value: v.id, label: v.name }))} />
          </Field>
          <Field label="For what" htmlFor="qf-item">
            <Select id="qf-item" value={itemId} onChange={setItemId}
              options={ws.items.map((i) => ({ value: i.id, label: i.name }))} />
          </Field>
        </div>

        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Their price" htmlFor="qf-price"
            error={tried && !priceOk ? 'Put in a price.' : null}>
            <NumberInput id="qf-price" value={price} onChange={setPrice}
              unit={uom ? `₹/${uom}` : '₹'} invalid={tried && !priceOk} />
          </Field>
          <Field label="Smallest order" htmlFor="qf-moq">
            <NumberInput id="qf-moq" value={moq} onChange={setMoq} unit={uom} placeholder="0" />
          </Field>
          <Field label="They take" htmlFor="qf-lead"
            error={tried && !leadOk ? 'Put in a number of days.' : null}>
            <NumberInput id="qf-lead" value={leadDays} onChange={setLeadDays} unit="days" step="1"
              invalid={tried && !leadOk} />
          </Field>
        </div>

        {/*
          * Where this price sits against the rates already on file. Not a
          * recommendation: a quote is a record of what somebody said, and
          * suggesting a different supplier would be answering a question
          * nobody asked.
          */}
        <QuoteStanding itemId={itemId} vendorId={vendorId} price={priceN} />

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Their reference" hint="Optional — the number on their quotation.">
            <TextInput value={ref} onChange={setRef} placeholder="QTR-2026-003" />
          </Field>
          <Field label="Against a request?" hint="Optional. Linking it lets you compare like with like.">
            <Select value={rfqId} onChange={setRfqId} placeholder="No request"
              options={ws.rfqs.map((r) => {
                const it = ws.items.find((i) => i.id === r.itemId)
                return { value: r.id, label: `${r.no}${it ? ` · ${it.name}` : ''}` }
              })} />
          </Field>
        </div>
      </div>

      <footer className="flex items-center gap-2 border-t border-line-soft px-4 py-3">
        <button type="button" onClick={onClose}
          className="press rounded-lg px-2.5 py-2 text-[13px] text-ink-2 hover:text-ink">Cancel</button>
        <span className="ml-auto" />
        <button type="button" onClick={save}
          className="press rounded-lg border border-accent-ink bg-accent-ink px-3.5 py-2 text-[13px] font-semibold text-on-accent hover:bg-accent">
          {editing ? 'Save changes' : 'Record quote'}
        </button>
      </footer>
    </Dialog>
  )
}
