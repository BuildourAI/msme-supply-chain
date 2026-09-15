'use client'
import { Dialog } from '@/components/ui/Dialog'
import { Button } from '@/components/ui/bits'
import type { ModuleEntry } from '@/lib/seed/stages'

export type Locked = { label: string; lock: NonNullable<ModuleEntry['lock']> }

/**
 * Why a module is not there.
 *
 * Two different facts wear the same lock, and the difference is the whole
 * point: a PLANNED module is queued behind a prerequisite and says what that
 * prerequisite is; an EXCLUDED one was considered and turned down, and says
 * why. A greyed-out row with no explanation teaches a client nothing except
 * that the demo is incomplete.
 *
 * Lifted out of the old top nav so the sidebar and the stage diagram open the
 * same dialog rather than keeping two copies of it in step.
 */
export function LockDialog({ lock, onClose }: { lock: Locked | null; onClose: () => void }) {
  return (
    <Dialog open={!!lock} onClose={onClose}
      title={lock?.label ?? ''}
      sub={lock?.lock.excludedReason ? 'Deliberately excluded' : `Planned — ${lock?.lock.phase}`}>
      <div className="space-y-3 px-4 py-4 text-[13px] leading-relaxed text-ink-2">
        {lock?.lock.excludedReason ? (
          <>
            <p>{lock.lock.excludedReason}</p>
            <p className="text-ink-3">
              This is an exclusion with a reason, not an oversight. Building it would add
              precision nobody asked for.
            </p>
          </>
        ) : (
          <>
            <p>
              Not built yet. It lands in <strong className="text-ink">{lock?.lock.phase}</strong> of
              the build sequence.
            </p>
            <div className="rounded-md border border-line bg-surface-2 p-3">
              <p className="mono text-[10px] uppercase tracking-wider text-ink-3">What it needs first</p>
              <p className="mt-1 text-ink">{lock?.lock.needs}</p>
            </div>
            <p className="text-ink-3">
              A demand-driven reorder point on a broken item master will confidently and
              repeatedly order the wrong thing — so the data foundation comes first.
            </p>
          </>
        )}
        <div className="flex justify-end pt-1">
          <Button onClick={onClose} variant="primary">Understood</Button>
        </div>
      </div>
    </Dialog>
  )
}
