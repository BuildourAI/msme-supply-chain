'use client'
import { useState } from 'react'
import { ListPage } from '@/components/ui/ListPage'
import { DataTable, StatePill } from '@/components/ui/DataTable'
import { SupplierForm } from '@/components/sourcing/SupplierForm'
import { ConfirmDelete } from '@/components/sourcing/ConfirmDelete'
import { DeskOnly } from '@/components/sourcing/DeskOnly'
import { DeskTools } from '@/components/sheet/DeskTools'
import { buildColumns, type DrawnColumn } from '@/components/sheet/columns'
import { useWorkspace } from '@/components/workspace/store'
import { removeVendor, supplierRows, vendorImpact, type SupplierRow } from '@/lib/workspace/sourcing'
import type { Vendor } from '@/lib/domain/types'

/**
 * Who you buy from.
 *
 * The columns a supplier record actually has to say, and no more. The things a
 * supplier screen is usually padded with — a score, an on-time percentage, a
 * rating out of five — are measurements, and this company has measured nothing
 * yet. Printing a rating of zero would be worse than printing none, so there is
 * none until a receipt exists to compute one from.
 *
 * What the owner adds themselves is another matter. A rating they keep in their
 * head is a real thing they know, so a column for it is theirs to make; it just
 * does not arrive pretending to be derived.
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

  /** how this screen draws the columns it owns — order and headings come from the view */
  const drawn: Record<string, DrawnColumn<SupplierRow>> = {
    name: {
      cell: (r) => <span className="font-semibold text-ink">{r.vendor.name}</span>,
      text: (r) => r.vendor.name,
    },
    type: {
      cell: (r) => (r.type
        ? <StatePill label={r.type} tone="info" />
        : <span className="text-ink-4">—</span>),
      text: (r) => r.type,
    },
    supplies: {
      align: 'right',
      cell: (r) => (r.supplies === 0
        ? <span className="text-ink-4" title="No agreed rate yet">no rates yet</span>
        : `${r.supplies} material${r.supplies === 1 ? '' : 's'}`),
      text: (r) => String(r.supplies),
    },
    lead: {
      align: 'right',
      cell: (r) => (r.leadDays === null
        ? <span className="text-ink-4">—</span>
        // measured beats quoted the moment there is a receipt, and says so
        : <span title={r.leadMeasured
          ? 'Measured from what has actually arrived'
          : 'What they quote — nothing has been recorded arriving yet'}>
          {r.leadDays}d
          {r.leadMeasured && <span className="ml-1 text-[10px] text-good">measured</span>}
        </span>),
      text: (r) => (r.leadDays === null ? '' : String(r.leadDays)),
    },
    terms: {
      align: 'right',
      cell: (r) => (r.vendor.paymentTermsDays > 0
        ? `${r.vendor.paymentTermsDays}d`
        : <span className="text-ink-3">on delivery</span>),
      text: (r) => String(r.vendor.paymentTermsDays),
    },
    open: {
      align: 'right',
      cell: (r) => (r.openOrders === 0
        ? <span className="text-ink-4">—</span>
        : <StatePill label={String(r.openOrders)} tone="warn" />),
      text: (r) => String(r.openOrders),
    },
    phone: {
      cell: (r) => (ws.vendorContact[r.vendor.id]?.phone
        ? <span className="mono text-[12.5px] text-ink-2">{ws.vendorContact[r.vendor.id].phone}</span>
        : <span className="text-ink-4">—</span>),
      text: (r) => ws.vendorContact[r.vendor.id]?.phone ?? '',
    },
    email: {
      cell: (r) => (ws.vendorContact[r.vendor.id]?.email
        ? <span className="text-[12.5px] text-ink-2">{ws.vendorContact[r.vendor.id].email}</span>
        : <span className="text-ink-4">—</span>),
      text: (r) => ws.vendorContact[r.vendor.id]?.email ?? '',
    },
  }

  const kit = buildColumns<SupplierRow>(ws, 'supplier', (r) => r.vendor.id, drawn)

  return (
    <>
      <ListPage
        title="Suppliers" noun="supplier" rows={rows}
        search={(r) => `${r.vendor.name} ${r.type} ${kit.searchText(r)}`}
        filter={{
          label: 'All types',
          options: types.map((t) => ({ value: t, label: t })),
          of: (r) => r.type,
        }}
        action={{ label: 'Add supplier', onClick: () => setAdding(true) }}
        tools={<DeskTools entity="supplier" noun="supplier" title="Suppliers" upload
          rows={() => kit.toRows(rows)} />}
        empty={{ line: 'Nobody here yet. Add the suppliers you buy from, or bring in a spreadsheet.', cta: 'Add your first supplier' }}>
        {(shown) => (
          <DataTable
            columns={kit.columns} rows={shown} keyOf={(r) => r.vendor.id}
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
