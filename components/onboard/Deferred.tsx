'use client'
import Link from 'next/link'
import { Icon } from '@/components/ui/icons'
import { useWorkspace } from '@/components/workspace/store'

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

/**
 * A screen that belongs to the worked example, seen from the owner's company.
 *
 * These are the analysis screens — what to buy today, why the cheapest quote is
 * not the cheapest material, money stuck in unusable stock. Every one of them
 * reads a history: a year of receipts to measure a lead time against, two
 * quotes on the same material to compare, rejections to hold a supplier to.
 * That is a thing a desk accumulates, not a thing to ask somebody to type in on
 * their first morning, and inventing it would make every figure a fiction.
 *
 * So in the owner's company they say what they are for and offer the sample
 * company, where the same screens run on figures that reconcile. They come back
 * as a dashboard inside the desk once there is a history behind them.
 */
export function SampleOnly({ shows, becomes }: { shows: string; becomes: string }) {
  const { setMode } = useWorkspace()

  return (
    <section className="anim-fade-up mx-auto mt-2 max-w-[36rem] rounded-lg border border-line panel px-5 py-7 text-center">
      <span aria-hidden className="mx-auto mb-3 grid size-10 place-items-center rounded-lg bg-accent-tint text-accent-ink">
        <Icon name="activity" className="size-5" />
      </span>
      <h2 className="text-[15px] font-bold leading-tight tracking-tight">
        This screen shows {shows}
      </h2>
      <p className="mx-auto mt-2 max-w-[30rem] text-[12.5px] leading-relaxed text-ink-2">
        It reads months of receipts, quotes and rejections — what a desk builds up by being used, not
        something to ask you to type in. It comes back as {becomes} once yours has that behind it.
      </p>
      <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
        <button type="button" onClick={() => setMode('sample')}
          className="press inline-flex items-center gap-1.5 rounded-md border border-accent-ink bg-accent-ink px-3 py-1.5 text-[13px] font-medium text-on-accent hover:bg-accent">
          See it in the sample company
          <Icon name="arrow-right" className="size-3.5" />
        </button>
        <Link href="/"
          className="press rounded-md border border-line bg-surface px-3 py-1.5 text-[13px] font-medium text-ink-2 hover:bg-surface-2 hover:text-ink">
          All stages
        </Link>
      </div>
      <p className="mt-3 text-[11.5px] leading-snug text-ink-3">
        Nothing here is filled in with example figures. What you enter is what you see.
      </p>
    </section>
  )
}
