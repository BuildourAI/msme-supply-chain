'use client'
import { useState } from 'react'
import { ListPage } from '@/components/ui/ListPage'
import { StatePill, type PillTone } from '@/components/ui/DataTable'
import { Icon } from '@/components/ui/icons'
import { DeskTools } from '@/components/sheet/DeskTools'
import { buildColumns, type DrawnColumn } from '@/components/sheet/columns'
import { OrderForm } from './OrderForm'
import { PoDocument, PoSentPill } from './PoDocument'
import { ReceiveForm } from './ReceiveForm'
import { ConfirmDelete } from './ConfirmDelete'
import { useAuth } from '@/components/workspace/auth'
import { useWorkspace } from '@/components/workspace/store'
import { dropFile } from '@/lib/intake/blobs'
import { mirrorRemove } from '@/lib/intake/mirror'
import { boardLines, type BoardLine } from '@/lib/workspace/board'
import { SYNC_WORDS, syncOrders, type SyncOrder } from '@/lib/workspace/orders'
import { AckDialog, ackPath } from './AckDialog'
import { ExpediteDialog } from './ExpediteDialog'
import { OrderSyncBlock, SyncPill } from './OrderSync'
import { ReviseDialog } from './ReviseDialog'
import {
  orderGroups, orderRows, removeOrder, type OrderGroup, type OrderRow,
} from '@/lib/workspace/sourcing'
import { outstandingOn, receivedAgainst } from '@/lib/workspace/receipts'
import { money, num, shortDate } from '@/lib/domain/format'
import type { OrderState, PurchaseOrder } from '@/lib/workspace/types'

/**
 * What you have ordered — and, once the supplier has it, what they are making.
 *
 * One card per order, because an order is a piece of paper: one supplier, one
 * number, one date, and however many materials are on it. A row here is a
 * LINE, and listing six lines flat repeated the number, the supplier, the
 * status and both dates six times over — the same noise the Quotes screen had
 * before a quotation became one record.
 *
 * What is true of the order is said once in the header. What differs line by
 * line stays on the line, and a column whose value is the same on every line
 * folds up into the header rather than being printed six times.
 *
 * The one column a paper order book cannot give you is the last: something
 * expected a week ago that has not arrived. That is the whole reason to keep
 * this rather than a notebook, so it is the only figure on the screen that
 * turns red.
 *
 * One home for an order: drafted here, handed over here, changed and
 * confirmed here. Once it is with its supplier the card grows what they are
 * making against what we need, every version of it, and their confirmation —
 * which used to be a second screen at the gate listing the same orders again.
 * The gate sees the order only on Due in, on the day it should land.
 */

/** Said in the card header, never on a line. */
const CHROME = new Set(['no', 'vendor'])

/**
 * True of a line, but usually the same on all of them.
 *
 * Bundling made that the normal case: six lines drafted together share both
 * dates. They fold into the header when every line agrees, and drop back onto
 * the lines the moment one differs — which is exactly when the difference is
 * the thing worth seeing.
 *
 * The status behaves the same way but is not in here, because the header
 * already carries it as a pill: folding it too would print "Draft" twice.
 */
const FOLD = ['ordered', 'expected']
const TONE: Record<OrderState, PillTone> = {
  draft: 'neutral', confirmed: 'info', shipped: 'warn', delivered: 'good', cancelled: 'neutral',
}
const LABEL: Record<OrderState, string> = {
  draft: 'Draft', confirmed: 'Confirmed', shipped: 'Shipped',
  delivered: 'Delivered', cancelled: 'Cancelled',
}

export function PurchaseOrders() {
  const { workspace, update, today } = useWorkspace()
  const { account } = useAuth()
  const [revising, setRevising] = useState<string | null>(null)
  const [acking, setAcking] = useState<string | null>(null)
  const [hurrying, setHurrying] = useState<BoardLine | null>(null)
  const [editing, setEditing] = useState<PurchaseOrder | null>(null)
  const [adding, setAdding] = useState(false)
  const [deleting, setDeleting] = useState<PurchaseOrder | null>(null)
  const [papering, setPapering] = useState<string | null>(null)
  const [receiving, setReceiving] = useState<PurchaseOrder | null>(null)

  if (!workspace) return null
  const ws = workspace
  const rows = orderRows(ws)
  const sync = new Map(syncOrders(ws, today).map((o) => [o.no, o]))
  const board = boardLines(ws, today)

  // a picture of their confirmation, taken back off the order and the device
  const removeImage = (no: string, id: string) => {
    update((w) => ({
      ...w,
      orders: w.orders.map((o) => (o.no === no && o.ackImageId === id ? { ...o, ackImageId: undefined } : o)),
    }))
    void dropFile(id)
    if (account) void mirrorRemove(ackPath(account.id, ws.id, id))
  }

  const drawn: Record<string, DrawnColumn<OrderRow>> = {
    // chrome: the card header states it once, but an export still carries it
    no: {
      cell: (r) => <span className="mono text-[12.5px] font-semibold">{r.order.no}</span>,
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
    /*
     * What has actually turned up, which is the column a paper order book
     * cannot keep. Blank until something has, rather than a confident 0 —
     * "nothing has arrived" and "nothing was ordered" look the same as a zero.
     */
    received: {
      align: 'right',
      cell: (r) => {
        const got = receivedAgainst(ws, r.order.id)
        if (got === 0) return <span className="text-ink-4">—</span>
        const left = outstandingOn(ws, r.order)
        return (
          <span title={left > 0 ? `${num(left, 3)} still to come` : 'All of it'}
            className={left > 0 ? 'text-warn' : ''}>
            {num(got, 3)}{r.item ? ` ${r.item.uom}` : ''}
          </span>
        )
      },
      text: (r) => String(receivedAgainst(ws, r.order.id)),
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
        /*
         * A row is a line; several lines sharing a number are one order. Both
         * the count line and the money below the table say orders, so both
         * count numbers — otherwise a three-line order to one supplier reads
         * as three orders on the screen and in the rail badge.
         */
        countOf={(rs) => new Set(rs.map((r) => r.order.no)).size}
        search={(r) => {
          const s = sync.get(r.order.no)
          return `${r.order.no} ${r.vendor?.name ?? ''} ${r.item?.name ?? ''} ${s ? SYNC_WORDS[s.state] : ''} ${kit.searchText(r)}`
        }}
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
            <div className="space-y-3">
              {orderGroups(shown).map((g) => (
                <Order
                  key={g.no} group={g} today={today} columns={kit.columns}
                  sync={sync.get(g.no)} board={board.filter((l) => l.order.no === g.no)}
                  onPaper={() => setPapering(g.no)}
                  onReceive={setReceiving} onEdit={setEditing} onDelete={setDeleting}
                  onRevise={setRevising} onAck={() => setAcking(g.no)} onHurry={setHurrying}
                  onRemoveImage={(id) => removeImage(g.no, id)}
                />
              ))}
            </div>
            {outstanding.length > 0 && (() => {
              const open = new Set(outstanding.map((r) => r.order.no)).size
              return (
                <p className="mt-3 text-[12.5px] text-ink-3">
                  <span className="num font-medium text-ink-2">
                    {money(outstanding.reduce((a, r) => a + r.total, 0))}
                  </span>
                  {' '}still out across {open} order{open === 1 ? '' : 's'}
                </p>
              )
            })()}
          </>
        )}
      </ListPage>

      <PoDocument open={papering !== null} no={papering} onClose={() => setPapering(null)} />
      <ReviseDialog orderId={revising} onClose={() => setRevising(null)} />
      <AckDialog no={acking} onClose={() => setAcking(null)} />
      <ExpediteDialog line={hurrying} onClose={() => setHurrying(null)} />

      <ReceiveForm open={receiving !== null} order={receiving}
        onClose={() => setReceiving(null)} />

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

/**
 * One order, with its lines under it.
 *
 * The header carries what is true of the whole order — its number, who it went
 * to, whether it has been handed over, and a way to make the document. The
 * lines carry what differs. A column that reads the same on every line is
 * lifted into the header rather than printed once per line. Once the supplier
 * has it, what they are making sits under the lines, with the buttons to
 * change it and to record that they confirmed.
 */
function Order({
  group, today, columns, sync, board, onPaper, onReceive, onEdit, onDelete, onRevise, onAck, onHurry, onRemoveImage,
}: {
  group: OrderGroup
  today: string
  columns: { key: string; head: string; align?: 'left' | 'right'; cell: (r: OrderRow) => React.ReactNode }[]
  /** absent until it has been handed over */
  sync?: SyncOrder
  board: BoardLine[]
  onPaper: () => void
  onReceive: (o: PurchaseOrder) => void
  onEdit: (o: PurchaseOrder) => void
  onDelete: (o: PurchaseOrder) => void
  onRevise: (orderId: string) => void
  onAck: () => void
  onHurry: (l: BoardLine) => void
  onRemoveImage: (id: string) => void
}) {
  const { no, rows, vendor, state, total, expectedOn } = group

  /*
   * A column every line agrees about is a fact of the order, so it goes up.
   * One that differs stays down, because a line running late among five that
   * are not is the whole reason to look at this screen.
   */
  const same = (key: string) => {
    const col = columns.find((c) => c.key === key)
    if (!col) return false
    const first = JSON.stringify(text(col, rows[0]))
    return rows.every((r) => JSON.stringify(text(col, r)) === first)
  }
  const lifted = FOLD.filter(same)
  const head = columns.filter((c) => lifted.includes(c.key))
  /*
   * The status leaves the lines when they all agree — the header pill has
   * already said it — and comes back the moment one line moves on without the
   * others, which is the only time it tells you anything.
   */
  const body = columns.filter((c) => !CHROME.has(c.key) && !lifted.includes(c.key)
    && !(c.key === 'state' && same('state')))

  const open = state !== 'delivered' && state !== 'cancelled'
  const late = open && expectedOn < today

  return (
    <article data-order={no} className={`rounded-xl border bg-surface p-4 ${
      late ? 'border-critical/40' : 'border-line'}`}>
      <div className="flex flex-wrap items-start gap-x-3 gap-y-2">
        <div className="min-w-0 flex-1">
          <h3 className="flex flex-wrap items-center gap-2">
            <span className="mono text-[13px] font-bold">{no}</span>
            <StatePill label={LABEL[state]} tone={TONE[state]} />
            <PoSentPill no={no} fallback={null} />
            {sync && <SyncPill state={sync.state} />}
            <span className="truncate text-[13.5px] font-semibold">
              {vendor?.name ?? 'Unknown supplier'}
            </span>
          </h3>
          <div className="mt-1 flex flex-wrap items-baseline gap-x-3 gap-y-0.5 text-[12px]">
            {head.map((c) => (
              <span key={c.key} className="inline-flex items-baseline gap-1">
                <span className="text-ink-3">{c.head}</span>
                <span className="num font-medium">{c.cell(rows[0])}</span>
              </span>
            ))}
            <span className="mono text-[11px] text-ink-3">
              {rows.length} line{rows.length === 1 ? '' : 's'}
            </span>
          </div>
        </div>
        {/* the document is the ORDER's, so it is offered once rather than per line */}
        <button type="button" onClick={onPaper}
          title={`Make the ${no} document`}
          className="press inline-flex shrink-0 items-center gap-1.5 rounded-md border border-line bg-surface px-2.5 py-1 text-[12px] font-medium hover:bg-surface-2">
          <Icon name="doc" className="size-3.5" />
          Make the document
        </button>
      </div>

      <div className="scroll-x relative mt-3 overflow-x-auto">
        <table className="w-full border-collapse text-[13px]">
          <thead>
            <tr className="border-y border-line-soft text-left">
              {body.map((c) => (
                <th key={c.key}
                  className={`whitespace-nowrap px-3 py-2 text-[11.5px] font-medium text-ink-3 first:pl-0 ${
                    c.align === 'right' ? 'text-right' : 'text-left'}`}>
                  {c.head}
                </th>
              ))}
              <th className="w-0 py-2"><span className="sr-only">What to do with it</span></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.order.id} className="border-b border-line-soft last:border-0">
                {body.map((c) => (
                  <td key={c.key}
                    className={`px-3 py-2.5 align-middle first:pl-0 ${
                      c.align === 'right' ? 'num whitespace-nowrap text-right' : ''}`}>
                    {c.cell(r)}
                  </td>
                ))}
                <td className="whitespace-nowrap py-2.5 pl-3 text-right align-middle">
                  <span className="inline-flex items-center gap-1">
                    <button type="button" onClick={() => onReceive(r.order)}
                      title={`Record what arrived of ${r.item?.name ?? 'this line'} against ${no}`}
                      className="press rounded-md p-1.5 text-ink-3 hover:bg-surface-3 hover:text-ink">
                      <Icon name="tray" className="size-4" />
                      <span className="sr-only">Record what arrived against {no}</span>
                    </button>
                    <button type="button" onClick={() => onEdit(r.order)}
                      title={`Edit the ${r.item?.name ?? 'line'} on ${no}`}
                      className="press rounded-md p-1.5 text-ink-3 hover:bg-surface-3 hover:text-ink">
                      <Icon name="pencil" className="size-4" />
                      <span className="sr-only">Edit {no}</span>
                    </button>
                    <button type="button" onClick={() => onDelete(r.order)}
                      title={`Delete the ${r.item?.name ?? 'line'} from ${no}`}
                      className="press rounded-md p-1.5 text-ink-4 hover:bg-critical-soft hover:text-critical">
                      <Icon name="trash" className="size-4" />
                      <span className="sr-only">Delete {no}</span>
                    </button>
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* what the order comes to, which is the figure somebody is deciding on */}
      {rows.length > 1 && (
        <p className="mt-2.5 border-t border-line-soft pt-2 text-right text-[12.5px] text-ink-3">
          Order total <span className="num ml-1 font-semibold text-ink">{money(total)}</span>
        </p>
      )}

      {sync && (
        <OrderSyncBlock o={sync} board={board}
          onRevise={onRevise} onSend={onPaper} onAck={onAck}
          onRemoveImage={onRemoveImage} onHurry={onHurry} />
      )}
    </article>
  )
}

/**
 * A cell as plain text, for deciding whether two lines agree.
 *
 * The cells are JSX, and two React elements are never `===` even when they
 * draw the same thing. `text` on the column is the same function the CSV
 * export uses, so "the same on screen" and "the same in a file" cannot drift.
 */
function text(col: { key: string; cell: (r: OrderRow) => React.ReactNode }, row: OrderRow) {
  const withText = col as { text?: (r: OrderRow) => string }
  return withText.text ? withText.text(row) : col.cell(row)
}
