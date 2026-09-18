'use client'
import { useEffect, useState } from 'react'
import { Dialog } from '@/components/ui/Dialog'
import { Field, NumberInput, Select, TextInput } from '@/components/ui/Field'
import { Icon } from '@/components/ui/icons'
import { useWorkspace } from '@/components/workspace/store'
import { nextId } from '@/lib/workspace/defaults'
import type { Vendor, VendorItem } from '@/lib/domain/types'

/**
 * Add or change a supplier.
 *
 * A plain form rather than the stepped wizard the set-up uses. The wizard earns
 * its steps when somebody is meeting the system for the first time and does not
 * know what it will ask for; an owner who came here to correct a payment term
 * already knows, and making them click Next three times to do it would be the
 * ceremony this whole pass is removing.
 *
 * One form for both jobs. Opened with a vendor it edits that vendor, opened
 * without one it adds — which is also what fixes the old behaviour where
 * re-opening a finished set-up step quietly added a second copy.
 */
interface Line { itemId: string; rate: string; leadDays: string; preferred: boolean }

export function SupplierForm({ open, onClose, editing }: {
  open: boolean
  onClose: () => void
  /** the vendor being changed, or null to add a new one */
  editing: Vendor | null
}) {
  const { workspace, update } = useWorkspace()
  const [name, setName] = useState('')
  const [type, setType] = useState('')
  const [terms, setTerms] = useState('30')
  const [lines, setLines] = useState<Line[]>([])
  const [tried, setTried] = useState(false)

  useEffect(() => {
    if (!open || !workspace) return
    setTried(false)
    if (editing) {
      setName(editing.name)
      setType(workspace.vendorType[editing.id] ?? workspace.categories.supplierType[0] ?? '')
      setTerms(String(editing.paymentTermsDays))
      setLines(workspace.vendorItems
        .filter((vi) => vi.vendorId === editing.id)
        .map((vi) => ({
          itemId: vi.itemId,
          rate: String(vi.rate),
          leadDays: String(vi.quotedLeadTimeDays),
          preferred: Boolean(vi.isPreferred),
        })))
    } else {
      setName('')
      setType(workspace.categories.supplierType[0] ?? '')
      setTerms('30')
      setLines([])
    }
  }, [open, editing]) // eslint-disable-line react-hooks/exhaustive-deps

  if (!open || !workspace) return null
  const ws = workspace

  const n = (v: string) => (v.trim() === '' ? NaN : Number(v))
  const termsN = n(terms)
  const nameOk = name.trim().length > 1
  const duplicate = ws.vendors.some(
    (v) => v.id !== editing?.id && v.name.trim().toLowerCase() === name.trim().toLowerCase(),
  )
  const termsOk = Number.isFinite(termsN) && termsN >= 0
  const ok = nameOk && !duplicate && termsOk

  const setLine = (i: number, patch: Partial<Line>) =>
    setLines((ls) => ls.map((l, k) => (k === i ? { ...l, ...patch } : l)))

  const save = () => {
    setTried(true)
    if (!ok) return
    const id = editing?.id ?? nextId('VN', ws.vendors)
    const vendor: Vendor = { id, name: name.trim(), paymentTermsDays: termsN }

    const kept = lines.filter((l) => l.itemId
      && Number.isFinite(n(l.rate)) && n(l.rate) > 0
      && Number.isFinite(n(l.leadDays)) && n(l.leadDays) > 0)

    const rates: VendorItem[] = kept.map((l) => {
      const was = ws.vendorItems.find((vi) => vi.vendorId === id && vi.itemId === l.itemId)
      return {
        // anything already measured against this supplier is kept; only what
        // the form asks about is overwritten
        ...(was ?? {
          freightPerUnit: 0, nonCreditableGst: 0, paymentTermCost: 0, rejectionAllowance: 0,
          trailingRejectionRate: 0, onTimePct: 0, score: 0, quoteValidUntil: '',
        }),
        vendorId: id,
        itemId: l.itemId,
        rate: n(l.rate),
        quotedLeadTimeDays: n(l.leadDays),
        trailingLeadTimeDays: was?.trailingLeadTimeDays ?? n(l.leadDays),
        isPreferred: l.preferred || undefined,
      } as VendorItem
    })

    update((w) => {
      const vendors = editing
        ? w.vendors.map((v) => (v.id === id ? vendor : v))
        : [...w.vendors, vendor]
      // the valuation basis is the last purchase price; a material with no rate
      // at all takes its first one from here
      const items = w.items.map((it) => {
        if (it.lastPurchaseRate > 0) return it
        const q = rates.find((r) => r.itemId === it.id)
        return q ? { ...it, lastPurchaseRate: q.rate } : it
      })
      return {
        ...w,
        vendors,
        items,
        vendorItems: [...w.vendorItems.filter((vi) => vi.vendorId !== id), ...rates],
        vendorType: { ...w.vendorType, [id]: type },
      }
    })
    onClose()
  }

  return (
    <Dialog open onClose={onClose} wide
      title={editing ? `Edit ${editing.name}` : 'Add a supplier'}>
      <div className="space-y-4 px-4 py-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Supplier name" htmlFor="sf-name"
            error={tried && !nameOk ? 'Give the supplier a name.'
              : duplicate ? 'You already have a supplier with that name.' : null}>
            <TextInput id="sf-name" value={name} onChange={setName} autoFocus
              placeholder="Shah Metals" invalid={(tried && !nameOk) || duplicate} />
          </Field>

          <Field label="Type" htmlFor="sf-type">
            <Select id="sf-type" value={type} onChange={setType}
              options={ws.categories.supplierType.map((t) => ({ value: t, label: t }))}
              addLabel="New supplier type…"
              onAdd={(v) => update((w) => ({
                ...w, categories: { ...w.categories, supplierType: [...w.categories.supplierType, v] },
              }))} />
          </Field>
        </div>

        <Field label="Days they give you to pay" htmlFor="sf-terms"
          error={tried && !termsOk ? 'Put in a number of days, or zero.' : null}>
          <NumberInput id="sf-terms" value={terms} onChange={setTerms} unit="days" step="1"
            invalid={tried && !termsOk} />
        </Field>

        <div>
          <p className="text-[13px] font-medium text-ink">What they supply</p>
          <p className="mt-0.5 text-[11.5px] text-ink-3">
            Leave it empty if you have not agreed a rate yet.
          </p>

          <div className="mt-2 space-y-2">
            {lines.map((l, i) => {
              const it = ws.items.find((x) => x.id === l.itemId)
              return (
                <div key={i} className="grid items-end gap-2 rounded-lg border border-line bg-surface-2 p-2.5 sm:grid-cols-[1.4fr_1fr_1fr_auto]">
                  <Field label="Material">
                    <Select value={l.itemId} onChange={(v) => setLine(i, { itemId: v })}
                      placeholder="Pick one"
                      options={ws.items.map((x) => ({ value: x.id, label: x.name }))} />
                  </Field>
                  <Field label="Rate">
                    <NumberInput value={l.rate} onChange={(v) => setLine(i, { rate: v })}
                      unit={it ? `₹/${it.uom}` : '₹'} />
                  </Field>
                  <Field label="Takes">
                    <NumberInput value={l.leadDays} onChange={(v) => setLine(i, { leadDays: v })}
                      unit="days" step="1" />
                  </Field>
                  <button type="button" onClick={() => setLines((ls) => ls.filter((_, k) => k !== i))}
                    title="Remove this material"
                    className="press mb-1 rounded-md p-1.5 text-ink-4 hover:bg-critical-soft hover:text-critical">
                    <Icon name="trash" className="size-4" />
                    <span className="sr-only">Remove this material</span>
                  </button>
                </div>
              )
            })}
          </div>

          {ws.items.length === 0 ? (
            <p className="mt-2 rounded-lg border border-warn/30 bg-warn-soft px-3 py-2 text-[12.5px] text-ink-2">
              Add a material first and it can be priced here.
            </p>
          ) : (
            <button type="button"
              onClick={() => setLines((ls) => [...ls, {
                itemId: ws.items[0].id, rate: '', leadDays: '', preferred: false,
              }])}
              className="press mt-2 inline-flex items-center gap-1.5 rounded-lg border border-line bg-surface px-3 py-1.5 text-[12.5px] font-medium hover:bg-surface-2">
              <Icon name="plus" className="size-3.5" />
              Add a material they supply
            </button>
          )}
        </div>
      </div>

      <footer className="flex items-center gap-2 border-t border-line-soft px-4 py-3">
        <button type="button" onClick={onClose}
          className="press rounded-lg px-2.5 py-2 text-[13px] text-ink-2 hover:text-ink">
          Cancel
        </button>
        <span className="ml-auto" />
        <button type="button" onClick={save}
          className="press rounded-lg border border-accent-ink bg-accent-ink px-3.5 py-2 text-[13px] font-semibold text-on-accent hover:bg-accent">
          {editing ? 'Save changes' : 'Add supplier'}
        </button>
      </footer>
    </Dialog>
  )
}
