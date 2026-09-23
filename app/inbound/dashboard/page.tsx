'use client'
import { useState } from 'react'
import { Icon } from '@/components/ui/icons'
import { DeskOnly } from '@/components/sourcing/DeskOnly'
import { Queue } from '@/components/sourcing/Queue'
import { Tiles } from '@/components/sourcing/Tiles'
import { MetricPicker } from '@/components/sourcing/MetricPicker'
import { ReceiveForm } from '@/components/sourcing/ReceiveForm'
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
  const { workspace, today } = useWorkspace()
  const [picking, setPicking] = useState(false)
  const [receiving, setReceiving] = useState<PurchaseOrder | null>(null)
  const [opened, setOpened] = useState<Set<Band>>(new Set())

  if (!workspace) return null
  const ws = workspace

  const queue = inboundDecisionsFor(ws, today)
  const berths = inFlight(ws, today)
  const metrics = pickedMetrics(ws, today, 'inbound')

  const act = (d: Decision, kind: Act) => {
    const { orderNo } = d.refs
    if (kind === 'arrive' && orderNo) {
      // a receipt is a line's, so the form opens on the first line still to come
      const line = ws.orders.find((o) => o.no === orderNo && o.state !== 'delivered'
        && o.state !== 'cancelled')
      if (line) setReceiving(line)
    }
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
      <ReceiveForm open={receiving !== null} order={receiving} onClose={() => setReceiving(null)} />
    </div>
  )
}
