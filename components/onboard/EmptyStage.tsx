'use client'
import { useState } from 'react'
import { Icon } from '@/components/ui/icons'
import { useWorkspace } from '@/components/workspace/store'
import { stepById, type StepId } from '@/lib/workspace/checklist'
import { needFor } from '@/lib/workspace/needs'
import { MaterialWizard } from './wizards/MaterialWizard'
import { SupplierWizard } from './wizards/SupplierWizard'
import { StockWizard } from './wizards/StockWizard'
import { RulesWizard } from './wizards/RulesWizard'
import { TeamWizard } from './wizards/TeamWizard'

/**
 * A screen that has nothing true to say yet, saying so.
 *
 * Two honest options exist for a screen with no data: show nothing and explain,
 * or show somebody else's figures. This build has never done the second, and
 * the screens a new owner meets first are the worst possible place to start.
 *
 * So the empty state names three things — what this screen is for, what is
 * missing, and the one button that fixes it. "No data" would be none of them.
 */
export function EmptyStage({ path }: { path: string }) {
  const { workspace } = useWorkspace()
  const [open, setOpen] = useState<StepId | null>(null)
  const need = needFor(path)
  if (!workspace || !need) return null

  const why = need.blocked(workspace)
  if (!why) return null
  const step = stepById(need.step(workspace))

  return (
    <>
      <section className="anim-fade-up mx-auto max-w-[36rem] rounded-lg border border-line panel px-5 py-7 text-center">
        <span aria-hidden className="mx-auto mb-3 grid size-10 place-items-center rounded-lg bg-accent-tint text-accent-ink">
          <Icon name="boxes" className="size-5" />
        </span>
        <h2 className="text-[15px] font-bold leading-tight tracking-tight">
          This screen shows {need.shows}
        </h2>
        <p className="mx-auto mt-2 max-w-[28rem] text-[12.5px] leading-relaxed text-ink-2">
          {why}
        </p>
        <button type="button" onClick={() => setOpen(step.id)}
          className="press mt-4 inline-flex items-center gap-1.5 rounded-md border border-accent-ink bg-accent-ink px-3 py-1.5 text-[13px] font-medium text-on-accent hover:bg-accent">
          {step.cta}
          <Icon name="arrow-right" className="size-3.5" />
        </button>
        <p className="mt-3 text-[11.5px] leading-snug text-ink-3">
          Nothing here is filled in with example figures. What you see is what you have entered.
        </p>
      </section>

      <TeamWizard open={open === 'company'} onClose={() => setOpen(null)} />
      <MaterialWizard open={open === 'materials'} onClose={() => setOpen(null)} />
      <SupplierWizard open={open === 'suppliers'} onClose={() => setOpen(null)} />
      <StockWizard open={open === 'stock'} onClose={() => setOpen(null)} />
      <RulesWizard open={open === 'rules'} onClose={() => setOpen(null)} />
    </>
  )
}

/**
 * A stage whose set-up has not been built yet.
 *
 * Sourcing first, and the rest get the same treatment once it is right. Saying
 * that plainly is better than an empty screen, and far better than quietly
 * showing the sample company's inventory to somebody looking at their own.
 */
export function StageLater({ stage }: { stage: string }) {
  return (
    <section className="anim-fade-up mx-auto max-w-[36rem] rounded-lg border border-line panel px-5 py-7 text-center">
      <span aria-hidden className="mx-auto mb-3 grid size-10 place-items-center rounded-lg bg-surface-3 text-ink-3">
        <Icon name="clock" className="size-5" />
      </span>
      <h2 className="text-[15px] font-bold leading-tight tracking-tight">
        {stage} comes after sourcing
      </h2>
      <p className="mx-auto mt-2 max-w-[30rem] text-[12.5px] leading-relaxed text-ink-2">
        Sourcing is being set up first, and this stage gets the same short steps once it is working the
        way you want. Until then, nothing here would be your data.
      </p>
      <p className="mt-3 text-[11.5px] leading-snug text-ink-3">
        The sample company has this stage fully built, if you want to see where it goes.
      </p>
    </section>
  )
}
