'use client'
import { useEffect, useState } from 'react'
import { Wizard, type WizardStep } from '@/components/ui/Wizard'
import { Field, NumberInput, TextInput } from '@/components/ui/Field'
import { useWorkspace } from '@/components/workspace/store'
import { issueId } from '@/lib/workspace/defaults'
import { JOBWORKER, jobworkers } from '@/lib/workspace/jobwork'
import { buildVendor } from '@/lib/workspace/records'

/**
 * Somebody you send material out to.
 *
 * Deliberately not the supplier wizard. That one asks for a rate against every
 * material, and a galvaniser's charge is for a process, not for the steel —
 * entered as a rate it would join the landed-cost comparison and could win it.
 * A jobworker is a name, a number to call and the days they give you to pay.
 *
 * "We don't send material out" is on the first screen and ticks the step,
 * because it is a real answer. A step that could only go green by inventing a
 * jobworker would teach people to invent one.
 */
export function JobworkerWizard({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { workspace, update } = useWorkspace()
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [terms, setTerms] = useState('30')

  useEffect(() => {
    if (!open) return
    setName(''); setPhone(''); setTerms('30')
  }, [open])

  if (!open || !workspace) return null
  const ws = workspace
  const termsN = terms.trim() === '' ? NaN : Number(terms)
  const duplicate = ws.vendors.some((v) => v.name.trim().toLowerCase() === name.trim().toLowerCase())
  const have = jobworkers(ws)

  const noJobwork = () => {
    update((w) => ({ ...w, drafts: { ...w.drafts, 'inbound.noJobwork': true } }))
    onClose()
  }

  const steps: WizardStep[] = [{
    label: 'Who',
    title: 'Who do you send material out to?',
    why: 'A galvaniser, a plater, a machine shop. Material with them is still yours — shown on every screen, never counted as stock you can use.',
    invalid: name.trim().length < 2
      ? 'Give the jobworker a name.'
      : duplicate ? 'You already have a supplier or jobworker by that name.'
        : !Number.isFinite(termsN) || termsN < 0 ? 'Put in the credit days, or zero for cash.' : null,
    body: (
      <div className="space-y-3.5">
        {have.length > 0 && (
          <p className="text-[12px] text-ink-3">
            Already added: {have.map((v) => v.name).join(', ')}.
          </p>
        )}
        <Field label="Their name" htmlFor="jw-name">
          <TextInput id="jw-name" value={name} onChange={setName} autoFocus
            placeholder="Shree Galvanisers" invalid={duplicate} />
        </Field>
        <Field label="A number to reach them on" hint="For a chase you send yourself. Nothing is ever sent from here."
          htmlFor="jw-phone">
          <TextInput id="jw-phone" value={phone} onChange={setPhone} placeholder="+91 98250 11234" />
        </Field>
        <Field label="How many days do they give you to pay?" htmlFor="jw-terms">
          <NumberInput id="jw-terms" value={terms} onChange={setTerms} unit="days" step="1" />
        </Field>
        <div className="border-t border-line-soft pt-3">
          <button type="button" onClick={noJobwork}
            className="press text-[12.5px] text-ink-3 underline underline-offset-2 hover:text-ink">
            We don&apos;t send material out
          </button>
          <p className="mt-1 text-[11.5px] leading-snug text-ink-4">
            Ticks this step. The Jobwork screen stays, for the day you do.
          </p>
        </div>
      </div>
    ),
  }]

  const save = () => {
    update((w0) => {
      const [w, id] = issueId(w0, 'VN')
      const vendor = buildVendor({ id, name, paymentTermsDays: Number.isFinite(termsN) ? termsN : 0 })
      const types = w.categories.supplierType
      return {
        ...w,
        vendors: [...w.vendors, vendor],
        vendorType: { ...w.vendorType, [id]: JOBWORKER },
        // an owner who renamed their categories still gets the word back
        categories: types.includes(JOBWORKER)
          ? w.categories
          : { ...w.categories, supplierType: [...types, JOBWORKER] },
        vendorContact: phone.trim()
          ? { ...w.vendorContact, [id]: { ...(w.vendorContact[id] ?? {}), phone: phone.trim() } }
          : w.vendorContact,
      }
    })
    onClose()
  }

  return (
    <Wizard open={open} onClose={onClose} wide={false}
      title="Add a jobworker"
      sub={have.length > 0 ? `${have.length} added so far` : undefined}
      steps={steps} onDone={save} doneLabel="Add this jobworker" />
  )
}
