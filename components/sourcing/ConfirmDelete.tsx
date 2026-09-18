'use client'
import { Dialog } from '@/components/ui/Dialog'
import type { DeleteImpact } from '@/lib/workspace/sourcing'

/**
 * Deleting, with what goes alongside it named.
 *
 * A delete that quietly takes six other records is how somebody loses an
 * afternoon's typing and stops trusting the thing. So the dialog says what is
 * attached before it asks, and `DeleteImpact` has already worked that out — the
 * screen never counts anything itself.
 *
 * It asks once. A second confirmation is a way of moving the blame rather than
 * preventing the mistake.
 */
export function ConfirmDelete({ open, onClose, onConfirm, what, impact }: {
  open: boolean
  onClose: () => void
  onConfirm: () => void
  /** what is being removed, named — "Shah Metals", not "this supplier" */
  what: string
  impact: DeleteImpact
}) {
  if (!open) return null
  return (
    <Dialog open onClose={onClose} title={`Delete ${what}?`}>
      <div className="space-y-3 px-4 py-4">
        {impact.clean ? (
          <p className="text-[13px] leading-relaxed text-ink-2">
            Nothing else is attached to it.
          </p>
        ) : (
          <>
            <p className="text-[13px] leading-relaxed text-ink-2">This also removes:</p>
            <ul className="space-y-1">
              {impact.losses.map((l) => (
                <li key={l} className="flex items-start gap-2 text-[13px] text-ink">
                  <span aria-hidden className="mt-1.5 size-1 shrink-0 rounded-full bg-critical" />
                  {l}
                </li>
              ))}
            </ul>
          </>
        )}
        <p className="text-[12px] text-ink-3">This cannot be undone.</p>
      </div>
      <footer className="flex items-center gap-2 border-t border-line-soft px-4 py-3">
        <button type="button" onClick={onClose}
          className="press rounded-lg px-2.5 py-2 text-[13px] text-ink-2 hover:text-ink">
          Keep it
        </button>
        <span className="ml-auto" />
        <button type="button" onClick={() => { onConfirm(); onClose() }}
          className="press rounded-lg border border-critical bg-critical px-3.5 py-2 text-[13px] font-semibold text-on-accent hover:opacity-90">
          Delete
        </button>
      </footer>
    </Dialog>
  )
}
