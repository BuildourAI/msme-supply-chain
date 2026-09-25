'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { DeskOnly } from '@/components/sourcing/DeskOnly'
import { BandButton, BandChip, RecentList, StageDashboard, WaitingList } from '@/components/desk/StageDashboard'
import { DispatchPictures, DispatchStrip } from '@/components/desk/StagePictures'
import { MetricPicker } from '@/components/sourcing/MetricPicker'
import { BookCarrierDialog, DeliveryDocument, NoteForm } from '@/components/dispatch/desk/NoteDialogs'
import { ChaseDialog, DeliveredDialog } from '@/components/dispatch/desk/ConsignmentDialogs'
import { ReceiveReturnDialog } from '@/components/dispatch/desk/ReturnDialogs'
import { useWorkspace } from '@/components/workspace/store'
import { recentFor } from '@/lib/workspace/desk-pictures'
import { compact, moneyOf } from '@/lib/workspace/executive'
import { type Act, type Band, type Decision } from '@/lib/workspace/decisions'
import { dispatchDecisionsFor, noteDispatch } from '@/lib/workspace/dispatch-decisions'
import { pickedMetrics } from '@/lib/workspace/metrics'
import { openJobForOrder } from '@/lib/workspace/sales'

/**
 * The shipping bay's morning, in the desk's frame (`StageDashboard`).
 *
 * Four pictures of the bay — every open sales order on its promise date, what
 * is on the road and how far along, each customer's deliveries on time and in
 * full, and what is on the shelf against what is promised — the open orders as
 * cards, and on the right what is waiting on you: which promise has passed,
 * which the floor is about to break, which is due with too little made.
 */
export default function Page() {
  return <DeskOnly><Dashboard /></DeskOnly>
}


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

  const book = moneyOf(ws, today).orderBook
  return (
    <>
      <StageDashboard stage="Dispatch" icon="truck"
        chips={<>
          <BandChip alert={queue.length > 0}>{queue.length} need{queue.length === 1 ? 's' : ''} you</BandChip>
          {book > 0 && <BandChip icon="doc">{compact(book)} to send</BandChip>}
        </>}
        actions={<>
          <BandButton icon="columns" onClick={() => setPicking(true)}>Figures</BandButton>
          <BandButton icon="truck" primary onClick={() => setNoting(null)}>Raise a delivery challan</BandButton>
        </>}
        metrics={metrics}
        pictures={<DispatchPictures ws={ws} today={today} />}
        strip={<DispatchStrip ws={ws} today={today} />}
        waiting={<WaitingList rows={queue} onAct={act} showAll={opened}
          onShowAll={(b) => setOpened((s) => new Set(s).add(b))}
          clear="Every open order is inside its promise, with what it needs made or being made." />}
        recent={<RecentList title="Recent in dispatch" items={recentFor(ws, 'dispatch')} today={today} />} />

      <MetricPicker open={picking} onClose={() => setPicking(false)} stage="dispatch" />
      <NoteForm orderId={noting} onClose={() => setNoting(undefined)} onRaised={setDoc} />
      <DeliveryDocument noteId={doc} onClose={() => setDoc(null)} />
      <BookCarrierDialog noteId={booking} onClose={() => setBooking(null)} />
      <DeliveredDialog consignmentId={delivering} onClose={() => setDelivering(null)} />
      <ChaseDialog consignmentId={chasing} onClose={() => setChasing(null)} />
      <ReceiveReturnDialog rmaId={receiving} onClose={() => setReceiving(null)} />
    </>
  )
}
