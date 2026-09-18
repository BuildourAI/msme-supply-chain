'use client'
import { useState } from 'react'
import { ListPage } from '@/components/ui/ListPage'
import { Column, DataTable, StatePill } from '@/components/ui/DataTable'
import { MaterialForm } from '@/components/sourcing/MaterialForm'
import { ConfirmDelete } from '@/components/sourcing/ConfirmDelete'
import { DeskOnly } from '@/components/sourcing/DeskOnly'
import { useWorkspace } from '@/components/workspace/store'
import { itemImpact, materialRows, removeItem, type MaterialRow } from '@/lib/workspace/sourcing'
import { money, num } from '@/lib/domain/format'
import type { Item } from '@/lib/domain/types'

/**
 * What you buy.
 *
 * The reference's equivalent is an electronics catalogue — part number,
 * manufacturer, MPN, package. This company buys in kilograms, tonnes and
 * metres, so the columns are the ones that matter here: what it is bought in,
 * what was last paid, and how much is on the shelf.
 *
 * A material nobody quotes gets a pill saying so rather than being hidden. It
 * is the state that stops it appearing in any buying suggestion, and the
 * fastest thing to fix once it is visible.
 */
export default function Page() {
  return <DeskOnly><Materials /></DeskOnly>
}

function Materials() {
  const { workspace, update } = useWorkspace()
  const [editing, setEditing] = useState<Item | null>(null)
  const [adding, setAdding] = useState(false)
  const [deleting, setDeleting] = useState<Item | null>(null)

  if (!workspace) return null
  const ws = workspace
  const rows = materialRows(ws)
  const groups = Array.from(new Set(rows.map((r) => r.group).filter(Boolean)))

  const columns: Column<MaterialRow>[] = [
    {
      key: 'code', head: 'Code',
      cell: (r) => <span className="mono text-[12.5px] font-semibold text-ink">{r.item.code}</span>,
    },
    {
      key: 'name', head: 'Material',
      cell: (r) => <span className="font-medium text-ink">{r.item.name}</span>,
    },
    {
      key: 'group', head: 'Group',
      cell: (r) => (r.group
        ? <StatePill label={r.group} tone="info" />
        : <span className="text-ink-4">—</span>),
    },
    {
      key: 'uom', head: 'Bought in',
      cell: (r) => <span className="mono text-[12.5px] text-ink-2">{r.item.uom}</span>,
    },
    {
      key: 'rate', head: 'Last paid', align: 'right',
      cell: (r) => (r.item.lastPurchaseRate > 0
        ? `${money(r.item.lastPurchaseRate)}`
        : <span className="text-ink-4" title="Set by the first supplier rate">—</span>),
    },
    {
      key: 'onHand', head: 'On hand', align: 'right',
      cell: (r) => (r.onHand > 0
        ? `${num(r.onHand, 3)} ${r.item.uom}`
        : <span className="text-ink-4">not counted</span>),
    },
    {
      key: 'suppliers', head: 'Suppliers', align: 'right',
      cell: (r) => (r.suppliers === 0
        ? <StatePill label="none yet" tone="warn" title="No supplier quotes this, so it cannot be ordered" />
        : String(r.suppliers)),
    },
  ]

  return (
    <>
      <ListPage
        title="Materials" noun="material" rows={rows}
        search={(r) => `${r.item.code} ${r.item.name} ${r.group}`}
        filter={{
          label: 'All groups',
          options: groups.map((g) => ({ value: g, label: g })),
          of: (r) => r.group,
        }}
        action={{ label: 'Add material', onClick: () => setAdding(true) }}
        empty={{ line: 'Nothing here yet. Add the materials you buy.', cta: 'Add your first material' }}>
        {(shown) => (
          <DataTable
            columns={columns} rows={shown} keyOf={(r) => r.item.id}
            onEdit={(r) => setEditing(r.item)}
            onDelete={(r) => setDeleting(r.item)}
            editLabel={(r) => `Edit ${r.item.name}`}
            deleteLabel={(r) => `Delete ${r.item.name}`}
          />
        )}
      </ListPage>

      <MaterialForm open={adding || editing !== null} editing={editing}
        onClose={() => { setAdding(false); setEditing(null) }} />

      <ConfirmDelete
        open={deleting !== null}
        what={deleting?.name ?? ''}
        impact={deleting ? itemImpact(ws, deleting.id) : { losses: [], clean: true }}
        onClose={() => setDeleting(null)}
        onConfirm={() => { if (deleting) update((w) => removeItem(w, deleting.id)) }}
      />
    </>
  )
}
