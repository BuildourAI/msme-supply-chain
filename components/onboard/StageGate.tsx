'use client'
import { usePathname } from 'next/navigation'
import { useWorkspace } from '@/components/workspace/store'
import { needFor } from '@/lib/workspace/needs'
import { EmptyStage, StageLater } from './EmptyStage'

/**
 * One wrapper every screen goes through.
 *
 * It answers a single question before a page renders: does this screen have
 * anything true to show the person looking at it? In the sample company the
 * answer is always yes and the page renders untouched, which is why every
 * existing gate suite is unaffected.
 *
 * In the owner's company it is the difference between a system that teaches
 * itself and one that shows a stranger four empty tables.
 */
export function StageGate({ children, later }: { children: React.ReactNode; later?: string }) {
  const { mode, workspace, ready } = useWorkspace()
  const pathname = usePathname()

  if (!ready) return <div className="min-h-[50vh]" aria-hidden />
  if (mode !== 'mine' || !workspace) return <>{children}</>

  // A stage whose set-up has not been built yet — sourcing comes first.
  if (later) return <StageLater stage={later} />

  const need = needFor(pathname)
  if (need && need.blocked(workspace)) return <EmptyStage path={pathname} />

  return <>{children}</>
}
