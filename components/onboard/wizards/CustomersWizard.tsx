'use client'
import { useEffect, useState } from 'react'
import { Wizard, type WizardStep } from '@/components/ui/Wizard'
import { useWorkspace } from '@/components/workspace/store'
import { ImportDialog } from '@/components/sheet/ImportDialog'
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
  const [importing, setImporting] = useState(false)

  useEffect(() => { if (open) { setD(customerDraftOf()); setImporting(false) } }, [open])

  if (!open || !workspace) return null
  // the whole list at once, from the sheet they already keep — the step ticks when one lands
  if (importing) return <ImportDialog open onClose={onClose} entity="customer" title="Customers" />
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
        <div className="border-t border-line-soft pt-3">
          <button type="button" onClick={() => setImporting(true)}
            className="press text-[12.5px] text-ink-3 underline underline-offset-2 hover:text-ink">
            Bring them in from Excel
          </button>
          <p className="mt-1 text-[11.5px] leading-snug text-ink-4">
            A sheet with a name column, and GSTIN, ship-to or credit days if you have them.
          </p>
        </div>
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
