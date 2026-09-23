'use client'
import { useEffect, useState } from 'react'
import { Icon } from '@/components/ui/icons'
import { DeskOnly } from '@/components/sourcing/DeskOnly'
import { Queue } from '@/components/sourcing/Queue'
import { Tiles } from '@/components/sourcing/Tiles'
import { MetricPicker } from '@/components/sourcing/MetricPicker'
import { ReceiveForm } from '@/components/sourcing/ReceiveForm'
import { GrnDocument } from '@/components/inbound/desk/GrnDocument'
import { InspectForm } from '@/components/inbound/desk/InspectForm'
import { AckDialog } from '@/components/inbound/desk/AckDialog'
import { ChaseDialog, ExpediteDialog } from '@/components/inbound/desk/ChaseDialog'
import { CloseChallanDialog, ReturnForm } from '@/components/inbound/desk/JobworkDialogs'
import { challanRows, type ChallanRow } from '@/lib/workspace/inbound'
import { PoDocument } from '@/components/sourcing/PoDocument'
import { boardLines, type BoardLine } from '@/lib/workspace/board'
import { isOpen } from '@/lib/workspace/receipts'
import { useWorkspace } from '@/components/workspace/store'
import { type Act, type Band, type Decision } from '@/lib/workspace/decisions'
import { inFlight } from '@/lib/workspace/flight'
import { inboundDecisionsFor } from '@/lib/workspace/inbound-decisions'
import { pickedMetrics } from '@/lib/workspace/metrics'
import type { PurchaseOrder } from '@/lib/workspace/types'

/**
 * The gate's morning.
 *
 * The same two columns as the sourcing dashboard, because the question is the
 * same shape: what is waiting on you, and what is on its way. The right-hand
 * column is literally the same list — orders out with suppliers, soonest first
 * — because that is exactly what the gate is waiting for. The left is the
 * gate's own work: goods due, receipts waiting on inspection, changes a
 * supplier has not confirmed, material out at a jobworker past its date.
 *
 * Nothing on this screen is also on the sourcing one. Chasing a late supplier
 * is sourcing's; saying what came off the lorry is the gate's.
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
  const [noticing, setNoticing] = useState<string | null>(null)
  const [acking, setAcking] = useState<string | null>(null)
  const [chasing, setChasing] = useState<BoardLine | null>(null)
  const [chasingChallan, setChasingChallan] = useState<ChallanRow | null>(null)
  const [returning, setReturning] = useState<string | null>(null)
  const [returned, setReturned] = useState<string | null>(null)
  const [closing, setClosing] = useState<string | null>(null)

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

  const queue = inboundDecisionsFor(ws, today)
  const berths = inFlight(ws, today)
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
    if (kind === 'keep' && d.kind === 'churn' && d.refs.orderId) {
      // noted until the line moves again — the key carries how many versions it had
      const o = ws.orders.find((x) => x.id === d.refs.orderId)
      const key = `inbound.churnNoted.${d.refs.orderId}.${o?.revisions?.length ?? 0}`
      update((w) => ({ ...w, drafts: { ...w.drafts, [key]: true } }))
      return
    }
    // the revised order IS the change notice: the same document, sent again
    if (kind === 'notice' && orderNo) { setNoticing(orderNo); return }
    if (kind === 'ack' && orderNo) { setAcking(orderNo); return }
    if (kind === 'chase' && d.refs.orderId) {
      const line = boardLines(ws, today).find((l) => l.order.id === d.refs.orderId)
      if (line) setChasing(line)
      return
    }
    const { challanId } = d.refs
    if (kind === 'chase' && challanId) {
      const row = challanRows(ws, today).find((r) => r.challan.id === challanId)
      if (row) setChasingChallan(row)
      return
    }
    if (kind === 'return' && challanId) { setReturning(challanId); return }
    if (kind === 'close-challan' && challanId) setClosing(challanId)
  }

  return (
    <div className="anim-page mx-auto w-full max-w-[72rem]">
      <header className="mb-5 flex flex-wrap items-center gap-x-4 gap-y-3">
        <h1 className="min-w-0 text-[26px] font-extrabold leading-none tracking-[-0.03em]">
          Inbound
        </h1>
        <div className="ml-auto flex shrink-0 items-center gap-2">
          <button type="button" onClick={() => setPicking(true)}
            className="press inline-flex items-center gap-1.5 rounded-lg border border-line bg-surface px-3 py-2 text-[13px] font-medium hover:bg-surface-2">
            <Icon name="columns" className="size-3.5" />
            Figures
          </button>
        </div>
      </header>

      <Queue rows={queue} berths={berths} onAct={act} showAll={opened}
        onShowAll={(b) => setOpened((s) => new Set(s).add(b))}
        clear="Nothing at the gate, nothing unconfirmed, nothing overdue at a jobworker." />

      {metrics.length > 0 && (
        <section className="mt-7">
          <h2 className="mb-2.5 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.07em] text-ink-3">
            <span aria-hidden className="h-px w-4 bg-line" />
            How the gate is doing
            <span aria-hidden className="h-px flex-1 bg-line" />
          </h2>
          <Tiles metrics={metrics} />
        </section>
      )}

      <MetricPicker open={picking} onClose={() => setPicking(false)} stage="inbound" />
      <ReceiveForm open={receiving !== null} order={receiving} onClose={() => setReceiving(null)}
        onArrived={(orderId) => setPending(orderId)} />
      <InspectForm receiptId={inspecting} onClose={() => setInspecting(null)}
        onClosed={(id) => setPapering(id)} />
      <GrnDocument open={papering !== null} receiptId={papering} onClose={() => setPapering(null)} />
      <PoDocument open={noticing !== null} no={noticing} onClose={() => setNoticing(null)} />
      <AckDialog no={acking} onClose={() => setAcking(null)} />
      <ExpediteDialog line={chasing} onClose={() => setChasing(null)} />
      {chasingChallan && (
        <ChaseDialog open onClose={() => setChasingChallan(null)}
          title={`Chase ${chasingChallan.vendor?.name ?? 'the jobworker'} on ${chasingChallan.challan.no}`}
          vendorId={chasingChallan.challan.vendorId}
          subject={`Challan ${chasingChallan.challan.no} — balance with you`}
          text={chasingChallan.chase} />
      )}
      <ReturnForm challanId={returning} onClose={() => setReturning(null)} onBooked={(id) => setReturned(id)} />
      <CloseChallanDialog challanId={closing} onClose={() => setClosing(null)} />
    </div>
  )
}
