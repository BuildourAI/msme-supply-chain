'use client'
import { useEffect, useState } from 'react'
import { Dialog } from '@/components/ui/Dialog'
import { Field, NumberInput, Select, TextInput } from '@/components/ui/Field'
import { Icon } from '@/components/ui/icons'
import { useWorkspace } from '@/components/workspace/store'
import { issueId } from '@/lib/workspace/defaults'
import { backfillRates, buildRate, buildVendor, unclaimableGstPctOf } from '@/lib/workspace/records'
import { setValues } from '@/lib/workspace/fields'
import { repriceTerms } from '@/lib/workspace/landed'
import { rejectionBasis } from '@/lib/workspace/receipts'
import { CustomFields } from '@/components/sheet/CustomFields'
import type { Workspace } from '@/lib/workspace/types'
import type { Vendor, VendorItem } from '@/lib/domain/types'

/**
 * Add or change a supplier.
 *
 * A plain form rather than the stepped wizard the set-up uses. The wizard earns
 * its steps when somebody is meeting the system for the first time and does not
 * know what it will ask for; an owner who came here to correct a payment term
 * already knows, and making them click Next three times to do it would be the
 * ceremony this whole pass is removing.
 *
 * One form for both jobs. Opened with a vendor it edits that vendor, opened
 * without one it adds — which is also what fixes the old behaviour where
 * re-opening a finished set-up step quietly added a second copy.
 */
interface Line {
  itemId: string
  rate: string
  leadDays: string
  preferred: boolean
  /** the three a quoted rate does not mention; blank means "they never said" */
  freight: string
  gstPct: string
  rejectPct: string
  /** whether the detail is open on this line — not saved, just where you were */
  open?: boolean
}

export function SupplierForm({ open, onClose, editing }: {
  open: boolean
  onClose: () => void
  /** the vendor being changed, or null to add a new one */
  editing: Vendor | null
}) {
  const { workspace, update } = useWorkspace()
  const [name, setName] = useState('')
  const [type, setType] = useState('')
  const [terms, setTerms] = useState('30')
  const [phone, setPhone] = useState('')
  const [email, setEmail] = useState('')
  const [address, setAddress] = useState('')
  const [custom, setCustom] = useState<Record<string, string>>({})
  const [lines, setLines] = useState<Line[]>([])
  const [tried, setTried] = useState(false)

  useEffect(() => {
    if (!open || !workspace) return
    setTried(false)
    if (editing) {
      setName(editing.name)
      setType(workspace.vendorType[editing.id] ?? workspace.categories.supplierType[0] ?? '')
      setTerms(String(editing.paymentTermsDays))
      setPhone(workspace.vendorContact[editing.id]?.phone ?? '')
      setEmail(workspace.vendorContact[editing.id]?.email ?? '')
      setAddress(workspace.vendorContact[editing.id]?.address ?? '')
      setCustom({ ...(workspace.custom[editing.id] ?? {}) })
      setLines(workspace.vendorItems
        .filter((vi) => vi.vendorId === editing.id)
        .map((vi) => ({
          itemId: vi.itemId,
          rate: String(vi.rate),
          leadDays: String(vi.quotedLeadTimeDays),
          preferred: Boolean(vi.isPreferred),
          // the percentages are not stored twice — they come back out of the
          // rupee figure and the rate
          freight: vi.freightPerUnit > 0 ? String(vi.freightPerUnit) : '',
          gstPct: vi.nonCreditableGst > 0 ? String(unclaimableGstPctOf(vi)) : '',
          rejectPct: vi.trailingRejectionRate > 0 ? String(vi.trailingRejectionRate) : '',
          open: vi.freightPerUnit > 0 || vi.nonCreditableGst > 0 || vi.trailingRejectionRate > 0,
        })))
    } else {
      setName('')
      setType(workspace.categories.supplierType[0] ?? '')
      setTerms('30')
      setPhone(''); setEmail(''); setAddress(''); setCustom({})
      setLines([])
    }
  }, [open, editing]) // eslint-disable-line react-hooks/exhaustive-deps

  if (!open || !workspace) return null
  const ws = workspace

  const n = (v: string) => (v.trim() === '' ? NaN : Number(v))
  const termsN = n(terms)
  const nameOk = name.trim().length > 1
  const duplicate = ws.vendors.some(
    (v) => v.id !== editing?.id && v.name.trim().toLowerCase() === name.trim().toLowerCase(),
  )
  const termsOk = Number.isFinite(termsN) && termsN >= 0
  const ok = nameOk && !duplicate && termsOk

  const setLine = (i: number, patch: Partial<Line>) =>
    setLines((ls) => ls.map((l, k) => (k === i ? { ...l, ...patch } : l)))

  const save = () => {
    setTried(true)
    if (!ok) return

    const kept = lines.filter((l) => l.itemId
      && Number.isFinite(n(l.rate)) && n(l.rate) > 0
      && Number.isFinite(n(l.leadDays)) && n(l.leadDays) > 0)

    // the id is issued inside the update, not before it — see `issueId`
    update((w0) => {
      const [w, id] = editing ? [w0, editing.id] : issueId(w0, 'VN')
      const vendor = buildVendor({ id, name, paymentTermsDays: termsN })
      const rates = kept.map((l) => buildRate(
        {
          vendorId: id, itemId: l.itemId, rate: n(l.rate), leadDays: n(l.leadDays),
          preferred: l.preferred,
          // a blank box is "they never said", not "none" — so it leaves what
          // was there alone rather than clearing a figure typed last month
          freight: l.freight.trim() === '' ? undefined : Number(l.freight),
          unclaimableGstPct: l.gstPct.trim() === '' ? undefined : Number(l.gstPct),
          rejectPct: l.rejectPct.trim() === '' ? undefined : Number(l.rejectPct),
        },
        w.vendorItems.find((vi) => vi.vendorId === id && vi.itemId === l.itemId),
      ))
      const contact = {
        phone: phone.trim() || undefined,
        email: email.trim() || undefined,
        address: address.trim() || undefined,
      }
      const withRecord: Workspace = {
        ...w,
        vendors: editing ? w.vendors.map((v) => (v.id === id ? vendor : v)) : [...w.vendors, vendor],
        items: backfillRates(w.items, rates),
        vendorItems: [...w.vendorItems.filter((vi) => vi.vendorId !== id), ...rates],
        vendorType: { ...w.vendorType, [id]: type },
        vendorContact: contact.phone || contact.email || contact.address
          ? { ...w.vendorContact, [id]: contact }
          : Object.fromEntries(Object.entries(w.vendorContact).filter(([k]) => k !== id)),
      }
      /*
       * Last, and over the whole workspace rather than this supplier: what a
       * supplier's payment terms cost depends on the best terms anyone offers
       * on that material, so entering one who gives ninety days makes every
       * rival on it dearer. See `repriceTerms`.
       */
      return repriceTerms(setValues(withRecord, id, custom))
    })
    onClose()
  }

  return (
    <Dialog open onClose={onClose} wide
      title={editing ? `Edit ${editing.name}` : 'Add a supplier'}>
      <div className="space-y-4 px-4 py-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Supplier name" htmlFor="sf-name"
            error={tried && !nameOk ? 'Give the supplier a name.'
              : duplicate ? 'You already have a supplier with that name.' : null}>
            <TextInput id="sf-name" value={name} onChange={setName} autoFocus
              placeholder="Shah Metals" invalid={(tried && !nameOk) || duplicate} />
          </Field>

          <Field label="Type" htmlFor="sf-type">
            <Select id="sf-type" value={type} onChange={setType}
              options={ws.categories.supplierType.map((t) => ({ value: t, label: t }))}
              addLabel="New supplier type…"
              onAdd={(v) => update((w) => ({
                ...w, categories: { ...w.categories, supplierType: [...w.categories.supplierType, v] },
              }))} />
          </Field>
        </div>

        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Days they give you to pay" htmlFor="sf-terms"
            error={tried && !termsOk ? 'Put in a number of days, or zero.' : null}>
            <NumberInput id="sf-terms" value={terms} onChange={setTerms} unit="days" step="1"
              invalid={tried && !termsOk} />
          </Field>
          {/*
            * Optional, and only needed when you want to hand them a request.
            * Both stay on this device, and go to the owner's own account when
            * they have one — which is where every other thing they type goes
            * too. Nothing is sent to the supplier.
            */}
          <Field label="Phone" hint="With the country code, for WhatsApp." htmlFor="sf-phone">
            <TextInput id="sf-phone" value={phone} onChange={setPhone} placeholder="+91 98220 11234" />
          </Field>
          <Field label="Email" htmlFor="sf-email">
            <TextInput id="sf-email" value={email} onChange={setEmail} placeholder="sales@shahmetals.in" />
          </Field>
          {/*
            * Asked for because a purchase order is addressed to somebody. A
            * request for prices can go out with a name on it; an order cannot.
            */}
          <Field label="Address" hint="Printed on a purchase order." htmlFor="sf-address">
            <TextInput id="sf-address" value={address} onChange={setAddress}
              placeholder="Plot 44, GIDC Phase II, Vatva, Ahmedabad 382445" />
          </Field>
        </div>

        <div>
          <p className="text-[13px] font-medium text-ink">What they supply</p>
          <p className="mt-0.5 text-[11.5px] text-ink-3">
            Leave it empty if you have not agreed a rate yet.
          </p>

          <div className="mt-2 space-y-2">
            {lines.map((l, i) => {
              const it = ws.items.find((x) => x.id === l.itemId)
              return (
                <div key={i} className="rounded-lg border border-line bg-surface-2 p-2.5">
                 <div className="grid items-end gap-2 sm:grid-cols-[1.4fr_1fr_1fr_auto]">
                  <Field label="Material">
                    <Select value={l.itemId} onChange={(v) => setLine(i, { itemId: v })}
                      placeholder="Pick one"
                      options={ws.items.map((x) => ({ value: x.id, label: x.name }))} />
                  </Field>
                  <Field label="Rate">
                    <NumberInput value={l.rate} onChange={(v) => setLine(i, { rate: v })}
                      unit={it ? `₹/${it.uom}` : '₹'} />
                  </Field>
                  <Field label="Takes">
                    <NumberInput value={l.leadDays} onChange={(v) => setLine(i, { leadDays: v })}
                      unit="days" step="1" />
                  </Field>
                  <button type="button" onClick={() => setLines((ls) => ls.filter((_, k) => k !== i))}
                    title="Remove this material"
                    className="press mb-1 rounded-md p-1.5 text-ink-4 hover:bg-critical-soft hover:text-critical">
                    <Icon name="trash" className="size-4" />
                    <span className="sr-only">Remove this material</span>
                  </button>
                 </div>

                 <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-line-soft pt-2">
                  {/*
                    * The checkbox this form has always passed to `buildRate`
                    * and never rendered — so an owner whose rule is "the
                    * supplier I usually use" had no way to say which that was.
                    */}
                  <label className="flex items-center gap-1.5 text-[12px] text-ink-2">
                    <input type="checkbox" checked={l.preferred}
                      onChange={(e) => setLine(i, { preferred: e.target.checked })}
                      className="size-3.5 accent-[var(--accent-ink)]" />
                    My usual supplier for it
                  </label>

                  <button type="button" onClick={() => setLine(i, { open: !l.open })}
                    className="press ml-auto text-[12px] text-accent-ink underline underline-offset-2">
                    {l.open ? 'Hide landed-cost detail' : 'Landed-cost detail'}
                  </button>
                 </div>

                 {/*
                   * Shut unless asked for. A rate and a lead time is the whole
                   * of what most people have when they add a supplier, and
                   * three more boxes on every line would make the common case
                   * look like paperwork.
                   */}
                 {l.open && (
                  <div className="mt-2 grid gap-2 sm:grid-cols-3">
                    <Field label="Freight"
                      hint={it ? `On top of the rate, per ${it.uom}.` : 'On top of the rate.'}>
                      <NumberInput value={l.freight} onChange={(v) => setLine(i, { freight: v })}
                        unit={it ? `₹/${it.uom}` : '₹'} placeholder="0" />
                    </Field>
                    <Field label="GST you cannot claim"
                      hint="Usually none. Composition dealers and blocked credits are the exceptions.">
                      <NumberInput value={l.gstPct} onChange={(v) => setLine(i, { gstPct: v })}
                        unit="%" placeholder="0" />
                    </Field>
                    {/*
                      * The one figure here that stops being a recollection.
                      * Once goods have been recorded arriving, this is the
                      * measured rate and the hint says so — typing over it is
                      * allowed and the next receipt measures it again.
                      */}
                    <Field label="Usually rejected"
                      hint={(() => {
                        const b = editing && l.itemId
                          ? rejectionBasis(ws, editing.id, l.itemId)
                          : { measured: false, receipts: 0 }
                        return b.measured
                          ? `Measured from ${b.receipts} receipt${b.receipts === 1 ? '' : 's'}.`
                          : 'What you have seen, until receipts measure it.'
                      })()}>
                      <NumberInput value={l.rejectPct} onChange={(v) => setLine(i, { rejectPct: v })}
                        unit="%" placeholder="0" />
                    </Field>
                  </div>
                 )}
                </div>
              )
            })}
          </div>

          {ws.items.length === 0 ? (
            <p className="mt-2 rounded-lg border border-warn/30 bg-warn-soft px-3 py-2 text-[12.5px] text-ink-2">
              Add a material first and it can be priced here.
            </p>
          ) : (
            <button type="button"
              onClick={() => setLines((ls) => [...ls, {
                itemId: ws.items[0].id, rate: '', leadDays: '', preferred: false,
                freight: '', gstPct: '', rejectPct: '',
              }])}
              className="press mt-2 inline-flex items-center gap-1.5 rounded-lg border border-line bg-surface px-3 py-1.5 text-[12.5px] font-medium hover:bg-surface-2">
              <Icon name="plus" className="size-3.5" />
              Add a material they supply
            </button>
          )}
        </div>

        <CustomFields entity="supplier" values={custom} onChange={setCustom} />
      </div>

      <footer className="flex items-center gap-2 border-t border-line-soft px-4 py-3">
        <button type="button" onClick={onClose}
          className="press rounded-lg px-2.5 py-2 text-[13px] text-ink-2 hover:text-ink">
          Cancel
        </button>
        <span className="ml-auto" />
        <button type="button" onClick={save}
          className="press rounded-lg border border-accent-ink bg-accent-ink px-3.5 py-2 text-[13px] font-semibold text-on-accent hover:bg-accent">
          {editing ? 'Save changes' : 'Add supplier'}
        </button>
      </footer>
    </Dialog>
  )
}
