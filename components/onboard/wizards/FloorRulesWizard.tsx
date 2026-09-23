'use client'
import { useEffect, useState } from 'react'
import { Wizard, type WizardStep } from '@/components/ui/Wizard'
import { Field, NumberInput, Textarea } from '@/components/ui/Field'
import { useWorkspace } from '@/components/workspace/store'
import { floorOf } from '@/lib/workspace/plan'

const DAYS = [
  { n: 1, short: 'Mon', name: 'Monday' },
  { n: 2, short: 'Tue', name: 'Tuesday' },
  { n: 3, short: 'Wed', name: 'Wednesday' },
  { n: 4, short: 'Thu', name: 'Thursday' },
  { n: 5, short: 'Fri', name: 'Friday' },
  { n: 6, short: 'Sat', name: 'Saturday' },
  { n: 0, short: 'Sun', name: 'Sunday' },
]

/**
 * The rules a day on the floor is judged by: which days are working days (a
 * target is set only for those), how far behind the daily target counts as
 * behind, and the reasons a piece is rejected — the owner's words, which
 * every output booking then picks from.
 */
export function FloorRulesWizard({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { workspace, update } = useWorkspace()
  const [days, setDays] = useState<number[]>([])
  const [behind, setBehind] = useState('')
  const [reasons, setReasons] = useState('')

  useEffect(() => {
    if (!open || !workspace) return
    const f = floorOf(workspace)
    setDays(f.workingDays); setBehind(String(f.behindPct)); setReasons(f.rejectReasons.join('\n'))
  }, [open]) // eslint-disable-line react-hooks/exhaustive-deps

  if (!open || !workspace) return null
  const pct = Number(behind)
  const list = reasons.split('\n').map((r) => r.trim()).filter(Boolean)

  const steps: WizardStep[] = [
    {
      label: 'Working days',
      title: 'When does the floor work, and when is a job behind?',
      why: 'A daily target is set only for working days, so a Sunday never makes a job look behind.',
      invalid: days.length === 0 ? 'Pick at least one working day.'
        : !(pct >= 0 && pct <= 100) ? 'Behind is a share of the day’s target, 0 to 100.' : null,
      body: (
        <div className="space-y-4">
          <fieldset>
            <legend className="mb-1.5 text-[13px] font-medium text-ink">Working days</legend>
            <div className="flex flex-wrap gap-1.5">
              {DAYS.map((d) => {
                const on = days.includes(d.n)
                return (
                  <button key={d.n} type="button" aria-pressed={on} aria-label={d.name}
                    onClick={() => setDays((ds) => (on ? ds.filter((x) => x !== d.n) : [...ds, d.n].sort()))}
                    className={`press rounded-full border px-3 py-1 text-[12.5px] ${on
                      ? 'border-accent-ink bg-accent-ink text-on-accent' : 'border-line bg-surface text-ink-2 hover:bg-surface-2'}`}>
                    {d.short}
                  </button>
                )
              })}
            </div>
          </fieldset>
          <Field label="Behind counts from" htmlFor="fr-behind"
            hint="Short of the target to date by more than this, a job goes on the dashboard as behind.">
            <NumberInput id="fr-behind" value={behind} onChange={setBehind} unit="% of target" step="1" />
          </Field>
        </div>
      ),
    },
    {
      label: 'Rejects',
      title: 'Why is a piece rejected?',
      why: 'One reason per line. Booking output offers these, so a month of rejects can be read by cause.',
      invalid: list.length === 0 ? 'Give at least one reason.' : null,
      body: (
        <Field label="Reasons" htmlFor="fr-reasons">
          <Textarea id="fr-reasons" value={reasons} onChange={setReasons} rows={6} />
        </Field>
      ),
    },
  ]

  const save = () => {
    update((w) => ({
      ...w,
      floor: { workingDays: days, behindPct: pct, rejectReasons: list },
      drafts: { ...w.drafts, 'production.rules.agreed': true },
    }))
    onClose()
  }

  return (
    <Wizard open={open} onClose={onClose} wide={false} title="Floor rules" steps={steps} onDone={save}
      doneLabel="Save the floor rules" />
  )
}
