'use client'
import { usePathname } from 'next/navigation'
import { useWorkspace } from '@/components/workspace/store'
import { needFor } from '@/lib/workspace/needs'
import { SampleOnly, StageLater } from './Deferred'

/**
 * One wrapper every screen goes through.
 *
 * It answers a single question before a page renders: does this screen have
 * anything true to show the person looking at it? In the sample company the
 * answer is always yes and the page renders untouched, which is why every
 * existing gate suite is unaffected.
 *
 * In the owner's company there are two ways the answer is no, and they are
 * different answers. A stage whose set-up has not been built yet says so and
 * waits its turn (`later`). A screen that reads a history the owner has not
 * accumulated belongs to the worked example for now (`sample`) — the operating
 * screens they do have are plain lists they fill themselves.
 */
export function StageGate({ children, later, sample, shows }: {
  children: React.ReactNode
  /** a stage whose guided set-up comes after sourcing */
  later?: string
  /** an analysis screen that needs a history — names what it comes back as */
  sample?: string
  /** what it shows, when the route is not one `needs.ts` already describes */
  shows?: string
}) {
  const { mode, workspace, ready } = useWorkspace()
  const pathname = usePathname()

  if (!ready) return <div className="min-h-[50vh]" aria-hidden />
  if (mode !== 'mine' || !workspace) return <>{children}</>

  if (later) return <StageLater stage={later} />
  if (sample) {
    return <SampleOnly becomes={sample} shows={shows ?? needFor(pathname)?.shows ?? 'the worked example'} />
  }

  return <>{children}</>
}
