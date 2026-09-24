'use client'
import { StatePill, type PillTone } from '@/components/ui/DataTable'
import { Icon } from '@/components/ui/icons'
import { money, num, shortDate } from '@/lib/domain/format'
import type { SyncState } from '@/lib/domain/inbound'
import { verdictText, type BoardLine } from '@/lib/workspace/board'
import { SYNC_WORDS, type SyncLine, type SyncOrder } from '@/lib/workspace/orders'
import { AckImage } from './AckDialog'

/**
 * An order once its supplier has it: what each side is working to.
 *
 * From the moment somebody changes a handed-over order until the supplier
 * confirms the change there are two quantities — what we now want, and what
 * they are making — and this says which of three places the order is in:
 * changed and the supplier not told; told, and awaiting their confirmation;
 * or in sync. Every change is a version, every version is here, and the
 * confirmation is kept against what it was — a reference in words, a picture
 * of the reply, or both.
 *
 * It sits on the order's own card on Purchase orders. It used to be a second
 * screen at the gate, which listed the same orders again; changing an order
 * and hearing back from the supplier are the buyer's, so the order keeps one
 * home from draft to the last confirmation.
 */
export const SYNC_TONE: Record<SyncState, PillTone> = {
  not_told: 'critical', awaiting_ack: 'warn', acknowledged: 'good',
}
const FILL: Record<SyncState, string> = {
  not_told: 'bg-critical-soft', awaiting_ack: 'bg-warn-soft', acknowledged: 'bg-surface-2',
}

export function SyncPill({ state }: { state: SyncState }) {
  return <StatePill label={SYNC_WORDS[state]} tone={SYNC_TONE[state]} />
}

export function OrderSyncBlock({ o, board, onRevise, onSend, onAck, onRemoveImage, onHurry }: {
  o: SyncOrder
  /** this order's lines on the inbound board, for whether each lands in time */
  board: BoardLine[]
  onRevise: (orderId: string) => void
  onSend: () => void
  onAck: () => void
  onRemoveImage: (id: string) => void
  onHurry: (l: BoardLine) => void
}) {
  const moving = o.lines.filter((l) => l.state !== 'acknowledged')
  const days = moving.length ? Math.max(...moving.map((l) => l.awaiting.value)) : 0
  const late = moving.some((l) => l.chaseOverdue)
  return (
    <section data-sync={o.state} aria-label={`What ${o.vendor?.name ?? 'the supplier'} is making`}
      className={`mt-3 rounded-lg px-3 py-2.5 ${FILL[o.state]}`}>
      <ul className="space-y-2.5">
        {o.lines.map((l) => (
          <LineRow key={l.order.id} l={l} pencil={o.lines.length > 1}
            board={board.find((b) => b.order.id === l.order.id)}
            onRevise={() => onRevise(l.order.id)} onHurry={onHurry} />
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
    </section>
  )
}

/**
 * One line: what we need and what they are making, large and side by side,
 * the date they are working to, and — when it will not be here in time — how
 * late, with a way to ask them to hurry the order already placed.
 */
function LineRow({ l, board, onRevise, onHurry, pencil }: {
  l: SyncLine
  board?: BoardLine
  onRevise: () => void
  onHurry: (b: BoardLine) => void
  pencil: boolean
}) {
  const differs = l.need.value !== l.making.value
  const cur = l.sync.revisions[l.sync.revisions.length - 1]
  const bad = board && (board.verdict.value === 'late' || board.verdict.value === 'tight')
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
      {bad && (
        <p className="mt-1.5 flex flex-wrap items-center gap-2 text-[11.5px]" data-lands={board.verdict.value}>
          <span className={`inline-flex items-center gap-1 font-semibold ${
            board.verdict.value === 'late' ? 'text-critical' : 'text-warn'}`}>
            <Icon name="alert" className="size-3.5" />
            {board.verdict.value === 'late'
              ? `lands ${verdictText(board)} — the line stops ${shortDate(board.stops!)}`
              : `tight — cannot be issued before the line stops ${shortDate(board.stops!)}`}
          </span>
          <button type="button" onClick={() => onHurry(board)}
            className="press rounded-md border border-line bg-surface px-2 py-0.5 text-[11.5px] font-medium hover:bg-surface-2">
            Hurry
          </button>
        </p>
      )}
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
