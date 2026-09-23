'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { ListPage } from '@/components/ui/ListPage'
import { StatePill, type PillTone } from '@/components/ui/DataTable'
import { Icon } from '@/components/ui/icons'
import { PoDocument } from '@/components/sourcing/PoDocument'
import { useAuth } from '@/components/workspace/auth'
import { useWorkspace } from '@/components/workspace/store'
import { useApp } from '@/state/app-store'
import { dropFile } from '@/lib/intake/blobs'
import { mirrorRemove } from '@/lib/intake/mirror'
import { money, num, shortDate } from '@/lib/domain/format'
import type { SyncState } from '@/lib/domain/inbound'
import { boardLines, verdictText, type BoardLine } from '@/lib/workspace/board'
import { SYNC_WORDS, syncOrders, type SyncLine, type SyncOrder } from '@/lib/workspace/orders'
import { AckDialog, AckImage, ackPath } from './AckDialog'
import { ExpediteDialog } from './ChaseDialog'
import { ReviseDialog } from './ReviseDialog'

/**
 * Open orders: what each supplier has been told, and whether it lands in time.
 *
 * Two parts, as the sample company's INB-02 has them.
 *
 * The first is the sync. Once an order is with its supplier there are two
 * quantities — what we now want, and what they are making — and they differ
 * from the moment somebody changes the order until the supplier confirms the
 * change. Each order is a card that says which of three places it is in:
 * changed and the supplier not told; told, and awaiting their confirmation;
 * or in sync. Every change is a version, every version is on the card, and
 * the confirmation is kept against what it was — a reference in words, a
 * picture of the reply, or both.
 *
 * The second is the inbound board: every line still to come, at the quantity
 * and date the supplier CONFIRMED, against the day the line would stop without
 * it. A change they have not seen moves nothing on the board, because it
 * moves nothing on the lorry.
 */
const TONE: Record<SyncState, PillTone> = {
  not_told: 'critical', awaiting_ack: 'warn', acknowledged: 'good',
}
const FILL: Record<SyncState, string> = {
  not_told: 'bg-critical-soft', awaiting_ack: 'bg-warn-soft', acknowledged: 'bg-surface-2',
}

export function Orders() {
  const { workspace, update, today } = useWorkspace()
  const { account } = useAuth()
  const router = useRouter()
  const [revising, setRevising] = useState<string | null>(null)
  const [papering, setPapering] = useState<string | null>(null)
  const [acking, setAcking] = useState<string | null>(null)
  const [chasing, setChasing] = useState<BoardLine | null>(null)

  if (!workspace) return null
  const ws = workspace
  const orders = syncOrders(ws, today)
  const board = boardLines(ws, today)
  const count = (s: SyncState) => orders.filter((o) => o.state === s).length
  const exposure = orders.reduce((a, o) => a + o.exposure, 0)

  const removeImage = (no: string, id: string) => {
    update((w) => ({
      ...w,
      orders: w.orders.map((o) => (o.no === no && o.ackImageId === id ? { ...o, ackImageId: undefined } : o)),
    }))
    void dropFile(id)
    if (account) void mirrorRemove(ackPath(account.id, ws.id, id))
  }

  return (
    <>
      <ListPage
        title="Open orders" noun="order" rows={orders}
        search={(o) => `${o.no} ${o.vendor?.name ?? ''} ${o.lines.map((l) => l.item?.name ?? '').join(' ')}`}
        filter={{
          label: 'Every state',
          options: (['not_told', 'awaiting_ack', 'acknowledged'] as SyncState[])
            .map((s) => ({ value: s, label: SYNC_WORDS[s] })),
          of: (o) => o.state,
        }}
        empty={{
          line: 'Nothing is out with a supplier. An order appears here once it has been handed over — then every change to it, whether the supplier has confirmed it, and when it lands against the day the line would stop.',
          second: { label: 'Purchase orders', onClick: () => router.push('/sourcing/orders') },
        }}>
        {(shown) => {
          const nos = new Set(shown.map((o) => o.no))
          const lines = board.filter((l) => nos.has(l.order.no))
          return (
            <div className="space-y-7">
              <section>
                <Heading icon="cart" title="Where each order stands" count={shown.length}
                  sub={exposure > 0
                    ? `${money(exposure)} riding on changes a supplier has not confirmed`
                    : 'Every supplier is making what you asked for'} />
                <ul className="mb-3 flex flex-wrap gap-1.5 text-[11.5px]" aria-label="How many are where">
                  <Chip tone="critical" n={count('not_told')} label={SYNC_WORDS.not_told} />
                  <Chip tone="warn" n={count('awaiting_ack')} label={SYNC_WORDS.awaiting_ack} />
                  <Chip tone="good" n={count('acknowledged')} label={SYNC_WORDS.acknowledged} />
                </ul>
                <ul className="grid items-start gap-3 md:grid-cols-2">
                  {shown.map((o, i) => (
                    <OrderCard key={o.no} o={o} i={i}
                      onRevise={setRevising}
                      onSend={() => setPapering(o.no)}
                      onAck={() => setAcking(o.no)}
                      onRemoveImage={(id) => removeImage(o.no, id)} />
                  ))}
                </ul>
              </section>

              {lines.length > 0 && (
                <section>
                  <Heading icon="truck" title="Inbound board" count={lines.length}
                    sub="Everything still to come, at what the supplier confirmed, against the day the line would stop" />
                  <Board lines={lines} qcDays={ws.policy.inboundQcDays} onChase={setChasing} />
                </section>
              )}
            </div>
          )
        }}
      </ListPage>

      <ReviseDialog orderId={revising} onClose={() => setRevising(null)} />
      <PoDocument open={papering !== null} no={papering} onClose={() => setPapering(null)} />
      <AckDialog no={acking} onClose={() => setAcking(null)} />
      <ExpediteDialog line={chasing} onClose={() => setChasing(null)} />
    </>
  )
}

function Heading({ icon, title, count, sub }: {
  icon: 'cart' | 'truck'; title: string; count: number; sub: string
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

function Chip({ tone, n, label }: { tone: 'critical' | 'warn' | 'good'; n: number; label: string }) {
  const skin = n === 0 ? 'border-line text-ink-3'
    : tone === 'critical' ? 'border-critical/40 bg-critical-soft text-ink-2'
      : tone === 'warn' ? 'border-warn/40 bg-warn-soft text-ink-2'
        : 'border-good/40 bg-good-soft text-ink-2'
  return (
    <li className={`rounded-full border px-2 py-0.5 ${skin}`}>
      <span className="num font-semibold">{n}</span> {label}
    </li>
  )
}

/**
 * One order, as its supplier holds it.
 *
 * The two quantities are the point of the card — what we need, what they are
 * making — so they stay large and side by side, one pair per line. Under them
 * the versions as chips, coloured by how far each got: confirmed, sent, or
 * never sent. Then whatever the supplier confirmed with, words and picture.
 */
function OrderCard({ o, i, onRevise, onSend, onAck, onRemoveImage }: {
  o: SyncOrder
  i: number
  onRevise: (orderId: string) => void
  onSend: () => void
  onAck: () => void
  onRemoveImage: (id: string) => void
}) {
  const moving = o.lines.filter((l) => l.state !== 'acknowledged')
  const days = moving.length ? Math.max(...moving.map((l) => l.awaiting.value)) : 0
  const late = moving.some((l) => l.chaseOverdue)
  return (
    <li style={{ '--i': i } as React.CSSProperties} data-order={o.no}
      className={`anim-fade-up rounded-xl px-3.5 py-3 ${FILL[o.state]}`}>
      <div className="flex items-start gap-3">
        <span aria-hidden className="grid size-9 shrink-0 place-items-center rounded-full bg-surface text-ink-2">
          <Icon name={o.shipped ? 'truck' : 'cart'} className="size-4" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="mono block text-[13.5px] font-bold">{o.no}</span>
          <span className="block truncate text-[11.5px] text-ink-2">
            {o.vendor?.name ?? 'Unknown supplier'}
            {o.lines.length > 1 && <> · {o.lines.length} lines</>}
            {o.shipped && <> · on its way</>}
          </span>
        </span>
        <StatePill label={SYNC_WORDS[o.state]} tone={TONE[o.state]} />
      </div>

      <ul className="mt-2.5 space-y-2.5">
        {o.lines.map((l) => (
          <LineRow key={l.order.id} l={l} pencil={o.lines.length > 1} onRevise={() => onRevise(l.order.id)} />
        ))}
      </ul>

      {(o.exposure > 0 || o.state === 'awaiting_ack') && (
        <p className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11.5px] text-ink-2">
          {o.exposure > 0 && (
            <span><strong className="num text-ink">{money(o.exposure)}</strong> riding on the change</span>
          )}
          {o.state === 'awaiting_ack' && (
            <span className={late ? 'font-semibold text-critical' : ''}>
              <Icon name="clock" className="mr-1 inline size-3.5 align-[-2px]" />
              sent {days === 0 ? 'today' : `${days} day${days === 1 ? '' : 's'} ago`}, no confirmation
              {late && ' — past the days you allow'}
            </span>
          )}
        </p>
      )}

      {/* what the supplier confirmed with — the placeholder the owner fills */}
      <div className="mt-2.5 flex items-center gap-2.5 rounded-lg bg-surface/70 px-2.5 py-2">
        {o.ackImageId
          ? <AckImage id={o.ackImageId} onRemove={() => onRemoveImage(o.ackImageId!)} />
          : (
            <button type="button" onClick={onAck} title="Add a picture of their confirmation"
              className="press grid size-12 shrink-0 place-items-center rounded-md border border-dashed border-line text-ink-4 hover:text-ink-2">
              <Icon name="camera" className="size-4" />
              <span className="sr-only">Add a picture of their confirmation</span>
            </button>
          )}
        <span className="min-w-0 flex-1 text-[11.5px] leading-snug">
          <span className="block text-ink-3">
            {o.ackedOn ? `Confirmed ${shortDate(o.ackedOn)}` : 'Not confirmed yet'}
          </span>
          <span className="block truncate text-ink-2" data-ack-ref>
            {o.ackRef ? `“${o.ackRef}”` : 'Add what they said, or a picture of it'}
          </span>
        </span>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        {o.state === 'not_told' && (
          <Primary onClick={onSend}>Send the change</Primary>
        )}
        {o.state === 'awaiting_ack' && (
          <>
            <Primary onClick={onAck}>They confirmed</Primary>
            <Quiet onClick={onSend}>Send it again</Quiet>
          </>
        )}
        {o.state === 'acknowledged' && (
          <Quiet onClick={onAck}>{o.ackImageId ? 'Replace their confirmation' : 'Add their confirmation'}</Quiet>
        )}
        {o.lines.length === 1 && (
          <Quiet onClick={() => onRevise(o.lines[0].order.id)}>Change</Quiet>
        )}
      </div>
    </li>
  )
}

function LineRow({ l, onRevise, pencil }: { l: SyncLine; onRevise: () => void; pencil: boolean }) {
  const differs = l.need.value !== l.making.value
  const cur = l.sync.revisions[l.sync.revisions.length - 1]
  return (
    <li>
      <div className="flex items-center gap-2">
        <span className="min-w-0 flex-1 truncate text-[12.5px] font-semibold">{l.item?.name ?? 'Unknown material'}</span>
        {l.whipsawed && (
          <span title={`Changed ${l.churn.value} times in 30 days`}
            className="rounded-full border border-warn/40 bg-warn-soft px-1.5 py-px text-[10.5px] text-ink-2">
            {l.churn.value}× in 30 days
          </span>
        )}
        {pencil && (
          <button type="button" onClick={onRevise} title={`Change ${l.item?.name ?? 'this line'}`}
            className="press rounded-md p-1 text-ink-4 hover:bg-surface hover:text-ink-2">
            <Icon name="pencil" className="size-3.5" />
            <span className="sr-only">Change {l.item?.name ?? 'this line'}</span>
          </button>
        )}
      </div>
      <div className="mt-1 flex items-end gap-2.5">
        <Figure label="What we need">
          <span className="num text-[17px] font-bold leading-none">{num(l.need.value, 3)}</span>
          <span className="ml-1 text-[11px] text-ink-3">{l.uom}</span>
        </Figure>
        <Icon name="arrow-right" className="mb-0.5 size-3.5 shrink-0 text-ink-4" />
        <Figure label="What they are making">
          <span className={`num text-[17px] font-bold leading-none ${differs ? 'text-warn' : ''}`}>
            {num(l.making.value, 3)}
          </span>
          <span className="ml-1 text-[11px] text-ink-3">{l.uom}</span>
        </Figure>
        <span className="mono ml-auto pb-0.5 text-[10.5px] text-ink-3">by {shortDate(cur.promisedDate)}</span>
      </div>
      <Versions l={l} />
    </li>
  )
}

function Figure({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <p className="text-[10px] font-semibold uppercase tracking-[0.06em] text-ink-3">{label}</p>
      <p className="mt-1 whitespace-nowrap">{children}</p>
    </div>
  )
}

/**
 * Every version the line has been through, as chips: green where the
 * supplier confirmed it, amber where it was sent and not confirmed, red where
 * it was never sent. The reason is on each chip, and in the fold beneath.
 */
function Versions({ l }: { l: SyncLine }) {
  const s = l.sync
  const tone = (v: number) => (v <= s.ackedVersion ? 'confirmed' : v <= s.notifiedVersion ? 'sent' : 'never sent')
  const skin: Record<string, string> = {
    confirmed: 'border-good/40 bg-good-soft',
    sent: 'border-warn/40 bg-warn-soft',
    'never sent': 'border-critical/40 bg-critical-soft',
  }
  return (
    <details className="group mt-1.5">
      <summary className="flex cursor-pointer list-none flex-wrap items-center gap-1 [&::-webkit-details-marker]:hidden">
        {s.revisions.map((r) => (
          <span key={r.version} data-version={r.version} data-version-state={tone(r.version)}
            title={`v${r.version} · ${num(r.qty, 3)} ${l.uom} by ${r.promisedDate} · ${tone(r.version)} — “${r.reason}”`}
            className={`mono rounded-md border px-1.5 py-px text-[10.5px] font-semibold text-ink-2 ${skin[tone(r.version)]}`}>
            v{r.version}
          </span>
        ))}
        <span className="ml-1 text-[11px] text-ink-3 group-open:hidden">history</span>
      </summary>
      <ol className="mt-1.5 space-y-1 border-l-2 border-line pl-3">
        {s.revisions.map((r) => (
          <li key={r.version} className="text-[11.5px]">
            <span className="mono font-semibold">v{r.version}</span>{' '}
            <span className="num">{num(r.qty, 3)} {l.uom}</span>{' '}
            <span className="text-ink-3">by {shortDate(r.promisedDate)} · {shortDate(r.changedOn)} · {r.changedBy}</span>
            <span className={`ml-1.5 ${tone(r.version) === 'confirmed' ? 'text-good'
              : tone(r.version) === 'sent' ? 'text-warn' : 'text-critical'}`}>{tone(r.version)}</span>
            <span className="block italic text-ink-3">“{r.reason}”</span>
          </li>
        ))}
      </ol>
    </details>
  )
}

function Primary({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  return (
    <button type="button" onClick={onClick}
      className="press rounded-lg border border-accent-ink bg-accent-ink px-3 py-1.5 text-[12.5px] font-semibold text-on-accent hover:bg-accent">
      {children}
    </button>
  )
}
function Quiet({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  return (
    <button type="button" onClick={onClick}
      className="press rounded-lg border border-line bg-surface px-3 py-1.5 text-[12.5px] font-medium hover:bg-surface-2">
      {children}
    </button>
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
 */
function Board({ lines, qcDays, onChase }: {
  lines: BoardLine[]; qcDays: number; onChase: (l: BoardLine) => void
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
                      {bad && (
                        <button type="button" onClick={() => onChase(l)}
                          className="press rounded-md border border-line bg-surface px-1.5 py-0.5 text-[11px] font-medium hover:bg-surface-2">
                          Hurry
                        </button>
                      )}
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
