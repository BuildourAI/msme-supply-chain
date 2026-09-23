'use client'
import { useEffect, useState } from 'react'
import { Wizard, type WizardStep } from '@/components/ui/Wizard'
import { useWorkspace } from '@/components/workspace/store'
import { CustomerFields, customerDraftOf, customerInput, type CustomerDraft } from '@/components/dispatch/desk/PartyForms'
import { addCustomer, customerProblem } from '@/lib/workspace/customers'

/**
 * Who you sell to — one at a time, as many as you like.
 *
 * A name is enough to be a customer. The GSTIN is what the delivery challan
 * and the e-way bill want, and the state is read off it rather than asked
 * twice; a distance only matters if a carrier charges by the kilometre.
 */
export function CustomersWizard({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { workspace, update } = useWorkspace()
  const [d, setD] = useState<CustomerDraft>(customerDraftOf())

  useEffect(() => { if (open) setD(customerDraftOf()) }, [open])

  if (!open || !workspace) return null
  const have = workspace.customers ?? []
  const input = customerInput(d)

  const steps: WizardStep[] = [{
    label: 'Customer',
    title: 'Who do you sell to?',
    why: 'An order names a customer, and a delivery challan carries their GSTIN and ship-to address. Add the rest from the Customers screen whenever you like.',
    invalid: customerProblem(workspace, input),
    body: (
      <div className="space-y-3">
        {have.length > 0 && (
          <p className="text-[12px] text-ink-3">Already added: {have.map((c) => c.name).join(', ')}.</p>
        )}
        <CustomerFields d={d} set={(p) => setD((x) => ({ ...x, ...p }))} idp="cw" />
      </div>
    ),
  }]

  return (
    <Wizard open={open} onClose={onClose} wide={false} title="Add a customer"
      sub={have.length > 0 ? `${have.length} added so far` : undefined}
      steps={steps} onDone={() => { update((w) => addCustomer(w, input)[0]); onClose() }}
      doneLabel="Add this customer" />
  )
}
