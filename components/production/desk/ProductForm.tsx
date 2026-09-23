'use client'
import { useEffect, useState } from 'react'
import { Dialog } from '@/components/ui/Dialog'
import { Field, NumberInput, Select, TextInput } from '@/components/ui/Field'
import { Icon } from '@/components/ui/icons'
import { useWorkspace } from '@/components/workspace/store'
import type { Uom } from '@/lib/domain/types'
import { UOM_LABEL } from '@/lib/workspace/defaults'
import { addProduct, productProblem, updateProduct, type ProductInput } from '@/lib/workspace/products'
import type { Product } from '@/lib/workspace/types'

export const n = (v: string) => (v.trim() === '' ? NaN : Number(v.replace(/,/g, '')))
export const DATE = 'num w-full rounded-md border border-line bg-surface px-2.5 py-2 text-[13px] outline-none focus:border-accent'

export const UOMS: Uom[] = ['nos', 'm', 'kg', 'm2', 'MT']

export interface BomDraft { itemId: string; qty: string }

export const bomOf = (p?: Product): BomDraft[] =>
  (p?.bom ?? []).map((l) => ({ itemId: l.itemId, qty: l.qtyPerUnit > 0 ? String(l.qtyPerUnit) : '' }))

export const bomInput = (rows: BomDraft[]) =>
  rows.filter((r) => r.itemId).map((r) => ({ itemId: r.itemId, qtyPerUnit: r.qty.trim() === '' ? 0 : n(r.qty) }))

/**
 * The material list for one unit. A blank quantity is kept, as "not said
 * yet" — the product can exist before anybody has measured a lay — and the
 * Products screen says which lines are still blank.
 */
export function BomEditor({ rows, onChange, idp, unit }: {
  rows: BomDraft[]
  onChange: (rows: BomDraft[]) => void
  /** id prefix, so two editors on a page do not share ids */
  idp: string
  /** what one unit of the product is, for the quantity's hint */
  unit: string
}) {
  const { workspace } = useWorkspace()
  if (!workspace) return null
  const items = workspace.items
  const set = (i: number, patch: Partial<BomDraft>) => onChange(rows.map((r, j) => (j === i ? { ...r, ...patch } : r)))
  const free = (i: number) => items.filter((it) => it.id === rows[i].itemId || !rows.some((r) => r.itemId === it.id))
  return (
    <div className="space-y-2">
      {rows.length === 0 && <p className="text-[12px] text-ink-3">No materials on it yet.</p>}
      <ul className="space-y-2">
        {rows.map((r, i) => {
          const uom = items.find((it) => it.id === r.itemId)?.uom ?? ''
          return (
            <li key={i} className="grid grid-cols-[minmax(0,3fr)_minmax(0,2fr)_auto] items-end gap-2">
              <div className="min-w-0">
                <label htmlFor={`${idp}-item-${i}`} className={i === 0 ? 'mb-1.5 block text-[13px] font-medium text-ink' : 'sr-only'}>
                  {i === 0 ? 'Material' : `Material ${i + 1}`}
                </label>
                <Select id={`${idp}-item-${i}`} value={r.itemId} onChange={(v) => set(i, { itemId: v })}
                  placeholder="Pick a material"
                  options={free(i).map((it) => ({ value: it.id, label: it.name }))} />
              </div>
              <div className="min-w-0">
                <label htmlFor={`${idp}-qty-${i}`} className={i === 0 ? 'mb-1.5 block text-[13px] font-medium text-ink' : 'sr-only'}>
                  {`In one ${unit || 'unit'}`}
                </label>
                <NumberInput id={`${idp}-qty-${i}`} value={r.qty} onChange={(v) => set(i, { qty: v })} unit={uom} placeholder="?" />
              </div>
              <button type="button" onClick={() => onChange(rows.filter((_, j) => j !== i))}
                aria-label={`Take ${items.find((it) => it.id === r.itemId)?.name ?? 'this material'} off the list`}
                className="press mb-1 grid size-8 place-items-center rounded-md text-ink-3 hover:bg-surface-2 hover:text-ink">
                <Icon name="close" className="size-3.5" />
              </button>
            </li>
          )
        })}
      </ul>
      {rows.length < items.length && (
        <button type="button" onClick={() => onChange([...rows, { itemId: '', qty: '' }])}
          className="press inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-[12.5px] font-medium text-accent-ink hover:bg-surface-2">
          <Icon name="plus" className="size-3.5" /> Add a material
        </button>
      )}
    </div>
  )
}

/** A product added, or its details and material list changed. */
export function ProductForm({ product, onClose }: {
  /** undefined is closed; null is a new one */
  product: Product | null | undefined
  onClose: () => void
}) {
  const { workspace, update } = useWorkspace()
  const [name, setName] = useState('')
  const [code, setCode] = useState('')
  const [uom, setUom] = useState<Uom>('nos')
  const [cost, setCost] = useState('')
  const [hsn, setHsn] = useState('')
  const [bom, setBom] = useState<BomDraft[]>([])
  const [tried, setTried] = useState(false)

  useEffect(() => {
    if (product === undefined) return
    setName(product?.name ?? ''); setCode(product?.code ?? ''); setUom(product?.uom ?? 'nos')
    setCost(product?.standardCost !== undefined ? String(product.standardCost) : '')
    setHsn(product?.hsn ?? ''); setBom(bomOf(product ?? undefined)); setTried(false)
  }, [product])

  if (product === undefined || !workspace) return null
  const input: ProductInput = {
    name, code, uom, hsn,
    standardCost: cost.trim() === '' ? undefined : n(cost),
    bom: bomInput(bom),
  }
  const problem = productProblem(workspace, input, product?.id)

  const save = () => {
    setTried(true)
    if (problem) return
    update((w) => (product ? updateProduct(w, product.id, input) : addProduct(w, input)[0]))
    onClose()
  }

  return (
    <Dialog open onClose={onClose} title={product ? `Edit ${product.name}` : 'Add a product'}
      sub="What you make, and what goes into one.">
      <div className="space-y-3 px-4 py-4">
        <div className="grid grid-cols-[minmax(0,3fr)_minmax(0,2fr)] gap-2">
          <Field label="What it is called" htmlFor="pf-name">
            <TextInput id="pf-name" value={name} onChange={setName} placeholder="Slim-fit jeans" autoFocus />
          </Field>
          <Field label="Counted in" htmlFor="pf-uom">
            <Select id="pf-uom" value={uom} onChange={(v) => setUom(v as Uom)}
              options={UOMS.map((u) => ({ value: u, label: UOM_LABEL[u] }))} />
          </Field>
        </div>
        <div className="grid grid-cols-3 gap-2">
          <Field label="Code" htmlFor="pf-code" hint="Optional">
            <TextInput id="pf-code" value={code} onChange={setCode} placeholder="SF-JN-32" />
          </Field>
          <Field label="Costs to make one" htmlFor="pf-cost" hint="Values finished stock">
            <NumberInput id="pf-cost" value={cost} onChange={setCost} unit="₹" />
          </Field>
          <Field label="HSN" htmlFor="pf-hsn" hint="For the challan">
            <TextInput id="pf-hsn" value={hsn} onChange={setHsn} placeholder="6203" />
          </Field>
        </div>
        <fieldset className="rounded-lg border border-line px-3 pb-3 pt-2">
          <legend className="px-1 text-[12.5px] font-semibold text-ink">What goes into one</legend>
          <BomEditor rows={bom} onChange={setBom} idp="pf-bom" unit={UOM_LABEL[uom].replace(/s$/, '')} />
        </fieldset>
        {tried && problem && <p role="alert" className="text-[12.5px] text-critical">{problem}</p>}
      </div>
      <footer className="flex items-center justify-end gap-2 border-t border-line-soft px-4 py-3">
        <button type="button" onClick={onClose}
          className="press rounded-lg px-2.5 py-2 text-[13px] text-ink-2 hover:text-ink">Cancel</button>
        <button type="button" onClick={save}
          className="press rounded-lg border border-accent-ink bg-accent-ink px-3.5 py-2 text-[13px] font-semibold text-on-accent hover:bg-accent">
          {product ? 'Save' : 'Add product'}
        </button>
      </footer>
    </Dialog>
  )
}
