'use client'
import { useEffect, useState } from 'react'
import { Dialog } from '@/components/ui/Dialog'
import { Field, NumberInput, TextInput } from '@/components/ui/Field'
import { useWorkspace } from '@/components/workspace/store'
import { outstandingOn, receiptsFor, recordReceipt } from '@/lib/workspace/receipts'
import { num, shortDate } from '@/lib/domain/format'
import type { PurchaseOrder } from '@/lib/workspace/types'

/**
 * What turned up.
 *
 * Three figures rather than one, because a delivery can be short and can be
 * partly bad, and those are different things to know: 100 ordered, 96 arrived,
 * 4 of those rejected. Rolling them into "received 92" throws away the two
 * facts that measure the supplier.
 *
 * Recording this is not bookkeeping. §5 makes the trailing average of the last
 * six actual receipts the authoritative lead time — "non-negotiable" — and
 * until something is recorded here, every lead time in this workspace is what
 * a supplier said about themselves. This is the screen that changes that.
 */
export function ReceiveForm({ open, onClose, order }: {
  open: boolean
  onClose: () => void
  order: PurchaseOrder | null
}) {
  const { workspace, update, today } = useWorkspace()
  const [qty, setQty] = useState('')
  const [rejected, setRejected] = useState('')
  const [note, setNote] = useState('')
  const [on, setOn] = useState('')
  const [tried, setTried] = useState(false)

  useEffect(() => {
    if (!open || !workspace || !order) return
    setTried(false)
    setQty(String(outstandingOn(workspace, order) || order.qty))
    setRejected(''); setNote(''); setOn(today)
  }, [open, order?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  if (!open || !workspace || !order) return null
  const ws = workspace

  const item = ws.items.find((i) => i.id === order.itemId)
  const vendor = ws.vendors.find((v) => v.id === order.vendorId)
  const already = receiptsFor(ws, order.vendorId, order.itemId)
  const left = outstandingOn(ws, order)

  const n = (v: string) => (v.trim() === '' ? NaN : Number(v))
  const qtyN = n(qty)
  const badN = rejected.trim() === '' ? 0 : Number(rejected)
  const qtyOk = Number.isFinite(qtyN) && qtyN > 0
  const badOk = Number.isFinite(badN) && badN >= 0 && badN <= (qtyOk ? qtyN : Infinity)
  const dateOk = on.length === 10 && on >= order.orderedOn
  const ok = qtyOk && badOk && dateOk

  const days = dateOk
    ? Math.round((Date.parse(`${on}T00:00:00Z`) - Date.parse(`${order.orderedOn}T00:00:00Z`)) / 86400000)
    : null

  const save = () => {
    setTried(true)
    if (!ok) return
    update((w) => recordReceipt(w, {
      order,
      qty: qtyN,
      accepted: qtyN - badN,
      rejected: badN,
      note,
      receivedOn: on,
    }))
    onClose()
  }

  return (
    <Dialog open onClose={onClose} wide title={`${order.no} — what arrived`}
      sub={`${item?.name ?? 'this material'} from ${vendor?.name ?? 'this supplier'}`}>
      <div className="space-y-4 px-4 py-4">
        <p className="rounded-lg border border-line bg-surface-2 px-3 py-2 text-[12.5px] text-ink-2">
          {num(order.qty, 3)} {item?.uom} ordered
          {already.length > 0 && <>, {num(order.qty - left, 3)} {item?.uom} already in</>}
          {left > 0 && left < order.qty && <> — <strong className="text-ink">{num(left, 3)} {item?.uom} still to come</strong></>}
        </p>

        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="How much came" htmlFor="rc-qty"
            error={tried && !qtyOk ? 'Put in what arrived.' : null}>
            <NumberInput id="rc-qty" value={qty} onChange={setQty} unit={item?.uom}
              invalid={tried && !qtyOk} />
          </Field>
          <Field label="Of that, rejected" htmlFor="rc-bad"
            hint="Leave empty if it was all usable."
            error={tried && !badOk ? 'More rejected than arrived.' : null}>
            <NumberInput id="rc-bad" value={rejected} onChange={setRejected} unit={item?.uom}
              placeholder="0" invalid={tried && !badOk} />
          </Field>
          <Field label="On" htmlFor="rc-on"
            error={tried && !dateOk ? 'A delivery cannot arrive before it was ordered.' : null}>
            <input id="rc-on" type="date" value={on} onChange={(e) => setOn(e.target.value)}
              className="num w-full rounded-md border border-line bg-surface px-2.5 py-2 text-[13px] outline-none focus:border-accent" />
          </Field>
        </div>

        <Field label="Anything worth remembering" hint="Optional — “4 sheets bent at the edge”.">
          <TextInput value={note} onChange={setNote} placeholder="" />
        </Field>

        {/*
          * What this receipt is about to measure, before it measures it. The
          * point of the record is that the lead time stops being the supplier's
          * claim, so the number it is about to become is worth showing.
          */}
        {days !== null && (
          <p className="rounded-lg border border-accent/40 bg-accent-tint/40 px-3 py-2.5 text-[12.5px] leading-relaxed text-ink-2">
            <strong className="text-ink">{days} days</strong> from order to delivery.
            {already.length > 0
              ? <> That makes {already.length + 1} receipts from {vendor?.name} on this material —
                  their lead time and rejection rate are measured from them, not quoted.</>
              : <> This is the first one from {vendor?.name} on this material, so their lead
                  time stops being what they quoted and starts being what they did.</>}
          </p>
        )}

        {already.length > 0 && (
          <div>
            <p className="text-[12.5px] font-medium">Already received</p>
            <ul className="mt-1 space-y-0.5">
              {already.slice(-4).reverse().map((r) => (
                <li key={r.id} className="flex gap-2 text-[11.5px] text-ink-2">
                  <span className="mono shrink-0">{shortDate(r.receivedOn)}</span>
                  <span className="min-w-0 flex-1 truncate">
                    {num(r.qty, 3)} {item?.uom}
                    {r.rejected > 0 && <span className="text-critical"> · {num(r.rejected, 3)} rejected</span>}
                    {r.note && <span className="text-ink-3"> · {r.note}</span>}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      <footer className="flex items-center gap-2 border-t border-line-soft px-4 py-3">
        <button type="button" onClick={onClose}
          className="press rounded-lg px-2.5 py-2 text-[13px] text-ink-2 hover:text-ink">Cancel</button>
        <span className="ml-auto" />
        <button type="button" onClick={save}
          className="press rounded-lg border border-accent-ink bg-accent-ink px-3.5 py-2 text-[13px] font-semibold text-on-accent hover:bg-accent">
          Record it
        </button>
      </footer>
    </Dialog>
  )
}
