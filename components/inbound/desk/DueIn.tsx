'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { ListPage } from '@/components/ui/ListPage'
import { StatePill } from '@/components/ui/DataTable'
import { Icon } from '@/components/ui/icons'
import { ReceiveForm } from '@/components/sourcing/ReceiveForm'
import { useWorkspace } from '@/components/workspace/store'
import { useApp } from '@/state/app-store'
import { num, shortDate } from '@/lib/domain/format'
import { boardLines, verdictText, type BoardLine } from '@/lib/workspace/board'
import { dueBackRows, type DueBack } from '@/lib/workspace/due'
import { isOpen } from '@/lib/workspace/receipts'
import type { PurchaseOrder } from '@/lib/workspace/types'
import { GrnDocument } from './GrnDocument'
import { InspectForm } from './InspectForm'
import { ReturnForm } from '@/components/inventory/desk/JobworkDialogs'

/**
 * What the gate should expect.
 *
 * Two kinds of lorry stop at the gate: an order a supplier is sending, and
 * material coming back from a jobworker. The gate does not change either —
 * changing an order is sourcing's, chasing a jobworker the store's — it needs
 * to know what is coming and when, and to say what came off the lorry when it
 * does. Each line has that one button, and it goes straight on to inspection.
 *
 * Orders are the inbound board: every line still to come at the quantity and
 * date the supplier CONFIRMED, against the day the line would stop without
 * it. Returns are what should still come back on each challan, at the yield
 * agreed, less what is back already.
 */
type DueRow =
  | { kind: 'order'; key: string; line: BoardLine }
  | { kind: 'back'; key: string; due: DueBack }

export function DueIn() {
  const { workspace, today } = useWorkspace()
  const router = useRouter()
  const [receiving, setReceiving] = useState<PurchaseOrder | null>(null)
  const [pending, setPending] = useState<string | null>(null)
  const [returning, setReturning] = useState<string | null>(null)
  const [returned, setReturned] = useState<string | null>(null)
  const [inspecting, setInspecting] = useState<string | null>(null)
  const [papering, setPapering] = useState<string | null>(null)

  // what just arrived goes straight on to its inspection
  useEffect(() => {
    if (!pending || !workspace) return
    const made = (workspace.receipts ?? [])
      .filter((r) => r.orderId === pending && isOpen(r))
      .sort((a, b) => b.id.localeCompare(a.id))[0]
    if (made) { setInspecting(made.id); setPending(null) }
  }, [pending, workspace])
  // and so does what came back from a jobworker
  useEffect(() => {
    if (!returned || !workspace) return
    const made = (workspace.receipts ?? [])
      .filter((r) => r.challanId === returned && isOpen(r))
      .sort((a, b) => b.id.localeCompare(a.id))[0]
    if (made) { setInspecting(made.id); setReturned(null) }
  }, [returned, workspace])

  if (!workspace) return null
  const ws = workspace
  const rows: DueRow[] = [
    ...boardLines(ws, today).map((line) => ({ kind: 'order' as const, key: line.order.id, line })),
    ...dueBackRows(ws, today).map((due) => ({ kind: 'back' as const, key: due.row.challan.id, due })),
  ]

  return (
    <>
      <ListPage
        title="Due in" noun="line" rows={rows}
        search={(r) => (r.kind === 'order'
          ? `${r.line.order.no} ${r.line.vendor?.name ?? ''} ${r.line.item?.name ?? ''}`
          : `${r.due.row.challan.no} ${r.due.row.vendor?.name ?? ''} ${r.due.row.item?.name ?? ''}`)}
        filter={{
          label: 'Everything due',
          options: [
            { value: 'order', label: 'From suppliers' },
            { value: 'back', label: 'Back from jobworkers' },
          ],
          of: (r) => r.kind,
        }}
        empty={{
          line: 'Nothing is due at the gate. A purchase order appears here once it has been handed over, a jobwork challan once material is out — each against the day it should land.',
          second: { label: 'Purchase orders', onClick: () => router.push('/sourcing/orders') },
        }}>
        {(shown) => {
          const lines = shown.flatMap((r) => (r.kind === 'order' ? [r.line] : []))
          const back = shown.flatMap((r) => (r.kind === 'back' ? [r.due] : []))
          return (
            <div className="space-y-7">
              {lines.length > 0 && (
                <section>
                  <Heading icon="truck" title="From suppliers" count={lines.length}
                    sub="At what the supplier confirmed, against the day the line would stop" />
                  <Board lines={lines} qcDays={ws.policy.inboundQcDays}
                    onArrived={(l) => setReceiving(l.order)} />
                </section>
              )}
              {back.length > 0 && (
                <section>
                  <Heading icon="factory" title="Back from jobworkers" count={back.length}
                    sub="What should still come back on each jobwork challan, at the yield agreed" />
                  <BackTable rows={back} onBack={setReturning} />
                </section>
              )}
            </div>
          )
        }}
      </ListPage>

      <ReceiveForm open={receiving !== null} order={receiving} onClose={() => setReceiving(null)}
        onArrived={(orderId) => setPending(orderId)} />
      <ReturnForm challanId={returning} onClose={() => setReturning(null)} onBooked={(id) => setReturned(id)} />
      <InspectForm receiptId={inspecting} onClose={() => setInspecting(null)}
        onClosed={(id) => setPapering(id)} />
      <GrnDocument open={papering !== null} receiptId={papering} onClose={() => setPapering(null)} />
    </>
  )
}

function Heading({ icon, title, count, sub }: {
  icon: 'truck' | 'factory'; title: string; count: number; sub: string
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

/** The same words Sent for jobwork uses for where a jobwork challan stands. */
function dueWord(d: DueBack): { label: string; tone: 'critical' | 'info' } {
  const late = d.row.late.value
  if (late > 0) return { label: `${late} day${late === 1 ? '' : 's'} overdue`, tone: 'critical' }
  const left = -late
  return { label: left === 0 ? 'Due back today' : `Due in ${left} day${left === 1 ? '' : 's'}`, tone: 'info' }
}

function BackTable({ rows, onBack }: { rows: DueBack[]; onBack: (challanId: string) => void }) {
  return (
    <div className="scroll-x relative overflow-x-auto rounded-xl border border-line bg-surface px-3 py-2">
      <table className="w-full min-w-[620px] border-collapse text-[12px]" data-due-back>
        <thead>
          <tr className="border-b border-line text-left text-[10px] font-semibold uppercase tracking-[0.06em] text-ink-3">
            <th className="py-1.5 pr-2 font-semibold">Jobwork challan</th>
            <th className="py-1.5 pr-2 font-semibold">Jobworker</th>
            <th className="w-full py-1.5 pr-2 font-semibold">Material</th>
            <th className="whitespace-nowrap py-1.5 pr-2 text-right font-semibold">Still to come</th>
            <th className="whitespace-nowrap py-1.5 pr-2 text-right font-semibold">Due back</th>
            <th className="py-1.5 text-right font-semibold"><span className="sr-only">Where it stands</span></th>
          </tr>
        </thead>
        <tbody className="divide-y divide-line-soft">
          {rows.map((d) => {
            const w = dueWord(d)
            const c = d.row.challan
            return (
              <tr key={c.id} data-due-back-row={c.no} className="hover:bg-surface-2">
                <td className="mono whitespace-nowrap py-2 pr-2 text-[11.5px] font-semibold">{c.no}</td>
                <td className="whitespace-nowrap py-2 pr-2">{d.row.vendor?.name ?? 'Unknown jobworker'}</td>
                <td className="max-w-[16rem] truncate py-2 pr-2" title={d.row.item?.name}>
                  {d.row.item?.name ?? 'Unknown material'}
                  {c.process && <span className="text-ink-3"> · {c.process}</span>}
                </td>
                <td className="mono whitespace-nowrap py-2 pr-2 text-right text-[11.5px]">{num(d.left, 3)} {d.row.uom}</td>
                <td className="mono whitespace-nowrap py-2 pr-2 text-right text-[11.5px]">{shortDate(c.dueBack)}</td>
                <td className="whitespace-nowrap py-2 text-right">
                  <span className="inline-flex items-center gap-1.5">
                    <StatePill label={w.label} tone={w.tone} />
                    <button type="button" onClick={() => onBack(c.id)}
                      title={`Say what came back on ${c.no}`}
                      className="press rounded-md border border-line bg-surface px-1.5 py-0.5 text-[11px] font-medium hover:bg-surface-2">
                      It came back
                    </button>
                  </span>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

/* ------------------------------------------------------- the inbound board -- */

const VERDICT_TONE: Record<BoardLine['verdict']['value'], string> = {
  in_time: 'text-good', tight: 'text-warn', late: 'text-critical', no_line: 'text-ink-3',
}

/**
 * Dates in dated columns, the word printed once in the heading; one small
 * lane per row for the comparison a timeline makes — does it land before the
 * line stops. The bar is the wait, the hatched tail the inspection, the red
 * tick the day the line stops. The verdict opens into its arithmetic.
 *
 * The one thing the gate does with a line is say it arrived. Hurrying a
 * supplier is sourcing's, on the order's own card.
 */
function Board({ lines, qcDays, onArrived }: {
  lines: BoardLine[]; qcDays: number; onArrived: (l: BoardLine) => void
}) {
  const { openInspect } = useApp()
  const { today } = useWorkspace()
  const days = (d: string) => Math.round((Date.parse(`${d}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86400000)
  const span = Math.max(14, ...lines.map((l) => Math.max(days(l.issuable), l.stops ? days(l.stops) : 0))) + 2
  const pct = (d: number) => `${Math.min(100, Math.max(0, (d / span) * 100))}%`
  return (
    <div className="rounded-xl border border-line bg-surface">
      <div className="relative overflow-x-auto px-3 py-2">
        <table className="w-full min-w-[680px] border-collapse text-[12px]" data-board>
          <thead>
            <tr className="border-b border-line text-left text-[10px] font-semibold uppercase tracking-[0.06em] text-ink-3">
              <th className="whitespace-nowrap py-1.5 pr-2 font-semibold">Order</th>
              <th className="w-full py-1.5 pr-2 font-semibold">On the supplier’s floor</th>
              <th className="w-28 py-1.5 pr-2 font-semibold">Timing</th>
              <th className="whitespace-nowrap py-1.5 pr-2 text-right font-semibold">Arrives</th>
              <th className="whitespace-nowrap py-1.5 pr-2 text-right font-semibold"
                title={`${qcDays} days of inbound inspection after it lands, before any of it can be issued`}>Issuable</th>
              <th className="whitespace-nowrap py-1.5 pr-2 text-right font-semibold">Line stops</th>
              <th className="whitespace-nowrap py-1.5 text-right font-semibold">Verdict</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line-soft">
            {lines.map((l) => {
              const a = days(l.arrives)
              const u = days(l.issuable)
              const bad = l.verdict.value === 'late' || l.verdict.value === 'tight'
              return (
                <tr key={l.order.id} data-board-row={l.order.no} className="hover:bg-surface-2">
                  <td className="whitespace-nowrap py-2 pr-2">
                    <span className="flex items-center gap-1.5">
                      <Icon name={l.shipped ? 'truck' : 'cart'}
                        className={`size-3.5 shrink-0 ${l.shipped ? 'text-accent-ink' : 'text-ink-3'}`} />
                      <span className="mono text-[11.5px] font-semibold">{l.order.no}</span>
                    </span>
                  </td>
                  <td className="max-w-[16rem] py-2 pr-2">
                    <span className="flex items-baseline gap-1.5">
                      <span className="min-w-0 truncate" title={l.item?.name}>{l.item?.name ?? 'Unknown material'}</span>
                      <span className={`mono shrink-0 text-[11px] ${l.inSync ? 'text-ink-3' : 'text-warn'}`}>
                        {num(l.qty, 3)} {l.uom}
                      </span>
                      {!l.inSync && (
                        <span className="shrink-0 text-warn"
                          title={`What they confirmed, not what you now want (${num(l.wantQty, 3)} ${l.uom})`}>
                          <Icon name="alert" className="size-3.5" />
                          <span className="sr-only">their confirmed quantity, not yours</span>
                        </span>
                      )}
                    </span>
                  </td>
                  <td className="py-2 pr-2">
                    <span className="relative block h-2.5 w-24 overflow-hidden rounded-full bg-surface-3"
                      title={`arrives ${shortDate(l.arrives)} · issuable ${shortDate(l.issuable)}${
                        l.stops ? ` · line stops ${shortDate(l.stops)}` : ''}`}>
                      <span className="anim-reveal absolute inset-y-0 left-0 rounded-l-full bg-accent"
                        style={{ width: pct(a) }} />
                      <span className="anim-reveal hatch absolute inset-y-0 rounded-r-full"
                        style={{ '--i': 3, '--hatch-c': 'var(--accent)', '--hatch-pitch': '4px', '--hatch-w': '1.5px',
                          left: pct(a), width: `${Math.max(0, ((u - a) / span) * 100)}%` } as React.CSSProperties} />
                      {l.stops && (
                        // ringed in the card's white, so it reads even over the orange wait
                        <span aria-hidden className="anim-tick absolute inset-y-0 w-[2px] bg-critical"
                          style={{ left: `min(${pct(days(l.stops))}, calc(100% - 3px))`,
                            boxShadow: '0 0 0 1.5px var(--surface)' }} />
                      )}
                    </span>
                  </td>
                  <td className="mono whitespace-nowrap py-2 pr-2 text-right text-[11.5px]">
                    {shortDate(l.arrives)}
                    {l.overdue && <span className="block text-[10px] text-critical">was due {shortDate(l.promised)}</span>}
                  </td>
                  <td className="mono whitespace-nowrap py-2 pr-2 text-right text-[11.5px] text-ink-3">{shortDate(l.issuable)}</td>
                  <td className="mono whitespace-nowrap py-2 pr-2 text-right text-[11.5px] text-critical">
                    {l.stops ? shortDate(l.stops) : <span className="text-ink-4">—</span>}
                  </td>
                  <td className="whitespace-nowrap py-2 text-right">
                    <span className="inline-flex items-center gap-1.5">
                      <button type="button" onClick={() => openInspect(l.verdict)} data-verdict={l.verdict.value}
                        title="How this is worked out"
                        className={`press inline-flex items-center gap-1 rounded-sm text-[11.5px] font-semibold underline decoration-dotted decoration-ink-3/40 underline-offset-[3px] ${VERDICT_TONE[l.verdict.value]}`}>
                        <Icon name={bad ? 'alert' : l.verdict.value === 'in_time' ? 'check' : 'info'} className="size-3.5" />
                        {verdictText(l)}
                      </button>
                      <button type="button" onClick={() => onArrived(l)}
                        title={`Say what came of ${l.item?.name ?? 'this line'} against ${l.order.no}`}
                        className="press rounded-md border border-line bg-surface px-1.5 py-0.5 text-[11px] font-medium hover:bg-surface-2">
                        Goods arrived
                      </button>
                    </span>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>

        <ul className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-[10.5px] text-ink-3">
          <li className="flex items-center gap-1.5">
            <span aria-hidden className="inline-block h-2 w-4 rounded-full bg-accent" />on its way
          </li>
          <li className="flex items-center gap-1.5">
            <span aria-hidden className="hatch inline-block h-2 w-4 rounded-full"
              style={{ '--hatch-c': 'var(--accent)', '--hatch-pitch': '4px', '--hatch-w': '1.5px' } as React.CSSProperties} />
            {qcDays} day{qcDays === 1 ? '' : 's'} of inspection before it can be issued
          </li>
          <li className="flex items-center gap-1.5">
            <span aria-hidden className="inline-block h-2.5 w-[2px] bg-critical" />the day the line stops
          </li>
          <li className="flex items-center gap-1.5">
            <Icon name="alert" className="size-3 text-warn" />their confirmed quantity, not yours
          </li>
        </ul>
      </div>
    </div>
  )
}
