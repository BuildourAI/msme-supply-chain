'use client'
import { useEffect, useState } from 'react'
import { Wizard, type WizardStep } from '@/components/ui/Wizard'
import { Field, NumberInput, Select, TextInput } from '@/components/ui/Field'
import { useWorkspace } from '@/components/workspace/store'
import { UOM_LABEL, nextId, suggestCode } from '@/lib/workspace/defaults'
import type { Item, Uom } from '@/lib/domain/types'

/**
 * Adding one material, four questions.
 *
 * The domain needs nine fields on an `Item`, several of them phrased the way a
 * planner would say them — `avgDailyConsumption`, `safetyStock`,
 * `coverageCeilingMonths`, `itemClass`. An owner does not think in those words
 * and should not have to. So the questions are the ones they can answer from
 * memory, and the planner's fields are computed from the answers:
 *
 *   safety stock = how many days' cushion they want × what they use in a day
 *
 * The two that genuinely have no plain-language form — the ABC class and the
 * coverage ceiling — take the documented defaults and stay behind "More
 * options" rather than being asked about. §13-4 already flags the flat 2.0-month
 * ceiling as something to agree per class with a client, and the rules step is
 * where that conversation happens.
 *
 * Nothing here invents a rate. `lastPurchaseRate` is the valuation basis for
 * every rupee figure on the stock screens, so it is set from the first supplier
 * quote rather than guessed — until then the material is worth nothing, which is
 * true rather than convenient.
 */
export function MaterialWizard({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { workspace, update } = useWorkspace()
  const [name, setName] = useState('')
  const [code, setCode] = useState('')
  const [codeTouched, setCodeTouched] = useState(false)
  const [group, setGroup] = useState('')
  const [uom, setUom] = useState<Uom>('kg')
  const [moq, setMoq] = useState('')
  const [daily, setDaily] = useState('')
  const [cushion, setCushion] = useState('7')
  const [feeds, setFeeds] = useState('')

  useEffect(() => {
    if (!open || !workspace) return
    setName(''); setCode(''); setCodeTouched(false)
    setGroup(workspace.categories.materialGroup[0] ?? '')
    setUom(workspace.categories.units[0] ?? 'kg')
    setMoq(''); setDaily(''); setCushion('7'); setFeeds('')
  }, [open]) // eslint-disable-line react-hooks/exhaustive-deps

  if (!open || !workspace) return null

  const ws = workspace
  const num = (v: string) => (v.trim() === '' ? NaN : Number(v))
  const dailyN = num(daily)
  const cushionN = num(cushion)
  const moqN = moq.trim() === '' ? 0 : Number(moq)
  const shownCode = codeTouched ? code : suggestCode(name, ws.items)
  const unitWord = UOM_LABEL[uom] ?? uom

  const duplicateName = ws.items.some((i) => i.name.trim().toLowerCase() === name.trim().toLowerCase())
  const duplicateCode = ws.items.some((i) => i.code.toUpperCase() === shownCode.toUpperCase())

  const steps: WizardStep[] = [
    {
      label: 'Name',
      title: 'What do you call this material?',
      why: 'Use the name your own people use on the floor. A supplier calling it something else is dealt with later.',
      invalid: name.trim().length < 2
        ? 'Give the material a name — at least two characters.'
        : duplicateName ? 'You already have a material with that name.' : null,
      body: (
        <div className="space-y-3.5">
          <Field label="Material name" htmlFor="mw-name">
            <TextInput id="mw-name" value={name} onChange={setName} autoFocus
              placeholder="Copper strip 25 mm" invalid={duplicateName} />
          </Field>
          <Field label="Short code" hint="Suggested from the name. Change it if you already have your own coding."
            htmlFor="mw-code"
            error={duplicateCode ? 'That code is already in use.' : null}>
            <TextInput id="mw-code" value={shownCode}
              onChange={(v) => { setCodeTouched(true); setCode(v) }} invalid={duplicateCode} />
          </Field>
          <Field label="What kind of material is it?"
            hint="Your own grouping. Add whatever names you actually use." htmlFor="mw-group">
            <Select id="mw-group" value={group} onChange={setGroup}
              options={ws.categories.materialGroup.map((g) => ({ value: g, label: g }))}
              addLabel="New group name…"
              onAdd={(v) => update((w) => ({
                ...w, categories: { ...w.categories, materialGroup: [...w.categories.materialGroup, v] },
              }))} />
          </Field>
        </div>
      ),
    },
    {
      label: 'How you buy it',
      title: `How do you buy ${name.trim() || 'it'}?`,
      why: 'The unit everything else is counted in — stock, orders, wastage.',
      invalid: Number.isFinite(moqN) && moqN >= 0 ? null : 'Put in a smallest order quantity, or leave it at zero.',
      body: (
        <div className="space-y-3.5">
          <Field label="What unit do you buy it in?" htmlFor="mw-uom">
            <Select id="mw-uom" value={uom} onChange={(v) => setUom(v as Uom)}
              options={ws.categories.units.map((u) => ({ value: u, label: `${UOM_LABEL[u] ?? u} (${u})` }))} />
          </Field>
          <Field label="Smallest quantity a supplier will sell you"
            hint="Leave it at zero if there is no minimum. Orders get rounded up to whole multiples of this."
            htmlFor="mw-moq">
            <NumberInput id="mw-moq" value={moq} onChange={setMoq} unit={uom} placeholder="0" />
          </Field>
        </div>
      ),
    },
    {
      label: 'How much you use',
      title: 'How much do you get through on a normal working day?',
      why: 'This is what tells the system when you are running out. A rough figure is far better than none — it can be corrected any time.',
      invalid: !Number.isFinite(dailyN) || dailyN <= 0
        ? 'Put in roughly how much you use in a day.'
        : !Number.isFinite(cushionN) || cushionN < 0
          ? 'Put in how many days of cushion you want, or zero.'
          : null,
      body: (
        <div className="space-y-3.5">
          <Field label={`On a normal day you use about…`} htmlFor="mw-daily">
            <NumberInput id="mw-daily" value={daily} onChange={setDaily} unit={`${uom} a day`} autoFocus />
          </Field>
          <Field label="How many days of cushion do you want to keep?"
            hint="Spare stock kept back for a late delivery or a rush job."
            htmlFor="mw-cushion">
            <NumberInput id="mw-cushion" value={cushion} onChange={setCushion} unit="days" step="1" />
          </Field>
          {Number.isFinite(dailyN) && dailyN > 0 && Number.isFinite(cushionN) && (
            <p className="rounded-md border border-line bg-surface-2 px-2.5 py-2 text-[12px] leading-relaxed text-ink-2">
              That keeps <strong className="text-ink">
                {Math.round(dailyN * cushionN * 1000) / 1000} {unitWord}
              </strong> back as cushion. The system will tell you to buy before stock drops through it,
              allowing for how long your supplier actually takes.
            </p>
          )}
        </div>
      ),
    },
    {
      label: 'What it goes into',
      title: 'What do you make with it?',
      why: 'Optional. It is what lets the system say “if this runs out, that order stops” instead of just naming a material.',
      invalid: null,
      body: (
        <Field label="Products that need it"
          hint="One per line, or separated by commas. You can leave this empty."
          htmlFor="mw-feeds">
          <textarea id="mw-feeds" value={feeds} onChange={(e) => setFeeds(e.target.value)} rows={3}
            placeholder={'Immersion heater 6 kW\nControl panel enclosure'}
            className="w-full rounded-md border border-line bg-surface px-2.5 py-2 text-[13px] outline-none focus:border-accent" />
        </Field>
      ),
    },
  ]

  const save = () => {
    const item: Item = {
      id: nextId('IT', ws.items),
      code: shownCode.trim().toUpperCase(),
      name: name.trim(),
      uom,
      // §13-4 flags a single class for everything as something to agree with the
      // client; the rules step is where that is settled, so B is the default
      // rather than a guess dressed up as a question.
      itemClass: 'B',
      coverageCeilingMonths: ws.policy.coverageCeiling.B,
      moq: moqN,
      safetyStock: Math.round(dailyN * cushionN * 1000) / 1000,
      avgDailyConsumption: dailyN,
      floorConsumptionPerDay: dailyN,
      // Set from the first supplier quote. Guessing it here would put an
      // invented rupee figure on every stock screen.
      lastPurchaseRate: 0,
      feeds: feeds.split(/[,\n]/).map((f) => f.trim()).filter(Boolean),
    }
    update((w) => ({
      ...w,
      items: [...w.items, item],
      itemGroup: { ...w.itemGroup, [item.id]: group },
    }))
    onClose()
  }

  return (
    <Wizard open={open} onClose={onClose}
      title="Add a material"
      sub={`${ws.items.length} added so far`}
      steps={steps} onDone={save} doneLabel="Add this material" />
  )
}
