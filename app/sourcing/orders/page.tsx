'use client'
import { useState } from 'react'
import { ListPage } from '@/components/ui/ListPage'
import { DataTable, StatePill, type PillTone } from '@/components/ui/DataTable'
import { DeskTools } from '@/components/sheet/DeskTools'
import { buildColumns, type DrawnColumn } from '@/components/sheet/columns'
import { OrderForm } from '@/components/sourcing/OrderForm'
import { ConfirmDelete } from '@/components/sourcing/ConfirmDelete'
import { DeskOnly } from '@/components/sourcing/DeskOnly'
import { useWorkspace } from '@/components/workspace/store'
import { orderRows, removeOrder, type OrderRow } from '@/lib/workspace/sourcing'
import { money, num, shortDate } from '@/lib/domain/format'
import type { OrderState, PurchaseOrder } from '@/lib/workspace/types'

/**
 * What you have ordered.
 *
 * The one column a paper order book cannot give you is the last: something
 * expected a week ago that has not arrived. That is the whole reason to keep
 * this rather than a notebook, so it is the only figure on the screen that
 * turns red.
 */
const TONE: Record<OrderState, PillTone> = {
  draft: 'neutral', confirmed: 'info', shipped: 'warn', delivered: 'good', cancelled: 'neutral',
}
const LABEL: Record<OrderState, string> = {
  draft: 'Draft', confirmed: 'Confirmed', shipped: 'Shipped',
  delivered: 'Delivered', cancelled: 'Cancelled',
}

export default function Page() {
  return <DeskOnly><Orders /></DeskOnly>
}

function Orders() {
  const { workspace, update, today } = useWorkspace()
  const [editing, setEditing] = useState<PurchaseOrder | null>(null)
  const [adding, setAdding] = useState(false)
  const [deleting, setDeleting] = useState<PurchaseOrder | null>(null)

  if (!workspace) return null
  const ws = workspace
  const rows = orderRows(ws)

  const drawn: Record<string, DrawnColumn<OrderRow>> = {
    no: {
      cell: (r) => <span className="mono text-[12.5px] font-semibold text-ink">{r.order.no}</span>,
      text: (r) => r.order.no,
    },
    state: {
      cell: (r) => <StatePill label={LABEL[r.order.state]} tone={TONE[r.order.state]} />,
      text: (r) => LABEL[r.order.state],
    },
    vendor: {
      cell: (r) => (r.vendor
        ? <span className="font-medium text-ink">{r.vendor.name}</span>
        : <span className="text-ink-4">—</span>),
      text: (r) => r.vendor?.name ?? '',
    },
    item: {
      cell: (r) => r.item?.name ?? <span className="text-ink-4">—</span>,
      text: (r) => r.item?.name ?? '',
    },
    qty: {
      align: 'right',
      cell: (r) => `${num(r.order.qty, 3)}${r.item ? ` ${r.item.uom}` : ''}`,
      text: (r) => String(r.order.qty),
    },
    rate: {
      align: 'right',
      cell: (r) => <span className="text-ink-2">{money(r.order.unitPrice)}</span>,
      text: (r) => String(r.order.unitPrice),
    },
    total: {
      align: 'right',
      cell: (r) => <span className="font-medium">{money(r.total)}</span>,
      text: (r) => String(r.total),
    },
    ordered: {
      align: 'right',
      cell: (r) => <span className="text-ink-2">{shortDate(r.order.orderedOn)}</span>,
      text: (r) => r.order.orderedOn,
    },
    expected: {
      align: 'right',
      cell: (r) => {
        const open = r.order.state !== 'delivered' && r.order.state !== 'cancelled'
        const late = open && r.order.expectedOn < today
        return (
          <span className={late ? 'font-medium text-critical' : ''}
            title={late ? 'Expected before today and not marked delivered' : undefined}>
            {shortDate(r.order.expectedOn)}
          </span>
        )
      },
      text: (r) => r.order.expectedOn,
    },
  }

  const kit = buildColumns<OrderRow>(ws, 'order', (r) => r.order.id, drawn)

  const outstanding = rows.filter(
    (r) => r.order.state !== 'delivered' && r.order.state !== 'cancelled',
  )

  return (
    <>
      <ListPage
        title="Purchase orders" noun="order" rows={rows}
        search={(r) => `${r.order.no} ${r.vendor?.name ?? ''} ${r.item?.name ?? ''} ${kit.searchText(r)}`}
        filter={{
          label: 'All statuses',
          options: (Object.keys(LABEL) as OrderState[]).map((s) => ({ value: s, label: LABEL[s] })),
          of: (r) => r.order.state,
        }}
        action={{ label: 'New order', onClick: () => setAdding(true) }}
        tools={<DeskTools entity="order" noun="order" title="Purchase orders"
          rows={() => kit.toRows(rows)} />}
        empty={{
          line: 'Nothing ordered yet. An order records what you placed, at what rate, and when it is due.',
          cta: 'Record your first order',
        }}>
        {(shown) => (
          <>
            <DataTable
              columns={kit.columns} rows={shown} keyOf={(r) => r.order.id}
              onEdit={(r) => setEditing(r.order)}
              onDelete={(r) => setDeleting(r.order)}
              editLabel={(r) => `Edit ${r.order.no}`}
              deleteLabel={(r) => `Delete ${r.order.no}`}
            />
            {outstanding.length > 0 && (
              <p className="mt-3 text-[12.5px] text-ink-3">
                <span className="num font-medium text-ink-2">
                  {money(outstanding.reduce((a, r) => a + r.total, 0))}
                </span>
                {' '}still out across {outstanding.length} order{outstanding.length === 1 ? '' : 's'}
              </p>
            )}
          </>
        )}
      </ListPage>

      <OrderForm open={adding || editing !== null} editing={editing}
        onClose={() => { setAdding(false); setEditing(null) }} />

      <ConfirmDelete
        open={deleting !== null}
        what={deleting?.no ?? ''}
        impact={{ losses: [], clean: true }}
        onClose={() => setDeleting(null)}
        onConfirm={() => { if (deleting) update((w) => removeOrder(w, deleting.id)) }}
      />
    </>
  )
}
