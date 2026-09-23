'use client'
import Link from 'next/link'
import { Icon } from '@/components/ui/icons'
import { useWorkspace } from '@/components/workspace/store'
import { progressOf, stepsFor } from '@/lib/workspace/checklist'
import { BUILT, STAGE_HOME, STAGE_TILES } from '@/lib/workspace/reveal'
import { Checklist } from './Checklist'

/**
 * Where an owner starts: five stages, and the ones that are open.
 *
 * Not a dashboard. Sixteen executive figures over a company that has entered
 * four materials would be sixteen zeroes and four charts of nothing, which is
 * the overwhelming-and-useless combination this pass exists to remove. The
 * question on this screen is "which part of the business am I working on", and
 * that is the only question on it.
 *
 * Each open tile carries its own set-up progress, and each stage's checklist
 * sits underneath. Inside a desk every screen is plain, with its own Add
 * button, because somebody who is operating already knows what they came for.
 */
export function StagePicker() {
  const { workspace } = useWorkspace()
  if (!workspace) return null

  return (
    <div className="mx-auto w-full max-w-[64rem]">
      <header className="mb-6">
        <p className="mono text-[10.5px] uppercase tracking-wider text-ink-3">
          {workspace.company.name}
        </p>
        <h1 className="mt-1 text-[26px] font-extrabold leading-none tracking-[-0.03em]">
          Welcome, {workspace.owner.name}
        </h1>
      </header>

      <ul className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {STAGE_TILES.map((s, i) => {
          const built = BUILT.includes(s.id)
          const p = progressOf(workspace, stepsFor(s.id))
          const body = (
            <>
              <span aria-hidden className={`grid size-9 shrink-0 place-items-center rounded-lg ${
                built ? 'bg-accent-tint text-accent-ink' : 'bg-surface-3 text-ink-4'}`}>
                <Icon name={s.icon} className="size-[18px]" />
              </span>
              <span className="mt-2.5 block text-[15px] font-bold leading-tight tracking-tight">
                {s.label}
              </span>
              <span className="mt-1 block text-[12.5px] leading-snug text-ink-2">{s.blurb}</span>
              <span className="mt-3 flex items-center gap-1.5">
                {built ? (
                  <>
                    <span className="mono text-[10.5px] uppercase tracking-wider text-accent-ink">
                      {p.complete ? 'ready' : `${p.doneCount} of ${p.total} set up`}
                    </span>
                    <Icon name="arrow-right" className="size-3 text-accent-ink" />
                  </>
                ) : (
                  <span className="mono text-[10.5px] uppercase tracking-wider text-ink-4">
                    comes later
                  </span>
                )}
              </span>
            </>
          )
          const shell = 'anim-fade-up flex min-w-0 flex-col rounded-xl border p-4 text-left transition-colors'
          return (
            <li key={s.id} style={{ '--i': i } as React.CSSProperties}>
              {built ? (
                <Link href={STAGE_HOME[s.id]}
                  className={`${shell} press border-line bg-surface hover:border-accent hover:bg-accent-tint/30`}>
                  {body}
                </Link>
              ) : (
                <div className={`${shell} border-line-soft bg-surface-2/50`} aria-disabled>
                  {body}
                </div>
              )}
            </li>
          )
        })}
      </ul>

      {/* It stays after the last step is ticked. The five wizards are the only
          way to change a company name, a material's units, a supplier's rate,
          a stock count or the order-sizing rules, so hiding the list once it is
          complete would stand those editors down with it. Ticked, it reads as
          confirmation; the tile above already says the stage is ready. One per
          open stage, in the order the material moves. */}
      {BUILT.map((stage) => <Checklist key={stage} stage={stage} />)}
    </div>
  )
}
