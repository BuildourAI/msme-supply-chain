'use client'
import { useEffect, useState } from 'react'
import { Wizard, type WizardStep } from '@/components/ui/Wizard'
import { Chips, Field, NumberInput } from '@/components/ui/Field'
import { useWorkspace } from '@/components/workspace/store'
import { money } from '@/lib/domain/format'
import type { ItemClass } from '@/lib/domain/types'
import { GST_JOBWORK_WARN_DAYS } from '@/lib/workspace/jobwork'

type ByClass = Record<ItemClass, string>
const CLASSES: ItemClass[] = ['A', 'B', 'C']
const asText = (r: Record<ItemClass, number>): ByClass => ({ A: String(r.A), B: String(r.B), C: String(r.C) })

/**
 * The rules a count, a loss and a jobworker are judged by.
 *
 * Every figure is already a policy value with the sample company's default;
 * this is where the owner says whether it is theirs. None of them stops
 * anything — they decide when the dashboard says so.
 *
 * The first question is whether the company cuts material at all. A trims
 * store never cuts; a garment floor cuts every day. "No" hides everything
 * about cuts and remnants' sizes, and is a real answer that can be changed
 * here later.
 */
export function StoreRulesWizard({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { workspace, update } = useWorkspace()
  const [cuts, setCuts] = useState<'yes' | 'no'>('no')
  const [cadence, setCadence] = useState<ByClass>({ A: '7', B: '14', C: '30' })
  const [tolerance, setTolerance] = useState<ByClass>({ A: '1', B: '2', C: '5' })
  const [target, setTarget] = useState<ByClass>({ A: '3', B: '4', C: '5' })
  const [over, setOver] = useState('1')
  const [unsold, setUnsold] = useState('90')
  const [rates, setRates] = useState<Record<string, string>>({})
  const [age, setAge] = useState('90')
  const [yieldTol, setYieldTol] = useState('2')
  const [mins, setMins] = useState<Record<string, string>>({})
  const [grace, setGrace] = useState('0')
  const [ceiling, setCeiling] = useState('200000')

  useEffect(() => {
    if (!open || !workspace) return
    const p = workspace.policy
    setCuts(workspace.cutting ? 'yes' : 'no')
    setCadence(asText(p.countCadenceDays)); setTolerance(asText(p.countTolerancePct))
    setTarget(asText(p.scrapTargetPct)); setOver(String(p.scrapTolerancePct))
    setUnsold(String(p.scrapUnrealisedDays)); setAge(String(p.remnantAgeDays))
    setYieldTol(String(p.yieldTolerancePct))
    setGrace(String(p.jobworkGraceDays)); setCeiling(String(p.jobworkerExposureCeiling))
    setRates(Object.fromEntries(Object.entries(workspace.scrapRate ?? {}).map(([k, v]) => [k, String(v)])))
    setMins(Object.fromEntries(Object.entries(workspace.minRemnant ?? {}).map(([k, v]) => [k, String(v)])))
  }, [open]) // eslint-disable-line react-hooks/exhaustive-deps

  if (!open || !workspace) return null
  const ws = workspace

  const n = (v: string) => (v.trim() === '' ? NaN : Number(v))
  const whole = (v: string) => Number.isInteger(n(v)) && n(v) >= 1
  const share = (v: string) => Number.isFinite(n(v)) && n(v) >= 0 && n(v) <= 100
  const blankOrMoney = (v: string) => v.trim() === '' || (Number.isFinite(n(v)) && n(v) >= 0)
  const graceN = n(grace), ceilingN = n(ceiling)

  const byClass = (vals: ByClass, set: (b: ByClass) => void, unit: string, idp: string, step = '1') => (
    <div className="grid grid-cols-3 gap-2">
      {CLASSES.map((c) => (
        <Field key={c} label={`Class ${c}`} htmlFor={`${idp}-${c}`}>
          <NumberInput id={`${idp}-${c}`} value={vals[c]} unit={unit} step={step}
            onChange={(v) => set({ ...vals, [c]: v })} />
        </Field>
      ))}
    </div>
  )

  const perMaterial = (vals: Record<string, string>, set: (r: Record<string, string>) => void,
    unit: (uom: string) => string, placeholder: string, idp: string) => (
    ws.items.length === 0
      ? <p className="text-[12px] text-ink-4">No materials yet — this can be filled in once there are.</p>
      : (
        <ul className="max-h-56 space-y-1.5 overflow-y-auto pr-1">
          {ws.items.map((it) => (
            <li key={it.id} className="grid grid-cols-[minmax(0,1fr)_9rem] items-center gap-2">
              <label htmlFor={`${idp}-${it.id}`} className="truncate text-[12.5px] text-ink-2" title={it.name}>{it.name}</label>
              <NumberInput id={`${idp}-${it.id}`} value={vals[it.id] ?? ''} unit={unit(it.uom)}
                placeholder={placeholder} onChange={(v) => set({ ...vals, [it.id]: v })} />
            </li>
          ))}
        </ul>
      )
  )

  const steps: WizardStep[] = [
    {
      label: 'Cutting',
      title: 'Do you cut material into parts?',
      why: 'Fabric laid and cut, sheet blanked, tube cut to length. If you do, the store keeps cut records and a register of the remnants — what is left, on which rack, how old.',
      invalid: null,
      body: (
        <div className="space-y-3">
          <Chips value={cuts} onChange={(v) => setCuts(v as 'yes' | 'no')} options={[
            { value: 'yes', label: 'Yes, we cut material' },
            { value: 'no', label: 'No — it goes out as it came in' },
          ]} />
          <p className="text-[12px] leading-relaxed text-ink-3">
            {cuts === 'yes'
              ? 'Cutting & offcuts is added to the store. Remnants returned from a job still land on the ledger either way.'
              : 'Nothing about cuts is shown. A short piece returned from a job is still kept, flagged as a remnant. Switch this on here any time.'}
          </p>
        </div>
      ),
    },
    {
      label: 'Counting',
      title: 'How often is each class counted, and what counts as a real difference?',
      why: 'Class A is the few materials worth the most. A lot not counted within its cadence is not wrong — it is unverified, and the dashboard says so.',
      invalid: !CLASSES.every((c) => whole(cadence[c])) ? 'Put in a whole number of days for each class.'
        : !CLASSES.every((c) => share(tolerance[c])) ? 'Put in a percentage for each class.' : null,
      body: (
        <div className="space-y-3.5">
          <p className="text-[12.5px] font-medium text-ink-2">Count every…</p>
          {byClass(cadence, setCadence, 'days', 'sr-cad')}
          <p className="text-[12.5px] font-medium text-ink-2">Raise a count that differs from the book by more than…</p>
          {byClass(tolerance, setTolerance, '%', 'sr-tol', 'any')}
        </div>
      ),
    },
    {
      label: 'Scrap',
      title: 'What scrap will you accept, and what does it fetch?',
      why: 'Scrap as a share of what is issued. Over the target by more than the margin, the dashboard says so; unsold for longer than you say, the recovery is treated as not coming.',
      invalid: !CLASSES.every((c) => share(target[c])) ? 'Put in a percentage for each class.'
        : !share(over) ? 'Put in how many points over the target is allowed.'
          : !whole(unsold) ? 'Put in a whole number of days.'
            : !ws.items.every((it) => blankOrMoney(rates[it.id] ?? '')) ? 'A scrap rate is rupees per unit, or blank for none.' : null,
      body: (
        <div className="space-y-3.5">
          <p className="text-[12.5px] font-medium text-ink-2">Scrap target, of what is issued</p>
          {byClass(target, setTarget, '%', 'sr-tgt', 'any')}
          <div className="grid grid-cols-2 gap-2">
            <Field label="Allowed over the target by" htmlFor="sr-over">
              <NumberInput id="sr-over" value={over} onChange={setOver} unit="points" step="any" />
            </Field>
            <Field label="Scrap unsold after" htmlFor="sr-unsold">
              <NumberInput id="sr-unsold" value={unsold} onChange={setUnsold} unit="days" step="1" />
            </Field>
          </div>
          <Field label="What a scrap dealer pays"
            hint="Per unit. Leave blank where scrap fetches nothing — it is then counted as dead loss.">
            {perMaterial(rates, setRates, (u) => `₹/${u}`, '—', 'sr-rate')}
          </Field>
        </div>
      ),
    },
    {
      label: 'Jobwork',
      title: 'How much slack do jobworkers get?',
      why: 'Material at a jobworker is yours and out of your sight. These decide when that becomes something to look at.',
      invalid: !(Number.isInteger(graceN) && graceN >= 0) ? 'Put in a whole number of days, zero for none.'
        : !Number.isFinite(ceilingN) || ceilingN <= 0 ? 'Put in an amount in rupees.' : null,
      body: (
        <div className="space-y-3.5">
          <Field label="Days past their promised date before a jobwork challan is raised on the dashboard" htmlFor="sr-grace">
            <NumberInput id="sr-grace" value={grace} onChange={setGrace} unit="days" step="1" />
          </Field>
          <Field label="The most one jobworker should hold at once"
            hint="Valued at what you last paid for the material. Past it, the dashboard says so; it never stops you sending."
            htmlFor="sr-ceiling">
            <NumberInput id="sr-ceiling" value={ceiling} onChange={setCeiling} unit="₹" step="10000" />
          </Field>
          {Number.isFinite(ceilingN) && ceilingN > 0 && (
            <p className="text-[12px] text-ink-2">
              That is <strong className="text-ink">{money(ceilingN)}</strong>
              {ceilingN >= 100000 && <> — {(ceilingN / 100000).toFixed(2)} lakh</>}.
            </p>
          )}
          <p className="text-[12px] leading-relaxed text-ink-3">
            GST wants material sent for jobwork back within a year of leaving, or counts it as supplied to
            the jobworker on the day it left. The store says so from {GST_JOBWORK_WARN_DAYS} days before.
          </p>
        </div>
      ),
    },
    ...(cuts === 'yes' ? [{
      label: 'Remnants',
      title: 'When is a remnant too small, and too old?',
      why: 'A piece below the smallest usable size is scrap at the cut. A remnant older than you say is offered up to use or scrap — never scrapped on its own.',
      invalid: !whole(age) ? 'Put in a whole number of days.'
        : !share(yieldTol) ? 'Put in how many points below the cutting plan is allowed.'
          : !ws.items.every((it) => blankOrMoney(mins[it.id] ?? '')) ? 'A smallest piece is a size, or blank for none.' : null,
      body: (
        <div className="space-y-3.5">
          <div className="grid grid-cols-2 gap-2">
            <Field label="Offer a remnant up after" htmlFor="sr-age">
              <NumberInput id="sr-age" value={age} onChange={setAge} unit="days" step="1" />
            </Field>
            <Field label="A cut may fall below plan by" htmlFor="sr-yield">
              <NumberInput id="sr-yield" value={yieldTol} onChange={setYieldTol} unit="points" step="any" />
            </Field>
          </div>
          <Field label="The smallest usable piece"
            hint="In the material's own unit. Blank keeps every remnant.">
            {perMaterial(mins, setMins, (u) => u, 'any size', 'sr-min')}
          </Field>
        </div>
      ),
    } satisfies WizardStep] : []),
  ]

  const numMap = (vals: Record<string, string>) => Object.fromEntries(
    ws.items.map((it) => [it.id, n(vals[it.id] ?? '')] as const).filter(([, v]) => Number.isFinite(v) && v > 0),
  )
  const cls = (vals: ByClass) => ({ A: n(vals.A), B: n(vals.B), C: n(vals.C) })

  const save = () => {
    update((w) => ({
      ...w,
      cutting: cuts === 'yes',
      policy: {
        ...w.policy,
        countCadenceDays: cls(cadence),
        countTolerancePct: cls(tolerance),
        scrapTargetPct: cls(target),
        scrapTolerancePct: n(over),
        scrapUnrealisedDays: n(unsold),
        jobworkGraceDays: graceN,
        jobworkerExposureCeiling: ceilingN,
        ...(cuts === 'yes' ? { remnantAgeDays: n(age), yieldTolerancePct: n(yieldTol) } : {}),
      },
      scrapRate: numMap(rates),
      minRemnant: cuts === 'yes' ? numMap(mins) : w.minRemnant,
      drafts: { ...w.drafts, 'inventory.rules.agreed': true },
    }))
    onClose()
  }

  return (
    <Wizard open={open} onClose={onClose}
      title="Your store rules"
      sub="Change any of them here later."
      steps={steps} onDone={save} doneLabel="Save the store rules" />
  )
}
