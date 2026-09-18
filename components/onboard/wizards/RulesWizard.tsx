'use client'
import { useEffect, useState } from 'react'
import { Wizard, type WizardStep } from '@/components/ui/Wizard'
import { Chips, Field, NumberInput } from '@/components/ui/Field'
import { useWorkspace } from '@/components/workspace/store'
import { money } from '@/lib/domain/format'

/**
 * The four rules that decide what the system suggests.
 *
 * Every one of these already exists as a policy figure with a default, and §13
 * flags two of them as guesses a developer should not be making: the ordering
 * cycle, and a coverage ceiling that is 2.0 months for everything regardless of
 * class. This step is where the owner settles them.
 *
 * They are asked in the form of the decision they drive, not the name of the
 * field. "What is the most one order should cover?" is answerable; "coverage
 * ceiling in months, per ABC class" is not, unless you already know the answer.
 *
 * The rules panel on the Sourcing Desk edits the same figures afterwards, so
 * nothing here is a one-time choice somebody is stuck with.
 */
export function RulesWizard({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { workspace, update } = useWorkspace()
  const [cycle, setCycle] = useState('15')
  const [ceiling, setCeiling] = useState('2')
  const [threshold, setThreshold] = useState('200000')
  const [prefer, setPrefer] = useState<'lowest_landed_cost' | 'preferred'>('lowest_landed_cost')

  useEffect(() => {
    if (!open || !workspace) return
    const p = workspace.policy
    setCycle(String(p.cycleDays.B))
    setCeiling(String(p.coverageCeiling.B))
    setThreshold(String(p.ownerApprovalThreshold))
    setPrefer(p.supplierDefault)
  }, [open]) // eslint-disable-line react-hooks/exhaustive-deps

  if (!open || !workspace) return null

  const n = (v: string) => (v.trim() === '' ? NaN : Number(v))
  const cycleN = n(cycle)
  const ceilingN = n(ceiling)
  const thresholdN = n(threshold)

  const steps: WizardStep[] = [
    {
      label: 'How often',
      title: 'How much stock should one order bring in?',
      why: 'Ordering little and often costs you in freight and paperwork; ordering rarely ties your money up in a corner of the store.',
      invalid: !Number.isFinite(cycleN) || cycleN <= 0 ? 'Put in a number of days.' : null,
      body: (
        <div className="space-y-3.5">
          <Field label="Roughly how many days should one order cover?"
            hint="Fifteen is a common answer. It is not a limit — a shortage overrides it."
            htmlFor="rw-cycle">
            <NumberInput id="rw-cycle" value={cycle} onChange={setCycle} unit="days" step="1" autoFocus />
          </Field>
        </div>
      ),
    },
    {
      label: 'Ceiling',
      title: 'What is the most a single order should ever cover?',
      why: 'A guardrail against a minimum order quantity quietly committing you to a year of stock. It holds the line and asks; it never blocks you.',
      invalid: !Number.isFinite(ceilingN) || ceilingN <= 0 ? 'Put in a number of months.' : null,
      body: (
        <div className="space-y-3.5">
          <Field label="Hold any order that would leave more than…" htmlFor="rw-ceiling">
            <NumberInput id="rw-ceiling" value={ceiling} onChange={setCeiling} unit="months of stock" />
          </Field>
          <p className="rounded-md border border-line bg-surface-2 px-2.5 py-2 text-[12px] leading-relaxed text-ink-2">
            An order past this is held with a reason, not cancelled. Somebody reads it and decides —
            the system never refuses on its own, and never orders on its own either.
          </p>
        </div>
      ),
    },
    {
      label: 'Sign-off',
      title: 'Above what amount do you want to see it yourself?',
      why: 'Anything dearer waits for your sign-off, whoever raised it.',
      invalid: !Number.isFinite(thresholdN) || thresholdN < 0 ? 'Put in an amount in rupees.' : null,
      body: (
        <div className="space-y-3.5">
          <Field label="Orders above this need the owner" htmlFor="rw-threshold">
            <NumberInput id="rw-threshold" value={threshold} onChange={setThreshold} unit="₹" step="1000" />
          </Field>
          {Number.isFinite(thresholdN) && thresholdN >= 0 && (
            <p className="text-[12px] text-ink-2">
              That is <strong className="text-ink">{money(thresholdN)}</strong>
              {thresholdN >= 100000 && <> — {(thresholdN / 100000).toFixed(2)} lakh</>}.
            </p>
          )}
        </div>
      ),
    },
    {
      label: 'Which supplier',
      title: 'When two suppliers can both supply, which comes first?',
      why: 'Either answer is defensible. What matters is that it is your answer rather than an accident.',
      invalid: null,
      body: (
        <div className="space-y-3.5">
          <Field label="Start with">
            <Chips value={prefer} onChange={(v) => setPrefer(v as typeof prefer)}
              options={[
                { value: 'lowest_landed_cost', label: 'The cheapest, all in' },
                { value: 'preferred', label: 'The one I usually use' },
              ]} />
          </Field>
          <p className="rounded-md border border-line bg-surface-2 px-2.5 py-2 text-[12px] leading-relaxed text-ink-2">
            {prefer === 'lowest_landed_cost' ? (
              <>Cheapest means after freight, non-refundable tax, credit terms and their rejection
              history — not the lowest quoted rate, which is often a different supplier.</>
            ) : (
              <>Your usual supplier is put first, and the system still shows what a cheaper one would
              have cost, so keeping the relationship stays a choice you can see the price of.</>
            )}
          </p>
        </div>
      ),
    },
  ]

  const save = () => {
    update((w) => ({
      ...w,
      policy: {
        ...w.policy,
        cycleDays: { A: cycleN, B: cycleN, C: cycleN },
        coverageCeiling: { A: ceilingN, B: ceilingN, C: ceilingN },
        ownerApprovalThreshold: thresholdN,
        supplierDefault: prefer,
      },
      drafts: { ...w.drafts, 'rules.agreed': true },
    }))
    onClose()
  }

  return (
    <Wizard open={open} onClose={onClose}
      title="Your rules"
      sub="Four decisions. Every one can be changed later on the Sourcing Desk."
      steps={steps} onDone={save} doneLabel="Save my rules" />
  )
}
