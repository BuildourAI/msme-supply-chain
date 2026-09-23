'use client'
import { useState } from 'react'
import { Icon } from '@/components/ui/icons'
import { DeskOnly } from '@/components/sourcing/DeskOnly'
import { Queue } from '@/components/sourcing/Queue'
import { Tiles } from '@/components/sourcing/Tiles'
import { MetricPicker } from '@/components/sourcing/MetricPicker'
import { OutputForm, PlanForm } from '@/components/production/desk/PlanDialogs'
import { useWorkspace } from '@/components/workspace/store'
import { type Act, type Band, type Decision } from '@/lib/workspace/decisions'
import { inFlight } from '@/lib/workspace/flight'
import { closeJob } from '@/lib/workspace/jobs'
import { pickedMetrics } from '@/lib/workspace/metrics'
import { noteProduction, productionDecisionsFor } from '@/lib/workspace/production-decisions'

/**
 * The floor's morning.
 *
 * The same two columns as the other desks: on the left, which job is stopped,
 * which will stop, which is behind and which nobody has planned; on the
 * right, what is on its way — because an order landing tomorrow is the
 * difference between a job that halts and one that only waits.
 */
export default function Page() {
  return <DeskOnly><Dashboard /></DeskOnly>
}

function Dashboard() {
  const { workspace, update, today } = useWorkspace()
  const [picking, setPicking] = useState(false)
  const [opened, setOpened] = useState<Set<Band>>(new Set())
  const [planning, setPlanning] = useState<string | null | undefined>(undefined)
  const [booking, setBooking] = useState<{ jobId?: string } | null>(null)

  if (!workspace) return null
  const ws = workspace
  const queue = productionDecisionsFor(ws, today)
  const berths = inFlight(ws, today)
  const metrics = pickedMetrics(ws, today, 'production')

  const act = (d: Decision, kind: Act) => {
    const { jobId } = d.refs
    if (kind === 'plan') { setPlanning(jobId ?? null); return }
    if (kind === 'output') { setBooking({ jobId }); return }
    if (kind === 'keep') { update((w) => noteProduction(w, d, today)); return }
    if (kind === 'close' && jobId) { update((w) => closeJob(w, jobId, today)) }
  }

  return (
    <div className="anim-page mx-auto w-full max-w-[72rem]">
      <header className="mb-5 flex flex-wrap items-center gap-x-4 gap-y-3">
        <h1 className="min-w-0 text-[26px] font-extrabold leading-none tracking-[-0.03em]">
          Production
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
        clear="Every planned job has what it needs, nothing is behind, nothing is unplanned." />

      {metrics.length > 0 && (
        <section className="mt-7">
          <h2 className="mb-2.5 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.07em] text-ink-3">
            <span aria-hidden className="h-px w-4 bg-line" />
            How the floor is doing
            <span aria-hidden className="h-px flex-1 bg-line" />
          </h2>
          <Tiles metrics={metrics} />
        </section>
      )}

      <MetricPicker open={picking} onClose={() => setPicking(false)} stage="production" />
      <PlanForm jobId={planning} onClose={() => setPlanning(undefined)} />
      <OutputForm open={booking !== null} preset={booking ?? undefined} onClose={() => setBooking(null)} />
    </div>
  )
}
