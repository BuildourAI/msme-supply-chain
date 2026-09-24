'use client'
import { useEffect, useState } from 'react'
import { Dialog } from '@/components/ui/Dialog'
import { Field, NumberInput, Select, Textarea } from '@/components/ui/Field'
import { Icon } from '@/components/ui/icons'
import { useWorkspace } from '@/components/workspace/store'
import { DATE, n } from '@/components/production/desk/ProductForm'
import { UOM_LABEL } from '@/lib/workspace/defaults'
import { addCustomer } from '@/lib/workspace/customers'
import { jobWord, openJobs } from '@/lib/workspace/jobs'
import { productOf } from '@/lib/workspace/products'
import {
  addOrder, defaultPromise, dispatchedOn, lastRateFor, openJobForOrder, orderProblem, updateOrder,
  type OrderInput,
} from '@/lib/workspace/sales'
import type { CustomerOrder, Workspace } from '@/lib/workspace/types'

/** "Open one for it" — a line whose job is opened, planned and linked when the order is saved. */
const NEW_JOB = '__new__'

interface LineDraft { productId: string; qty: string; rate: string; rateTouched: boolean; jobId: string }

const blank = (): LineDraft => ({ productId: '', qty: '', rate: '', rateTouched: false, jobId: '' })

/**
 * A customer's order: who, by when, and what — a product, how many, at what
 * rate — and, where it is known, the style making each line.
 *
 * The rate starts at the one last agreed with this customer for that
 * product. A line can name an open style, or ask for one: saved, the order
 * opens it, plans it to finish two working days before the promise, and
 * links it — so Line watch's verdict on that style becomes this order's.
 */
export function OrderForm({ order, onClose, onSaved }: {
  /** undefined is closed; null is a new one */
  order: CustomerOrder | null | undefined
  onClose: () => void
  onSaved?: (orderId: string) => void
}) {
  const { workspace, update, today } = useWorkspace()
  const [customerId, setCustomerId] = useState('')
  const [takenOn, setTakenOn] = useState('')
  const [promised, setPromised] = useState('')
  const [lines, setLines] = useState<LineDraft[]>([blank()])
  const [note, setNote] = useState('')
  const [tried, setTried] = useState(false)

  useEffect(() => {
    if (order === undefined || !workspace) return
    setCustomerId(order?.customerId ?? '')
    setTakenOn(order?.takenOn ?? today)
    setPromised(order?.promisedDate ?? defaultPromise(workspace, today))
    setLines(order ? order.lines.map((l) => ({
      productId: l.productId, qty: String(l.qty), rate: String(l.rate), rateTouched: true, jobId: l.jobId ?? '',
    })) : [blank()])
    setNote(order?.note ?? '')
    setTried(false)
  }, [order]) // eslint-disable-line react-hooks/exhaustive-deps

  if (order === undefined || !workspace) return null
  const ws = workspace
  const word = jobWord(ws).one
  const customers = ws.customers ?? []
  const products = ws.products ?? []
  // an owner who added a customer by typing gets it picked, by name
  const cid = customers.find((c) => c.id === customerId)?.id
    ?? customers.find((c) => c.name.trim().toLowerCase() === customerId.trim().toLowerCase())?.id ?? ''
  const shipped = order ? dispatchedOn(ws, order.id) : 0

  const rateFor = (l: LineDraft) => (l.rateTouched ? l.rate
    : (cid && l.productId ? String(lastRateFor(ws, cid, l.productId) ?? '') : ''))
  const input: OrderInput = {
    customerId: cid, takenOn, promisedDate: promised, note,
    lines: lines.filter((l) => l.productId || l.qty.trim()).map((l) => ({
      productId: l.productId, qty: n(l.qty), rate: rateFor(l).trim() === '' ? NaN : n(rateFor(l)),
      jobId: l.jobId && l.jobId !== NEW_JOB ? l.jobId : undefined,
    })),
  }
  const problem = products.length === 0 ? 'Add a product first — Production › More › Products.'
    : orderProblem(ws, input, order?.id)
  const set = (i: number, p: Partial<LineDraft>) => setLines((ls) => ls.map((l, j) => (j === i ? { ...l, ...p } : l)))
  const value = input.lines.reduce((a, l) => a + (Number.isFinite(l.qty * l.rate) ? l.qty * l.rate : 0), 0)

  const save = () => {
    setTried(true)
    if (problem) return
    const kept = lines.filter((l) => l.productId || l.qty.trim())
    const opening = kept.map((l, i) => (l.jobId === NEW_JOB ? i : -1)).filter((i) => i >= 0)
    const write = (w0: Workspace): [Workspace, string] => {
      let [w, id] = order ? [updateOrder(w0, order.id, input), order.id] : addOrder(w0, input)
      if (!id) return [w0, '']
      for (const i of opening) [w] = openJobForOrder(w, id, `${id}/${i + 1}`, today)
      return [w, id]
    }
    const [, savedId] = write(ws)
    update((w) => write(w)[0])
    if (savedId) onSaved?.(savedId)
    onClose()
  }

  const jobsFor = (productId: string) => openJobs(ws).filter((j) => !j.productId || j.productId === productId)

  return (
    <Dialog open onClose={onClose} wide title={order ? `Edit ${order.no}` : 'New sales order'}
      sub={order && shipped > 0 ? 'Something has gone out against it, so it can no longer be changed — cancel it instead.'
        : 'Who ordered what, at what rate, and by when you promised it.'}>
      <div className="space-y-3 px-4 py-4">
        <div className="grid gap-2 sm:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_minmax(0,1fr)] sm:items-end">
          <Field label="Customer" htmlFor="of-customer">
            <Select id="of-customer" value={cid || customerId} onChange={setCustomerId}
              placeholder={customers.length ? 'Pick the customer' : 'No customers yet'}
              options={customers.map((c) => ({ value: c.id, label: c.name }))}
              addLabel="Their name — details later on Customers"
              onAdd={(name) => update((w) => addCustomer(w, { name })[0])} />
          </Field>
          <Field label="Taken on" htmlFor="of-taken">
            <input id="of-taken" type="date" value={takenOn} max={today} onChange={(e) => setTakenOn(e.target.value)} className={DATE} />
          </Field>
          <Field label="Promised for" htmlFor="of-promised">
            <input id="of-promised" type="date" value={promised} min={takenOn || undefined}
              onChange={(e) => setPromised(e.target.value)} className={DATE} />
          </Field>
        </div>

        <fieldset className="rounded-lg border border-line px-3 pb-3 pt-2">
          <legend className="px-1 text-[12.5px] font-semibold text-ink">What they ordered</legend>
          <ul className="space-y-3">
            {lines.map((l, i) => {
              const p = productOf(ws, l.productId)
              const unit = p ? UOM_LABEL[p.uom].toLowerCase() : ''
              const last = cid && l.productId ? lastRateFor(ws, cid, l.productId) : undefined
              return (
                <li key={i} className="grid grid-cols-2 items-end gap-2 border-b border-line-soft pb-3 last:border-0 last:pb-0 sm:grid-cols-[minmax(0,3fr)_minmax(0,1.3fr)_minmax(0,1.5fr)_minmax(0,2.4fr)_auto]">
                  <Field label={i === 0 ? 'Product' : `Product ${i + 1}`} htmlFor={`of-p-${i}`} className="col-span-2 sm:col-span-1">
                    <Select id={`of-p-${i}`} value={l.productId} placeholder="Pick a product"
                      onChange={(v) => set(i, { productId: v, jobId: '' })}
                      options={products.map((x) => ({ value: x.id, label: x.name }))} />
                  </Field>
                  <Field label="How many" htmlFor={`of-q-${i}`}>
                    <NumberInput id={`of-q-${i}`} value={l.qty} onChange={(v) => set(i, { qty: v })} unit={unit} step="1" />
                  </Field>
                  <Field label="Rate" htmlFor={`of-r-${i}`}>
                    <NumberInput id={`of-r-${i}`} value={rateFor(l)} onChange={(v) => set(i, { rate: v, rateTouched: true })}
                      unit={unit ? `₹/${unit.replace(/s$/, '')}` : '₹'} placeholder={last !== undefined ? String(last) : undefined} />
                  </Field>
                  <Field label="Made on" htmlFor={`of-j-${i}`} className="col-span-2 sm:col-span-1">
                    <Select id={`of-j-${i}`} value={l.jobId} onChange={(v) => set(i, { jobId: v })}
                      options={[
                        { value: '', label: `No ${word} yet` },
                        ...jobsFor(l.productId).map((j) => ({ value: j.id, label: `${j.no}${j.name ? ` — ${j.name}` : ''}` })),
                        ...(l.productId && !(order && shipped > 0) ? [{ value: NEW_JOB, label: `Open a ${word} for it` }] : []),
                      ]} />
                  </Field>
                  <button type="button" onClick={() => setLines((ls) => (ls.length === 1 ? [blank()] : ls.filter((_, j) => j !== i)))}
                    aria-label={`Take line ${i + 1} off`}
                    className="press mb-1 hidden size-8 place-items-center rounded-md text-ink-3 hover:bg-surface-2 hover:text-ink sm:grid">
                    <Icon name="close" className="size-3.5" />
                  </button>
                </li>
              )
            })}
          </ul>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <button type="button" onClick={() => setLines((ls) => [...ls, blank()])}
              className="press inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-[12.5px] font-medium text-accent-ink hover:bg-surface-2">
              <Icon name="plus" className="size-3.5" /> Add a product
            </button>
            {value > 0 && (
              <span className="num ml-auto text-[12.5px] text-ink-2">
                Order value <strong className="text-ink">₹{Math.round(value).toLocaleString('en-IN')}</strong>
              </span>
            )}
          </div>
          {lines.some((l) => l.jobId === NEW_JOB) && (
            <p className="mt-2 text-[11.5px] leading-snug text-ink-3">
              Saved, each {word} is opened with the product and quantity and planned to finish two working days before the promise.
            </p>
          )}
        </fieldset>

        <Field label="Note" htmlFor="of-note" hint="Optional — their PO number, a colour, a packing instruction">
          <Textarea id="of-note" value={note} onChange={setNote} rows={2} />
        </Field>
        {tried && problem && <p role="alert" className="text-[12.5px] text-critical">{problem}</p>}
      </div>
      <footer className="flex items-center justify-end gap-2 border-t border-line-soft px-4 py-3">
        <button type="button" onClick={onClose}
          className="press rounded-lg px-2.5 py-2 text-[13px] text-ink-2 hover:text-ink">Cancel</button>
        <button type="button" onClick={save}
          className="press rounded-lg border border-accent-ink bg-accent-ink px-3.5 py-2 text-[13px] font-semibold text-on-accent hover:bg-accent">
          {order ? 'Save' : 'Save the sales order'}
        </button>
      </footer>
    </Dialog>
  )
}
