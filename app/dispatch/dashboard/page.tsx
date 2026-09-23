'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Icon } from '@/components/ui/icons'
import { DeskOnly } from '@/components/sourcing/DeskOnly'
import { Queue, type Side } from '@/components/sourcing/Queue'
import { Tiles } from '@/components/sourcing/Tiles'
import { MetricPicker } from '@/components/sourcing/MetricPicker'
import { BookCarrierDialog, DeliveryDocument, NoteForm } from '@/components/dispatch/desk/NoteDialogs'
import { ChaseDialog, DeliveredDialog } from '@/components/dispatch/desk/ConsignmentDialogs'
import { ReceiveReturnDialog } from '@/components/dispatch/desk/ReturnDialogs'
import { useWorkspace } from '@/components/workspace/store'
import { onTheRoad } from '@/lib/workspace/consignments'
import { type Act, type Band, type Decision } from '@/lib/workspace/decisions'
import { dispatchDecisionsFor, noteDispatch } from '@/lib/workspace/dispatch-decisions'
import { pickedMetrics } from '@/lib/workspace/metrics'
import { openJobForOrder } from '@/lib/workspace/sales'

/**
 * The shipping bay's morning.
 *
 * On the left, the promises: which has passed, which the floor is about to
 * break, which is due with too little on the shelf, and which nobody is
 * making. On the right, what is on the road — every consignment nobody has
 * yet confirmed as delivered, under the carrier who has it.
 */
export default function Page() {
  return <DeskOnly><Dashboard /></DeskOnly>
}

const when = (d: number) => (d === 0 ? 'due today' : d === 1 ? 'tomorrow' : d > 0 ? `in ${d} days` : `${-d} day${d === -1 ? '' : 's'} late`)

function Dashboard() {
  const { workspace, update, today } = useWorkspace()
  const router = useRouter()
  const [picking, setPicking] = useState(false)
  const [opened, setOpened] = useState<Set<Band>>(new Set())
  const [noting, setNoting] = useState<string | null | undefined>(undefined)
  const [doc, setDoc] = useState<string | null>(null)
  const [booking, setBooking] = useState<string | null>(null)
  const [delivering, setDelivering] = useState<string | null>(null)
  const [chasing, setChasing] = useState<string | null>(null)
  const [receiving, setReceiving] = useState<string | null>(null)

  if (!workspace) return null
  const ws = workspace
  const queue = dispatchDecisionsFor(ws, today)
  const metrics = pickedMetrics(ws, today, 'dispatch')
  const road = onTheRoad(ws, today)
  const side: Side = {
    title: 'On the road',
    icon: 'truck',
    quiet: { title: 'Nothing on the road', line: 'A dispatch note booked with a carrier shows here until somebody confirms it was delivered.' },
    groups: road.map((g) => ({
      key: g.carrierId,
      label: g.carrier?.name ?? 'Unknown carrier',
      cards: g.rows.map((x) => ({
        key: x.row.consignment.id,
        title: x.row.note.no,
        detail: `${x.row.customer?.name ?? 'Customer'} · ${x.units} piece${x.units === 1 ? '' : 's'}`,
        foot: x.row.consignment.lrNo ? `docket ${x.row.consignment.lrNo}` : undefined,
        progress: x.progress,
        big: when(x.daysAway),
        small: x.row.consignment.promisedDate,
        flag: x.daysAway < 0 ? { text: 'not confirmed', tone: 'critical' as const } : undefined,
      })),
    })),
  }

  const act = (d: Decision, kind: Act) => {
    const { orderId, lineId, noteId, consignmentId } = d.refs
    if (kind === 'delivered' && consignmentId) { setDelivering(consignmentId); return }
    if (kind === 'chase' && consignmentId) { setChasing(consignmentId); return }
    if (kind === 'receive' && d.refs.rmaId) { setReceiving(d.refs.rmaId); return }
    if (kind === 'dispatch') { setNoting(orderId ?? null); return }
    if (kind === 'book' && noteId) { setBooking(noteId); return }
    if (kind === 'plan' && orderId && lineId) { update((w) => openJobForOrder(w, orderId, lineId, today)[0]); return }
    if (kind === 'keep') { update((w) => noteDispatch(w, d, today)); return }
    if (kind === 'open') router.push(d.href)
  }

  return (
    <div className="anim-page mx-auto w-full max-w-[72rem]">
      <header className="mb-5 flex flex-wrap items-center gap-x-4 gap-y-3">
        <h1 className="min-w-0 text-[26px] font-extrabold leading-none tracking-[-0.03em]">
          Dispatch
        </h1>
        <div className="ml-auto flex shrink-0 items-center gap-2">
          <button type="button" onClick={() => setPicking(true)}
            className="press inline-flex items-center gap-1.5 rounded-lg border border-line bg-surface px-3 py-2 text-[13px] font-medium hover:bg-surface-2">
            <Icon name="columns" className="size-3.5" />
            Figures
          </button>
          <button type="button" onClick={() => setNoting(null)}
            className="press inline-flex items-center gap-1.5 rounded-lg border border-accent-ink bg-accent-ink px-3.5 py-2 text-[13px] font-semibold text-on-accent hover:bg-accent">
            <Icon name="truck" className="size-3.5" />
            Raise a dispatch note
          </button>
        </div>
      </header>

      <Queue rows={queue} berths={[]} side={side} onAct={act} showAll={opened}
        onShowAll={(b) => setOpened((s) => new Set(s).add(b))}
        clear="Every open order is inside its promise, with what it needs made or being made." />

      {metrics.length > 0 && (
        <section className="mt-7">
          <h2 className="mb-2.5 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.07em] text-ink-3">
            <span aria-hidden className="h-px w-4 bg-line" />
            How the bay is doing
            <span aria-hidden className="h-px flex-1 bg-line" />
          </h2>
          <Tiles metrics={metrics} />
        </section>
      )}

      <MetricPicker open={picking} onClose={() => setPicking(false)} stage="dispatch" />
      <NoteForm orderId={noting} onClose={() => setNoting(undefined)} onRaised={setDoc} />
      <DeliveryDocument noteId={doc} onClose={() => setDoc(null)} />
      <BookCarrierDialog noteId={booking} onClose={() => setBooking(null)} />
      <DeliveredDialog consignmentId={delivering} onClose={() => setDelivering(null)} />
      <ChaseDialog consignmentId={chasing} onClose={() => setChasing(null)} />
      <ReceiveReturnDialog rmaId={receiving} onClose={() => setReceiving(null)} />
    </div>
  )
}
