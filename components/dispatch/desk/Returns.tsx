'use client'
import { useState } from 'react'
import { ListPage } from '@/components/ui/ListPage'
import { DataTable, StatePill, type PillTone } from '@/components/ui/DataTable'
import { DeskTools } from '@/components/sheet/DeskTools'
import { buildColumns, type DrawnColumn } from '@/components/sheet/columns'
import { ConfirmDelete } from '@/components/sourcing/ConfirmDelete'
import { useWorkspace } from '@/components/workspace/store'
import { money, num, shortDate } from '@/lib/domain/format'
import {
  RETURN_WORD, closeReturn, removeReturn, removeReturnProblem, returnRows, type ReturnRow, type ReturnState,
} from '@/lib/workspace/returns'
import { ReceiveReturnDialog, ReturnForm } from './ReturnDialogs'

const TONE: Record<ReturnState, PillTone> = { authorised: 'info', overdue: 'critical', received: 'warn', closed: 'neutral' }

/**
 * What customers are sending back.
 *
 * Authorised against the note it went out on, due back by a day, then booked
 * in at the gate: what is fit to sell again goes back on the finished-goods
 * shelf, what is damaged stays off it with the reason. Valued at what it cost
 * to make — the refund, if there is one, is the accounts package's.
 */
export function Returns() {
  const { workspace, update, today } = useWorkspace()
  const [raising, setRaising] = useState<string | null | undefined>(undefined)
  const [receiving, setReceiving] = useState<string | null>(null)
  const [deleting, setDeleting] = useState<ReturnRow | null>(null)

  if (!workspace) return null
  const ws = workspace
  const rows = returnRows(ws, today)

  const drawn: Record<string, DrawnColumn<ReturnRow>> = {
    no: { cell: (r) => <span className="mono whitespace-nowrap text-[12.5px] font-semibold text-ink">{r.rma.no}</span>, text: (r) => r.rma.no },
    customer: { cell: (r) => <span className="font-medium text-ink">{r.customer?.name ?? '—'}</span>, text: (r) => r.customer?.name ?? '' },
    against: {
      cell: (r) => (
        <span className="whitespace-nowrap">
          <span className="mono block text-[12px] text-ink-2">{r.note?.no ?? '—'}</span>
          <span className="mono block text-[11px] text-ink-3">{r.order?.no ?? ''}</span>
        </span>
      ),
      text: (r) => `${r.note?.no ?? ''} ${r.order?.no ?? ''}`,
    },
    product: { cell: (r) => r.product?.name ?? '—', text: (r) => r.product?.name ?? '' },
    qty: { align: 'right', cell: (r) => num(r.rma.qty, 0), text: (r) => String(r.rma.qty) },
    reason: { cell: (r) => <span className="line-clamp-2 max-w-[16rem] text-[12.5px] text-ink-2">{r.rma.reason}</span>, text: (r) => r.rma.reason },
    due: {
      cell: (r) => <span className={`num whitespace-nowrap ${r.overdue ? 'font-semibold text-critical' : 'text-ink-2'}`}>{shortDate(r.rma.dueBy)}</span>,
      text: (r) => r.rma.dueBy,
    },
    state: {
      cell: (r) => (
        <span className="inline-flex flex-col items-start gap-1">
          <StatePill label={RETURN_WORD[r.state]} tone={TONE[r.state]} />
          {r.rma.receivedOn && (
            <span className="whitespace-nowrap text-[11.5px] text-ink-3" title={r.rma.damageNote}>
              {r.rma.good ?? 0} good · {r.rma.damaged ?? 0} damaged
            </span>
          )}
        </span>
      ),
      text: (r) => `${RETURN_WORD[r.state]}${r.rma.receivedOn ? ` ${r.rma.good ?? 0} good ${r.rma.damaged ?? 0} damaged` : ''}`,
    },
    value: {
      align: 'right',
      cell: (r) => (r.value && (r.value.value as number) > 0 ? money(r.value.value as number) : <span className="text-ink-4">—</span>),
      text: (r) => String(r.value?.value ?? ''),
    },
  }
  const kit = buildColumns<ReturnRow>(ws, 'rma', (r) => r.rma.id, drawn)

  return (
    <>
      <ListPage
        title="Returns" noun="return" rows={rows}
        search={(r) => `${r.rma.no} ${r.customer?.name ?? ''} ${r.note?.no ?? ''} ${r.product?.name ?? ''} ${r.rma.reason} ${kit.searchText(r)}`}
        filter={{
          label: 'Every state',
          options: (Object.keys(RETURN_WORD) as ReturnState[]).filter((s) => rows.some((r) => r.state === s)).map((s) => ({ value: s, label: RETURN_WORD[s] })),
          of: (r) => r.state,
        }}
        action={{ label: 'Authorise a return', onClick: () => setRaising(null) }}
        tools={<DeskTools entity="rma" noun="return" title="Returns" rows={() => kit.toRows(rows)} />}
        empty={{
          line: 'Nothing coming back. A return is agreed against the dispatch note the goods went out on, and booked in when it arrives — the good pieces go back on the shelf.',
          cta: 'Authorise a return',
        }}>
        {(shown) => (
          <DataTable columns={kit.columns} rows={shown} keyOf={(r) => r.rma.id}
            extra={{
              icon: 'tray',
              label: (r) => (r.rma.state === 'authorised' ? `Book in ${r.rma.no}` : `${r.rma.no} is booked in`),
              onClick: (r) => { if (r.rma.state === 'authorised') setReceiving(r.rma.id) },
            }}
            extra2={{
              icon: 'check',
              label: (r) => (r.rma.state === 'received' ? `Close ${r.rma.no}` : r.rma.state === 'closed' ? `${r.rma.no} is closed` : 'Book it in first'),
              onClick: (r) => { if (r.rma.state === 'received') update((w) => closeReturn(w, r.rma.id)) },
            }}
            onDelete={(r) => setDeleting(r)}
            deleteLabel={(r) => `Withdraw ${r.rma.no}`} />
        )}
      </ListPage>
      <ReturnForm noteId={raising} onClose={() => setRaising(undefined)} />
      <ReceiveReturnDialog rmaId={receiving} onClose={() => setReceiving(null)} />
      <ConfirmDelete
        open={deleting !== null}
        what={deleting ? `${deleting.rma.no} from ${deleting.customer?.name ?? 'the customer'}` : ''}
        impact={{ losses: [], clean: true }}
        blocked={deleting ? removeReturnProblem(ws, deleting.rma.id) : null}
        onClose={() => setDeleting(null)}
        onConfirm={() => { if (deleting) update((w) => removeReturn(w, deleting.rma.id)) }}
      />
    </>
  )
}
