'use client'
import { useState } from 'react'
import { ListPage } from '@/components/ui/ListPage'
import { DataTable, StatePill } from '@/components/ui/DataTable'
import { DeskTools } from '@/components/sheet/DeskTools'
import { buildColumns, type DrawnColumn } from '@/components/sheet/columns'
import { ConfirmDelete } from '@/components/sourcing/ConfirmDelete'
import { useWorkspace } from '@/components/workspace/store'
import { num } from '@/lib/domain/format'
import { carrierRows, type CarrierRow } from '@/lib/workspace/consignments'
import {
  CARRIER_MODE, customerRows, removeCarrier, removeCarrierProblem, removeCustomer, removeCustomerProblem,
  type CustomerRow,
} from '@/lib/workspace/customers'
import type { WsCarrier, WsCustomer } from '@/lib/workspace/types'
import { CarrierForm, CustomerForm } from './PartyForms'

/** Who the company sells to. A customer an order names stays, with the order. */
export function Customers() {
  const { workspace, update, today } = useWorkspace()
  const [editing, setEditing] = useState<WsCustomer | null | undefined>(undefined)
  const [deleting, setDeleting] = useState<CustomerRow | null>(null)
  if (!workspace) return null
  const ws = workspace
  const rows = customerRows(ws, today)

  const drawn: Record<string, DrawnColumn<CustomerRow>> = {
    name: { cell: (r) => <span className="font-semibold text-ink">{r.customer.name}</span>, text: (r) => r.customer.name },
    gstin: { cell: (r) => <span className="mono text-[12px] text-ink-2">{r.customer.gstin ?? '—'}</span>, text: (r) => r.customer.gstin ?? '' },
    state: { cell: (r) => r.state ?? <span className="text-ink-4">—</span>, text: (r) => r.state ?? '' },
    shipTo: {
      cell: (r) => <span className="line-clamp-2 max-w-[18rem] text-[12.5px] text-ink-2">{r.customer.shipTo ?? '—'}</span>,
      text: (r) => r.customer.shipTo ?? '',
    },
    terms: {
      align: 'right',
      cell: (r) => (r.customer.paymentTerms !== undefined ? `${r.customer.paymentTerms} days` : <span className="text-ink-4">—</span>),
      text: (r) => String(r.customer.paymentTerms ?? ''),
    },
    open: { align: 'right', cell: (r) => (r.openOrders ? num(r.openOrders, 0) : <span className="text-ink-4">—</span>), text: (r) => String(r.openOrders) },
  }
  const kit = buildColumns<CustomerRow>(ws, 'customer', (r) => r.customer.id, drawn)

  return (
    <>
      <ListPage
        title="Customers" noun="customer" rows={rows}
        search={(r) => `${r.customer.name} ${r.customer.gstin ?? ''} ${r.state ?? ''} ${r.customer.shipTo ?? ''} ${kit.searchText(r)}`}
        action={{ label: 'Add a customer', onClick: () => setEditing(null) }}
        tools={<DeskTools entity="customer" noun="customer" title="Customers" rows={() => kit.toRows(rows)} />}
        empty={{ line: 'Nobody yet. A customer is a name; the GSTIN and ship-to address are what the delivery challan carries.', cta: 'Add a customer' }}>
        {(shown) => (
          <DataTable columns={kit.columns} rows={shown} keyOf={(r) => r.customer.id}
            onEdit={(r) => setEditing(r.customer)} onDelete={(r) => setDeleting(r)}
            editLabel={(r) => `Edit ${r.customer.name}`} deleteLabel={(r) => `Delete ${r.customer.name}`} />
        )}
      </ListPage>
      <CustomerForm customer={editing} onClose={() => setEditing(undefined)} />
      <ConfirmDelete
        open={deleting !== null} what={deleting?.customer.name ?? ''} impact={{ losses: [], clean: true }}
        blocked={deleting ? removeCustomerProblem(ws, deleting.customer.id) : null}
        onClose={() => setDeleting(null)}
        onConfirm={() => { if (deleting) update((w) => removeCustomer(w, deleting.customer.id)) }} />
    </>
  )
}

/** Who carries it — and how often they get there by the day the customer was told. */
export function Carriers() {
  const { workspace, update, today } = useWorkspace()
  const [editing, setEditing] = useState<WsCarrier | null | undefined>(undefined)
  const [deleting, setDeleting] = useState<CarrierRow | null>(null)
  if (!workspace) return null
  const ws = workspace
  const rows = carrierRows(ws, today)

  const drawn: Record<string, DrawnColumn<CarrierRow>> = {
    name: { cell: (r) => <span className="font-semibold text-ink">{r.carrier.name}</span>, text: (r) => r.carrier.name },
    mode: { cell: (r) => CARRIER_MODE[r.carrier.mode], text: (r) => CARRIER_MODE[r.carrier.mode] },
    rate: {
      align: 'right',
      cell: (r) => (r.carrier.ratePerKgKm !== undefined ? `₹${r.carrier.ratePerKgKm}/kg·km` : <span className="text-ink-4">—</span>),
      text: (r) => String(r.carrier.ratePerKgKm ?? ''),
    },
    shipped: { align: 'right', cell: (r) => (r.shipped ? num(r.shipped, 0) : <span className="text-ink-4">—</span>), text: (r) => String(r.shipped) },
    late: {
      align: 'right',
      cell: (r) => (r.delivered === 0 ? <span className="text-ink-4">—</span>
        : r.late === 0 ? <StatePill label="None late" tone="good" />
          : <span className="text-critical">{r.late} of {r.delivered}{(r.drift.value as number) > 0 ? ` · ${r.drift.value} days behind` : ''}</span>),
      text: (r) => `${r.late}/${r.delivered}`,
    },
  }
  const kit = buildColumns<CarrierRow>(ws, 'carrier', (r) => r.carrier.id, drawn)

  return (
    <>
      <ListPage
        title="Carriers" noun="carrier" rows={rows}
        search={(r) => `${r.carrier.name} ${CARRIER_MODE[r.carrier.mode]} ${kit.searchText(r)}`}
        action={{ label: 'Add a carrier', onClick: () => setEditing(null) }}
        tools={<DeskTools entity="carrier" noun="carrier" title="Carriers" rows={() => kit.toRows(rows)} />}
        empty={{ line: 'Nobody yet. A transporter, a courier or your own vehicle — each consignment is booked with one.', cta: 'Add a carrier' }}>
        {(shown) => (
          <DataTable columns={kit.columns} rows={shown} keyOf={(r) => r.carrier.id}
            onEdit={(r) => setEditing(r.carrier)} onDelete={(r) => setDeleting(r)}
            editLabel={(r) => `Edit ${r.carrier.name}`} deleteLabel={(r) => `Delete ${r.carrier.name}`} />
        )}
      </ListPage>
      <CarrierForm carrier={editing} onClose={() => setEditing(undefined)} />
      <ConfirmDelete
        open={deleting !== null} what={deleting?.carrier.name ?? ''} impact={{ losses: [], clean: true }}
        blocked={deleting ? removeCarrierProblem(ws, deleting.carrier.id) : null}
        onClose={() => setDeleting(null)}
        onConfirm={() => { if (deleting) update((w) => removeCarrier(w, deleting.carrier.id)) }} />
    </>
  )
}
