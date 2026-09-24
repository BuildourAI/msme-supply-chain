'use client'
import { useEffect, useState } from 'react'
import { Wizard, type WizardStep } from '@/components/ui/Wizard'
import { Chips, Field, NumberInput } from '@/components/ui/Field'
import { useWorkspace } from '@/components/workspace/store'
import { money } from '@/lib/domain/format'
import { repriceTerms } from '@/lib/workspace/landed'

/**
 * The six rules that decide what the system suggests, and when it asks.
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
 * The last is about orders already with a supplier: how long a change may go
 * unconfirmed, and how often a line may move before it is a pattern. Those
 * cards are the buyer's, so their rules are too.
 *
 * Nothing here is a one-time choice somebody is stuck with: the checklist's
 * Change link opens this again, on the figures as they are now.
 */
export function RulesWizard({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { workspace, update } = useWorkspace()
  const [cycle, setCycle] = useState('15')
  const [ceiling, setCeiling] = useState('2')
  const [threshold, setThreshold] = useState('200000')
  const [prefer, setPrefer] = useState<'lowest_landed_cost' | 'preferred'>('lowest_landed_cost')
  const [capital, setCapital] = useState('')
  const [ack, setAck] = useState('2')
  const [churn, setChurn] = useState('2')

  useEffect(() => {
    if (!open || !workspace) return
    const p = workspace.policy
    setCycle(String(p.cycleDays.B))
    setCeiling(String(p.coverageCeiling.B))
    setThreshold(String(p.ownerApprovalThreshold))
    setPrefer(p.supplierDefault)
    setCapital(p.costOfMoneyPct > 0 ? String(p.costOfMoneyPct) : '')
    setAck(String(p.ackChaseDays)); setChurn(String(p.poChurnLimit))
  }, [open]) // eslint-disable-line react-hooks/exhaustive-deps

  if (!open || !workspace) return null

  const n = (v: string) => (v.trim() === '' ? NaN : Number(v))
  const positive = (v: number) => (Number.isFinite(v) && v > 0 ? v : 0)
  const cycleN = n(cycle)
  const ceilingN = n(ceiling)
  const thresholdN = n(threshold)
  // blank is a real answer here, and it means zero rather than "not a number"
  const capitalN = positive(n(capital))
  const ackN = n(ack), churnN = n(churn)
  const whole = (v: number, least: number) => Number.isInteger(v) && v >= least

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
    {
      label: 'Credit',
      title: 'One supplier wants cash, another gives you 45 days. What is that worth?',
      why: 'It is the one cost of buying that nobody puts on a quotation, and the only one this can work out for you.',
      invalid: null,
      body: (
        <div className="space-y-3.5">
          <Field label="What your working capital costs you"
            hint="The rate on your cash credit or overdraft, a year. Leave it blank if you would rather not say."
            htmlFor="rw-money">
            <NumberInput id="rw-money" value={capital} onChange={setCapital} unit="% a year"
              placeholder="11" />
          </Field>
          {/*
            * Blank is a real answer and it has to behave like one. Every other
            * figure in this wizard is a rule with a defensible default; this is
            * a fact about one business that nobody here knows, and a
            * plausible-looking 11% applied quietly would change which supplier
            * the system recommends on a number the owner never gave.
            */}
          <p className="rounded-md border border-line bg-surface-2 px-2.5 py-2 text-[12px] leading-relaxed text-ink-2">
            {capitalN > 0 ? (
              <>Paying cash where somebody else would have given you 45 days costs you{' '}
              <strong className="text-ink">{(capitalN * 45 / 365).toFixed(1)}%</strong> of the order —
              on ₹1,00,000 that is {money(100000 * (capitalN / 100) * (45 / 365))}. It is counted in
              the comparison from now on.</>
            ) : (
              <>Left blank, payment terms are not costed at all and the comparison says so. Nothing
              is assumed on your behalf.</>
            )}
          </p>
        </div>
      ),
    },
    {
      label: 'Changes',
      title: 'When is a change overdue, and a line moving too often?',
      why: 'Once an order is with its supplier, a change is a new version they have to confirm. These decide when the dashboard raises one.',
      invalid: !whole(ackN, 0) ? 'Put in a whole number of days.'
        : !whole(churnN, 1) ? 'Put in how many changes in 30 days is still normal — one or more.' : null,
      body: (
        <div className="space-y-3.5">
          <Field label="Chase a change to an order they have not confirmed after…"
            hint="The change is text for you to send. Until they confirm it, your stock figures use the order as they last agreed it."
            htmlFor="rw-ack">
            <NumberInput id="rw-ack" value={ack} onChange={setAck} unit="days" step="1" />
          </Field>
          <Field label="Raise a line changed more than … times in 30 days"
            hint="A line that keeps moving gets re-planned by the supplier every time, and priced in next quarter."
            htmlFor="rw-churn">
            <NumberInput id="rw-churn" value={churn} onChange={setChurn} unit="times" step="1" />
          </Field>
        </div>
      ),
    },
  ]

  const save = () => {
    /*
     * Repriced, because the cost of money is the one rule that changes a
     * figure already written. Every other knob here is read at derivation
     * time; this one is baked into each rate's payment-term cost when the rate
     * is saved — so setting it after the suppliers were entered would
     * otherwise leave every one of them at zero, which is exactly what it did.
     */
    update((w) => repriceTerms({
      ...w,
      policy: {
        ...w.policy,
        cycleDays: { A: cycleN, B: cycleN, C: cycleN },
        coverageCeiling: { A: ceilingN, B: ceilingN, C: ceilingN },
        ownerApprovalThreshold: thresholdN,
        supplierDefault: prefer,
        costOfMoneyPct: capitalN > 0 ? capitalN : 0,
        ackChaseDays: ackN,
        poChurnLimit: churnN,
      },
      drafts: { ...w.drafts, 'rules.agreed': true },
    }))
    onClose()
  }

  return (
    <Wizard open={open} onClose={onClose}
      title="Your rules"
      sub="Six decisions. Change any of them later from this checklist."
      steps={steps} onDone={save} doneLabel="Save my rules" />
  )
}
