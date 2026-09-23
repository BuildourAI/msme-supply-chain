'use client'
import { useEffect, useState } from 'react'
import { Dialog } from '@/components/ui/Dialog'
import { Chips, Field, NumberInput, Textarea, TextInput } from '@/components/ui/Field'
import { useWorkspace } from '@/components/workspace/store'
import {
  addCarrier, addCustomer, CARRIER_MODE, carrierProblem, customerProblem, updateCarrier, updateCustomer,
  type CarrierInput, type CustomerInput,
} from '@/lib/workspace/customers'
import { isGstin, stateOfGstin, STATES } from '@/lib/workspace/gst'
import type { CarrierMode, WsCarrier, WsCustomer } from '@/lib/workspace/types'

const n = (v: string) => (v.trim() === '' ? undefined : Number(v.replace(/,/g, '')))

export interface CustomerDraft { name: string; gstin: string; state: string; shipTo: string; phone: string; email: string; km: string; terms: string }

export const customerDraftOf = (c?: WsCustomer | null): CustomerDraft => ({
  name: c?.name ?? '', gstin: c?.gstin ?? '', state: c?.state ?? '', shipTo: c?.shipTo ?? '',
  phone: c?.phone ?? '', email: c?.email ?? '',
  km: c?.distanceKm !== undefined ? String(c.distanceKm) : '',
  terms: c?.paymentTerms !== undefined ? String(c.paymentTerms) : '',
})

export const customerInput = (d: CustomerDraft): CustomerInput => ({
  name: d.name, gstin: d.gstin, shipTo: d.shipTo, phone: d.phone, email: d.email,
  // a state typed only when the GSTIN does not already say it
  state: stateOfGstin(d.gstin) ? undefined : d.state,
  distanceKm: n(d.km), paymentTerms: n(d.terms),
})

/**
 * A customer's fields. The state is read off the GSTIN as it is typed, and
 * asked for only when there is no GSTIN to read it from — an unregistered
 * buyer still has a place of supply.
 */
export function CustomerFields({ d, set, idp }: { d: CustomerDraft; set: (p: Partial<CustomerDraft>) => void; idp: string }) {
  const read = stateOfGstin(d.gstin)
  const gstBad = d.gstin.trim() !== '' && !isGstin(d.gstin)
  return (
    <div className="space-y-3">
      <Field label="Their name" htmlFor={`${idp}-name`}>
        <TextInput id={`${idp}-name`} value={d.name} onChange={(v) => set({ name: v })} placeholder="Bharat Panels Pvt Ltd" autoFocus />
      </Field>
      <div className="grid grid-cols-2 items-end gap-2">
        <Field label="GSTIN" htmlFor={`${idp}-gstin`}
          hint={read ? `In ${read}` : gstBad ? 'Fifteen characters, starting with the state code' : 'Optional — the state is read off it'}>
          <TextInput id={`${idp}-gstin`} value={d.gstin} onChange={(v) => set({ gstin: v.toUpperCase() })} placeholder="27AABCB1234K1Z2" invalid={gstBad} />
        </Field>
        {read ? (
          <Field label="State">
            <p className="rounded-md border border-line-soft bg-surface-2 px-2.5 py-2 text-[13px] text-ink-2">{read}</p>
          </Field>
        ) : (
          <Field label="State" htmlFor={`${idp}-state`} hint="The place of supply">
            <select id={`${idp}-state`} value={d.state} onChange={(e) => set({ state: e.target.value })}
              className="w-full rounded-md border border-line bg-surface px-2.5 py-2 text-[13px] outline-none focus:border-accent">
              <option value="">Not said</option>
              {STATES.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </Field>
        )}
      </div>
      <Field label="Ship to" htmlFor={`${idp}-ship`} hint="Printed on the delivery challan">
        <Textarea id={`${idp}-ship`} value={d.shipTo} onChange={(v) => set({ shipTo: v })} rows={2}
          placeholder="Gate 2, Plot 18, Chakan MIDC, Pune 410501" />
      </Field>
      <div className="grid grid-cols-2 items-end gap-2">
        <Field label="Phone" htmlFor={`${idp}-phone`} hint="For a challan you send yourself">
          <TextInput id={`${idp}-phone`} value={d.phone} onChange={(v) => set({ phone: v })} placeholder="+91 98220 11234" />
        </Field>
        <Field label="Email" htmlFor={`${idp}-email`}>
          <TextInput id={`${idp}-email`} value={d.email} onChange={(v) => set({ email: v })} placeholder="stores@customer.in" />
        </Field>
      </div>
      <div className="grid grid-cols-2 items-end gap-2">
        <Field label="Pays in" htmlFor={`${idp}-terms`} hint="Optional">
          <NumberInput id={`${idp}-terms`} value={d.terms} onChange={(v) => set({ terms: v })} unit="days" step="1" />
        </Field>
        <Field label="Distance" htmlFor={`${idp}-km`} hint="Only for working out freight">
          <NumberInput id={`${idp}-km`} value={d.km} onChange={(v) => set({ km: v })} unit="km" step="1" />
        </Field>
      </div>
    </div>
  )
}

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

/** A customer added or changed. `onAdded` hands back a new customer's id, for a form that opened this one. */
export function CustomerForm({ customer, onClose, onAdded }: {
  customer: WsCustomer | null | undefined
  onClose: () => void
  onAdded?: (id: string) => void
}) {
  const { workspace, update } = useWorkspace()
  const [d, setD] = useState<CustomerDraft>(customerDraftOf())
  const [tried, setTried] = useState(false)
  useEffect(() => {
    if (customer === undefined) return
    setD(customerDraftOf(customer)); setTried(false)
  }, [customer])
  if (customer === undefined || !workspace) return null
  const input = customerInput(d)
  const problem = customerProblem(workspace, input, customer?.id)
  const save = () => {
    setTried(true)
    if (problem) return
    if (customer) update((w) => updateCustomer(w, customer.id, input))
    else {
      const [, id] = addCustomer(workspace, input)
      update((w) => addCustomer(w, input)[0])
      if (id) onAdded?.(id)
    }
    onClose()
  }
  return (
    <Dialog open onClose={onClose} title={customer ? `Edit ${customer.name}` : 'Add a customer'}
      sub="Who you sell to, and where it goes.">
      <div className="space-y-3 px-4 py-4">
        <CustomerFields d={d} set={(p) => setD((x) => ({ ...x, ...p }))} idp="cf" />
        {tried && problem && <p role="alert" className="text-[12.5px] text-critical">{problem}</p>}
      </div>
      <Footer onClose={onClose} onSave={save} label={customer ? 'Save' : 'Add customer'} />
    </Dialog>
  )
}

export const MODES: CarrierMode[] = ['own', 'part', 'full', 'courier', 'other']

export interface CarrierDraft { name: string; mode: CarrierMode; rate: string; phone: string }

export const carrierDraftOf = (c?: WsCarrier | null): CarrierDraft => ({
  name: c?.name ?? '', mode: c?.mode ?? 'part',
  rate: c?.ratePerKgKm !== undefined ? String(c.ratePerKgKm) : '', phone: c?.phone ?? '',
})

export const carrierInput = (d: CarrierDraft): CarrierInput => ({ name: d.name, mode: d.mode, ratePerKgKm: n(d.rate), phone: d.phone })

export function CarrierFields({ d, set, idp }: { d: CarrierDraft; set: (p: Partial<CarrierDraft>) => void; idp: string }) {
  return (
    <div className="space-y-3">
      <Field label="Who" htmlFor={`${idp}-name`}>
        <TextInput id={`${idp}-name`} value={d.name} onChange={(v) => set({ name: v })} placeholder="VRL Logistics" autoFocus />
      </Field>
      <fieldset>
        <legend className="mb-1.5 text-[13px] font-medium text-ink">How they carry it</legend>
        <Chips value={d.mode} onChange={(v) => set({ mode: v as CarrierMode })}
          options={MODES.map((m) => ({ value: m, label: CARRIER_MODE[m] }))} />
      </fieldset>
      <div className="grid grid-cols-2 items-end gap-2">
        <Field label="Rate" htmlFor={`${idp}-rate`} hint="Optional — freight is worked out from it">
          <NumberInput id={`${idp}-rate`} value={d.rate} onChange={(v) => set({ rate: v })} unit="₹/kg·km" />
        </Field>
        <Field label="Phone" htmlFor={`${idp}-phone`} hint="For a chase you send yourself">
          <TextInput id={`${idp}-phone`} value={d.phone} onChange={(v) => set({ phone: v })} placeholder="+91 98220 11234" />
        </Field>
      </div>
    </div>
  )
}

export function CarrierForm({ carrier, onClose, onAdded }: {
  carrier: WsCarrier | null | undefined
  onClose: () => void
  onAdded?: (id: string) => void
}) {
  const { workspace, update } = useWorkspace()
  const [d, setD] = useState<CarrierDraft>(carrierDraftOf())
  const [tried, setTried] = useState(false)
  useEffect(() => {
    if (carrier === undefined) return
    setD(carrierDraftOf(carrier)); setTried(false)
  }, [carrier])
  if (carrier === undefined || !workspace) return null
  const input = carrierInput(d)
  const problem = carrierProblem(workspace, input, carrier?.id)
  const save = () => {
    setTried(true)
    if (problem) return
    if (carrier) update((w) => updateCarrier(w, carrier.id, input))
    else {
      const [, id] = addCarrier(workspace, input)
      update((w) => addCarrier(w, input)[0])
      if (id) onAdded?.(id)
    }
    onClose()
  }
  return (
    <Dialog open onClose={onClose} title={carrier ? `Edit ${carrier.name}` : 'Add a carrier'}
      sub="Who takes it to the customer — your own vehicle counts.">
      <div className="space-y-3 px-4 py-4">
        <CarrierFields d={d} set={(p) => setD((x) => ({ ...x, ...p }))} idp="crf" />
        {tried && problem && <p role="alert" className="text-[12.5px] text-critical">{problem}</p>}
      </div>
      <Footer onClose={onClose} onSave={save} label={carrier ? 'Save' : 'Add carrier'} />
    </Dialog>
  )
}
