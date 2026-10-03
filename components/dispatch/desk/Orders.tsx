'use client'
import { useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ListPage } from '@/components/ui/ListPage'
import { DataTable, StatePill, type PillTone } from '@/components/ui/DataTable'
import { Icon } from '@/components/ui/icons'
import { Tabs } from '@/components/ui/Tabs'
import { JourneyDots, JourneyStrip } from '@/components/charts/journey'
import { DeskTools } from '@/components/sheet/DeskTools'
import { buildColumns, type DrawnColumn } from '@/components/sheet/columns'
import { ConfirmDelete } from '@/components/sourcing/ConfirmDelete'
import { OutputForm } from '@/components/production/desk/PlanDialogs'
import { useWorkspace } from '@/components/workspace/store'
import { money, num, shortDate } from '@/lib/domain/format'
import {
  WHERE_OPTIONS, matchesWhere, orderBoard, orderJourney, type OrderAct, type OrderJourney,
} from '@/lib/workspace/journeys'
import { WATCH_WORD } from '@/lib/workspace/linewatch'
import {
  cancelOrder, ORDER_WORD, openJobForOrder, orderRows, removeOrder, removeOrderProblem, reopenOrder,
  type OrderRow, type OrderStatus,
} from '@/lib/workspace/sales'
import type { CustomerOrder } from '@/lib/workspace/types'
import { OrderForm } from './OrderDialogs'
import { BookCarrierDialog, DeliveryDocument, NoteForm } from './NoteDialogs'
import { DeliveredDialog } from './ConsignmentDialogs'

export const ORDER_TONE: Record<OrderStatus, PillTone> = {
  not_out: 'neutral', part: 'info', full: 'good', late: 'critical', cancelled: 'neutral',
}

type View = 'journey' | 'table'

/**
 * The order book, read the way an owner asks about an order: where is it?
 *
 * Each order is a row with its journey under it — taken, job card, made,
 * dispatched, delivered — and the one thing to do next beside it. What is
 * late comes first, most late at the top; then what is due this week; then
 * later. What has been delivered folds away under one line. Opening a row
 * shows what they ordered, line by line, and every delivery challan with
 * where it got to.
 *
 * The table is still one tab away, with its columns, import and export, for
 * the owner who wants every figure side by side or a sheet to send.
 *
 * Under the status, the promise at risk, taken from the Line watch verdict on
 * the job card making it, so a customer hears about a halt from the owner
 * before they notice it themselves.
 */
export function Orders() {
  const { workspace, update, today } = useWorkspace()
  const router = useRouter()
  const [editing, setEditing] = useState<CustomerOrder | null | undefined>(undefined)
  const [deleting, setDeleting] = useState<OrderRow | null>(null)
  const [noting, setNoting] = useState<string | null | undefined>(undefined)
  const [doc, setDoc] = useState<string | null>(null)
  const [booking, setBooking] = useState<string | null>(null)
  const [delivering, setDelivering] = useState<string | null>(null)
  const [outputFor, setOutputFor] = useState<string | null>(null)
  const [view, setView] = useState<View>('journey')
  const [opened, setOpened] = useState<string | null>(null)
  const [showOver, setShowOver] = useState(false)

  const rows = useMemo(() => (workspace ? orderRows(workspace, today) : []), [workspace, today])
  const journeys = useMemo(
    () => new Map(workspace ? rows.map((r) => [r.order.id, orderJourney(workspace, r.order, today)]) : []),
    [workspace, rows, today],
  )

  if (!workspace) return null
  const ws = workspace
  const jof = (r: OrderRow) => journeys.get(r.order.id)!

  const act = (r: OrderRow, a: OrderAct) => {
    if (a.kind === 'job') update((w) => openJobForOrder(w, r.order.id, a.lineId, today)[0])
    else if (a.kind === 'card') router.push(`/production/jobs?card=${a.jobId}`)
    else if (a.kind === 'output') setOutputFor(a.jobId)
    else if (a.kind === 'dispatch') setNoting(r.order.id)
    else if (a.kind === 'book') setBooking(a.noteId)
    else if (a.kind === 'deliver') setDelivering(a.consignmentId)
  }
  const toggleCancel = (r: OrderRow) =>
    update((w) => (r.order.state === 'cancelled' ? reopenOrder(w, r.order.id) : cancelOrder(w, r.order.id)))

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
          {r.risk && <Risk r={r} />}
        </span>
      ),
      text: (r) => `${ORDER_WORD[r.status]}${r.risk ? ' · at risk' : ''}`,
    },
  }
  const kit = buildColumns<OrderRow>(ws, 'salesOrder', (r) => r.order.id, drawn)
  const open = rows.filter((r) => { const j = jof(r); return !j.done && !j.cancelled }).length

  return (
    <>
      <ListPage
        title="Sales orders" noun="sales order" rows={rows}
        search={(r) => `${r.order.no} ${r.customer?.name ?? ''} ${r.lines.map((l) => `${l.product?.name ?? ''} ${l.job?.no ?? ''}`).join(' ')} ${kit.searchText(r)}`}
        filter={{ label: 'Where it is', options: WHERE_OPTIONS, match: (r, pick) => matchesWhere(jof(r), pick) }}
        action={{ label: 'New sales order', onClick: () => setEditing(null) }}
        tools={<DeskTools entity="salesOrder" noun="sales order" title="Sales orders" rows={() => kit.toRows(rows)} />}
        empty={{
          line: 'No sales orders yet. A sales order is a customer, a promised day and what they want — and a line can name the job card it is made on, so a halt on the floor shows here as a promise at risk.',
          cta: 'New sales order',
        }}>
        {(shown) => (
          <>
            <Tabs label="How to show the sales orders" value={view} onChange={setView} items={[
              { id: 'journey', label: 'Journey', badge: <Count n={open} /> },
              { id: 'table', label: 'Table', badge: <Count n={rows.length} /> },
            ]} />
            {view === 'table' ? (
              <DataTable columns={kit.columns} rows={shown} keyOf={(r) => r.order.id}
                extra={{ icon: 'truck', label: (r) => (r.complete ? `${r.order.no} has all gone` : `Dispatch against ${r.order.no}`), onClick: (r) => setNoting(r.order.id) }}
                extra2={{
                  icon: 'undo',
                  label: (r) => (r.order.state === 'cancelled' ? `Reopen ${r.order.no}` : `Cancel ${r.order.no}`),
                  onClick: toggleCancel,
                }}
                onEdit={(r) => setEditing(r.order)}
                onDelete={(r) => setDeleting(r)}
                editLabel={(r) => `Edit ${r.order.no}`}
                deleteLabel={(r) => `Delete ${r.order.no}`} />
            ) : (
              <Board rows={shown} today={today} jof={jof} opened={opened} showOver={showOver}
                onShowOver={() => setShowOver((s) => !s)}
                row={(r, isOpen) => (
                  <OrderStrip key={r.order.id} r={r} j={jof(r)} open={isOpen}
                    onToggle={() => setOpened((o) => (o === r.order.id ? null : r.order.id))}
                    onAct={(a) => act(r, a)}
                    onDoc={setDoc}
                    onDispatch={() => setNoting(r.order.id)}
                    onEdit={() => setEditing(r.order)}
                    onCancel={() => toggleCancel(r)}
                    onDelete={() => setDeleting(r)}
                    onBook={setBooking}
                    onDeliver={setDelivering} />
                )} />
            )}
          </>
        )}
      </ListPage>

      <OrderForm order={editing} onClose={() => setEditing(undefined)} />
      <NoteForm orderId={noting} onClose={() => setNoting(undefined)} onRaised={setDoc} />
      <DeliveryDocument noteId={doc} onClose={() => setDoc(null)} />
      <BookCarrierDialog noteId={booking} onClose={() => setBooking(null)} />
      <DeliveredDialog consignmentId={delivering} onClose={() => setDelivering(null)} />
      <OutputForm open={outputFor !== null} preset={{ jobId: outputFor ?? undefined }} onClose={() => setOutputFor(null)} />
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

const Count = ({ n }: { n: number }) => (
  <span className="mono rounded-full bg-surface-3 px-1.5 text-[10.5px] font-normal text-ink-3">{n}</span>
)

function Risk({ r }: { r: OrderRow }) {
  if (!r.risk) return null
  return (
    <span className="max-w-[14rem] text-[11.5px] leading-snug text-warn" title={r.risk.reason}>
      At risk — {r.risk.jobNo} {r.risk.status === 'finishes_late' ? 'finishes after the promise' : WATCH_WORD[r.risk.status].toLowerCase()}
    </span>
  )
}

/**
 * The list in its groups: past the promise, due this week, later — and what
 * is over folded under one line. When nothing open is left in view (a search
 * for an old order, or the Delivered filter) the over ones are simply shown.
 */
function Board({ rows, today, jof, opened, showOver, onShowOver, row }: {
  rows: OrderRow[]
  today: string
  jof: (r: OrderRow) => OrderJourney
  opened: string | null
  showOver: boolean
  onShowOver: () => void
  row: (r: OrderRow, open: boolean) => React.ReactNode
}) {
  if (rows.length === 0) {
    return <p className="rounded-xl border border-line bg-surface px-6 py-10 text-center text-[13px] text-ink-3">No sales orders match.</p>
  }
  const b = orderBoard(rows, jof, today)
  const openCount = b.late.length + b.soon.length + b.later.length
  const delivered = b.over.filter((r) => jof(r).done).length
  const cancelled = b.over.length - delivered
  const overWords = [delivered > 0 && `${delivered} delivered`, cancelled > 0 && `${cancelled} cancelled`].filter(Boolean).join(' · ')
  const group = (key: string, title: string, list: OrderRow[]) => list.length > 0 && (
    <section key={key} data-group={key} className="space-y-2">
      <h3 className="flex items-center gap-2 px-1 pt-1 text-[11px] font-bold uppercase tracking-[0.07em] text-ink-3">
        {title}<Count n={list.length} />
      </h3>
      <ul className="space-y-2">{list.map((r) => row(r, opened === r.order.id))}</ul>
    </section>
  )
  return (
    <div className="space-y-3" data-order-board>
      {group('late', 'Past the promise', b.late)}
      {group('soon', 'Due this week', b.soon)}
      {group('later', 'Later', b.later)}
      {b.over.length > 0 && (openCount === 0
        ? group('over', cancelled > 0 && delivered > 0 ? 'Delivered and cancelled' : delivered > 0 ? 'Delivered' : 'Cancelled', b.over)
        : (
          <>
            <button type="button" onClick={onShowOver} data-fold aria-expanded={showOver}
              className="flex w-full items-center gap-3 px-1 pt-2 text-[12.5px] text-ink-3">
              <i className="flex-1 border-t border-line" />
              <span>{overWords} · <span className="font-semibold text-accent-ink underline underline-offset-2">{showOver ? 'hide them' : 'show them'}</span></span>
              <i className="flex-1 border-t border-line" />
            </button>
            {showOver && group('over', 'Over', b.over)}
          </>
        ))}
    </div>
  )
}

/** One order: a header line, its journey, and — opened — what they ordered and its papers. */
function OrderStrip({ r, j, open, onToggle, onAct, onDoc, onDispatch, onEdit, onCancel, onDelete, onBook, onDeliver }: {
  r: OrderRow
  j: OrderJourney
  open: boolean
  onToggle: () => void
  onAct: (a: OrderAct) => void
  onDoc: (noteId: string) => void
  onDispatch: () => void
  onEdit: () => void
  onCancel: () => void
  onDelete: () => void
  onBook: (noteId: string) => void
  onDeliver: (consignmentId: string) => void
}) {
  const { order } = r
  const what = j.lines.length === 1 ? `${num(j.qty, 0)} ${j.lines[0].product ?? 'pieces'}` : `${num(j.qty, 0)} pieces · ${j.lines.length} lines`
  const lastOn = j.steps[4].on
  const flag = j.cancelled ? { tone: 'neutral', text: 'Cancelled' }
    : j.late > 0 ? { tone: 'late', text: j.lateText! }
      : j.done ? { tone: 'good', text: `Delivered${lastOn ? ` ${shortDate(lastOn)}` : ''}` } : null
  const stop = (e: React.MouseEvent) => e.stopPropagation()
  const last = j.papers.at(-1)

  return (
    <li data-so={order.no} data-where={j.where}
      className={`rounded-[14px] border bg-surface ${open ? 'border-accent/40 shadow-[inset_0_0_0_1px_var(--accent-soft)]' : 'border-line'}`}>
      {/* the whole top of the row opens it; the chevron is the same, for a keyboard */}
      <div className="cursor-pointer px-3.5 pb-2 pt-3 sm:px-4" onClick={onToggle}>
        <div className="flex items-center gap-3">
          <div className="min-w-0 flex-1 sm:flex sm:flex-wrap sm:items-center sm:gap-x-3 sm:gap-y-1">
            <div className="flex min-w-0 items-baseline gap-2">
              <span className="mono whitespace-nowrap text-[13.5px] font-bold text-ink">{order.no}</span>
              <span className="truncate text-[13.5px] font-semibold text-ink">{r.customer?.name ?? 'Unknown customer'}</span>
            </div>
            <div className="truncate text-[12px] text-ink-3 sm:text-[12.5px]">
              <span className="sm:text-ink-2">{what}</span>
              <span className="hidden sm:inline"> · <span className="num">{money(j.value)}</span></span>
              <span> · promised <span className="num">{shortDate(order.promisedDate)}</span></span>
            </div>
            {flag && (
              <span data-flag={flag.tone} className={`hidden items-center gap-1 rounded-full px-2.5 py-0.5 text-[11.5px] font-bold sm:inline-flex ${
                flag.tone === 'late' ? 'bg-critical-soft text-critical' : flag.tone === 'good' ? 'bg-good-soft text-good' : 'bg-surface-2 text-ink-3'}`}>
                <Icon name={flag.tone === 'late' ? 'alert' : flag.tone === 'good' ? 'check' : 'close'} className="size-3" />
                {flag.text}
              </span>
            )}
            {r.risk && <span className="hidden sm:inline"><Risk r={r} /></span>}
          </div>
          <span className="sm:hidden"><JourneyDots journey={j} /></span>
          {j.act && (
            <button type="button" data-act={j.act.kind} onClick={(e) => { stop(e); onAct(j.act!) }}
              className="press hidden shrink-0 items-center gap-1.5 rounded-lg bg-accent-ink px-3 py-1.5 text-[12.5px] font-semibold text-on-accent hover:bg-accent sm:inline-flex">
              {j.act.label}<Icon name="arrow-right" className="size-3.5" />
            </button>
          )}
          <button type="button" onClick={(e) => { stop(e); onToggle() }} aria-expanded={open} data-open-so={order.no}
            title={open ? `Close ${order.no}` : `Open ${order.no}`}
            className="press -mr-1.5 shrink-0 rounded-md p-0.5 text-ink-3 hover:bg-surface-2 hover:text-ink sm:mr-0 sm:p-1">
            <Icon name="chevron" className={`size-4 transition-transform ${open ? 'rotate-90' : ''}`} />
            <span className="sr-only">{open ? 'Close' : 'Open'} {order.no}</span>
          </button>
        </div>
        {/* on a phone the dots stand in for the strip until the row is opened */}
        <JourneyStrip journey={j} label={order.no} small hideLate
          onDoc={(d) => { if (d.kind === 'note') onDoc(d.id) }}
          className={`mt-2.5 ${open ? '' : 'hidden sm:block'}`} />
      </div>

      {open && (
        <div data-so-open={order.no} className="grid gap-4 rounded-b-[14px] border-t border-line-soft bg-surface-2/60 px-3.5 py-3 sm:px-4 md:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
          <section className="min-w-0">
            <h4 className="mb-1.5 text-[10.5px] font-bold uppercase tracking-[0.07em] text-ink-3">What they ordered</h4>
            <div className="scroll-x overflow-x-auto">
              <table className="w-full border-collapse text-[12.5px]">
                <thead>
                  <tr className="border-b border-line text-left text-[11px] text-ink-3">
                    <th className="py-1.5 pr-2 font-semibold">Product</th>
                    <th className="px-2 py-1.5 text-right font-semibold">Qty</th>
                    <th className="px-2 py-1.5 text-right font-semibold">Rate</th>
                    <th className="px-2 py-1.5 text-right font-semibold">Made</th>
                    <th className="px-2 py-1.5 text-right font-semibold">Dispatched</th>
                    <th className="py-1.5 pl-2 text-right font-semibold">Still to go</th>
                  </tr>
                </thead>
                <tbody>
                  {j.lines.map((l) => (
                    <tr key={l.lineId} className="border-b border-line-soft last:border-0">
                      <td className="py-2 pr-2">
                        {l.product ?? 'Unknown product'}
                        {l.job && (
                          <Link href={`/production/jobs?card=${l.job.id}`} className="mono text-[11px] text-ink-3 hover:text-ink hover:underline">
                            {' '}· {l.job.no}
                          </Link>
                        )}
                      </td>
                      <td className="num px-2 py-2 text-right">{num(l.qty, 0)}</td>
                      <td className="num px-2 py-2 text-right">{money(l.rate)}</td>
                      <td className="num px-2 py-2 text-right">{l.made === null ? <span className="text-ink-4">—</span> : num(l.made, 0)}</td>
                      <td className="num px-2 py-2 text-right">{num(l.sent, 0)}</td>
                      <td className="num py-2 pl-2 text-right font-semibold">{num(l.still, 0)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {r.risk && <p className="mt-2 sm:hidden"><Risk r={r} /></p>}
          </section>

          <section className="min-w-0">
            <h4 className="mb-1.5 text-[10.5px] font-bold uppercase tracking-[0.07em] text-ink-3">Papers</h4>
            {j.papers.length === 0 ? (
              <p className="py-1.5 text-[12.5px] text-ink-3">Nothing dispatched yet.</p>
            ) : (
              <ul className="divide-y divide-line-soft text-[12.5px]">
                {j.papers.map((p) => (
                  <li key={p.note.id} data-paper={p.note.no} className="flex flex-wrap items-center gap-x-2 gap-y-1 py-1.5">
                    <button type="button" onClick={() => onDoc(p.note.id)} title={`Open ${p.note.no}`}
                      className="jr-doc text-[11.5px]">{p.note.no}</button>
                    <span className="num text-ink-2">{shortDate(p.note.on)}</span>
                    <span className="num">{num(p.qty, 0)}</span>
                    {p.carrier && <span className="text-ink-2">{p.carrier}{p.consignment?.lrNo ? ` · ${p.consignment.lrNo}` : ''}</span>}
                    {p.state === 'delivered' ? (
                      <span className="font-semibold text-good">
                        delivered {shortDate(p.consignment!.deliveredOn!)}{p.consignment?.confirmedBy ? <span className="font-normal text-ink-3"> · {p.consignment.confirmedBy}</span> : null}
                      </span>
                    ) : p.state === 'road' ? (
                      <>
                        <span className={p.late ? 'font-semibold text-critical' : 'text-ink-2'}>
                          on the road {p.days === 0 ? 'since today' : `${p.days} ${p.days === 1 ? 'day' : 'days'}`} · promised {shortDate(p.consignment!.promisedDate)}
                        </span>
                        <Quiet onClick={() => onDeliver(p.consignment!.id)}>Mark delivered</Quiet>
                      </>
                    ) : (
                      <>
                        <span className={p.late ? 'font-semibold text-critical' : 'text-ink-2'}>no carrier booked</span>
                        <Quiet onClick={() => onBook(p.note.id)}>Book the carrier</Quiet>
                      </>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </section>

          <div className="flex flex-wrap gap-1.5 md:col-span-2" data-so-actions>
            {j.act && (
              <button type="button" onClick={() => onAct(j.act!)}
                className="press inline-flex items-center gap-1.5 rounded-lg bg-accent-ink px-3 py-1.5 text-[12.5px] font-semibold text-on-accent hover:bg-accent sm:hidden">
                {j.act.label}<Icon name="arrow-right" className="size-3.5" />
              </button>
            )}
            {!j.cancelled && !r.complete && <Quiet onClick={onDispatch}>Dispatch against {order.no}</Quiet>}
            <Quiet onClick={onEdit}>Edit</Quiet>
            {last && <Quiet onClick={() => onDoc(last.note.id)}>Open {last.note.no}</Quiet>}
            <Quiet onClick={onCancel}>{j.cancelled ? `Reopen ${order.no}` : `Cancel ${order.no}`}</Quiet>
            <Quiet onClick={onDelete} danger>Delete</Quiet>
          </div>
        </div>
      )}
    </li>
  )
}

function Quiet({ onClick, danger = false, children }: { onClick: () => void; danger?: boolean; children: React.ReactNode }) {
  return (
    <button type="button" onClick={onClick}
      className={`press rounded-lg border border-line bg-surface px-2.5 py-1.5 text-[12.5px] font-medium hover:bg-surface-2 ${
        danger ? 'text-critical hover:bg-critical-soft' : 'text-ink'}`}>
      {children}
    </button>
  )
}
