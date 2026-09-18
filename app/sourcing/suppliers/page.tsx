'use client'
import { useState } from 'react'
import { ListPage } from '@/components/ui/ListPage'
import { Column, DataTable, StatePill } from '@/components/ui/DataTable'
import { SupplierForm } from '@/components/sourcing/SupplierForm'
import { ConfirmDelete } from '@/components/sourcing/ConfirmDelete'
import { DeskOnly } from '@/components/sourcing/DeskOnly'
import { useWorkspace } from '@/components/workspace/store'
import { removeVendor, supplierRows, vendorImpact, type SupplierRow } from '@/lib/workspace/sourcing'
import type { Vendor } from '@/lib/domain/types'

/**
 * Who you buy from.
 *
 * Five columns and two icons, which is what the record actually has to say. The
 * things a supplier screen is usually padded with — a score, an on-time
 * percentage, a rating out of five — are measurements, and this company has
 * measured nothing yet. Printing a rating of zero would be worse than printing
 * none, so there is none until a receipt exists to compute one from.
 */
export default function Page() {
  return <DeskOnly><Suppliers /></DeskOnly>
}

function Suppliers() {
  const { workspace, update } = useWorkspace()
  const [editing, setEditing] = useState<Vendor | null>(null)
  const [adding, setAdding] = useState(false)
  const [deleting, setDeleting] = useState<Vendor | null>(null)

  if (!workspace) return null
  const ws = workspace
  const rows = supplierRows(ws)
  const types = Array.from(new Set(rows.map((r) => r.type).filter(Boolean)))

  const columns: Column<SupplierRow>[] = [
    {
      key: 'name', head: 'Supplier',
      cell: (r) => <span className="font-semibold text-ink">{r.vendor.name}</span>,
    },
    {
      key: 'type', head: 'Type',
      cell: (r) => (r.type
        ? <StatePill label={r.type} tone="info" />
        : <span className="text-ink-4">—</span>),
    },
    {
      key: 'supplies', head: 'Supplies', align: 'right',
      cell: (r) => (r.supplies === 0
        ? <span className="text-ink-4" title="No agreed rate yet">no rates yet</span>
        : `${r.supplies} material${r.supplies === 1 ? '' : 's'}`),
    },
    {
      key: 'lead', head: 'Lead time', align: 'right',
      cell: (r) => (r.leadDays === null
        ? <span className="text-ink-4">—</span>
        : `${r.leadDays}d`),
    },
    {
      key: 'terms', head: 'Payment', align: 'right',
      cell: (r) => (r.vendor.paymentTermsDays > 0
        ? `${r.vendor.paymentTermsDays}d`
        : <span className="text-ink-3">on delivery</span>),
    },
    {
      key: 'open', head: 'Open orders', align: 'right',
      cell: (r) => (r.openOrders === 0
        ? <span className="text-ink-4">—</span>
        : <StatePill label={String(r.openOrders)} tone="warn" />),
    },
  ]

  return (
    <>
      <ListPage
        title="Suppliers" noun="supplier" rows={rows}
        search={(r) => `${r.vendor.name} ${r.type}`}
        filter={{
          label: 'All types',
          options: types.map((t) => ({ value: t, label: t })),
          of: (r) => r.type,
        }}
        action={{ label: 'Add supplier', onClick: () => setAdding(true) }}
        empty={{ line: 'Nobody here yet. Add the suppliers you buy from.', cta: 'Add your first supplier' }}>
        {(shown) => (
          <DataTable
            columns={columns} rows={shown} keyOf={(r) => r.vendor.id}
            onEdit={(r) => setEditing(r.vendor)}
            onDelete={(r) => setDeleting(r.vendor)}
            editLabel={(r) => `Edit ${r.vendor.name}`}
            deleteLabel={(r) => `Delete ${r.vendor.name}`}
          />
        )}
      </ListPage>

      <SupplierForm open={adding || editing !== null} editing={editing}
        onClose={() => { setAdding(false); setEditing(null) }} />

      <ConfirmDelete
        open={deleting !== null}
        what={deleting?.name ?? ''}
        impact={deleting ? vendorImpact(ws, deleting.id) : { losses: [], clean: true }}
        onClose={() => setDeleting(null)}
        onConfirm={() => { if (deleting) update((w) => removeVendor(w, deleting.id)) }}
      />
    </>
  )
}
