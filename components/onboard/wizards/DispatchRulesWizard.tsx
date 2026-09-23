'use client'
import { useEffect, useState } from 'react'
import { Wizard, type WizardStep } from '@/components/ui/Wizard'
import { Field, NumberInput } from '@/components/ui/Field'
import { useWorkspace } from '@/components/workspace/store'
import { dispatchRulesOf } from '@/lib/workspace/customers'
import { stateOfGstin, STATES } from '@/lib/workspace/gst'

/**
 * The rules the shipping bay is judged by.
 *
 * Your own state decides whether a supply is inside the state or across it,
 * so it is read off your GSTIN and only asked when there is none. The e-way
 * bill threshold, the on-time target, the days a new order is promised in and
 * the days a return is given to come back are each a number you can change.
 */
export function DispatchRulesWizard({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { workspace, update } = useWorkspace()
  const [state, setState] = useState('')
  const [eway, setEway] = useState('')
  const [otif, setOtif] = useState('')
  const [promise, setPromise] = useState('')
  const [ret, setRet] = useState('')

  useEffect(() => {
    if (!open || !workspace) return
    const r = dispatchRulesOf(workspace)
    setState(workspace.company.state ?? stateOfGstin(workspace.company.gstin) ?? '')
    setEway(String(r.ewayThreshold)); setOtif(String(r.otifTargetPct))
    setPromise(String(r.promiseDays)); setRet(String(r.returnDays))
  }, [open]) // eslint-disable-line react-hooks/exhaustive-deps

  if (!open || !workspace) return null
  const read = stateOfGstin(workspace.company.gstin)
  const num = (v: string) => (v.trim() === '' ? NaN : Number(v.replace(/,/g, '')))
  const E = num(eway), O = num(otif), P = num(promise), R = num(ret)

  const steps: WizardStep[] = [
    {
      label: 'Your state',
      title: 'Where do you dispatch from?',
      why: 'A customer in your own state is an intra-state supply (CGST and SGST); anywhere else is inter-state (IGST). The accounts package needs to know which.',
      invalid: null,
      body: (
        <Field label="Your state" htmlFor="dr-state"
          hint={read ? `Read off your GSTIN ${workspace.company.gstin}` : 'You have no GSTIN on your company, so say it here.'}>
          <select id="dr-state" value={state} onChange={(e) => setState(e.target.value)}
            className="w-full rounded-md border border-line bg-surface px-2.5 py-2 text-[13px] outline-none focus:border-accent">
            <option value="">Not said</option>
            {STATES.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </Field>
      ),
    },
    {
      label: 'Numbers',
      title: 'What does the bay hold itself to?',
      why: 'Each is only a default. The e-way bill threshold is ₹50,000 for most movements; check your state’s rule for goods moving inside it.',
      invalid: !(E >= 0) ? 'The e-way bill threshold is rupees.'
        : !(O > 0 && O <= 100) ? 'The on-time target is a percentage, 1 to 100.'
          : !(Number.isInteger(P) && P >= 0) ? 'Promise days are whole days.'
            : !(Number.isInteger(R) && R >= 0) ? 'Return days are whole days.' : null,
      body: (
        <div className="grid grid-cols-2 items-end gap-3">
          <Field label="E-way bill from" htmlFor="dr-eway" hint="A note worth this or more needs one">
            <NumberInput id="dr-eway" value={eway} onChange={setEway} unit="₹" step="1000" />
          </Field>
          <Field label="On time, in full" htmlFor="dr-otif" hint="The target the dashboard judges by">
            <NumberInput id="dr-otif" value={otif} onChange={setOtif} unit="%" step="1" />
          </Field>
          <Field label="Promise a new order in" htmlFor="dr-promise" hint="The order form starts here">
            <NumberInput id="dr-promise" value={promise} onChange={setPromise} unit="days" step="1" />
          </Field>
          <Field label="A return comes back within" htmlFor="dr-return" hint="Its due-back date">
            <NumberInput id="dr-return" value={ret} onChange={setRet} unit="days" step="1" />
          </Field>
        </div>
      ),
    },
  ]

  const save = () => {
    update((w) => ({
      ...w,
      company: { ...w.company, state: state || undefined },
      dispatchRules: { ewayThreshold: E, otifTargetPct: O, promiseDays: P, returnDays: R },
      drafts: { ...w.drafts, 'dispatch.rules.agreed': true },
    }))
    onClose()
  }

  return (
    <Wizard open={open} onClose={onClose} wide={false} title="Dispatch rules" steps={steps} onDone={save}
      doneLabel="Save the dispatch rules" />
  )
}
