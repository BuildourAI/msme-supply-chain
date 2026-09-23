'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { BestLanded } from '@/components/sourcing/BestLanded'
import { Dialog } from '@/components/ui/Dialog'
import { Chips, Field, NumberInput, Select } from '@/components/ui/Field'
import { Icon } from '@/components/ui/icons'
import { useWorkspace } from '@/components/workspace/store'
import { issueId } from '@/lib/workspace/defaults'
import { addDays, nextNo } from '@/lib/workspace/sourcing'
import { money, num, shortDate } from '@/lib/domain/format'
import type { OrderState, PurchaseOrder } from '@/lib/workspace/types'

/**
 * An order you placed.
 *
 * The record of it, not the placing of it. §11 is explicit and every client in
 * the source set refused the alternative: the system never sends anything to a
 * supplier. What this buys is the thing a paper order book cannot do — knowing
 * on any given morning what is still out and when it was promised.
 *
 * One supplier, several materials, one number. That is how an order book
 * works, and it is what lets the whole thing print as one page: the lines you
 * placed with somebody in one go share a `no`, and `lib/paper/po.ts` collects
 * them by it. Editing reaches one line at a time, because an order already
 * placed is changed a line at a time.
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

interface Line {
  itemId: string
  qty: string
  price: string
}

const BLANK: Line = { itemId: '', qty: '', price: '' }

export function OrderForm({ open, onClose, editing }: {
  open: boolean
  onClose: () => void
  editing: PurchaseOrder | null
}) {
  const { workspace, update, today } = useWorkspace()
  const [vendorId, setVendorId] = useState('')
  const [lines, setLines] = useState<Line[]>([BLANK])
  const [orderedOn, setOrderedOn] = useState('')
  const [expectedOn, setExpectedOn] = useState('')
  const [state, setState] = useState<OrderState>('confirmed')
  const [tried, setTried] = useState(false)

  useEffect(() => {
    if (!open || !workspace) return
    setTried(false)
    if (editing) {
      setVendorId(editing.vendorId)
      setLines([{
        itemId: editing.itemId, qty: String(editing.qty), price: String(editing.unitPrice),
      }])
      setOrderedOn(editing.orderedOn); setExpectedOn(editing.expectedOn)
      setState(editing.state)
    } else {
      const v = workspace.vendors[0]
      const rate = workspace.vendorItems.find((vi) => vi.vendorId === v?.id)
      setVendorId(v?.id ?? '')
      setLines([{
        itemId: rate?.itemId ?? workspace.items[0]?.id ?? '',
        qty: '',
        price: rate ? String(rate.rate) : '',
      }])
      setOrderedOn(today)
      setExpectedOn(addDays(today, rate?.quotedLeadTimeDays ?? 7))
      setState('confirmed')
    }
  }, [open, editing]) // eslint-disable-line react-hooks/exhaustive-deps

  if (!open || !workspace) return null
  const ws = workspace

  /*
   * A line its supplier holds is not edited here. What they are making, how
   * much and by when is a new version with a reason, which the supplier is
   * sent and confirms — on Open orders. Typing over it here would change our
   * figure silently and leave theirs where it was, which is the gap that
   * screen exists to show. The rate and the state stay editable: the rate is
   * our record of what was agreed, the state is what somebody observed.
   */
  const locked = editing !== null && (editing.state === 'confirmed' || editing.state === 'shipped'
    || (editing.revisions?.length ?? 0) > 0)

  const setLine = (i: number, patch: Partial<Line>) =>
    setLines((ls) => ls.map((l, k) => (k === i ? { ...l, ...patch } : l)))

  /** picking a supplier and a material together suggests the rate they quote */
  const rateFor = (v: string, i: string) =>
    ws.vendorItems.find((vi) => vi.vendorId === v && vi.itemId === i)

  const suggestLine = (i: number, v: string, itemId: string) => {
    const r = rateFor(v, itemId)
    setLine(i, { itemId, ...(r ? { price: String(r.rate) } : {}) })
    if (r) setExpectedOn(addDays(orderedOn || today, r.quotedLeadTimeDays))
  }

  /** switching supplier re-suggests every line, because each has its own rate */
  const useVendor = (v: string) => {
    setVendorId(v)
    setLines((ls) => ls.map((l) => {
      const r = rateFor(v, l.itemId)
      return r ? { ...l, price: String(r.rate) } : l
    }))
  }

  const n = (v: string) => (v.trim() === '' ? NaN : Number(v))
  const ok = (l: Line) => Boolean(l.itemId)
    && Number.isFinite(n(l.qty)) && n(l.qty) > 0
    && Number.isFinite(n(l.price)) && n(l.price) > 0

  const good = lines.filter(ok)
  const valid = Boolean(vendorId) && good.length === lines.length && lines.length > 0
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
    if (!valid) return
    update((w0) => {
      if (editing) {
        const l = lines[0]
        const order: PurchaseOrder = locked ? {
          ...editing, unitPrice: n(l.price), orderedOn, state,
        } : {
          ...editing,
          vendorId,
          itemId: l.itemId,
          qty: n(l.qty),
          unitPrice: n(l.price),
          orderedOn,
          expectedOn,
          state,
        }
        return { ...w0, orders: w0.orders.map((o) => (o.id === editing.id ? order : o)) }
      }

      /*
       * One number for the whole thing, issued once. Every line takes it, which
       * is what makes them one order to the Orders screen and one page to the
       * document.
       */
      const no = nextNo('PO', w0.orders)
      let w = w0
      const made: PurchaseOrder[] = []
      for (const l of lines) {
        const [next, id] = issueId(w, 'PO')
        w = next
        made.push({
          id, no, vendorId,
          itemId: l.itemId,
          qty: n(l.qty),
          unitPrice: n(l.price),
          orderedOn, expectedOn, state,
        })
      }
      return { ...w, orders: [...w.orders, ...made] }
    })
    onClose()
  }

  const total = good.reduce((a, l) => a + n(l.qty) * n(l.price), 0)
  const uomOf = (id: string) => ws.items.find((i) => i.id === id)?.uom

  return (
    <Dialog open onClose={onClose} wide
      title={editing ? `Edit ${editing.no}` : 'Record an order'}>
      <div className="space-y-4 px-4 py-4">
        {locked && editing && (
          <p className="rounded-lg border border-accent/30 bg-accent-tint px-3 py-2.5 text-[12.5px] leading-relaxed text-ink-2"
            data-locked>
            {ws.vendors.find((v) => v.id === editing.vendorId)?.name ?? 'The supplier'} has this order —{' '}
            <strong className="text-ink">{num(editing.qty, 3)} {uomOfItem(ws, editing.itemId)}</strong> by{' '}
            {shortDate(editing.expectedOn)}. A change to how much or when is a new version they have to
            confirm, so it is made on{' '}
            <Link href="/inbound/orders" onClick={onClose}
              className="font-semibold text-accent-ink underline underline-offset-2">Open orders</Link>.
          </p>
        )}

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Supplier" htmlFor="of-vendor">
            {locked
              ? <p className="py-2 text-[13px] font-medium">{ws.vendors.find((v) => v.id === vendorId)?.name ?? '—'}</p>
              : <Select id="of-vendor" value={vendorId} onChange={useVendor}
                  options={ws.vendors.map((v) => ({ value: v.id, label: v.name }))} />}
          </Field>
          <Field label="Status">
            <Chips value={state} onChange={(v) => setState(v as OrderState)}
              options={editing ? STATES : STATES.slice(0, 3)} />
          </Field>
        </div>

        <div className="space-y-3">
          {lines.map((l, i) => (
            <div key={i} className="rounded-lg border border-line bg-surface-2/40 p-3">
              <div className="flex flex-wrap items-end gap-3">
                <Field label="Material" className="min-w-[12rem] flex-1" htmlFor={`of-item-${i}`}>
                  {locked
                    ? <p className="py-2 text-[13px] font-medium">{ws.items.find((it) => it.id === l.itemId)?.name ?? '—'}</p>
                    : <Select id={`of-item-${i}`} value={l.itemId}
                        onChange={(v) => suggestLine(i, vendorId, v)}
                        options={ws.items.map((it) => ({ value: it.id, label: it.name }))} />}
                </Field>
                <Field label="Quantity" className="w-28" htmlFor={`of-qty-${i}`}>
                  {locked
                    ? <p className="num py-2 text-[13px] font-medium">{num(n(l.qty), 3)} {uomOf(l.itemId)}</p>
                    : <NumberInput id={`of-qty-${i}`} value={l.qty}
                        onChange={(v) => setLine(i, { qty: v })} unit={uomOf(l.itemId)}
                        invalid={tried && !ok(l)} />}
                </Field>
                <Field label="Agreed rate" className="w-32" htmlFor={`of-price-${i}`}>
                  <NumberInput id={`of-price-${i}`} value={l.price}
                    onChange={(v) => setLine(i, { price: v })}
                    unit={uomOf(l.itemId) ? `₹/${uomOf(l.itemId)}` : '₹'}
                    invalid={tried && !ok(l)} />
                </Field>
                {!editing && lines.length > 1 && (
                  <button type="button" onClick={() => setLines((ls) => ls.filter((_, k) => k !== i))}
                    title="Remove this line"
                    className="press mb-1 rounded-md p-1.5 text-ink-4 hover:bg-critical-soft hover:text-critical">
                    <Icon name="trash" className="size-4" />
                    <span className="sr-only">Remove this line</span>
                  </button>
                )}
              </div>

              {/*
                * Offered, never applied. Pressing the button is the only thing
                * that changes the supplier — see §11, and `BestLanded`'s own
                * note. Hidden once an order has been confirmed, because by then
                * the choice was made and second-guessing it is noise.
                */}
              {(!editing || state === 'draft') && (
                <div className="mt-2.5">
                  <BestLanded itemId={l.itemId} vendorId={vendorId}
                    qty={Number.isFinite(n(l.qty)) ? n(l.qty) : undefined}
                    scope={lines.length > 1 ? 'for this order' : undefined}
                    onPick={useVendor} />
                </div>
              )}
            </div>
          ))}

          {!editing && (
            <button type="button" onClick={() => setLines((ls) => [...ls, BLANK])}
              className="press inline-flex items-center gap-1.5 rounded-lg border border-line bg-surface px-3 py-2 text-[13px] font-medium hover:bg-surface-2">
              <Icon name="plus" className="size-3.5" />
              Add another material
            </button>
          )}
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Ordered on" htmlFor="of-on">
            <input id="of-on" type="date" value={orderedOn}
              onChange={(e) => setOrderedOn(e.target.value)}
              className="num w-full rounded-md border border-line bg-surface px-2.5 py-2 text-[13px] outline-none focus:border-accent" />
          </Field>
          <Field label="Expected" htmlFor="of-exp">
            {locked
              ? <p className="num py-2 text-[13px] font-medium">{shortDate(expectedOn)}</p>
              : <input id="of-exp" type="date" value={expectedOn}
                  onChange={(e) => setExpectedOn(e.target.value)}
                  className="num w-full rounded-md border border-line bg-surface px-2.5 py-2 text-[13px] outline-none focus:border-accent" />}
          </Field>
        </div>

        {total > 0 && (
          <p className="rounded-lg border border-line bg-surface-2 px-3 py-2 text-[13px] text-ink-2">
            Order value <strong className="num text-ink">{money(total)}</strong>
            {lines.length > 1 && <span className="text-ink-3"> across {lines.length} lines</span>}
          </p>
        )}

        {tried && !valid && (
          <p className="text-[12.5px] text-critical">
            Every line needs a material, a quantity and a rate.
          </p>
        )}
      </div>

      <footer className="flex items-center gap-2 border-t border-line-soft px-4 py-3">
        <button type="button" onClick={onClose}
          className="press rounded-lg px-2.5 py-2 text-[13px] text-ink-2 hover:text-ink">Cancel</button>
        <span className="ml-auto" />
        <button type="button" onClick={save}
          className="press rounded-lg border border-accent-ink bg-accent-ink px-3.5 py-2 text-[13px] font-semibold text-on-accent hover:bg-accent">
          {editing ? 'Save changes' : `Record order${lines.length > 1 ? ` · ${lines.length} lines` : ''}`}
        </button>
      </footer>
    </Dialog>
  )
}

const uomOfItem = (ws: { items: { id: string; uom: string }[] }, id: string) =>
  ws.items.find((i) => i.id === id)?.uom ?? ''
