'use client'
import { useState } from 'react'
import { DeskOnly } from '@/components/sourcing/DeskOnly'
import { BandButton, BandChip, RecentList, StageDashboard, WaitingList } from '@/components/desk/StageDashboard'
import { ProductionPictures, ProductionStrip } from '@/components/desk/StagePictures'
import { MetricPicker } from '@/components/sourcing/MetricPicker'
import { OutputForm, PlanForm } from '@/components/production/desk/PlanDialogs'
import { ResumeDialog } from '@/components/production/desk/HaltDialogs'
import { useWorkspace } from '@/components/workspace/store'
import { recentFor } from '@/lib/workspace/desk-pictures'
import { lineRunsFor } from '@/lib/workspace/linewatch'
import { type Act, type Band, type Decision } from '@/lib/workspace/decisions'
import { closeJob } from '@/lib/workspace/jobs'
import { pickedMetrics } from '@/lib/workspace/metrics'
import { noteProduction, productionDecisionsFor } from '@/lib/workspace/production-decisions'

/**
 * The floor's morning, in the desk's frame (`StageDashboard`).
 *
 * Four pictures of the floor — each job card against its plan with the days
 * it stood still, what came off each week against what the plan said, why the
 * line stopped, and how much was right first time — the open job cards as
 * rings, and on the right what is waiting on you: which job is stopped, which
 * will stop, which is behind and which nobody has planned.
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
  const [resuming, setResuming] = useState<string | null>(null)

  if (!workspace) return null
  const ws = workspace
  const queue = productionDecisionsFor(ws, today)
  const metrics = pickedMetrics(ws, today, 'production')

  const act = (d: Decision, kind: Act) => {
    const { jobId } = d.refs
    if (kind === 'plan') { setPlanning(jobId ?? null); return }
    if (kind === 'output') { setBooking({ jobId }); return }
    if (kind === 'resume' && d.refs.haltId) { setResuming(d.refs.haltId); return }
    if (kind === 'keep') { update((w) => noteProduction(w, d, today)); return }
    if (kind === 'close' && jobId) { update((w) => closeJob(w, jobId, today)) }
  }

  const runs = lineRunsFor(ws)
  return (
    <>
      <StageDashboard stage="Production" icon="factory"
        chips={<>
          <BandChip alert={queue.length > 0}>{queue.length} need{queue.length === 1 ? 's' : ''} you</BandChip>
          {runs && <BandChip icon="clock">Line runs {runs.days.value >= 100 ? '99+' : Math.round(runs.days.value * 10) / 10} days</BandChip>}
        </>}
        actions={<BandButton icon="columns" onClick={() => setPicking(true)}>Figures</BandButton>}
        metrics={metrics}
        pictures={<ProductionPictures ws={ws} today={today} />}
        strip={<ProductionStrip ws={ws} today={today} />}
        waiting={<WaitingList rows={queue} onAct={act} showAll={opened}
          onShowAll={(b) => setOpened((s) => new Set(s).add(b))}
          clear="Every planned job has what it needs, nothing is behind, nothing is unplanned." />}
        recent={<RecentList title="Recent on the floor" items={recentFor(ws, 'production')} today={today} />} />

      <MetricPicker open={picking} onClose={() => setPicking(false)} stage="production" />
      <PlanForm jobId={planning} onClose={() => setPlanning(undefined)} />
      <OutputForm open={booking !== null} preset={booking ?? undefined} onClose={() => setBooking(null)} />
      <ResumeDialog haltId={resuming} onClose={() => setResuming(null)} />
    </>
  )
}
