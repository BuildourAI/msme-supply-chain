'use client'
import { useEffect, useState } from 'react'
import { Wizard, type WizardStep } from '@/components/ui/Wizard'
import { Field, NumberInput } from '@/components/ui/Field'
import { useWorkspace } from '@/components/workspace/store'

/**
 * The three rules the gate runs on.
 *
 * Every one already exists as a policy figure with a default the sample
 * company uses. This is where the owner says whether those are theirs. Each is
 * asked as the decision it drives rather than the name of the field — "how
 * long may material wait uninspected" is answerable; "QC overdue days" is not
 * unless you already know.
 *
 * None of them blocks anything. They decide when something is raised on the
 * dashboard, which is the only thing the gate ever does on its own. When a
 * change to an order is chased is sourcing's rule now, and how much slack a
 * jobworker gets is the store's: each rule sits with the cards it raises.
 */
export function GateRulesWizard({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { workspace, update } = useWorkspace()
  const [qc, setQc] = useState('2')
  const [overdue, setOverdue] = useState('3')
  const [spike, setSpike] = useState('2')

  useEffect(() => {
    if (!open || !workspace) return
    const p = workspace.policy
    setQc(String(p.inboundQcDays))
    setOverdue(String(p.qcOverdueDays))
    setSpike(String(p.rejectionSpikeMultiple))
  }, [open]) // eslint-disable-line react-hooks/exhaustive-deps

  if (!open || !workspace) return null

  const n = (v: string) => (v.trim() === '' ? NaN : Number(v))
  const qcN = n(qc), overdueN = n(overdue), spikeN = n(spike)
  const days = (v: number) => Number.isFinite(v) && v >= 0 && Number.isInteger(v)

  const steps: WizardStep[] = [
    {
      label: 'Inspection',
      title: 'How long does material wait at the gate?',
      why: 'Nothing is usable until it is inspected, so this is time your material is on the premises and not on the shelf.',
      invalid: !days(qcN) ? 'Put in a whole number of days for inspection.'
        : !days(overdueN) || overdueN < 1 ? 'Put in how many days before it is raised — one or more.'
          : null,
      body: (
        <div className="space-y-3.5">
          <Field label="How many days does inspection usually take?"
            hint="Two is common. It is added to every arrival date, so the Sourcing desk orders that much earlier."
            htmlFor="gr-qc">
            <NumberInput id="gr-qc" value={qc} onChange={setQc} unit="days" step="1" autoFocus />
          </Field>
          <Field label="Raise it when a receipt has waited uninspected for…" htmlFor="gr-overdue">
            <NumberInput id="gr-overdue" value={overdue} onChange={setOverdue} unit="days" step="1" />
          </Field>
        </div>
      ),
    },
    {
      label: 'Rejections',
      title: 'When is a rejection a pattern?',
      why: 'One bad batch happens. A supplier rejecting at twice their usual rate is telling you something.',
      invalid: !Number.isFinite(spikeN) || spikeN <= 1 ? 'A spike has to be more than their usual rate — put in a multiple above 1.' : null,
      body: (
        <div className="space-y-3.5">
          <Field label="Raise a delivery rejected at more than … times the supplier's usual rate"
            htmlFor="gr-spike">
            <NumberInput id="gr-spike" value={spike} onChange={setSpike} unit="× their usual" autoFocus />
          </Field>
        </div>
      ),
    },
  ]

  const save = () => {
    update((w) => ({
      ...w,
      policy: {
        ...w.policy,
        inboundQcDays: qcN,
        qcOverdueDays: overdueN,
        rejectionSpikeMultiple: spikeN,
      },
      drafts: { ...w.drafts, 'inbound.rules.agreed': true },
    }))
    onClose()
  }

  return (
    <Wizard open={open} onClose={onClose}
      title="The gate rules"
      sub="Three decisions. Change any of them here later."
      steps={steps} onDone={save} doneLabel="Save the gate rules" />
  )
}
