'use client'
import { useState } from 'react'
import { ListPage } from '@/components/ui/ListPage'
import { DataTable, StatePill } from '@/components/ui/DataTable'
import { useWorkspace } from '@/components/workspace/store'
import { IssueForm } from '@/components/inventory/desk/IssueDialogs'
import { num, shortDate } from '@/lib/domain/format'
import { jobWordCap } from '@/lib/workspace/jobs'
import {
  WATCH_TONE, WATCH_WORD, lineRunsFor, lineWatch, stoppingThisWeek, type JobWatch,
} from '@/lib/workspace/linewatch'
import { floorOf, weekOf } from '@/lib/workspace/plan'
import { NeedsDialog, OutputForm, PlanForm } from './PlanDialogs'

const BAR: Record<string, string> = {
  critical: 'bg-critical-soft border-critical/40 text-critical',
  warn: 'bg-warn-soft border-warn/40 text-warn',
  good: 'bg-good-soft border-good/30 text-good',
  neutral: 'bg-surface-3 border-line text-ink-3',
}

const dayName = (iso: string) => new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-IN', { weekday: 'short', timeZone: 'UTC' })

/**
 * The week on the floor, for the owner to act on.
 *
 * Each planned job across the days it runs, coloured by what it will do; and
 * under it every planned job with the reason in words — which material is
 * short and by how much, what is on its way and when, which jobworker is late,
 * how far behind its daily target it is. From a row: what it needs (and issue
 * it), book what came off, or plan it again.
 */
export function LineWatch() {
  const { workspace, today } = useWorkspace()
  const [needsOf, setNeedsOf] = useState<string | null>(null)
  const [issuing, setIssuing] = useState<{ jobId: string; itemId?: string } | null>(null)
  const [booking, setBooking] = useState<{ jobId?: string } | null>(null)
  const [planning, setPlanning] = useState<string | null | undefined>(undefined)

  if (!workspace) return null
  const ws = workspace
  const word = jobWordCap(ws)
  const watch = lineWatch(ws, today)
  const week = weekOf(today, floorOf(ws))
  const thisWeek = watch.filter((w) => w.inWeek)
  const stopping = stoppingThisWeek(watch)
  const runs = lineRunsFor(ws)

  return (
    <>
      <ListPage
        title="Line watch" noun={`planned ${word.one.toLowerCase()}`} rows={watch}
        search={(w) => `${w.job.no} ${w.job.name ?? ''} ${w.product?.name ?? ''} ${w.reasons.join(' ')}`}
        filter={{
          label: 'Every status',
          options: (['halted', 'will_halt', 'at_risk', 'will_run', 'made'] as const)
            .filter((s) => watch.some((w) => w.status === s))
            .map((s) => ({ value: s, label: WATCH_WORD[s] })),
          of: (w) => w.status,
        }}
        action={{ label: `Plan a ${word.one.toLowerCase()}`, icon: 'calendar', onClick: () => setPlanning(null) }}
        empty={{
          line: `Nothing planned. Give an open ${word.one.toLowerCase()} its product, how many and when, and Line watch says whether the store can feed it — before the floor finds out.`,
          cta: `Plan a ${word.one.toLowerCase()}`,
        }}>
        {(shown) => {
          const ids = new Set(shown.map((w) => w.job.id))
          const grid = thisWeek.filter((w) => ids.has(w.job.id))
          return (
            <div className="space-y-4">
              <p className="text-[12.5px] text-ink-3">
                {runs && Number.isFinite(runs.days.value)
                  ? <>The line runs for <strong className="num text-ink">{num(runs.days.value, 1)} days</strong> on {runs.item.name}, the tightest material. </>
                  : null}
                {thisWeek.length > 0
                  ? <>{stopping.length === 0 ? `All ${thisWeek.length} of this week’s jobs will run.` : `${stopping.length} of ${thisWeek.length} jobs this week will not run as planned.`}</>
                  : 'Nothing is planned to run this week.'}
              </p>

              {grid.length > 0 && (
                <section aria-label="This week on the floor" className="scroll-x overflow-x-auto rounded-xl border border-line bg-surface p-3">
                  <div className="grid min-w-[36rem] gap-y-1.5" style={{ gridTemplateColumns: `8rem repeat(${week.length}, minmax(0, 1fr))` }}>
                    <span />
                    {week.map((d) => (
                      <span key={d} className={`px-1 text-center text-[11.5px] ${d === today ? 'font-bold text-ink' : 'text-ink-3'}`}>
                        {dayName(d)} {d.slice(8)}
                      </span>
                    ))}
                    {grid.map((w) => {
                      const first = week.findIndex((d) => d >= w.job.plannedStart!)
                      const lastIdx = week.map((d) => d <= w.job.plannedFinish!).lastIndexOf(true)
                      const from = first === -1 ? 0 : first
                      const to = lastIdx === -1 ? week.length - 1 : lastIdx
                      return (
                        <div key={w.job.id} className="contents">
                          <span className="truncate pr-2 text-[12.5px]">
                            <span className="mono font-semibold text-ink">{w.job.no}</span>{' '}
                            <span className="text-ink-3">{w.product?.name}</span>
                          </span>
                          <span
                            className={`truncate rounded-md border px-2 py-1 text-[11.5px] font-medium ${BAR[WATCH_TONE[w.status]]}`}
                            style={{ gridColumn: `${from + 2} / ${to + 3}` }}
                            title={w.reasons.join(' · ')}>
                            {WATCH_WORD[w.status]}{w.reasons[0] ? ` — ${w.reasons[0]}` : ''}
                          </span>
                        </div>
                      )
                    })}
                  </div>
                </section>
              )}

              <DataTable rows={shown} keyOf={(w) => w.job.id}
                columns={[
                  {
                    key: 'no', head: word.one,
                    cell: (w) => (
                      <span className="min-w-0">
                        <span className="mono block font-semibold text-ink">{w.job.no}</span>
                        <span className="block text-[11.5px] text-ink-3">{w.product?.name}</span>
                      </span>
                    ),
                  },
                  { key: 'qty', head: 'To make', align: 'right', cell: (w) => <>{w.made} <span className="text-ink-3">/ {w.job.qty}</span></> },
                  {
                    key: 'when', head: 'When',
                    cell: (w) => <span className="whitespace-nowrap text-ink-2">{shortDate(w.job.plannedStart!)} – {shortDate(w.job.plannedFinish!)}</span>,
                  },
                  { key: 'status', head: 'Status', cell: (w) => <StatePill label={WATCH_WORD[w.status]} tone={WATCH_TONE[w.status]} /> },
                  {
                    key: 'why', head: 'Why',
                    cell: (w: JobWatch) => (w.reasons.length === 0
                      ? <span className="text-ink-3">{w.status === 'made' ? 'Everything planned has come off.' : 'Everything it still needs is on the shelf.'}</span>
                      : (
                        <ul className="space-y-0.5 text-[12.5px] leading-snug text-ink-2">
                          {w.reasons.slice(0, 3).map((r, i) => <li key={i}>{r}</li>)}
                          {w.reasons.length > 3 && <li className="text-ink-3">and {w.reasons.length - 3} more</li>}
                        </ul>
                      )),
                  },
                ]}
                extra={{ icon: 'boxes', label: (w) => `What ${w.job.no} needs`, onClick: (w) => setNeedsOf(w.job.id) }}
                extra2={{
                  icon: 'plus',
                  label: (w) => (w.status === 'made' ? 'Nothing left to book' : `Book output on ${w.job.no}`),
                  onClick: (w) => { if (w.status !== 'made') setBooking({ jobId: w.job.id }) },
                }}
                onEdit={(w) => setPlanning(w.job.id)}
                editLabel={(w) => `Re-plan ${w.job.no}`} />
            </div>
          )
        }}
      </ListPage>

      <NeedsDialog jobId={needsOf} onClose={() => setNeedsOf(null)}
        onIssue={(itemId) => { const jobId = needsOf!; setNeedsOf(null); setIssuing({ jobId, itemId }) }} />
      <IssueForm open={issuing !== null} preset={issuing ?? undefined} onClose={() => setIssuing(null)} />
      <OutputForm open={booking !== null} preset={booking ?? undefined} onClose={() => setBooking(null)} />
      <PlanForm jobId={planning} onClose={() => setPlanning(undefined)} />
    </>
  )
}
