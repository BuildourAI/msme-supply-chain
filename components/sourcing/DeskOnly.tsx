'use client'
import { useWorkspace } from '@/components/workspace/store'
import { Icon } from '@/components/ui/icons'

/**
 * The desk screens work on your own company, and only on it.
 *
 * The sample company is the worked example — nine materials, twenty-seven
 * quotes, figures that reconcile to the spec. It has no requests, no quotes
 * against requests and no purchase orders, because those are records a person
 * makes. Rather than inventing a second set of sample data so these screens
 * have something to show, they say plainly that this is where your own company
 * goes.
 */
export function DeskOnly({ children }: { children: React.ReactNode }) {
  const { mode, ready, hasAccount } = useWorkspace()

  if (!ready) return <div className="min-h-[50vh]" aria-hidden />
  if (mode === 'mine') return <>{children}</>

  return (
    <section className="mx-auto mt-6 max-w-[34rem] rounded-xl border border-line bg-surface px-6 py-10 text-center">
      <span aria-hidden className="mx-auto mb-3 grid size-10 place-items-center rounded-lg bg-accent-tint text-accent-ink">
        <Icon name="boxes" className="size-5" />
      </span>
      <h1 className="text-[16px] font-bold leading-tight tracking-tight">
        This is where your own company goes
      </h1>
      <p className="mx-auto mt-2 max-w-[26rem] text-[13px] leading-relaxed text-ink-2">
        {hasAccount
          ? 'You are looking at the sample company. Switch back to your own from the menu in the top right.'
          : 'Set your company up and this screen fills with your suppliers, materials and orders.'}
      </p>
    </section>
  )
}
