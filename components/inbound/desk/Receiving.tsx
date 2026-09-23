'use client'
import { useEffect, useState } from 'react'
import { ListPage } from '@/components/ui/ListPage'
import { DataTable, StatePill, type PillTone } from '@/components/ui/DataTable'
import { DeskTools } from '@/components/sheet/DeskTools'
import { buildColumns, type DrawnColumn } from '@/components/sheet/columns'
import { ConfirmDelete } from '@/components/sourcing/ConfirmDelete'
import { ReceiveForm } from '@/components/sourcing/ReceiveForm'
import { Icon } from '@/components/ui/icons'
import { useWorkspace } from '@/components/workspace/store'
import { money, num, shortDate } from '@/lib/domain/format'
import type { QcState } from '@/lib/domain/inbound'
import { receiptRows, spikeOf, type ReceiptRow } from '@/lib/workspace/inbound'
import { isOpen, removeReceipt } from '@/lib/workspace/receipts'
import { GrnDocument } from './GrnDocument'
import { InspectForm } from './InspectForm'

/**
 * The gate.
 *
 * Two lists on one screen, because they are one list at two moments. At the
 * top, what is standing at the gate: arrived, not inspected, not usable — the
 * oldest first, with how long it has been waiting against the days the gate
 * rules allow. Underneath, every receipt closed, newest first: what came, what
 * was accepted, what was turned back and why, who inspected it — each with its
 * goods receipt note a click away.
 *
 * The closed log is not a report. It is where somebody goes when a supplier
 * says "we sent a hundred" and the answer has to be a page with a date, a
 * reading and a name on it.
 */
const STATE_LABEL: Record<QcState, string> = {
  fresh: 'Within the window', at_limit: 'Inspect today', overdue: 'Past the window',
}
const STATE_TONE: Record<QcState, PillTone> = {
  fresh: 'info', at_limit: 'warn', overdue: 'critical',
}

export function Receiving() {
  const { workspace, update, today } = useWorkspace()
  const [arriving, setArriving] = useState(false)
  const [pending, setPending] = useState<string | null>(null)
  const [inspecting, setInspecting] = useState<string | null>(null)
  const [papering, setPapering] = useState<string | null>(null)
  const [deleting, setDeleting] = useState<ReceiptRow | null>(null)

  /*
   * Straight on to inspecting what just arrived. The arrival form hands back
   * the order line, and the newest open receipt on it is the one it wrote.
   */
  useEffect(() => {
    if (!pending || !workspace) return
    const made = (workspace.receipts ?? [])
      .filter((r) => r.orderId === pending && isOpen(r))
      .sort((a, b) => b.id.localeCompare(a.id))[0]
    if (made) { setInspecting(made.id); setPending(null) }
  }, [pending, workspace])

  if (!workspace) return null
  const ws = workspace
  const rows = receiptRows(ws, today)
  const atGate = rows.filter((r) => isOpen(r.receipt))

  const drawn: Record<string, DrawnColumn<ReceiptRow>> = {
    id: {
      cell: (r) => <span className="mono whitespace-nowrap text-[12.5px] font-semibold text-ink">{r.receipt.id}</span>,
      text: (r) => r.receipt.id,
    },
    state: {
      cell: (r) => (isOpen(r.receipt)
        ? <StatePill label="At the gate" tone="warn" />
        : r.receipt.noSpec ? <StatePill label="Unchecked" tone="neutral" />
          : r.receipt.rejected > 0 ? <StatePill label="Part rejected" tone="critical" />
            : r.receipt.deviationReason ? <StatePill label="Accepted as it stands" tone="warn" />
              : <StatePill label="Passed" tone="good" />),
      text: (r) => (isOpen(r.receipt) ? 'At the gate' : r.receipt.rejected > 0 ? 'Part rejected' : 'Closed'),
    },
    vendor: { cell: (r) => r.vendor?.name ?? '—', text: (r) => r.vendor?.name ?? '' },
    item: {
      cell: (r) => <span className="font-medium text-ink">{r.item?.name ?? 'Unknown material'}</span>,
      text: (r) => r.item?.name ?? '',
    },
    against: {
      cell: (r) => (r.against ? <span className="mono text-[12px]">{r.against}</span> : <span className="text-ink-4">—</span>),
      text: (r) => r.against,
    },
    qty: {
      align: 'right',
      cell: (r) => `${num(r.receipt.qty, 3)} ${r.item?.uom ?? ''}`,
      text: (r) => String(r.receipt.qty),
    },
    accepted: {
      align: 'right',
      cell: (r) => (isOpen(r.receipt) ? <span className="text-ink-4">—</span> : num(r.receipt.accepted, 3)),
      text: (r) => (isOpen(r.receipt) ? '' : String(r.receipt.accepted)),
    },
    rejected: {
      align: 'right',
      cell: (r) => (isOpen(r.receipt) ? <span className="text-ink-4">—</span>
        : r.receipt.rejected > 0
          ? <span className="font-semibold text-critical" title={spikeOf(ws, r.receipt).spike
            ? 'Well beyond this supplier’s own record' : undefined}>{num(r.receipt.rejected, 3)}</span>
          : '0'),
      text: (r) => (isOpen(r.receipt) ? '' : String(r.receipt.rejected)),
    },
    failed: {
      cell: (r) => {
        const names = (r.receipt.failedCheckIds ?? [])
          .map((id) => r.checks.find((c) => c.id === id)?.label ?? id)
        return names.length ? <span className="text-critical">{names.join(', ')}</span> : <span className="text-ink-4">—</span>
      },
      text: (r) => (r.receipt.failedCheckIds ?? [])
        .map((id) => r.checks.find((c) => c.id === id)?.label ?? id).join('; '),
    },
    received: {
      align: 'right',
      cell: (r) => shortDate(r.receipt.receivedOn),
      text: (r) => r.receipt.receivedOn,
    },
    inspector: {
      cell: (r) => (r.receipt.inspector && r.receipt.inspector !== 'unchecked'
        ? r.receipt.inspector : <span className="text-ink-4">—</span>),
      text: (r) => (r.receipt.inspector && r.receipt.inspector !== 'unchecked' ? r.receipt.inspector : ''),
    },
  }
  const kit = buildColumns<ReceiptRow>(ws, 'receipt', (r) => r.receipt.id, drawn)

  return (
    <>
      <ListPage
        title="Receiving" noun="receipt" rows={rows}
        search={(r) => `${r.receipt.id} ${r.item?.name ?? ''} ${r.vendor?.name ?? ''} ${r.against} ${kit.searchText(r)}`}
        filter={{
          label: 'At the gate and closed',
          options: [{ value: 'open', label: 'At the gate' }, { value: 'closed', label: 'Closed' }],
          of: (r) => (isOpen(r.receipt) ? 'open' : 'closed'),
        }}
        action={{ label: 'Goods arrived', icon: 'tray', onClick: () => setArriving(true) }}
        tools={<DeskTools entity="receipt" noun="receipt" title="Receipts" rows={() => kit.toRows(rows)} />}
        empty={{
          line: 'Nothing has arrived yet. When a lorry is at the gate, say what came off it — it waits here until somebody inspects it, and none of it is stock until then.',
          cta: 'Goods arrived',
        }}>
        {(shown) => {
          const open = shown.filter((r) => isOpen(r.receipt))
          const closed = shown.filter((r) => !isOpen(r.receipt))
          return (
            <div className="space-y-7">
              {open.length > 0 && (
                <section>
                  <Heading icon="tray" title="At the gate" count={open.length}
                    sub={`${money(open.reduce((a, r) => a + r.value.value, 0))} of material nobody can issue yet`} />
                  <ul className="grid gap-3 md:grid-cols-2">
                    {open.map((r, i) => (
                      <GateCard key={r.receipt.id} row={r} i={i}
                        onInspect={() => setInspecting(r.receipt.id)}
                        onDelete={() => setDeleting(r)} />
                    ))}
                  </ul>
                </section>
              )}
              {closed.length > 0 && (
                <section>
                  <Heading icon="check" title="Closed" count={closed.length}
                    sub="Every receipt inspected, with its goods receipt note" />
                  <DataTable
                    columns={kit.columns} rows={closed} keyOf={(r) => r.receipt.id}
                    extra={{
                      icon: 'doc',
                      label: (r) => `The goods receipt note for ${r.receipt.id}`,
                      onClick: (r) => setPapering(r.receipt.id),
                    }}
                    onDelete={(r) => setDeleting(r)}
                    deleteLabel={(r) => `Delete ${r.receipt.id}`}
                  />
                </section>
              )}
            </div>
          )
        }}
      </ListPage>

      <ReceiveForm open={arriving} order={null} onClose={() => setArriving(false)}
        onArrived={(orderId) => setPending(orderId)} />
      <InspectForm receiptId={inspecting} onClose={() => setInspecting(null)}
        onClosed={(id) => setPapering(id)} />
      <GrnDocument open={papering !== null} receiptId={papering} onClose={() => setPapering(null)} />

      <ConfirmDelete
        open={deleting !== null}
        what={deleting?.receipt.id ?? ''}
        impact={deleting ? {
          clean: false,
          losses: isOpen(deleting.receipt)
            ? [`the record that ${num(deleting.receipt.qty, 3)} ${deleting.item?.uom ?? ''} arrived`,
              `its place in ${deleting.vendor?.name ?? 'the supplier'}’s lead time`]
            : [`the ${num(deleting.receipt.accepted, 3)} ${deleting.item?.uom ?? ''} it put on the shelf`,
              ...(deleting.receipt.rejected > 0
                ? [`the ${num(deleting.receipt.rejected, 3)} ${deleting.item?.uom ?? ''} it recorded as rejected`] : []),
              `its place in ${deleting.vendor?.name ?? 'the supplier'}’s lead time and rejection record`],
        } : { losses: [], clean: true }}
        onClose={() => setDeleting(null)}
        onConfirm={() => { if (deleting) update((w) => removeReceipt(w, deleting.receipt.id)) }}
      />
    </>
  )
}

function Heading({ icon, title, count, sub }: {
  icon: 'tray' | 'check'; title: string; count: number; sub: string
}) {
  return (
    <div className="mb-3 flex flex-wrap items-baseline gap-x-2 gap-y-1 border-b border-line pb-2">
      <span aria-hidden className="grid size-6 place-items-center self-center rounded-md bg-surface-2 text-ink-2">
        <Icon name={icon} className="size-3.5" />
      </span>
      <h2 className="text-[13.5px] font-bold tracking-[-0.01em]">{title}</h2>
      <span className="mono rounded-full bg-surface-2 px-1.5 py-px text-[10.5px] font-semibold text-ink-2">{count}</span>
      <span className="text-[12px] text-ink-3">{sub}</span>
    </div>
  )
}

/**
 * One receipt waiting at the gate. The clock is the point of the card: how
 * long it has stood there against the days the gate rules allow.
 */
function GateCard({ row, i, onInspect, onDelete }: {
  row: ReceiptRow; i: number; onInspect: () => void; onDelete: () => void
}) {
  const r = row.receipt
  const uom = row.item?.uom ?? ''
  const marked = row.checks.filter((c) => row.results.some((x) => x.checkId === c.id && x.outcome !== 'not_checked')).length
  const fill = row.state === 'overdue' ? 'bg-critical-soft' : row.state === 'at_limit' ? 'bg-warn-soft' : 'bg-surface-2'
  return (
    <li style={{ '--i': i } as React.CSSProperties}
      className={`anim-fade-up rounded-xl px-3.5 py-3 ${fill}`}>
      <div className="flex items-start gap-3">
        <span aria-hidden className="grid size-9 shrink-0 place-items-center rounded-full bg-surface text-ink-2">
          <Icon name="tray" className="size-4" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[13.5px] font-bold">{row.item?.name ?? 'Unknown material'}</span>
          <span className="block truncate text-[11.5px] text-ink-2">
            {num(r.qty, 3)} {uom} from {row.vendor?.name ?? 'Unknown supplier'}
            {row.against && <> · <span className="mono">{row.against}</span></>}
          </span>
        </span>
        <StatePill label={STATE_LABEL[row.state]} tone={STATE_TONE[row.state]} />
      </div>

      <dl className="mt-2.5 grid grid-cols-3 gap-2 text-[11.5px]">
        <div>
          <dt className="text-ink-3">Waiting</dt>
          <dd className="num font-semibold">{row.age.value} day{row.age.value === 1 ? '' : 's'}</dd>
        </div>
        <div>
          <dt className="text-ink-3">Issuable from</dt>
          <dd className="num font-semibold">{shortDate(row.issuable.value)}</dd>
        </div>
        <div>
          <dt className="text-ink-3">Checks</dt>
          <dd className="num font-semibold">
            {row.checks.length === 0 ? 'none written' : `${marked} of ${row.checks.length}`}
          </dd>
        </div>
      </dl>

      <div className="mt-3 flex items-center gap-2">
        <button type="button" onClick={onInspect}
          className="press rounded-lg border border-line bg-surface px-3 py-1.5 text-[12.5px] font-semibold hover:bg-surface-2">
          {row.checks.length === 0 ? 'Close it' : marked > 0 ? 'Carry on inspecting' : 'Inspect'}
        </button>
        <span className="text-[11.5px] text-ink-3">worth {money(row.value.value)} at last paid</span>
        <button type="button" onClick={onDelete} title={`Delete ${r.id}`}
          className="press ml-auto rounded-md p-1.5 text-ink-4 hover:bg-critical-soft hover:text-critical">
          <Icon name="trash" className="size-4" />
          <span className="sr-only">Delete {r.id}</span>
        </button>
      </div>
    </li>
  )
}
