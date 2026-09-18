'use client'
import { useEffect, useState } from 'react'
import { Dialog } from '@/components/ui/Dialog'
import { Chips, Field, NumberInput, Select } from '@/components/ui/Field'
import { useWorkspace } from '@/components/workspace/store'
import { issueId } from '@/lib/workspace/defaults'
import { addDays, nextNo } from '@/lib/workspace/sourcing'
import { money } from '@/lib/domain/format'
import type { OrderState, PurchaseOrder } from '@/lib/workspace/types'

/**
 * An order you placed.
 *
 * The record of it, not the placing of it. §11 is explicit and every client in
 * the source set refused the alternative: the system never sends anything to a
 * supplier. What this buys is the thing a paper order book cannot do — knowing
 * on any given morning what is still out and when it was promised.
 *
 * The rate is prefilled from the supplier's standing rate when there is one, and
 * from the quote when the order came from one, but it stays editable. What was
 * actually agreed on the phone beats what was written down last month.
 */
const STATES: { value: OrderState; label: string }[] = [
  { value: 'draft', label: 'Draft' },
  { value: 'confirmed', label: 'Confirmed' },
  { value: 'shipped', label: 'Shipped' },
  { value: 'delivered', label: 'Delivered' },
  { value: 'cancelled', label: 'Cancelled' },
]

export function OrderForm({ open, onClose, editing }: {
  open: boolean
  onClose: () => void
  editing: PurchaseOrder | null
}) {
  const { workspace, update, today } = useWorkspace()
  const [vendorId, setVendorId] = useState('')
  const [itemId, setItemId] = useState('')
  const [qty, setQty] = useState('')
  const [price, setPrice] = useState('')
  const [orderedOn, setOrderedOn] = useState('')
  const [expectedOn, setExpectedOn] = useState('')
  const [state, setState] = useState<OrderState>('confirmed')
  const [tried, setTried] = useState(false)

  useEffect(() => {
    if (!open || !workspace) return
    setTried(false)
    if (editing) {
      setVendorId(editing.vendorId); setItemId(editing.itemId)
      setQty(String(editing.qty)); setPrice(String(editing.unitPrice))
      setOrderedOn(editing.orderedOn); setExpectedOn(editing.expectedOn)
      setState(editing.state)
    } else {
      const v = workspace.vendors[0]
      const rate = workspace.vendorItems.find((vi) => vi.vendorId === v?.id)
      setVendorId(v?.id ?? '')
      setItemId(rate?.itemId ?? workspace.items[0]?.id ?? '')
      setQty(''); setPrice(rate ? String(rate.rate) : '')
      setOrderedOn(today)
      setExpectedOn(addDays(today, rate?.quotedLeadTimeDays ?? 7))
      setState('confirmed')
    }
  }, [open, editing]) // eslint-disable-line react-hooks/exhaustive-deps

  if (!open || !workspace) return null
  const ws = workspace

  // picking a supplier and a material together suggests the rate they quote
  const suggest = (v: string, i: string) => {
    const r = ws.vendorItems.find((vi) => vi.vendorId === v && vi.itemId === i)
    if (r) {
      setPrice(String(r.rate))
      setExpectedOn(addDays(orderedOn || today, r.quotedLeadTimeDays))
    }
  }

  const n = (v: string) => (v.trim() === '' ? NaN : Number(v))
  const qtyN = n(qty)
  const priceN = n(price)
  const qtyOk = Number.isFinite(qtyN) && qtyN > 0
  const priceOk = Number.isFinite(priceN) && priceN > 0
  const ok = Boolean(vendorId) && Boolean(itemId) && qtyOk && priceOk
    && orderedOn.length === 10 && expectedOn.length === 10

  const blocked = ws.vendors.length === 0 || ws.items.length === 0
  if (blocked) {
    return (
      <Dialog open onClose={onClose} title="Record an order">
        <div className="px-4 py-5">
          <p className="rounded-lg border border-warn/30 bg-warn-soft px-3 py-2.5 text-[13px] leading-relaxed text-ink-2">
            {ws.vendors.length === 0
              ? 'Add a supplier first — an order goes to somebody.'
              : 'Add a material first — an order is for something.'}
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
      const [w, id] = editing ? [w0, editing.id] : issueId(w0, 'PO')
      const order: PurchaseOrder = {
        id,
        no: editing?.no ?? nextNo('PO', w.orders),
        vendorId, itemId,
        qty: qtyN, unitPrice: priceN,
        orderedOn, expectedOn, state,
        quoteId: editing?.quoteId,
      }
      return {
        ...w,
        orders: editing ? w.orders.map((o) => (o.id === id ? order : o)) : [...w.orders, order],
      }
    })
    onClose()
  }

  const uom = ws.items.find((i) => i.id === itemId)?.uom
  const total = qtyOk && priceOk ? qtyN * priceN : null

  return (
    <Dialog open onClose={onClose} wide
      title={editing ? `Edit ${editing.no}` : 'Record an order'}>
      <div className="space-y-4 px-4 py-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Supplier" htmlFor="of-vendor">
            <Select id="of-vendor" value={vendorId}
              onChange={(v) => { setVendorId(v); suggest(v, itemId) }}
              options={ws.vendors.map((v) => ({ value: v.id, label: v.name }))} />
          </Field>
          <Field label="Material" htmlFor="of-item">
            <Select id="of-item" value={itemId}
              onChange={(v) => { setItemId(v); suggest(vendorId, v) }}
              options={ws.items.map((i) => ({ value: i.id, label: i.name }))} />
          </Field>
        </div>

        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Quantity" htmlFor="of-qty"
            error={tried && !qtyOk ? 'Put in a quantity.' : null}>
            <NumberInput id="of-qty" value={qty} onChange={setQty} unit={uom}
              invalid={tried && !qtyOk} />
          </Field>
          <Field label="Agreed rate" htmlFor="of-price"
            error={tried && !priceOk ? 'Put in a rate.' : null}>
            <NumberInput id="of-price" value={price} onChange={setPrice}
              unit={uom ? `₹/${uom}` : '₹'} invalid={tried && !priceOk} />
          </Field>
          <Field label="Status">
            <Chips value={state} onChange={(v) => setState(v as OrderState)}
              options={STATES.slice(0, 3)} />
          </Field>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Ordered on" htmlFor="of-on">
            <input id="of-on" type="date" value={orderedOn}
              onChange={(e) => setOrderedOn(e.target.value)}
              className="num w-full rounded-md border border-line bg-surface px-2.5 py-2 text-[13px] outline-none focus:border-accent" />
          </Field>
          <Field label="Expected" htmlFor="of-exp">
            <input id="of-exp" type="date" value={expectedOn}
              onChange={(e) => setExpectedOn(e.target.value)}
              className="num w-full rounded-md border border-line bg-surface px-2.5 py-2 text-[13px] outline-none focus:border-accent" />
          </Field>
        </div>

        {editing && (
          <Field label="Status">
            <Chips value={state} onChange={(v) => setState(v as OrderState)} options={STATES} />
          </Field>
        )}

        {total !== null && (
          <p className="rounded-lg border border-line bg-surface-2 px-3 py-2 text-[13px] text-ink-2">
            Order value <strong className="num text-ink">{money(total)}</strong>
          </p>
        )}
      </div>

      <footer className="flex items-center gap-2 border-t border-line-soft px-4 py-3">
        <button type="button" onClick={onClose}
          className="press rounded-lg px-2.5 py-2 text-[13px] text-ink-2 hover:text-ink">Cancel</button>
        <span className="ml-auto" />
        <button type="button" onClick={save}
          className="press rounded-lg border border-accent-ink bg-accent-ink px-3.5 py-2 text-[13px] font-semibold text-on-accent hover:bg-accent">
          {editing ? 'Save changes' : 'Record order'}
        </button>
      </footer>
    </Dialog>
  )
}
