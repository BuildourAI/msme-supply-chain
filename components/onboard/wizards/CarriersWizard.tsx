'use client'
import { useEffect, useState } from 'react'
import { Wizard, type WizardStep } from '@/components/ui/Wizard'
import { useWorkspace } from '@/components/workspace/store'
import { CarrierFields, carrierDraftOf, carrierInput, type CarrierDraft } from '@/components/dispatch/desk/PartyForms'
import { addCarrier, carrierProblem } from '@/lib/workspace/customers'

/**
 * Who takes the goods to the customer.
 *
 * "Our own vehicle" is on the first screen and is a real answer: a note sent
 * in the company's tempo is booked, promised and confirmed like any other, so
 * its on-time record is kept too.
 */
export function CarriersWizard({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { workspace, update } = useWorkspace()
  const [d, setD] = useState<CarrierDraft>(carrierDraftOf())

  useEffect(() => { if (open) setD(carrierDraftOf()) }, [open])

  if (!open || !workspace) return null
  const have = workspace.carriers ?? []
  const input = carrierInput(d)
  const hasOwn = have.some((c) => c.mode === 'own')

  const ownVehicle = () => {
    update((w) => addCarrier(w, { name: 'Our own vehicle', mode: 'own' })[0])
    onClose()
  }

  const steps: WizardStep[] = [{
    label: 'Carrier',
    title: 'Who carries it to the customer?',
    why: 'A transporter, a courier, or your own vehicle. Each consignment is booked with one, so late deliveries can be told apart by who carried them.',
    invalid: carrierProblem(workspace, input),
    body: (
      <div className="space-y-3">
        {have.length > 0 && (
          <p className="text-[12px] text-ink-3">Already added: {have.map((c) => c.name).join(', ')}.</p>
        )}
        <CarrierFields d={d} set={(p) => setD((x) => ({ ...x, ...p }))} idp="crw" />
        {!hasOwn && (
          <div className="border-t border-line-soft pt-3">
            <button type="button" onClick={ownVehicle}
              className="press text-[12.5px] text-ink-3 underline underline-offset-2 hover:text-ink">
              We deliver in our own vehicle
            </button>
            <p className="mt-1 text-[11.5px] leading-snug text-ink-4">
              Adds &ldquo;Our own vehicle&rdquo; as a carrier and ticks this step.
            </p>
          </div>
        )}
      </div>
    ),
  }]

  return (
    <Wizard open={open} onClose={onClose} wide={false} title="Add a carrier"
      sub={have.length > 0 ? `${have.length} added so far` : undefined}
      steps={steps} onDone={() => { update((w) => addCarrier(w, input)[0]); onClose() }}
      doneLabel="Add this carrier" />
  )
}
