'use client'
import { useState } from 'react'
import { ListPage } from '@/components/ui/ListPage'
import { DataTable, StatePill, Tags, type PillTone } from '@/components/ui/DataTable'
import { DeskTools } from '@/components/sheet/DeskTools'
import { buildColumns, type DrawnColumn } from '@/components/sheet/columns'
import { RfqForm } from '@/components/sourcing/RfqForm'
import { ConfirmDelete } from '@/components/sourcing/ConfirmDelete'
import { DeskOnly } from '@/components/sourcing/DeskOnly'
import { useWorkspace } from '@/components/workspace/store'
import { removeRfq, rfqImpact, rfqRows, type RfqRow } from '@/lib/workspace/sourcing'
import { num, shortDate } from '@/lib/domain/format'
import type { Rfq, RfqState } from '@/lib/workspace/types'

/**
 * What you have asked for.
 *
 * The state is the column that earns its place: a request sent a fortnight ago
 * with nothing back is the thing worth seeing from the doorway, and it is
 * exactly what a paper enquiry book never tells you. Three of the five states
 * move by themselves as quotes arrive.
 */
const TONE: Record<RfqState, PillTone> = {
  draft: 'neutral', sent: 'info', quoted: 'warn', awarded: 'good', closed: 'neutral',
}
const LABEL: Record<RfqState, string> = {
  draft: 'Draft', sent: 'Sent', quoted: 'Quoted', awarded: 'Awarded', closed: 'Closed',
}

export default function Page() {
  return <DeskOnly><Rfqs /></DeskOnly>
}

function Rfqs() {
  const { workspace, update, today } = useWorkspace()
  const [editing, setEditing] = useState<Rfq | null>(null)
  const [adding, setAdding] = useState(false)
  const [deleting, setDeleting] = useState<Rfq | null>(null)

  if (!workspace) return null
  const ws = workspace
  const rows = rfqRows(ws)

  const drawn: Record<string, DrawnColumn<RfqRow>> = {
    no: {
      cell: (r) => <span className="mono text-[12.5px] font-semibold text-ink">{r.rfq.no}</span>,
      text: (r) => r.rfq.no,
    },
    state: {
      cell: (r) => <StatePill label={LABEL[r.rfq.state]} tone={TONE[r.rfq.state]} />,
      text: (r) => LABEL[r.rfq.state],
    },
    item: {
      cell: (r) => (r.item
        ? <span className="font-medium text-ink">{r.item.name}</span>
        : <span className="text-ink-4">—</span>),
      text: (r) => r.item?.name ?? '',
    },
    asked: {
      cell: (r) => <Tags items={r.vendors.map((v) => v.name)} />,
      text: (r) => r.vendors.map((v) => v.name).join('; '),
    },
    qty: {
      align: 'right',
      cell: (r) => `${num(r.rfq.qty, 3)}${r.item ? ` ${r.item.uom}` : ''}`,
      text: (r) => String(r.rfq.qty),
    },
    back: {
      align: 'right',
      cell: (r) => (r.quotes.length === 0
        ? <span className="text-ink-4">none yet</span>
        : `${r.quotes.length} quote${r.quotes.length === 1 ? '' : 's'}`),
      text: (r) => String(r.quotes.length),
    },
    needed: {
      align: 'right',
      cell: (r) => {
        const late = r.rfq.neededBy < today && r.rfq.state !== 'awarded' && r.rfq.state !== 'closed'
        return (
          <span className={late ? 'text-critical' : ''}
            title={late ? 'The date has passed and nothing has been awarded' : undefined}>
            {shortDate(r.rfq.neededBy)}
          </span>
        )
      },
      text: (r) => r.rfq.neededBy,
    },
  }

  const kit = buildColumns<RfqRow>(ws, 'rfq', (r) => r.rfq.id, drawn)

  return (
    <>
      <ListPage
        title="Requests" noun="request" rows={rows}
        search={(r) => `${r.rfq.no} ${r.item?.name ?? ''} ${r.vendors.map((v) => v.name).join(' ')} ${kit.searchText(r)}`}
        filter={{
          label: 'All statuses',
          options: (Object.keys(LABEL) as RfqState[]).map((s) => ({ value: s, label: LABEL[s] })),
          of: (r) => r.rfq.state,
        }}
        action={{ label: 'New request', onClick: () => setAdding(true) }}
        tools={<DeskTools entity="rfq" noun="request" title="Requests"
          rows={() => kit.toRows(rows)} />}
        empty={{
          line: 'Nothing asked for yet. A request records what you want, from whom, and by when.',
          cta: 'Create your first request',
        }}>
        {(shown) => (
          <DataTable
            columns={kit.columns} rows={shown} keyOf={(r) => r.rfq.id}
            onEdit={(r) => setEditing(r.rfq)}
            onDelete={(r) => setDeleting(r.rfq)}
            editLabel={(r) => `Edit ${r.rfq.no}`}
            deleteLabel={(r) => `Delete ${r.rfq.no}`}
          />
        )}
      </ListPage>

      <RfqForm open={adding || editing !== null} editing={editing}
        onClose={() => { setAdding(false); setEditing(null) }} />

      <ConfirmDelete
        open={deleting !== null}
        what={deleting?.no ?? ''}
        impact={deleting ? rfqImpact(ws, deleting.id) : { losses: [], clean: true }}
        onClose={() => setDeleting(null)}
        onConfirm={() => { if (deleting) update((w) => removeRfq(w, deleting.id)) }}
      />
    </>
  )
}
