'use client'
import { useEffect, useState } from 'react'
import { DeskOnly } from '@/components/sourcing/DeskOnly'
import { BandButton, BandChip, RecentList, StageDashboard, WaitingList } from '@/components/desk/StageDashboard'
import { InboundPictures, InboundStrip } from '@/components/desk/StagePictures'
import { MetricPicker } from '@/components/sourcing/MetricPicker'
import { ReceiveForm } from '@/components/sourcing/ReceiveForm'
import { GrnDocument } from '@/components/inbound/desk/GrnDocument'
import { InspectForm } from '@/components/inbound/desk/InspectForm'
import { isOpen } from '@/lib/workspace/receipts'
import { useWorkspace } from '@/components/workspace/store'
import { recentFor } from '@/lib/workspace/desk-pictures'
import { type Act, type Band, type Decision } from '@/lib/workspace/decisions'
import { inboundDecisionsFor } from '@/lib/workspace/inbound-decisions'
import { pickedMetrics } from '@/lib/workspace/metrics'
import type { PurchaseOrder } from '@/lib/workspace/types'

/**
 * The gate's morning, in the desk's frame (`StageDashboard`).
 *
 * Four pictures of the gate — what is waiting and for how long against the
 * inspection window, what lands on each of the next ten days, each delivery
 * against the day it was promised, and this month's accepted against rejected
 * — the last few receipts as cards, and on the right what is waiting on you.
 *
 * Nothing on this screen is also on the sourcing one. Chasing a late supplier,
 * and getting a change to an order confirmed, are sourcing's; saying what came
 * off the lorry is the gate's.
 */
export default function Page() {
  return <DeskOnly><Dashboard /></DeskOnly>
}

function Dashboard() {
  const { workspace, update, today } = useWorkspace()
  const [picking, setPicking] = useState(false)
  const [receiving, setReceiving] = useState<PurchaseOrder | null>(null)
  const [pending, setPending] = useState<string | null>(null)
  const [inspecting, setInspecting] = useState<string | null>(null)
  const [papering, setPapering] = useState<string | null>(null)
  const [opened, setOpened] = useState<Set<Band>>(new Set())

  // what just arrived goes straight on to its inspection
  useEffect(() => {
    if (!pending || !workspace) return
    const made = (workspace.receipts ?? [])
      .filter((r) => r.orderId === pending && isOpen(r))
      .sort((a, b) => b.id.localeCompare(a.id))[0]
    if (made) { setInspecting(made.id); setPending(null) }
  }, [pending, workspace])

  if (!workspace) return null
  const ws = workspace

  const queue = inboundDecisionsFor(ws, today)
  const metrics = pickedMetrics(ws, today, 'inbound')

  const act = (d: Decision, kind: Act) => {
    const { orderNo, receiptId } = d.refs
    if (kind === 'arrive' && orderNo) {
      // a receipt is a line's, so the form opens on the first line still to come
      const line = ws.orders.find((o) => o.no === orderNo && o.state !== 'delivered'
        && o.state !== 'cancelled')
      if (line) setReceiving(line)
      return
    }
    if (kind === 'inspect' && receiptId) {
      setInspecting(receiptId)
      return
    }
    if (kind === 'keep' && receiptId) {
      // "noted" on a rejection spike: a real answer, and it sticks
      update((w) => ({ ...w, drafts: { ...w.drafts, [`inbound.spikeNoted.${receiptId}`]: true } }))
      return
    }
  }

  const atGate = ws.receipts.filter(isOpen).length
  return (
    <>
      <StageDashboard stage="Inbound" icon="tray"
        chips={<>
          <BandChip alert={queue.length > 0}>{queue.length} need{queue.length === 1 ? 's' : ''} you</BandChip>
          {atGate > 0 ? <BandChip icon="tray">{atGate} at the gate</BandChip> : <BandChip icon="tray">nothing at the gate</BandChip>}
        </>}
        actions={<BandButton icon="columns" onClick={() => setPicking(true)}>Figures</BandButton>}
        metrics={metrics}
        pictures={<InboundPictures ws={ws} today={today} />}
        strip={<InboundStrip ws={ws} today={today} />}
        waiting={<WaitingList rows={queue} onAct={act} showAll={opened}
          onShowAll={(b) => setOpened((s) => new Set(s).add(b))}
          clear="Nothing at the gate, nothing waiting on inspection." />}
        recent={<RecentList title="Recent at the gate" items={recentFor(ws, 'inbound')} today={today} />} />

      <MetricPicker open={picking} onClose={() => setPicking(false)} stage="inbound" />
      <ReceiveForm open={receiving !== null} order={receiving} onClose={() => setReceiving(null)}
        onArrived={(orderId) => setPending(orderId)} />
      <InspectForm receiptId={inspecting} onClose={() => setInspecting(null)}
        onClosed={(id) => setPapering(id)} />
      <GrnDocument open={papering !== null} receiptId={papering} onClose={() => setPapering(null)} />
    </>
  )
}
