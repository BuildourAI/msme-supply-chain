'use client'
import { useEffect, useState } from 'react'
import { QuoteStanding } from '@/components/sourcing/BestLanded'
import { Dialog } from '@/components/ui/Dialog'
import { Field, NumberInput, Select, TextInput } from '@/components/ui/Field'
import { Icon } from '@/components/ui/icons'
import { useWorkspace } from '@/components/workspace/store'
import { issueId } from '@/lib/workspace/defaults'
import { syncRfqStates } from '@/lib/workspace/sourcing'
import type { Quote, QuoteLine } from '@/lib/workspace/types'

/**
 * A quotation somebody gave you.
 *
 * One supplier, one date, and the prices on it — which is what a quotation is.
 * It used to be one form per material, so a quotation pricing six things was
 * filled in six times and the reference and validity typed six times with it.
 *
 * The request it answers is optional and sits last, because in practice the
 * price usually arrives first — on the phone, in a WhatsApp photo of a
 * letterhead — and being made to create a request before you can write down a
 * number is how a system gets bypassed. Picking one links them and moves the
 * request along by itself.
 */
interface Line {
  id?: string
  itemId: string
  price: string
  moq: string
  leadDays: string
  state: QuoteLine['state']
}

const BLANK: Line = { itemId: '', price: '', moq: '', leadDays: '', state: 'received' }

export function QuoteForm({ open, onClose, editing, forRfqId }: {
  open: boolean
  onClose: () => void
  editing: Quote | null
  /** opened from a request's own card */
  forRfqId?: string
}) {
  const { workspace, update, today } = useWorkspace()
  const [vendorId, setVendorId] = useState('')
  const [lines, setLines] = useState<Line[]>([BLANK])
  const [ref, setRef] = useState('')
  const [valid, setValid] = useState('')
  const [on, setOn] = useState('')
  const [rfqId, setRfqId] = useState('')
  const [tried, setTried] = useState(false)

  useEffect(() => {
    if (!open || !workspace) return
    setTried(false)
    if (editing) {
      setVendorId(editing.vendorId)
      setLines(editing.lines.map((l) => ({
        id: l.id,
        itemId: l.itemId,
        price: String(l.unitPrice),
        moq: l.moq > 0 ? String(l.moq) : '',
        leadDays: String(l.leadDays),
        state: l.state,
      })))
      setRef(editing.ref ?? ''); setValid(editing.validUntil ?? '')
      setOn(editing.on); setRfqId(editing.rfqId ?? '')
    } else {
      const rfq = forRfqId ? workspace.rfqs.find((r) => r.id === forRfqId) : undefined
      setVendorId(rfq?.vendorIds[0] ?? workspace.vendors[0]?.id ?? '')
      setLines([{ ...BLANK, itemId: rfq?.itemId ?? workspace.items[0]?.id ?? '' }])
      setRef(''); setValid(''); setOn(today); setRfqId(forRfqId ?? '')
    }
  }, [open, editing, forRfqId]) // eslint-disable-line react-hooks/exhaustive-deps

  if (!open || !workspace) return null
  const ws = workspace

  const setLine = (i: number, patch: Partial<Line>) =>
    setLines((ls) => ls.map((l, k) => (k === i ? { ...l, ...patch } : l)))

  const n = (v: string) => (v.trim() === '' ? NaN : Number(v))
  const ok = (l: Line) => Boolean(l.itemId)
    && Number.isFinite(n(l.price)) && n(l.price) > 0
    && Number.isFinite(n(l.leadDays)) && n(l.leadDays) > 0

  const valid1 = Boolean(vendorId) && lines.length > 0 && lines.every(ok) && on.length === 10

  const blocked = ws.vendors.length === 0 || ws.items.length === 0
  if (blocked) {
    return (
      <Dialog open onClose={onClose} title="Record a quotation">
        <div className="px-4 py-5">
          <p className="rounded-lg border border-warn/30 bg-warn-soft px-3 py-2.5 text-[13px] leading-relaxed text-ink-2">
            {ws.vendors.length === 0
              ? 'Add a supplier first — a quotation comes from somebody.'
              : 'Add a material first — a quotation is for something.'}
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
    if (!valid1) return
    update((w0) => {
      const [w, id] = editing ? [w0, editing.id] : issueId(w0, 'QT')
      const quote: Quote = {
        id,
        rfqId: rfqId || undefined,
        docId: editing?.docId,
        vendorId,
        ref: ref.trim() || undefined,
        validUntil: valid.length === 10 ? valid : undefined,
        on,
        lines: lines.map((l, i) => ({
          // a line keeps its id when it had one, so anything keyed to it stays
          id: l.id ?? `${id}/${i + 1}`,
          itemId: l.itemId,
          unitPrice: n(l.price),
          moq: l.moq.trim() === '' ? 0 : Number(l.moq),
          leadDays: n(l.leadDays),
          state: l.state,
        })),
      }
      return syncRfqStates({
        ...w,
        quotes: editing ? w.quotes.map((q) => (q.id === id ? quote : q)) : [...w.quotes, quote],
      })
    })
    onClose()
  }

  const uomOf = (id: string) => ws.items.find((i) => i.id === id)?.uom

  return (
    <Dialog open onClose={onClose} wide
      title={editing ? 'Edit quotation' : 'Record a quotation'}>
      <div className="space-y-4 px-4 py-4">
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Who quoted it" htmlFor="qf-vendor">
            <Select id="qf-vendor" value={vendorId} onChange={setVendorId}
              options={ws.vendors.map((v) => ({ value: v.id, label: v.name }))} />
          </Field>
          <Field label="Their reference" hint="Optional — the number on their quotation.">
            <TextInput value={ref} onChange={setRef} placeholder="QTR-2026-003" />
          </Field>
          {/*
            * Almost every quotation says one and this build threw it away, so
            * a price agreed in March went on ranking suppliers in September
            * with nothing said. Optional: a price settled on the phone carries
            * no validity, and inventing one would be worse than having none.
            */}
          <Field label="Good until" hint="Optional — what their quotation says." htmlFor="qf-valid">
            <input id="qf-valid" type="date" value={valid}
              onChange={(e) => setValid(e.target.value)}
              className="num w-full rounded-md border border-line bg-surface px-2.5 py-2 text-[13px] outline-none focus:border-accent" />
          </Field>
        </div>

        <div className="space-y-3">
          {lines.map((l, i) => (
            <div key={i} className="rounded-lg border border-line bg-surface-2/40 p-3">
              <div className="flex flex-wrap items-end gap-3">
                <Field label="For what" className="min-w-[11rem] flex-1" htmlFor={`qf-item-${i}`}>
                  <Select id={`qf-item-${i}`} value={l.itemId}
                    onChange={(v) => setLine(i, { itemId: v })}
                    options={ws.items.map((it) => ({ value: it.id, label: it.name }))} />
                </Field>
                <Field label="Their price" className="w-32" htmlFor={`qf-price-${i}`}>
                  <NumberInput id={`qf-price-${i}`} value={l.price}
                    onChange={(v) => setLine(i, { price: v })}
                    unit={uomOf(l.itemId) ? `₹/${uomOf(l.itemId)}` : '₹'}
                    invalid={tried && !ok(l)} />
                </Field>
                <Field label="Smallest order" className="w-28" htmlFor={`qf-moq-${i}`}>
                  <NumberInput id={`qf-moq-${i}`} value={l.moq}
                    onChange={(v) => setLine(i, { moq: v })} unit={uomOf(l.itemId)} placeholder="0" />
                </Field>
                <Field label="They take" className="w-28" htmlFor={`qf-lead-${i}`}>
                  <NumberInput id={`qf-lead-${i}`} value={l.leadDays}
                    onChange={(v) => setLine(i, { leadDays: v })} unit="days" step="1"
                    invalid={tried && !ok(l)} />
                </Field>
                {lines.length > 1 && (
                  <button type="button" onClick={() => setLines((ls) => ls.filter((_, k) => k !== i))}
                    title="Remove this line"
                    className="press mb-1 rounded-md p-1.5 text-ink-4 hover:bg-critical-soft hover:text-critical">
                    <Icon name="trash" className="size-4" />
                    <span className="sr-only">Remove this line</span>
                  </button>
                )}
              </div>

              {/*
                * Where this price sits against the rates already on file. Not a
                * recommendation: a quotation is a record of what somebody said,
                * and suggesting a different supplier would be answering a
                * question nobody asked.
                */}
              <div className="mt-2.5">
                <QuoteStanding itemId={l.itemId} vendorId={vendorId} price={n(l.price)} />
              </div>
            </div>
          ))}

          <button type="button" onClick={() => setLines((ls) => [...ls, BLANK])}
            className="press inline-flex items-center gap-1.5 rounded-lg border border-line bg-surface px-3 py-2 text-[13px] font-medium hover:bg-surface-2">
            <Icon name="plus" className="size-3.5" />
            Add another material
          </button>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Quoted on" htmlFor="qf-on">
            <input id="qf-on" type="date" value={on} onChange={(e) => setOn(e.target.value)}
              className="num w-full rounded-md border border-line bg-surface px-2.5 py-2 text-[13px] outline-none focus:border-accent" />
          </Field>
          <Field label="Against a request?" hint="Optional. Linking it lets you compare like with like.">
            <Select value={rfqId} onChange={setRfqId} placeholder="No request"
              options={ws.rfqs.map((r) => {
                const it = ws.items.find((i) => i.id === r.itemId)
                return { value: r.id, label: `${r.no}${it ? ` · ${it.name}` : ''}` }
              })} />
          </Field>
        </div>

        {tried && !valid1 && (
          <p className="text-[12.5px] text-critical">
            Every line needs a material, a price and a number of days.
          </p>
        )}
      </div>

      <footer className="flex items-center gap-2 border-t border-line-soft px-4 py-3">
        <button type="button" onClick={onClose}
          className="press rounded-lg px-2.5 py-2 text-[13px] text-ink-2 hover:text-ink">Cancel</button>
        <span className="ml-auto" />
        <button type="button" onClick={save}
          className="press rounded-lg border border-accent-ink bg-accent-ink px-3.5 py-2 text-[13px] font-semibold text-on-accent hover:bg-accent">
          {editing ? 'Save changes' : `Record quotation${lines.length > 1 ? ` · ${lines.length} lines` : ''}`}
        </button>
      </footer>
    </Dialog>
  )
}
