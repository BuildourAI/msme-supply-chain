'use client'
import { useState } from 'react'
import { Icon } from '@/components/ui/icons'
import { useWorkspace } from '@/components/workspace/store'
import { longDate } from '@/lib/domain/format'
import { progressOf, stepsFor, type Step, type StepId } from '@/lib/workspace/checklist'
import { fyOf, hasRecords } from '@/lib/workspace/executive'
import { BUILT, STAGE_TILES, type StageId } from '@/lib/workspace/reveal'
import { Checklist, Wizards } from './Checklist'
import { Gist } from './Gist'

/**
 * Where an owner starts: the business in one look, then five stages.
 *
 * Not a dashboard on day one. Sixteen figures over a company that has entered
 * four materials would be sixteen zeroes and four charts of nothing, so until
 * the first purchase order, count, job card or sales order is written the only
 * question here is "which part of the business am I working on". Once there is
 * something to read, the gist opens above the stages — money, what needs the
 * owner, the goals, each stage's figures — and the stages stay underneath,
 * because which stage to work on is still the question after the look.
 *
 * Day one is in the owner's colours too, and on one screen: a navy band with
 * how far the set-up has got, the one step to do next, and the five stages
 * side by side, each with its own steps. A step two stages share counts once
 * in the band, and ticks in both columns at once.
 */
export function StagePicker() {
  const { workspace } = useWorkspace()
  if (!workspace) return null
  const running = hasRecords(workspace)
  const lead = running ? undefined : setup(workspace).next?.step.id

  return (
    <>
    {running && <Gist />}
    <div className="mx-auto w-full max-w-[90rem]">
      {running ? (
        // the gist carries the welcome; underneath, the stages and their set-up lists
        <h2 className="mb-3 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.07em] text-ink-3">
          <span className="shrink-0">Your stages</span>
          <span className="hidden font-normal normal-case tracking-normal sm:inline">· set-up and each desk</span>
          <span aria-hidden className="h-px flex-1 bg-line" />
        </h2>
      ) : (
        <>
          <Band />
          <StartHere />
        </>
      )}

      {/* The lists stay after the last step is ticked. The wizards are the only
          way to change a company name, a material's units, a supplier's rate,
          a stock count or the order-sizing rules, so hiding a list once it is
          complete would stand those editors down with it. Ticked, it reads as
          confirmation. One per open stage, in the order the material moves. */}
      <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
        {BUILT.map((stage, i) => (
          <div key={stage} className="anim-fade-up flex min-w-0 [&>section]:flex-1" style={{ '--i': i + 2 } as React.CSSProperties}>
            <Checklist stage={stage} lead={lead} />
          </div>
        ))}
      </div>
    </div>
    </>
  )
}

/** Every step across the open stages, each counted once, and the first one not done. */
function setup(ws: NonNullable<ReturnType<typeof useWorkspace>['workspace']>) {
  const seen = new Map<StepId, boolean>()
  let next: { stage: StageId; step: Step; n: number } | null = null
  for (const stage of BUILT) {
    const p = progressOf(ws, stepsFor(stage))
    p.steps.forEach(({ step, done }) => seen.set(step.id, done))
    if (!next && p.next) next = { stage, step: p.next, n: p.steps.findIndex((s) => s.step.id === p.next!.id) + 1 }
  }
  const all = [...seen.values()]
  return { done: all.filter(Boolean).length, total: all.length, next }
}

/** The welcome, in the band every dashboard wears: whose company, and how far its set-up has got. */
function Band() {
  const { workspace, today } = useWorkspace()
  if (!workspace) return null
  const s = setup(workspace)
  return (
    <header data-welcome-band
      className="anim-fade-up flex flex-wrap items-center gap-x-4 gap-y-3 rounded-2xl bg-gradient-to-r from-navy-deep to-navy px-4 py-3.5 text-white sm:px-5">
      <span aria-hidden className="grid size-10 shrink-0 place-items-center rounded-xl bg-white/12">
        <Icon name="factory" className="size-5" />
      </span>
      <div className="min-w-0">
        <p className="mono truncate text-[10.5px] uppercase tracking-wider text-white/70">
          {workspace.company.name}{today ? ` · ${fyOf(today).label}` : ''}
        </p>
        <h1 className="text-[21px] font-extrabold leading-tight tracking-[-0.02em]">Welcome, {workspace.owner.name}</h1>
      </div>
      <div className="w-full min-w-0 sm:ml-auto sm:w-[19rem]">
        <p className="flex items-baseline gap-2 text-[12px] font-semibold">
          {s.next ? 'Getting set up' : 'All set up'}
          <span className="mono ml-auto text-[11px] font-normal text-white/75">{s.done} of {s.total} steps</span>
        </p>
        <span className="mt-1.5 flex gap-[3px]" aria-hidden>
          {Array.from({ length: s.total }, (_, i) => (
            <span key={i} className={`h-1.5 flex-1 rounded-full ${i < s.done ? 'bg-white' : 'bg-white/20'}`} />
          ))}
        </span>
      </div>
      {today && (
        <span className="inline-flex items-center gap-1.5 rounded-lg bg-white/12 px-2.5 py-1.5 text-[12px] font-semibold">
          <Icon name="calendar" className="size-3.5 opacity-80" />{longDate(today)}
        </span>
      )}
    </header>
  )
}

/**
 * The one thing to do next, whichever stage it is in — the first step not yet
 * done, in the order material moves. Its column below has the same step
 * marked; this is the instruction, the columns are the map.
 */
function StartHere() {
  const { workspace } = useWorkspace()
  const [open, setOpen] = useState<StepId | null>(null)
  if (!workspace) return null
  const { next } = setup(workspace)
  const label = next ? STAGE_TILES.find((t) => t.id === next.stage)!.label : ''
  return (
    <section data-start-here style={{ '--i': 1 } as React.CSSProperties}
      className="anim-fade-up my-2.5 flex flex-wrap items-center gap-x-4 gap-y-3 rounded-2xl border border-line border-l-[4px] border-l-navy bg-surface px-4 py-3.5 sm:px-5">
      {next ? (
        <>
          <span aria-hidden className="grid size-11 shrink-0 place-items-center rounded-full bg-navy text-[17px] font-extrabold text-white">{next.n}</span>
          <div className="min-w-0 flex-1 basis-[18rem]">
            <p className="mono text-[10.5px] uppercase tracking-wider text-navy">Start here · {label}</p>
            <p className="mt-0.5 text-[16px] font-bold leading-tight tracking-tight">{next.step.title}</p>
            <p className="mt-0.5 text-[12.5px] leading-snug text-ink-2">{next.step.why}</p>
          </div>
          <button type="button" onClick={() => setOpen(next.step.id)}
            className="press inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-navy px-4 py-2 text-[13.5px] font-semibold text-white hover:bg-navy-deep">
            {next.step.cta}
            <Icon name="arrow-right" className="size-4" />
          </button>
        </>
      ) : (
        <>
          <span aria-hidden className="grid size-11 shrink-0 place-items-center rounded-full bg-good-soft text-good"><Icon name="check" className="size-5" /></span>
          <div className="min-w-0 flex-1">
            <p className="text-[16px] font-bold leading-tight tracking-tight">Every stage is set up</p>
            <p className="mt-0.5 text-[12.5px] leading-snug text-ink-2">
              The desks run on your own numbers now. The first purchase order, count, job card or sales order opens the business at a glance here.
            </p>
          </div>
        </>
      )}
      <Wizards open={open} onClose={() => setOpen(null)} />
    </section>
  )
}
