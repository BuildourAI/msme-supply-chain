'use client'
import { useEffect, useMemo, useState } from 'react'
import { Dialog } from '@/components/ui/Dialog'
import { Field, NumberInput, Select, TextInput } from '@/components/ui/Field'
import { PaperDialog, useSentTo, type Paper } from '@/components/sourcing/PaperDialog'
import { useWorkspace } from '@/components/workspace/store'
import { DATE, n } from '@/components/production/desk/ProductForm'
import { money } from '@/lib/domain/format'
import { addDays } from '@/lib/domain/calc'
import { buildDelivery, deliveryFileName, deliverySendableFor, handoffLines, renderDelivery } from '@/lib/paper/delivery'
import { bookConsignment, bookProblem, consignmentOf, suggestFreight, updateConsignment, type Booking } from '@/lib/workspace/consignments'
import { addCarrier, CARRIER_MODE } from '@/lib/workspace/customers'
import { UOM_LABEL } from '@/lib/workspace/defaults'
import { handoff, noteProblem, pendingOf, raiseNote, type NoteInput } from '@/lib/workspace/dispatch-notes'
import { fgOnHand, productOf } from '@/lib/workspace/products'
import { openOrders, orderOf } from '@/lib/workspace/sales'
import type { SendEntry, Workspace } from '@/lib/workspace/types'

/** The products an order still wants, once each, in the order it lists them. */
const productsOf = (ws: Workspace, orderId: string) => {
  const o = orderOf(ws, orderId)
  return o ? [...new Set(o.lines.map((l) => l.productId))] : []
}

function CarrierPick({ value, onChange, id }: { value: string; onChange: (v: string) => void; id: string }) {
  const { workspace, update } = useWorkspace()
  if (!workspace) return null
  const carriers = workspace.carriers ?? []
  const byName = carriers.find((c) => c.id === value) ? value
    : carriers.find((c) => c.name.trim().toLowerCase() === value.trim().toLowerCase())?.id ?? value
  return (
    <Select id={id} value={byName} onChange={onChange}
      placeholder={carriers.length ? 'Pick the carrier' : 'No carriers yet'}
      options={carriers.map((c) => ({ value: c.id, label: `${c.name} · ${CARRIER_MODE[c.mode].toLowerCase()}` }))}
      addLabel="Their name — part load by default"
      onAdd={(name) => update((w) => addCarrier(w, { name, mode: 'part' })[0])} />
  )
}

/** A carrier picked by id, or by the name just typed into it. */
const carrierIdOf = (ws: Workspace, v: string) =>
  (ws.carriers ?? []).find((c) => c.id === v)?.id
  ?? (ws.carriers ?? []).find((c) => c.name.trim().toLowerCase() === v.trim().toLowerCase())?.id ?? ''

/**
 * Goods out against an order.
 *
 * Per product, how many are going now — never more than the order still
 * wants, never more than came off the floor, and it says which of the two it
 * ran into. Who let it go is named; the carrier can be booked here or later.
 */
export function NoteForm({ orderId, onClose, onRaised }: {
  /** undefined is closed; null is "pick the order" */
  orderId: string | null | undefined
  onClose: () => void
  onRaised?: (noteId: string) => void
}) {
  const { workspace, update, today, session } = useWorkspace()
  const actor = session?.actor ?? ''
  const [pick, setPick] = useState('')
  const [on, setOn] = useState('')
  const [qty, setQty] = useState<Record<string, string>>({})
  const [weight, setWeight] = useState('')
  const [by, setBy] = useState('')
  const [booking, setBooking] = useState(false)
  const [carrier, setCarrier] = useState('')
  const [lr, setLr] = useState('')
  const [eta, setEta] = useState('')
  const [freight, setFreight] = useState('')
  const [tried, setTried] = useState(false)

  const start = (ws: Workspace, id: string) => {
    const q: Record<string, string> = {}
    const o = orderOf(ws, id)
    for (const pid of productsOf(ws, id)) {
      const can = o ? Math.min(pendingOf(ws, o, pid), Math.max(0, Math.floor(fgOnHand(ws, pid)))) : 0
      q[pid] = can > 0 ? String(can) : ''
    }
    setQty(q)
    setEta(o && o.promisedDate >= today ? o.promisedDate : addDays(today, 2))
  }

  useEffect(() => {
    if (orderId === undefined || !workspace) return
    setPick(orderId ?? ''); setOn(today); setWeight(''); setBy(actor || workspace.owner.name)
    setBooking(false); setCarrier(''); setLr(''); setFreight(''); setTried(false)
    if (orderId) start(workspace, orderId)
    else { setQty({}); setEta(addDays(today, 2)) }
  }, [orderId]) // eslint-disable-line react-hooks/exhaustive-deps

  if (orderId === undefined || !workspace) return null
  const ws = workspace
  const order = orderOf(ws, pick)
  const pids = pick ? productsOf(ws, pick) : []
  const options = openOrders(ws)
  const book: Booking | undefined = booking
    ? { carrierId: carrierIdOf(ws, carrier), lrNo: lr, promisedDate: eta, freight: freight.trim() === '' ? undefined : n(freight) }
    : undefined
  const input: NoteInput = {
    orderId: pick, on, actor: actor || ws.owner.name, authorisedBy: by,
    weightKg: weight.trim() === '' ? undefined : n(weight),
    lines: pids.map((pid) => ({ productId: pid, qty: qty[pid]?.trim() ? n(qty[pid]) : 0 })),
    booking: book,
  }
  const problem = !pick ? 'Pick the order it goes against.'
    : order && pids.every((pid) => pendingOf(ws, order, pid) === 0) ? `Everything on ${order.no} has already gone.`
      : noteProblem(ws, input, today)
  const taxable = order ? input.lines.reduce((a, l) => a + (Number.isFinite(l.qty) ? l.qty : 0)
    * (order.lines.find((x) => x.productId === l.productId)?.rate ?? 0), 0) : 0

  const save = () => {
    setTried(true)
    if (problem) return
    const [, id] = raiseNote(ws, input, today)
    update((w) => raiseNote(w, input, today)[0])
    onClose()
    if (id) onRaised?.(id)
  }

  return (
    <Dialog open onClose={onClose} wide title={order ? `Dispatch against ${order.no}` : 'Raise a delivery challan'}
      sub="What is leaving now, on whose say-so. Finished stock comes down by exactly this.">
      <div className="space-y-3 px-4 py-4">
        <div className="grid gap-2 sm:grid-cols-[minmax(0,2fr)_minmax(0,1fr)] sm:items-end">
          <Field label="Against order" htmlFor="nf-order">
            <Select id="nf-order" value={pick} onChange={(v) => { setPick(v); start(ws, v) }}
              placeholder={options.length ? 'Pick the order' : 'No open order has anything left to go'}
              options={[...(order && !options.some((o) => o.id === order.id) ? [order] : []), ...options].map((o) => ({
                value: o.id,
                label: `${o.no} — ${(ws.customers ?? []).find((c) => c.id === o.customerId)?.name ?? 'customer'} · promised ${o.promisedDate}`,
              }))} />
          </Field>
          <Field label="Going on" htmlFor="nf-on">
            <input id="nf-on" type="date" value={on} max={today} onChange={(e) => setOn(e.target.value)} className={DATE} />
          </Field>
        </div>

        {order && (
          <fieldset className="rounded-lg border border-line px-3 pb-3 pt-2">
            <legend className="px-1 text-[12.5px] font-semibold text-ink">What is going</legend>
            <ul className="space-y-2">
              {pids.map((pid) => {
                const p = productOf(ws, pid)
                const pending = pendingOf(ws, order, pid)
                const shelf = fgOnHand(ws, pid)
                const unit = p ? UOM_LABEL[p.uom].toLowerCase() : ''
                return (
                  <li key={pid} className="grid grid-cols-[minmax(0,1fr)_8.5rem] items-center gap-2">
                    <div className="min-w-0">
                      <label htmlFor={`nf-q-${pid}`} className="block truncate text-[13px] font-medium text-ink">{p?.name ?? 'Unknown product'}</label>
                      <p className="num text-[11.5px] text-ink-3">
                        {pending} still to go · {shelf} on the shelf
                        {pending > 0 && shelf < pending && <span className="text-warn"> · {pending - Math.max(0, shelf)} not made yet</span>}
                      </p>
                    </div>
                    <NumberInput id={`nf-q-${pid}`} value={qty[pid] ?? ''} onChange={(v) => setQty((q) => ({ ...q, [pid]: v }))}
                      unit={unit} step="1" placeholder="0" />
                  </li>
                )
              })}
            </ul>
            {taxable > 0 && (
              <p className="num mt-2 text-right text-[12px] text-ink-2">
                At the order’s rates <strong className="text-ink">{money(taxable)}</strong>
              </p>
            )}
          </fieldset>
        )}

        <div className="grid grid-cols-2 items-end gap-2">
          <Field label="Authorised by" htmlFor="nf-by" hint="Who let it leave">
            <TextInput id="nf-by" value={by} onChange={setBy} />
          </Field>
          <Field label="Weight" htmlFor="nf-weight" hint="Optional — freight is worked out from it">
            <NumberInput id="nf-weight" value={weight} onChange={setWeight} unit="kg" />
          </Field>
        </div>

        <label className="flex items-center gap-2 text-[13px] text-ink">
          <input type="checkbox" checked={booking} onChange={(e) => setBooking(e.target.checked)} className="size-4 accent-[var(--accent-ink)]" />
          Book it with a carrier now
        </label>
        {booking && (
          <div className="grid gap-2 rounded-lg border border-line px-3 py-3 sm:grid-cols-2 sm:items-end">
            <Field label="Carrier" htmlFor="nf-carrier">
              <CarrierPick id="nf-carrier" value={carrier} onChange={setCarrier} />
            </Field>
            <Field label="Docket or LR number" htmlFor="nf-lr" hint="Optional">
              <TextInput id="nf-lr" value={lr} onChange={setLr} placeholder="VRL 4471902" />
            </Field>
            <Field label="Customer told to expect it" htmlFor="nf-eta">
              <input id="nf-eta" type="date" value={eta} min={on || undefined} onChange={(e) => setEta(e.target.value)} className={DATE} />
            </Field>
            <Field label="Freight" htmlFor="nf-freight" hint="Optional — worked out from the rate when blank">
              <NumberInput id="nf-freight" value={freight} onChange={setFreight} unit="₹" />
            </Field>
          </div>
        )}
        {tried && problem && <p role="alert" className="text-[12.5px] text-critical">{problem}</p>}
      </div>
      <footer className="flex items-center justify-end gap-2 border-t border-line-soft px-4 py-3">
        <button type="button" onClick={onClose}
          className="press rounded-lg px-2.5 py-2 text-[13px] text-ink-2 hover:text-ink">Cancel</button>
        <button type="button" onClick={save}
          className="press rounded-lg border border-accent-ink bg-accent-ink px-3.5 py-2 text-[13px] font-semibold text-on-accent hover:bg-accent">
          Raise the challan
        </button>
      </footer>
    </Dialog>
  )
}

/**
 * A note given to a carrier — or, once booked, its docket, freight and
 * promised day put right. Who confirmed a delivery is never edited here.
 */
export function BookCarrierDialog({ noteId, onClose }: { noteId: string | null; onClose: () => void }) {
  const { workspace, update } = useWorkspace()
  const [carrier, setCarrier] = useState('')
  const [lr, setLr] = useState('')
  const [eta, setEta] = useState('')
  const [freight, setFreight] = useState('')
  const [tried, setTried] = useState(false)

  useEffect(() => {
    if (!noteId || !workspace) return
    const note = (workspace.dispatchNotes ?? []).find((x) => x.id === noteId)
    const c = consignmentOf(workspace, noteId)
    const o = orderOf(workspace, note?.orderId)
    setCarrier(c?.carrierId ?? ''); setLr(c?.lrNo ?? '')
    setEta(c?.promisedDate ?? (o && note && o.promisedDate >= note.on ? o.promisedDate : addDays(note?.on ?? '', 2)))
    setFreight(c?.freight !== undefined ? String(c.freight) : ''); setTried(false)
  }, [noteId]) // eslint-disable-line react-hooks/exhaustive-deps

  if (!noteId || !workspace) return null
  const ws = workspace
  const note = (ws.dispatchNotes ?? []).find((x) => x.id === noteId)
  if (!note) return null
  const existing = consignmentOf(ws, noteId)
  const cid = carrierIdOf(ws, carrier)
  const suggested = cid ? suggestFreight(ws, noteId, cid) : undefined
  const b: Booking = { carrierId: cid, lrNo: lr, promisedDate: eta, freight: freight.trim() === '' ? undefined : n(freight) }
  const problem = existing?.deliveredOn ? 'It has been delivered; its booking is part of the record now.'
    : existing ? (!cid ? 'Pick the carrier.' : !eta ? 'Put in the day the customer was told.' : eta < note.on ? 'It cannot arrive before it left.'
      : b.freight !== undefined && !(b.freight >= 0) ? 'Freight is rupees, or blank.' : null)
      : bookProblem(ws, noteId, b)

  const save = () => {
    setTried(true)
    if (problem) return
    update((w) => (existing
      ? updateConsignment(w, existing.id, { carrierId: cid, lrNo: lr.trim() || undefined, promisedDate: eta, freight: b.freight ?? suggested })
      : bookConsignment(w, noteId, b)[0]))
    onClose()
  }

  return (
    <Dialog open onClose={onClose} title={existing ? `${note.no} — the booking` : `Book ${note.no} with a carrier`}
      sub="Who took it, the number their own system knows it by, and when the customer was told it would arrive.">
      <div className="grid gap-2 px-4 py-4 sm:grid-cols-2 sm:items-end">
        <Field label="Carrier" htmlFor="bc-carrier">
          <CarrierPick id="bc-carrier" value={carrier} onChange={setCarrier} />
        </Field>
        <Field label="Docket or LR number" htmlFor="bc-lr" hint="Optional">
          <TextInput id="bc-lr" value={lr} onChange={setLr} placeholder="VRL 4471902" />
        </Field>
        <Field label="Customer told to expect it" htmlFor="bc-eta">
          <input id="bc-eta" type="date" value={eta} min={note.on} onChange={(e) => setEta(e.target.value)} className={DATE} />
        </Field>
        <Field label="Freight" htmlFor="bc-freight"
          hint={suggested !== undefined ? `${money(suggested)} at their rate, if left blank` : 'Optional'}>
          <NumberInput id="bc-freight" value={freight} onChange={setFreight} unit="₹"
            placeholder={suggested !== undefined ? String(suggested) : undefined} />
        </Field>
        {tried && problem && <p role="alert" className="text-[12.5px] text-critical sm:col-span-2">{problem}</p>}
      </div>
      <footer className="flex items-center justify-end gap-2 border-t border-line-soft px-4 py-3">
        <button type="button" onClick={onClose}
          className="press rounded-lg px-2.5 py-2 text-[13px] text-ink-2 hover:text-ink">Cancel</button>
        <button type="button" onClick={save}
          className="press rounded-lg border border-accent-ink bg-accent-ink px-3.5 py-2 text-[13px] font-semibold text-on-accent hover:bg-accent">
          {existing ? 'Save' : 'Book it'}
        </button>
      </footer>
    </Dialog>
  )
}

/**
 * The delivery challan — preview, download, WhatsApp, email, print — with the
 * values the tax invoice and the e-way bill need under it. The buttons open
 * something a person then sends; nothing is sent from here.
 */
export function DeliveryDocument({ noteId, onClose }: { noteId: string | null; onClose: () => void }) {
  const { workspace, update, today } = useWorkspace()
  const sent = useSentTo('dn', noteId ?? '')

  const papers = useMemo<Paper[]>(() => {
    if (!workspace || !noteId) return []
    const doc = buildDelivery(workspace, noteId)
    if (!doc) return []
    const note = (workspace.dispatchNotes ?? []).find((x) => x.id === noteId)!
    const customer = (workspace.customers ?? []).find((c) => c.id === note.customerId)
    return [{
      vendor: { id: note.customerId, name: doc.customer.name },
      problems: doc.problems,
      fileName: deliveryFileName(doc),
      sendable: deliverySendableFor(doc),
      render: () => renderDelivery(doc),
      contact: { phone: customer?.phone, email: customer?.email },
      saveContact: (field, value) => update((w) => ({
        ...w,
        customers: (w.customers ?? []).map((c) => (c.id === note.customerId ? { ...c, [field]: value || undefined } : c)),
      })),
    }]
  }, [workspace, noteId, update])

  if (!noteId || !workspace || papers.length === 0) return null
  const note = (workspace.dispatchNotes ?? []).find((x) => x.id === noteId)!

  const onSent = (customerId: string, via: SendEntry['via']) => {
    const entry: SendEntry = { kind: 'dn', id: noteId, vendorId: customerId, via, at: today }
    update((w) => ({
      ...w,
      sendLog: [...w.sendLog.filter((s) => !(s.kind === 'dn' && s.id === noteId && s.vendorId === customerId)), entry],
    }))
  }

  return (
    <PaperDialog open onClose={onClose}
      title={`${note.no} — delivery challan`}
      sub={handoffLines(handoff(workspace, noteId)).join(' · ')}
      papers={papers}
      sentTo={new Set(sent.map((s) => s.vendorId))}
      onSent={onSent} />
  )
}
