'use client'
import Link from 'next/link'
import { Icon, type IconName } from '@/components/ui/icons'

/**
 * A screen of the inbound desk whose records have not landed yet.
 *
 * Says what it will do and sends somebody to where they can already work,
 * rather than showing an empty table that looks broken.
 */
export function ComingNext({ title, icon, line }: { title: string; icon: IconName; line: string }) {
  return (
    <div className="mx-auto w-full max-w-[72rem]">
      <h1 className="mb-5 text-[26px] font-extrabold leading-none tracking-[-0.03em]">{title}</h1>
      <div className="rounded-xl border border-line bg-surface px-6 py-12 text-center">
        <span aria-hidden className="mx-auto mb-3 grid size-10 place-items-center rounded-lg bg-accent-tint text-accent-ink">
          <Icon name={icon} className="size-5" />
        </span>
        <p className="mx-auto max-w-[32rem] text-[13.5px] leading-relaxed text-ink-2">{line}</p>
        <Link href="/inbound/dashboard"
          className="press mt-4 inline-flex items-center gap-1.5 rounded-lg border border-line bg-surface px-3.5 py-2 text-[13px] font-medium hover:bg-surface-2">
          Back to the gate <Icon name="arrow-right" className="size-3.5" />
        </Link>
      </div>
    </div>
  )
}
