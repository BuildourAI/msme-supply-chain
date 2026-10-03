'use client'
import { useState } from 'react'
import { Icon } from '@/components/ui/icons'
import { useWorkspace } from '@/components/workspace/store'
import { progressOf, stepsFor, type StepId } from '@/lib/workspace/checklist'
import { STAGE_TILES, type StageId } from '@/lib/workspace/reveal'
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
 * It lives inside each stage, in the side panel, not on the Welcome page: a
 * stage's materials, racks or customers are entered there, when the owner gets
 * to them. Folded, it is a line, a bar and the one next step — five buttons of
 * equal weight is a menu; one is an instruction. Unfolded, it is every step
 * with its own button, done or not, because the wizards are also how a company
 * name, a material's units, a supplier's rate or a rule is changed later.
 *
 * One component for every stage: the stage picks the list, and the list is
 * data in `checklist.ts`. The steps two stages share are the same objects, so
 * adding a material from the inbound card ticks it on the sourcing one too.
 */
const WORDS = ['none', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine']

export function Checklist({ stage = 'sourcing' }: { stage?: StageId }) {
  const { workspace } = useWorkspace()
  const [openStep, setOpenStep] = useState<StepId | null>(null)
  const [unfolded, setUnfolded] = useState(false)

  if (!workspace) return null
  const p = progressOf(workspace, stepsFor(stage))
  const name = (STAGE_TILES.find((t) => t.id === stage)?.label ?? 'Sourcing').toLowerCase()

  return (
    <div data-setup={stage} className="rounded-lg bg-accent-tint p-2.5">
      <button type="button" onClick={() => setUnfolded((u) => !u)} aria-expanded={unfolded}
        className="press flex w-full items-baseline gap-1.5 text-left text-[12px] font-bold leading-tight">
        {p.complete ? `Your ${name} is set up` : `Setting up ${name}`}
        <span className="mono ml-auto text-[10.5px] font-normal text-ink-3">
          {p.doneCount} of {p.total}
        </span>
        <Icon name="chevron" className={`size-3 self-center text-ink-3 transition-transform ${unfolded ? '-rotate-90' : 'rotate-90'}`} />
      </button>
      <div className="mt-1.5 flex gap-0.5" aria-hidden>
        {p.steps.map(({ step, done }) => (
          <span key={step.id}
            className={`h-1 flex-1 rounded-full ${done ? 'bg-accent-ink' : 'bg-surface-3'}`} />
        ))}
      </div>

      {unfolded ? (
        <ol data-setup-steps className="mt-1.5 flex flex-col gap-0.5">
          {p.steps.map(({ step, done }, n) => (
            <li key={step.id} data-step={step.id} title={done ? step.summary(workspace) : step.why}
              className="flex items-start gap-1.5 rounded-md px-1 py-1">
              <span aria-hidden
                className={`mt-px grid size-4 shrink-0 place-items-center rounded-full text-[9.5px] font-bold ${
                  done ? 'bg-good-soft text-good' : p.next?.id === step.id ? 'bg-navy text-white' : 'bg-surface-3 text-ink-3'}`}>
                {done ? <Icon name="check" className="size-2.5" /> : n + 1}
              </span>
              <span className="min-w-0 flex-1">
                <span className={`block truncate text-[11.5px] leading-snug ${done ? 'text-ink-2' : 'font-semibold text-ink'}`}>{step.title}</span>
                <button type="button" onClick={() => setOpenStep(step.id)}
                  className="press text-[10.5px] font-semibold text-accent-ink hover:underline">
                  {done ? 'Change' : step.cta}
                </button>
              </span>
            </li>
          ))}
        </ol>
      ) : p.next ? (
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
