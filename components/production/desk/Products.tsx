'use client'
import { useState } from 'react'
import { ListPage } from '@/components/ui/ListPage'
import { DataTable, StatePill } from '@/components/ui/DataTable'
import { Icon } from '@/components/ui/icons'
import { DeskTools } from '@/components/sheet/DeskTools'
import { buildColumns, type DrawnColumn } from '@/components/sheet/columns'
import { ConfirmDelete } from '@/components/sourcing/ConfirmDelete'
import { ProductsWizard } from '@/components/onboard/wizards/ProductsWizard'
import { useWorkspace } from '@/components/workspace/store'
import { money, num } from '@/lib/domain/format'
import { UOM_LABEL } from '@/lib/workspace/defaults'
import { productRows, removeProduct, removeProductProblem, type ProductRow } from '@/lib/workspace/products'
import type { Product } from '@/lib/workspace/types'
import { CountFinishedDialog } from './PlanDialogs'
import { ProductForm } from './ProductForm'

/**
 * What the company makes, and what goes into one.
 *
 * The material list is what the floor plans from — a style of a product
 * needs its list times the quantity — so a list with no quantities is said
 * here, and on the dashboard, until somebody fills it in. Finished stock is
 * a sum of what was booked off the floor, less what went out.
 */
export function Products() {
  const { workspace, update, today } = useWorkspace()
  const [editing, setEditing] = useState<Product | null | undefined>(undefined)
  const [deleting, setDeleting] = useState<ProductRow | null>(null)
  const [counting, setCounting] = useState<string | null>(null)
  const [wizard, setWizard] = useState(false)

  if (!workspace) return null
  const ws = workspace
  const rows = productRows(ws, today)

  const drawn: Record<string, DrawnColumn<ProductRow>> = {
    code: { cell: (r) => <span className="mono text-[12px] text-ink-2">{r.product.code || '—'}</span>, text: (r) => r.product.code },
    name: { cell: (r) => <span className="font-semibold text-ink">{r.product.name}</span>, text: (r) => r.product.name },
    uom: { cell: (r) => UOM_LABEL[r.product.uom], text: (r) => r.product.uom },
    cost: {
      align: 'right',
      cell: (r) => (r.product.standardCost !== undefined ? money(r.product.standardCost) : <span className="text-ink-4">—</span>),
      text: (r) => String(r.product.standardCost ?? ''),
    },
    bom: {
      cell: (r) => (r.lines.length === 0 ? <StatePill label="No materials" tone="warn" /> : (
        <span className="block text-[12.5px] leading-snug">
          {r.lines.map((l, i) => (
            <span key={i} className="block">
              <span className="text-ink">{l.item?.name ?? 'Unknown material'}</span>{' '}
              {l.qtyPerUnit > 0
                ? <span className="num text-ink-2">{num(l.qtyPerUnit, 3)} {l.item?.uom ?? ''}</span>
                : <span className="text-warn">no quantity</span>}
            </span>
          ))}
        </span>
      )),
      text: (r) => r.lines.map((l) => `${l.item?.name ?? ''} ${l.qtyPerUnit || '?'}`).join('; '),
    },
    made: { align: 'right', cell: (r) => (r.madeThisMonth ? num(r.madeThisMonth, 0) : <span className="text-ink-4">—</span>), text: (r) => String(r.madeThisMonth) },
    stock: {
      align: 'right',
      cell: (r) => (
        <span>
          {num(r.stock, 0)}
          {r.value > 0 && <span className="block text-[11px] text-ink-3">{money(r.value)}</span>}
        </span>
      ),
      text: (r) => String(r.stock),
    },
  }
  const kit = buildColumns<ProductRow>(ws, 'product', (r) => r.product.id, drawn)

  return (
    <>
      <ListPage
        title="Products" noun="product" rows={rows}
        search={(r) => `${r.product.name} ${r.product.code} ${r.lines.map((l) => l.item?.name ?? '').join(' ')} ${kit.searchText(r)}`}
        action={{ label: 'Add a product', onClick: () => setEditing(null) }}
        tools={
          <>
            {rows.length > 0 && (
              <button type="button" onClick={() => setCounting('')}
                className="press inline-flex items-center gap-1.5 rounded-lg border border-line bg-surface px-3 py-2 text-[13px] font-medium hover:bg-surface-2">
                <Icon name="hash" className="size-3.5" /> Count finished stock
              </button>
            )}
            <DeskTools entity="product" noun="product" title="Products" rows={() => kit.toRows(rows)} />
          </>
        }
        empty={{
          line: 'Nothing here yet. Say what you make and what goes into one, and a style then only needs a product and a quantity for the floor to know what it needs.',
          cta: 'Add a product',
          second: { label: 'Add several at once', onClick: () => setWizard(true) },
        }}>
        {(shown) => (
          <DataTable columns={kit.columns} rows={shown} keyOf={(r) => r.product.id}
            onEdit={(r) => setEditing(r.product)}
            onDelete={(r) => setDeleting(r)}
            editLabel={(r) => `Edit ${r.product.name}`}
            deleteLabel={(r) => `Delete ${r.product.name}`} />
        )}
      </ListPage>

      <ProductForm product={editing} onClose={() => setEditing(undefined)} />
      <ProductsWizard open={wizard} onClose={() => setWizard(false)} />
      <CountFinishedDialog productId={counting} onClose={() => setCounting(null)} />
      <ConfirmDelete
        open={deleting !== null}
        what={deleting?.product.name ?? ''}
        impact={{ losses: [], clean: true }}
        blocked={deleting ? removeProductProblem(ws, deleting.product.id) : null}
        onClose={() => setDeleting(null)}
        onConfirm={() => { if (deleting) update((w) => removeProduct(w, deleting.product.id)) }}
      />
    </>
  )
}
