'use client'
import { useState } from 'react'
import Link from 'next/link'
import { Icon, type IconName } from '@/components/ui/icons'
import { useWorkspace } from '@/components/workspace/store'
import { progressOf, stepsFor, type StepId } from '@/lib/workspace/checklist'
import { STAGE_HOME, STAGE_TILES, type StageId } from '@/lib/workspace/reveal'
import { ChecksWizard } from './wizards/ChecksWizard'
import { GateRulesWizard } from './wizards/GateRulesWizard'
import { JobsWizard } from './wizards/JobsWizard'
import { RacksWizard } from './wizards/RacksWizard'
import { StoreRulesWizard } from './wizards/StoreRulesWizard'
import { FloorRulesWizard } from './wizards/FloorRulesWizard'
import { ProductsWizard } from './wizards/ProductsWizard'
import { PlanForm } from '@/components/production/desk/PlanDialogs'
import { OrderForm } from '@/components/dispatch/desk/OrderDialogs'
import { CustomersWizard } from './wizards/CustomersWizard'
import { CarriersWizard } from './wizards/CarriersWizard'
import { DispatchRulesWizard } from './wizards/DispatchRulesWizard'
import { JobworkerWizard } from './wizards/JobworkerWizard'
import { MaterialWizard } from './wizards/MaterialWizard'
import { SupplierWizard } from './wizards/SupplierWizard'
import { StockWizard } from './wizards/StockWizard'
import { RulesWizard } from './wizards/RulesWizard'
import { TeamWizard } from './wizards/TeamWizard'

/**
 * Setting up a stage, as a handful of steps that go green.
 *
 * The shape is taken straight from what works: a numbered list, one live
 * button, and a tick that arrives the moment the underlying data does. The tick
 * is not a stored flag — each step asks the workspace whether its data exists,
 * so a checklist can never claim something is done that is not, and deleting
 * the last supplier un-ticks the supplier step by itself.
 *
 * Only the next step gets a primary button. Five buttons of equal weight is a
 * menu; one is an instruction. The count in the words is the stage's own —
 * the gate has four, the store five.
 *
 * One component for every stage: the stage picks the list, and the list is
 * data in `checklist.ts`. The steps two stages share are the same objects, so
 * adding a material from the inbound card ticks it on the sourcing one too.
 *
 * On the Welcome page each stage is a column in the owner's colours: the stage
 * itself at the top (a ring for how far its set-up has got, and a link into
 * the desk), then its steps one line each. A finished step shows what it
 * holds; the next one says why it matters and gets an outlined button (the
 * one solid button on the page is the step to do first); the rest keep a
 * quiet link, with why each matters in its tooltip rather than on every line.
 */
const WORDS = ['none', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine']

export function Checklist({ compact = false, stage = 'sourcing', lead }: {
  compact?: boolean
  stage?: StageId
  /** the step the page already explains above the columns — not said again here */
  lead?: StepId
}) {
  const { workspace } = useWorkspace()
  const [openStep, setOpenStep] = useState<StepId | null>(null)

  if (!workspace) return null
  const p = progressOf(workspace, stepsFor(stage))
  const name = (STAGE_TILES.find((t) => t.id === stage)?.label ?? 'Sourcing').toLowerCase()

  if (compact) {
    return (
      <div className="rounded-lg bg-accent-tint p-2.5">
        <p className="flex items-baseline gap-1.5 text-[12px] font-bold leading-tight">
          Setting up {name}
          <span className="mono ml-auto text-[10.5px] font-normal text-ink-3">
            {p.doneCount} of {p.total}
          </span>
        </p>
        <div className="mt-1.5 flex gap-0.5" aria-hidden>
          {p.steps.map(({ step, done }) => (
            <span key={step.id}
              className={`h-1 flex-1 rounded-full ${done ? 'bg-accent-ink' : 'bg-surface-3'}`} />
          ))}
        </div>
        {p.next ? (
          <button type="button" onClick={() => setOpenStep(p.next!.id)}
            className="press mt-1.5 inline-flex items-center gap-1 text-[11px] font-semibold text-accent-ink hover:underline">
            {p.next.cta} <Icon name="arrow-right" className="size-3" />
          </button>
        ) : (
          <p className="mt-1 text-[10.5px] leading-snug text-ink-2">
            All {WORDS[p.total] ?? p.total} done. Your desk is running on your own numbers.
          </p>
        )}
        <Wizards open={openStep} onClose={() => setOpenStep(null)} />
      </div>
    )
  }

  const tile = STAGE_TILES.find((t) => t.id === stage)!
  return (
    <section data-setup={stage} className="flex min-w-0 flex-col overflow-hidden rounded-2xl border border-line bg-surface">
      <Link href={STAGE_HOME[stage]} data-stage-tile={stage}
        className="press group flex items-center gap-3 border-b border-line-soft px-3.5 py-3 transition-colors hover:bg-navy/[0.04]">
        <StageRing icon={tile.icon} done={p.doneCount} total={p.total} />
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-1 text-[14.5px] font-bold leading-tight tracking-tight">
            {tile.label}
            <Icon name="arrow-right" className="size-3.5 text-navy opacity-0 transition-opacity group-hover:opacity-100" />
          </span>
          <span className="mt-0.5 line-clamp-2 block text-[11.5px] leading-snug text-ink-3 xl:min-h-[2.75em]">{tile.blurb}</span>
          <span className={`mono mt-1 block text-[10.5px] ${p.complete ? 'text-good' : 'text-navy'}`}>
            {p.doneCount} of {p.total} set up{p.complete ? ' · ready' : ''}
          </span>
        </span>
      </Link>

      <div className="flex items-baseline gap-2 px-3.5 pb-1.5 pt-2.5">
        <h2 className="text-[12px] font-bold">{p.complete ? `Your ${name} is set up` : `Set up your ${name}`}</h2>
        <span className="ml-auto shrink-0 text-[10.5px] text-ink-3">{WORDS[p.total] ?? p.total} short steps</span>
      </div>

      <ol className="flex flex-1 flex-col gap-1 px-2 pb-2">
        {p.steps.map(({ step, done }, n) => {
          const isNext = p.next?.id === step.id
          return (
            <li key={step.id} title={done ? step.summary(workspace) : step.why}
              className={`rounded-xl px-1.5 py-1.5 ${isNext ? 'bg-navy/[0.06] ring-1 ring-inset ring-navy/25' : ''}`}>
              <div className="flex items-start gap-2">
                <span aria-hidden
                  className={`mt-px grid size-5 shrink-0 place-items-center rounded-full text-[10.5px] font-bold ${
                    done ? 'bg-good-soft text-good' : isNext ? 'bg-navy text-white' : 'bg-surface-3 text-ink-3'}`}>
                  {done ? <Icon name="check" className="size-3" /> : n + 1}
                </span>
                <span className="min-w-0 flex-1">
                  <span className={`block text-[12.5px] font-semibold leading-snug ${done ? 'text-ink-2' : 'text-ink'}`}>{step.title}</span>
                  {done && <span className="block truncate text-[11px] leading-snug text-ink-3">{step.summary(workspace)}</span>}
                  {isNext && step.id !== lead && <span className="mt-0.5 line-clamp-2 block text-[11px] leading-snug text-ink-3">{step.why}</span>}
                </span>
                {!isNext && (
                  <button type="button" onClick={() => setOpenStep(step.id)}
                    className="press shrink-0 rounded-md px-1 py-0.5 text-[11px] text-ink-3 underline underline-offset-2 hover:text-navy">
                    {done ? 'Change' : step.cta}
                  </button>
                )}
              </div>
              {isNext && (
                <button type="button" onClick={() => setOpenStep(step.id)}
                  className="press ml-7 mt-1.5 inline-flex items-center gap-1 rounded-lg border border-navy/40 bg-surface px-2.5 py-1 text-[11.5px] font-semibold text-navy hover:bg-navy/[0.06]">
                  {step.cta}
                  <Icon name="arrow-right" className="size-3" />
                </button>
              )}
            </li>
          )
        })}
      </ol>

      <Wizards open={openStep} onClose={() => setOpenStep(null)} />
    </section>
  )
}

/** How far a stage's set-up has got, as a ring round the stage's own icon. */
function StageRing({ icon, done, total }: { icon: IconName; done: number; total: number }) {
  const R = 20, C = 2 * Math.PI * R
  const full = done === total
  return (
    <span className="relative grid size-12 shrink-0 place-items-center">
      <svg viewBox="0 0 48 48" className="absolute inset-0 size-12" aria-hidden>
        <circle cx="24" cy="24" r={R} fill="none" stroke="var(--surface-3)" strokeWidth="4" />
        {done > 0 && (
          <circle cx="24" cy="24" r={R} fill="none" stroke={full ? 'var(--good)' : 'var(--navy)'} strokeWidth="4" strokeLinecap="round"
            strokeDasharray={`${(C * done) / total} ${C}`} transform="rotate(-90 24 24)" />
        )}
      </svg>
      <span aria-hidden className="grid size-8 place-items-center rounded-full bg-navy/10 text-navy">
        <Icon name={icon} className="size-4" />
      </span>
    </span>
  )
}

export function Wizards({ open, onClose }: { open: StepId | null; onClose: () => void }) {
  return (
    <>
      <TeamWizard open={open === 'company'} onClose={onClose} />
      <MaterialWizard open={open === 'materials'} onClose={onClose} />
      <SupplierWizard open={open === 'suppliers'} onClose={onClose} />
      <StockWizard open={open === 'stock'} onClose={onClose} />
      <RulesWizard open={open === 'rules'} onClose={onClose} />
      <ChecksWizard open={open === 'checks'} onClose={onClose} />
      <JobworkerWizard open={open === 'jobworkers'} onClose={onClose} />
      <GateRulesWizard open={open === 'gateRules'} onClose={onClose} />
      <RacksWizard open={open === 'racks'} onClose={onClose} />
      <JobsWizard open={open === 'jobs'} onClose={onClose} />
      <StoreRulesWizard open={open === 'storeRules'} onClose={onClose} />
      <ProductsWizard open={open === 'products'} onClose={onClose} />
      <PlanForm jobId={open === 'plan' ? null : undefined} onClose={onClose} />
      <FloorRulesWizard open={open === 'floorRules'} onClose={onClose} />
      <CustomersWizard open={open === 'customers'} onClose={onClose} />
      <CarriersWizard open={open === 'carriers'} onClose={onClose} />
      <OrderForm order={open === 'firstOrder' ? null : undefined} onClose={onClose} />
      <DispatchRulesWizard open={open === 'dispatchRules'} onClose={onClose} />
    </>
  )
}
