'use client'
import { useEffect, useState } from 'react'
import { Dialog } from '@/components/ui/Dialog'
import { Field, NumberInput, Select, TextInput } from '@/components/ui/Field'
import { useWorkspace } from '@/components/workspace/store'
import { setValues } from '@/lib/workspace/fields'
import { CustomFields } from '@/components/sheet/CustomFields'
import { UOM_LABEL, issueId, suggestCode } from '@/lib/workspace/defaults'
import { buildItem } from '@/lib/workspace/records'
import type { Item, Uom } from '@/lib/domain/types'

/**
 * Add or change a material.
 *
 * The domain wants nine fields on an item, several of them in a planner's
 * words. An owner is asked the two they can answer — what they get through in a
 * day, and how many days of cushion they want to keep — and the safety stock is
 * the product of those. The class and the coverage ceiling take the documented
 * defaults and are not asked about at all: §13 flags both as figures to agree
 * with a client, and the set-up's rules step is where that happens.
 *
 * What is deliberately absent is a price. A material is worth what was last
 * paid for it, and that comes from a supplier's rate — inventing one here would
 * put a made-up rupee figure on every stock screen.
 */
export function MaterialForm({ open, onClose, editing }: {
  open: boolean
  onClose: () => void
  editing: Item | null
}) {
  const { workspace, update } = useWorkspace()
  const [name, setName] = useState('')
  const [code, setCode] = useState('')
  const [codeTouched, setCodeTouched] = useState(false)
  const [group, setGroup] = useState('')
  const [uom, setUom] = useState<Uom>('kg')
  const [moq, setMoq] = useState('')
  const [daily, setDaily] = useState('')
  const [cushion, setCushion] = useState('7')
  const [custom, setCustom] = useState<Record<string, string>>({})
  const [tried, setTried] = useState(false)

  useEffect(() => {
    if (!open || !workspace) return
    setTried(false); setCodeTouched(Boolean(editing))
    if (editing) {
      setName(editing.name)
      setCode(editing.code)
      setGroup(workspace.itemGroup[editing.id] ?? workspace.categories.materialGroup[0] ?? '')
      setUom(editing.uom)
      setMoq(String(editing.moq))
      setDaily(String(editing.avgDailyConsumption))
      setCushion(editing.avgDailyConsumption > 0
        ? String(Math.round(editing.safetyStock / editing.avgDailyConsumption))
        : '0')
    } else {
      setName(''); setCode('')
      setGroup(workspace.categories.materialGroup[0] ?? '')
      setUom(workspace.categories.units[0] ?? 'kg')
      setMoq(''); setDaily(''); setCushion('7')
    }
  }, [open, editing]) // eslint-disable-line react-hooks/exhaustive-deps

  if (!open || !workspace) return null
  const ws = workspace

  const n = (v: string) => (v.trim() === '' ? NaN : Number(v))
  const dailyN = n(daily)
  const cushionN = n(cushion)
  const moqN = moq.trim() === '' ? 0 : Number(moq)
  const shownCode = codeTouched ? code : suggestCode(name, ws.items)

  const nameOk = name.trim().length > 1
  const dupName = ws.items.some(
    (i) => i.id !== editing?.id && i.name.trim().toLowerCase() === name.trim().toLowerCase(),
  )
  const dupCode = ws.items.some(
    (i) => i.id !== editing?.id && i.code.toUpperCase() === shownCode.trim().toUpperCase(),
  )
  const dailyOk = Number.isFinite(dailyN) && dailyN > 0
  const cushionOk = Number.isFinite(cushionN) && cushionN >= 0
  const moqOk = Number.isFinite(moqN) && moqN >= 0
  const ok = nameOk && !dupName && !dupCode && dailyOk && cushionOk && moqOk

  const save = () => {
    setTried(true)
    if (!ok) return
    update((w0) => {
      const [w, id] = editing ? [w0, editing.id] : issueId(w0, 'IT')
      const item = buildItem(w, {
        id,
        name,
        code: shownCode,
        uom,
        moq: moqN,
        daily: dailyN,
        cushionDays: cushionN,
      }, editing ?? undefined)
      return setValues({
        ...w,
        items: editing ? w.items.map((i) => (i.id === id ? item : i)) : [...w.items, item],
        itemGroup: { ...w.itemGroup, [id]: group },
      }, id, custom)
    })
    onClose()
  }

  return (
    <Dialog open onClose={onClose} wide title={editing ? `Edit ${editing.name}` : 'Add a material'}>
      <div className="space-y-4 px-4 py-4">
        <div className="grid gap-4 sm:grid-cols-[2fr_1fr]">
          <Field label="Material name" htmlFor="mf-name"
            error={tried && !nameOk ? 'Give the material a name.'
              : dupName ? 'You already have a material with that name.' : null}>
            <TextInput id="mf-name" value={name} onChange={setName} autoFocus
              placeholder="Copper strip 25 mm" invalid={(tried && !nameOk) || dupName} />
          </Field>
          <Field label="Code" htmlFor="mf-code"
            error={dupCode ? 'That code is in use.' : null}>
            <TextInput id="mf-code" value={shownCode}
              onChange={(v) => { setCodeTouched(true); setCode(v) }} invalid={dupCode} />
          </Field>
        </div>

        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Group" htmlFor="mf-group">
            <Select id="mf-group" value={group} onChange={setGroup}
              options={ws.categories.materialGroup.map((g) => ({ value: g, label: g }))}
              addLabel="New group name…"
              onAdd={(v) => update((w) => ({
                ...w, categories: { ...w.categories, materialGroup: [...w.categories.materialGroup, v] },
              }))} />
          </Field>
          <Field label="Bought in" htmlFor="mf-uom">
            <Select id="mf-uom" value={uom} onChange={(v) => setUom(v as Uom)}
              options={ws.categories.units.map((u) => ({ value: u, label: `${UOM_LABEL[u] ?? u} (${u})` }))} />
          </Field>
          <Field label="Smallest order" htmlFor="mf-moq"
            error={tried && !moqOk ? 'A number, or zero.' : null}>
            <NumberInput id="mf-moq" value={moq} onChange={setMoq} unit={uom} placeholder="0"
              invalid={tried && !moqOk} />
          </Field>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Used on a normal day" htmlFor="mf-daily"
            hint="Roughly. It is what tells the system when you are running out."
            error={tried && !dailyOk ? 'Put in roughly how much you use in a day.' : null}>
            <NumberInput id="mf-daily" value={daily} onChange={setDaily} unit={`${uom} a day`}
              invalid={tried && !dailyOk} />
          </Field>
          <Field label="Days of cushion" htmlFor="mf-cushion"
            hint="Spare stock kept back for a late delivery."
            error={tried && !cushionOk ? 'A number of days, or zero.' : null}>
            <NumberInput id="mf-cushion" value={cushion} onChange={setCushion} unit="days" step="1"
              invalid={tried && !cushionOk} />
          </Field>
        </div>

        {dailyOk && cushionOk && (
          <p className="rounded-lg border border-line bg-surface-2 px-3 py-2 text-[12.5px] leading-relaxed text-ink-2">
            Keeps <strong className="text-ink">
              {Math.round(dailyN * cushionN * 1000) / 1000} {uom}
            </strong> back as cushion.
          </p>
        )}

        <CustomFields entity="material" values={custom} onChange={setCustom} />
      </div>

      <footer className="flex items-center gap-2 border-t border-line-soft px-4 py-3">
        <button type="button" onClick={onClose}
          className="press rounded-lg px-2.5 py-2 text-[13px] text-ink-2 hover:text-ink">Cancel</button>
        <span className="ml-auto" />
        <button type="button" onClick={save}
          className="press rounded-lg border border-accent-ink bg-accent-ink px-3.5 py-2 text-[13px] font-semibold text-on-accent hover:bg-accent">
          {editing ? 'Save changes' : 'Add material'}
        </button>
      </footer>
    </Dialog>
  )
}
