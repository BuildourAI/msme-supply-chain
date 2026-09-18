'use client'
import { useEffect, useState } from 'react'
import { Wizard, type WizardStep } from '@/components/ui/Wizard'
import { Field, NumberInput, Select, TextInput } from '@/components/ui/Field'
import { Icon } from '@/components/ui/icons'
import { useWorkspace } from '@/components/workspace/store'
import { issueId } from '@/lib/workspace/defaults'
import { backfillRates, buildRate, buildVendor } from '@/lib/workspace/records'
import { money } from '@/lib/domain/format'
import type { Vendor, VendorItem } from '@/lib/domain/types'

/**
 * Adding one supplier and what they sell you.
 *
 * "Add one supplier — what he supplies, when he's supplying — and it gets
 * stored and pops up on the screen in a much simpler manner." Three questions,
 * and the third is the one that makes a buying suggestion possible at all: a
 * rate and a lead time against a material.
 *
 * The commercial fields on `VendorItem` that a first-time owner cannot answer —
 * a trailing rejection rate, an on-time percentage, a score — are left at zero
 * rather than invented. They are measurements, and there is nothing measured
 * yet. The screens that use them already say so.
 *
 * The quoted lead time is recorded as quoted. §5 makes the trailing average of
 * the last six receipts authoritative precisely because the quoted figure
 * flatters, and this build now labels the difference instead of quietly
 * treating one as the other.
 */
interface Line { itemId: string; rate: string; leadDays: string; preferred: boolean }

const blankLine = (itemId: string): Line => ({ itemId, rate: '', leadDays: '', preferred: false })

export function SupplierWizard({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { workspace, update } = useWorkspace()
  const [name, setName] = useState('')
  const [type, setType] = useState('')
  const [terms, setTerms] = useState('30')
  const [lines, setLines] = useState<Line[]>([])

  useEffect(() => {
    if (!open || !workspace) return
    setName('')
    setType(workspace.categories.supplierType[0] ?? '')
    setTerms('30')
    setLines(workspace.items.length ? [blankLine(workspace.items[0].id)] : [])
  }, [open]) // eslint-disable-line react-hooks/exhaustive-deps

  if (!open || !workspace) return null
  const ws = workspace

  const num = (v: string) => (v.trim() === '' ? NaN : Number(v))
  const termsN = num(terms)
  const itemById = (id: string) => ws.items.find((i) => i.id === id)
  const duplicate = ws.vendors.some((v) => v.name.trim().toLowerCase() === name.trim().toLowerCase())

  const setLine = (n: number, patch: Partial<Line>) =>
    setLines((ls) => ls.map((l, k) => (k === n ? { ...l, ...patch } : l)))

  const filled = lines.filter((l) => l.itemId && Number.isFinite(num(l.rate)) && num(l.rate) > 0
    && Number.isFinite(num(l.leadDays)) && num(l.leadDays) > 0)

  const noMaterials = ws.items.length === 0

  const steps: WizardStep[] = [
    {
      label: 'Who',
      title: 'Who is the supplier?',
      why: 'The name you would say on the phone. Nothing is ever sent to them from here.',
      invalid: name.trim().length < 2
        ? 'Give the supplier a name.'
        : duplicate ? 'You already have a supplier with that name.'
          : !Number.isFinite(termsN) || termsN < 0 ? 'Put in the credit days, or zero for cash.' : null,
      body: (
        <div className="space-y-3.5">
          <Field label="Supplier name" htmlFor="sw-name">
            <TextInput id="sw-name" value={name} onChange={setName} autoFocus
              placeholder="Shah Metals" invalid={duplicate} />
          </Field>
          <Field label="What kind of supplier are they?"
            hint="Your own grouping — add whatever names you use." htmlFor="sw-type">
            <Select id="sw-type" value={type} onChange={setType}
              options={ws.categories.supplierType.map((t) => ({ value: t, label: t }))}
              addLabel="New supplier type…"
              onAdd={(v) => update((w) => ({
                ...w, categories: { ...w.categories, supplierType: [...w.categories.supplierType, v] },
              }))} />
          </Field>
          <Field label="How many days do they give you to pay?"
            hint="Zero if you pay on delivery. It is part of what a material really costs you."
            htmlFor="sw-terms">
            <NumberInput id="sw-terms" value={terms} onChange={setTerms} unit="days" step="1" />
          </Field>
        </div>
      ),
    },
    {
      label: 'What they supply',
      title: `What does ${name.trim() || 'this supplier'} sell you?`,
      why: 'A rate and how long they take. This is what makes a buying suggestion possible.',
      invalid: noMaterials
        ? 'Add a material first — there is nothing for a supplier to quote against yet.'
        : filled.length === 0
          ? 'Fill in a rate and a delivery time for at least one material.'
          : null,
      body: noMaterials ? (
        <p className="rounded-md border border-warn/30 bg-warn-soft px-3 py-2.5 text-[12.5px] leading-relaxed text-ink-2">
          You have not added any materials yet, so there is nothing to quote against. Close this, add a
          material first, then come back.
        </p>
      ) : (
        <div className="space-y-3">
          {lines.map((l, n) => {
            const it = itemById(l.itemId)
            return (
              <div key={n} className="rounded-md border border-line bg-surface-2 p-2.5">
                <div className="grid gap-2.5 sm:grid-cols-2">
                  <Field label="Material">
                    <Select value={l.itemId} onChange={(v) => setLine(n, { itemId: v })}
                      options={ws.items.map((i) => ({ value: i.id, label: `${i.name} (${i.code})` }))} />
                  </Field>
                  <Field label="Their rate">
                    <NumberInput value={l.rate} onChange={(v) => setLine(n, { rate: v })}
                      unit={it ? `₹ per ${it.uom}` : '₹'} />
                  </Field>
                  <Field label="How long do they usually take?"
                    hint="From placing the order to the goods arriving.">
                    <NumberInput value={l.leadDays} onChange={(v) => setLine(n, { leadDays: v })}
                      unit="days" step="1" />
                  </Field>
                  <Field label="Is this your usual supplier for it?">
                    <label className="flex items-center gap-2 py-1.5 text-[12.5px] text-ink-2">
                      <input type="checkbox" checked={l.preferred}
                        onChange={(e) => setLine(n, { preferred: e.target.checked })}
                        className="size-4 accent-[var(--accent-ink)]" />
                      Yes, prefer them for this material
                    </label>
                  </Field>
                </div>
                {lines.length > 1 && (
                  <button type="button" onClick={() => setLines((ls) => ls.filter((_, k) => k !== n))}
                    className="press mt-1.5 text-[11.5px] text-ink-3 underline underline-offset-2 hover:text-critical">
                    Remove this material
                  </button>
                )}
              </div>
            )
          })}
          <button type="button"
            onClick={() => setLines((ls) => [...ls, blankLine(ws.items[0].id)])}
            className="press inline-flex items-center gap-1.5 rounded-md border border-line bg-surface px-2.5 py-1.5 text-[12.5px] font-medium hover:bg-surface-2">
            <Icon name="arrow-down" className="size-3.5" />
            They supply something else too
          </button>
        </div>
      ),
    },
    {
      label: 'Check',
      title: 'Does this look right?',
      why: 'Nothing is sent anywhere. This only tells the system what to expect.',
      invalid: null,
      body: (
        <div className="space-y-2.5">
          <div className="rounded-md border border-line bg-surface-2 px-3 py-2.5 text-[12.5px]">
            <p className="font-semibold text-ink">{name.trim() || 'Unnamed supplier'}</p>
            <p className="mt-0.5 text-ink-2">
              {type || 'no type'} · {Number.isFinite(termsN) && termsN > 0 ? `${termsN} days to pay` : 'pay on delivery'}
            </p>
          </div>
          <ul className="divide-y divide-line-soft rounded-md border border-line">
            {filled.map((l, n) => {
              const it = itemById(l.itemId)!
              return (
                <li key={n} className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5 px-3 py-2 text-[12.5px]">
                  <span className="font-medium">{it.name}</span>
                  <span className="mono text-[11px] text-ink-3">{it.code}</span>
                  <span className="num ml-auto">{money(Number(l.rate))} / {it.uom}</span>
                  <span className="num text-ink-2">{Number(l.leadDays)} days</span>
                  {l.preferred && <span className="text-[11px] text-accent-ink">your usual</span>}
                </li>
              )
            })}
          </ul>
          <p className="text-[11.5px] leading-relaxed text-ink-3">
            The delivery time is recorded as <em>quoted</em>, not measured. Once goods actually start
            arriving, the system replaces it with what really happened — which is usually the more
            useful number, and often not the same one.
          </p>
        </div>
      ),
    },
  ]

  const save = () => {
    update((w0) => {
      const [w, id] = issueId(w0, 'VN')
      const vendor = buildVendor({
        id, name, paymentTermsDays: Number.isFinite(termsN) ? termsN : 0,
      })
      const vendorItems = filled.map((l) => buildRate({
        vendorId: id,
        itemId: l.itemId,
        rate: Number(l.rate),
        leadDays: Number(l.leadDays),
        preferred: l.preferred,
      }))
      return {
        ...w,
        // The valuation basis is the last purchase price (§13-1). A material
        // with no rate at all is valued at nothing, so the first quote fills it
        // in — and a later, cheaper quote does not overwrite what was paid.
        items: backfillRates(w.items, vendorItems),
        vendors: [...w.vendors, vendor],
        vendorItems: [...w.vendorItems, ...vendorItems],
        vendorType: { ...w.vendorType, [id]: type },
      }
    })
    onClose()
  }

  return (
    <Wizard open={open} onClose={onClose}
      title="Add a supplier"
      sub={`${ws.vendors.length} added so far`}
      steps={steps} onDone={save} doneLabel="Add this supplier" />
  )
}
