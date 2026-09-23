'use client'
import { useEffect, useState } from 'react'
import { Wizard, type WizardStep } from '@/components/ui/Wizard'
import { Select } from '@/components/ui/Field'
import { Icon } from '@/components/ui/icons'
import { useWorkspace } from '@/components/workspace/store'
import { BomEditor, UOMS, bomInput, type BomDraft } from '@/components/production/desk/ProductForm'
import type { Uom } from '@/lib/domain/types'
import { UOM_LABEL } from '@/lib/workspace/defaults'
import { addProduct, productProblem, suggestedProducts, type ProductInput } from '@/lib/workspace/products'
import type { Workspace } from '@/lib/workspace/types'

interface Row { name: string; uom: Uom; bom: BomDraft[] }

const INPUT = 'w-full rounded-md border border-line bg-surface px-2.5 py-2 text-[13px] outline-none focus:border-accent'

/**
 * What the company makes.
 *
 * Two questions: the names, then what goes into one of each. A company that
 * already said, on its materials, that denim goes into "Slim-fit jeans" finds
 * that product waiting here with denim on its list — only the quantity is
 * asked, because nobody but the floor knows how much a lay takes.
 */
export function ProductsWizard({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { workspace, update } = useWorkspace()
  const [rows, setRows] = useState<Row[]>([])
  const [suggested, setSuggested] = useState(0)

  useEffect(() => {
    if (!open || !workspace) return
    const s = suggestedProducts(workspace)
    setSuggested(s.length)
    setRows(s.length > 0
      ? s.map((x) => ({ name: x.name, uom: 'nos', bom: x.itemIds.map((itemId) => ({ itemId, qty: '' })) }))
      : [{ name: '', uom: 'nos', bom: [] }])
  }, [open]) // eslint-disable-line react-hooks/exhaustive-deps

  if (!open || !workspace) return null
  const ws = workspace
  const named = rows.filter((r) => r.name.trim() !== '')
  const inputs: ProductInput[] = named.map((r) => ({ name: r.name, uom: r.uom, bom: bomInput(r.bom) }))

  // each checked against the ones already added, and the ones before it on this list
  const problemIn = (): string | null => {
    let w: Workspace = ws
    for (const p of inputs) {
      const problem = productProblem(w, p)
      if (problem) return problem
      ;[w] = addProduct(w, p)
    }
    return null
  }
  const set = (i: number, patch: Partial<Row>) => setRows((rs) => rs.map((r, j) => (j === i ? { ...r, ...patch } : r)))

  const steps: WizardStep[] = [
    {
      label: 'What you make',
      title: 'What do you make?',
      why: suggested > 0
        ? `${suggested === 1 ? 'This one comes' : `These ${suggested} come`} from what you said your materials go into. Rename, add or take off.`
        : 'The things that leave your floor finished. A style is then one of these, in a quantity.',
      invalid: named.length === 0 ? 'Name at least one product.' : problemIn(),
      body: (
        <div className="space-y-2">
          <div className="grid grid-cols-[minmax(0,3fr)_minmax(0,2fr)_auto] gap-x-2 gap-y-1.5">
            <span className="text-[11.5px] font-medium text-ink-3">Product</span>
            <span className="text-[11.5px] font-medium text-ink-3">Counted in</span>
            <span />
            {rows.map((r, i) => (
              <div key={i} className="contents">
                <input aria-label={`Product ${i + 1}`} id={`pw-name-${i}`} value={r.name}
                  data-autofocus={i === 0 ? '' : undefined}
                  onChange={(e) => set(i, { name: e.target.value })}
                  placeholder={['Slim-fit jeans', 'Cargo shorts', 'Denim jacket'][i] ?? `Product ${i + 1}`}
                  className={INPUT} />
                <Select id={`pw-uom-${i}`} value={r.uom} onChange={(v) => set(i, { uom: v as Uom })}
                  options={UOMS.map((u) => ({ value: u, label: UOM_LABEL[u] }))} />
                <button type="button" onClick={() => setRows((rs) => rs.filter((_, j) => j !== i))}
                  aria-label={`Take ${r.name || `product ${i + 1}`} off`}
                  className="press grid size-9 place-items-center rounded-md text-ink-3 hover:bg-surface-2 hover:text-ink">
                  <Icon name="close" className="size-3.5" />
                </button>
              </div>
            ))}
          </div>
          <button type="button" onClick={() => setRows((rs) => [...rs, { name: '', uom: 'nos', bom: [] }])}
            className="press inline-flex items-center gap-1 text-[12.5px] font-medium text-accent-ink hover:underline">
            <Icon name="plus" className="size-3.5" /> Another product
          </button>
        </div>
      ),
    },
    {
      label: 'What goes into one',
      title: 'What goes into one of each?',
      why: 'How much of each material one piece takes. Leave a quantity blank if nobody has measured it yet — the floor will ask again.',
      invalid: problemIn(),
      body: (
        <div className="space-y-3">
          {ws.items.length === 0 && (
            <p className="text-[12.5px] text-ink-3">You have no materials yet. Add them under Sourcing, then come back to say what goes into each product.</p>
          )}
          {rows.map((r, i) => (r.name.trim() === '' ? null : (
            <fieldset key={i} className="rounded-lg border border-line px-3 pb-3 pt-2">
              <legend className="px-1 text-[12.5px] font-semibold text-ink">{r.name}</legend>
              <BomEditor rows={r.bom} onChange={(bom) => set(i, { bom })} idp={`pw-bom-${i}`}
                unit={UOM_LABEL[r.uom].replace(/s$/, '')} />
            </fieldset>
          )))}
        </div>
      ),
    },
  ]

  const save = () => {
    update((w0) => inputs.reduce((w, p) => addProduct(w, p)[0], w0))
    onClose()
  }

  return (
    <Wizard open={open} onClose={onClose} title="Your products" steps={steps} onDone={save}
      doneLabel={named.length === 1 ? 'Add this product' : `Add these ${named.length} products`} />
  )
}
