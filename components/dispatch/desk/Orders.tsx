'use client'
import { useState } from 'react'
import Link from 'next/link'
import { ListPage } from '@/components/ui/ListPage'
import { DataTable, StatePill, type PillTone } from '@/components/ui/DataTable'
import { DeskTools } from '@/components/sheet/DeskTools'
import { buildColumns, type DrawnColumn } from '@/components/sheet/columns'
import { ConfirmDelete } from '@/components/sourcing/ConfirmDelete'
import { useWorkspace } from '@/components/workspace/store'
import { money, num, shortDate } from '@/lib/domain/format'
import { WATCH_WORD } from '@/lib/workspace/linewatch'
import {
  cancelOrder, ORDER_WORD, orderRows, removeOrder, removeOrderProblem, reopenOrder,
  type OrderRow, type OrderStatus,
} from '@/lib/workspace/sales'
import type { CustomerOrder } from '@/lib/workspace/types'
import { OrderForm } from './OrderDialogs'
import { DeliveryDocument, NoteForm } from './NoteDialogs'

export const ORDER_TONE: Record<OrderStatus, PillTone> = {
  not_out: 'neutral', part: 'info', full: 'good', late: 'critical', cancelled: 'neutral',
}

/**
 * The order book: ordered against dispatched, one row an order.
 *
 * Status is what has gone — not out, part shipped, in full — or that the
 * promise has passed. Under it, the promise at risk, taken from the Line
 * watch verdict on the style making it, so a customer hears about a halt from
 * the owner before they notice it themselves.
 */
export function Orders() {
  const { workspace, update, today } = useWorkspace()
  const [editing, setEditing] = useState<CustomerOrder | null | undefined>(undefined)
  const [deleting, setDeleting] = useState<OrderRow | null>(null)
  const [noting, setNoting] = useState<string | null | undefined>(undefined)
  const [doc, setDoc] = useState<string | null>(null)

  if (!workspace) return null
  const ws = workspace
  const rows = orderRows(ws, today)

  const drawn: Record<string, DrawnColumn<OrderRow>> = {
    no: { cell: (r) => <span className="mono whitespace-nowrap text-[12.5px] font-semibold text-ink">{r.order.no}</span>, text: (r) => r.order.no },
    customer: { cell: (r) => <span className="font-medium text-ink">{r.customer?.name ?? '—'}</span>, text: (r) => r.customer?.name ?? '' },
    taken: { cell: (r) => <span className="num whitespace-nowrap text-ink-2">{shortDate(r.order.takenOn)}</span>, text: (r) => r.order.takenOn },
    promised: {
      cell: (r) => <span className={`num whitespace-nowrap ${r.overdue ? 'font-semibold text-critical' : 'text-ink-2'}`}>{shortDate(r.order.promisedDate)}</span>,
      text: (r) => r.order.promisedDate,
    },
    lines: {
      cell: (r) => (
        <span className="block text-[12.5px] leading-snug">
          {r.lines.map((l) => (
            <span key={l.line.id} className="block">
              <span className="text-ink">{l.product?.name ?? 'Unknown product'}</span>{' '}
              <span className="num text-ink-2">× {num(l.line.qty, 0)}</span>
              {/* this order → this job card: the card is where it is made, issued and sent out from */}
              {l.job && (
                <Link href={`/production/jobs?card=${l.job.id}`} className="mono text-[11px] text-ink-3 hover:text-ink hover:underline">
                  {' '}· {l.job.no}
                </Link>
              )}
            </span>
          ))}
        </span>
      ),
      text: (r) => r.lines.map((l) => `${l.product?.name ?? ''} x ${l.line.qty}${l.job ? ` (${l.job.no})` : ''}`).join('; '),
    },
    made: {
      align: 'right',
      cell: (r) => (r.made === null ? <span className="text-ink-4">—</span> : num(r.made, 0)),
      text: (r) => (r.made === null ? '' : String(r.made)),
    },
    dispatched: { align: 'right', cell: (r) => `${num(r.dispatched, 0)} of ${num(r.ordered, 0)}`, text: (r) => String(r.dispatched) },
    pending: {
      align: 'right',
      cell: (r) => (r.pending.value ? <span className="font-semibold text-ink">{num(r.pending.value as number, 0)}</span> : <span className="text-ink-4">—</span>),
      text: (r) => String(r.pending.value),
    },
    value: { align: 'right', cell: (r) => money(r.value.value as number), text: (r) => String(r.value.value) },
    status: {
      cell: (r) => (
        <span className="inline-flex flex-col items-start gap-1">
          <StatePill label={ORDER_WORD[r.status]} tone={ORDER_TONE[r.status]} />
          {r.risk && (
            <span className="max-w-[14rem] text-[11.5px] leading-snug text-warn" title={r.risk.reason}>
              At risk — {r.risk.jobNo} {r.risk.status === 'finishes_late' ? 'finishes after the promise' : WATCH_WORD[r.risk.status].toLowerCase()}
            </span>
          )}
        </span>
      ),
      text: (r) => `${ORDER_WORD[r.status]}${r.risk ? ' · at risk' : ''}`,
    },
  }
  const kit = buildColumns<OrderRow>(ws, 'salesOrder', (r) => r.order.id, drawn)

  return (
    <>
      <ListPage
        title="Sales orders" noun="sales order" rows={rows}
        search={(r) => `${r.order.no} ${r.customer?.name ?? ''} ${r.lines.map((l) => `${l.product?.name ?? ''} ${l.job?.no ?? ''}`).join(' ')} ${kit.searchText(r)}`}
        filter={{
          label: 'Status',
          options: (Object.keys(ORDER_WORD) as OrderStatus[]).map((s) => ({ value: s, label: ORDER_WORD[s] })),
          of: (r) => r.status,
        }}
        action={{ label: 'New sales order', onClick: () => setEditing(null) }}
        tools={<DeskTools entity="salesOrder" noun="sales order" title="Sales orders" rows={() => kit.toRows(rows)} />}
        empty={{
          line: 'No sales orders yet. A sales order is a customer, a promised day and what they want — and a line can name the style or job card it is made on, so a halt on the floor shows here as a promise at risk.',
          cta: 'New sales order',
        }}>
        {(shown) => (
          <DataTable columns={kit.columns} rows={shown} keyOf={(r) => r.order.id}
            extra={{ icon: 'truck', label: (r) => (r.complete ? `${r.order.no} has all gone` : `Dispatch against ${r.order.no}`), onClick: (r) => setNoting(r.order.id) }}
            extra2={{
              icon: 'undo',
              label: (r) => (r.order.state === 'cancelled' ? `Reopen ${r.order.no}` : `Cancel ${r.order.no}`),
              onClick: (r) => update((w) => (r.order.state === 'cancelled' ? reopenOrder(w, r.order.id) : cancelOrder(w, r.order.id))),
            }}
            onEdit={(r) => setEditing(r.order)}
            onDelete={(r) => setDeleting(r)}
            editLabel={(r) => `Edit ${r.order.no}`}
            deleteLabel={(r) => `Delete ${r.order.no}`} />
        )}
      </ListPage>

      <OrderForm order={editing} onClose={() => setEditing(undefined)} />
      <NoteForm orderId={noting} onClose={() => setNoting(undefined)} onRaised={setDoc} />
      <DeliveryDocument noteId={doc} onClose={() => setDoc(null)} />
      <ConfirmDelete
        open={deleting !== null}
        what={deleting ? `${deleting.order.no} for ${deleting.customer?.name ?? 'a customer'}` : ''}
        impact={{ losses: [], clean: true }}
        blocked={deleting ? removeOrderProblem(ws, deleting.order.id) : null}
        onClose={() => setDeleting(null)}
        onConfirm={() => { if (deleting) update((w) => removeOrder(w, deleting.order.id)) }}
      />
    </>
  )
}
