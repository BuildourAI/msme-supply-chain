'use client'
import { useState } from 'react'
import { Icon } from '@/components/ui/icons'
import { useWorkspace } from '@/components/workspace/store'
import { SOURCING_STEPS, progressOf, type StepId } from '@/lib/workspace/checklist'
import { MaterialWizard } from './wizards/MaterialWizard'
import { SupplierWizard } from './wizards/SupplierWizard'
import { StockWizard } from './wizards/StockWizard'
import { RulesWizard } from './wizards/RulesWizard'
import { TeamWizard } from './wizards/TeamWizard'

/**
 * Setting up sourcing, as five steps that go green.
 *
 * The shape is taken straight from what works: a numbered list, one live
 * button, and a tick that arrives the moment the underlying data does. The tick
 * is not a stored flag — each step asks the workspace whether its data exists,
 * so a checklist can never claim something is done that is not, and deleting
 * the last supplier un-ticks the supplier step by itself.
 *
 * Only the next step gets a primary button. Five buttons of equal weight is a
 * menu; one is an instruction.
 */
export function Checklist({ compact = false }: { compact?: boolean }) {
  const { workspace } = useWorkspace()
  const [openStep, setOpenStep] = useState<StepId | null>(null)

  if (!workspace) return null
  const p = progressOf(workspace)

  if (compact) {
    return (
      <div className="rounded-lg bg-accent-tint p-2.5">
        <p className="flex items-baseline gap-1.5 text-[12px] font-bold leading-tight">
          Setting up sourcing
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
            All five done. Your desk is running on your own numbers.
          </p>
        )}
        <Wizards open={openStep} onClose={() => setOpenStep(null)} />
      </div>
    )
  }

  return (
    <section className="anim-fade-up mb-3 min-w-0 rounded-lg border border-line panel">
      <header className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-line-soft px-4 py-3">
        <div className="min-w-0">
          <h2 className="text-[15px] font-bold leading-tight tracking-tight">
            {p.complete ? 'Your sourcing is set up' : 'Set up your sourcing'}
          </h2>
          <p className="mt-0.5 text-[12px] leading-snug text-ink-2">
            {p.complete
              ? 'Every screen in the desk is running on your own numbers. Change any of it here.'
              : 'Five short steps. Each one turns a screen on.'}
          </p>
        </div>
        <span className="mono ml-auto shrink-0 rounded-full border border-line bg-surface px-2.5 py-0.5 text-[11px] text-ink-2">
          {p.doneCount} of {p.total} done
        </span>
      </header>

      <ol className="divide-y divide-line-soft">
        {p.steps.map(({ step, done }, n) => {
          const isNext = p.next?.id === step.id
          return (
            <li key={step.id}
              className={`flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-2.5 ${
                isNext ? 'bg-accent-tint/40' : ''}`}>
              <span aria-hidden
                className={`grid size-6 shrink-0 place-items-center rounded-full text-[11px] font-bold ${
                  done ? 'bg-good-soft text-good'
                    : isNext ? 'bg-accent-ink text-on-accent' : 'bg-surface-3 text-ink-3'}`}>
                {done ? <Icon name="check" className="size-3.5" /> : n + 1}
              </span>

              <span className="min-w-0 flex-1">
                <span className={`block text-[13px] font-semibold leading-tight ${done ? 'text-ink-2' : 'text-ink'}`}>
                  {step.title}
                </span>
                <span className="mt-0.5 block text-[11.5px] leading-snug text-ink-3">
                  {done ? step.summary(workspace) : step.why}
                </span>
              </span>

              {isNext ? (
                <button type="button" onClick={() => setOpenStep(step.id)}
                  className="press shrink-0 rounded-md border border-accent-ink bg-accent-ink px-3 py-1.5 text-[12.5px] font-medium text-on-accent hover:bg-accent">
                  {step.cta}
                </button>
              ) : (
                <button type="button" onClick={() => setOpenStep(step.id)}
                  className="press shrink-0 rounded-md px-2 py-1 text-[12px] text-ink-3 underline underline-offset-2 hover:text-ink">
                  {done ? 'Change' : step.cta}
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

function Wizards({ open, onClose }: { open: StepId | null; onClose: () => void }) {
  return (
    <>
      <TeamWizard open={open === 'company'} onClose={onClose} />
      <MaterialWizard open={open === 'materials'} onClose={onClose} />
      <SupplierWizard open={open === 'suppliers'} onClose={onClose} />
      <StockWizard open={open === 'stock'} onClose={onClose} />
      <RulesWizard open={open === 'rules'} onClose={onClose} />
    </>
  )
}
