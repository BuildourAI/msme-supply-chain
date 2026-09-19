'use client'
import { useState } from 'react'
import { Dialog } from '@/components/ui/Dialog'
import { Icon } from '@/components/ui/icons'
import { useWorkspace } from '@/components/workspace/store'
import { forgetAlias } from '@/lib/intake/alias'
import { shortDate } from '@/lib/domain/format'

/**
 * The wordings each supplier uses, and what they were decided to mean.
 *
 * The sample company puts this beside its review queue and calls it the
 * deliverable: "a better parser reduces the queue; only the table makes the
 * data usable by everything downstream." It belongs on the owner's side too.
 *
 * It lives in a dialog off the Documents header rather than as a second table
 * on that screen, because one table per screen is the shape this whole portal
 * keeps and a learned wording is something you look up, not something you
 * watch.
 *
 * Unlike the sample's, a row here has a bin. "An accepted match is permanent"
 * is a promise that the system will not quietly forget — not that the owner
 * cannot correct themselves. A wrong alias is silent and permanent, which is
 * exactly what that screen warns about; refusing to remove one turns its own
 * warning into a trap.
 */
export function AliasPanel({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { workspace, update } = useWorkspace()
  const [dropping, setDropping] = useState<{ vendorId: string; raw: string } | null>(null)

  if (!open || !workspace) return null
  const ws = workspace

  const vendor = (id: string) => ws.vendors.find((v) => v.id === id)?.name ?? 'a supplier'
  const item = (id: string) => ws.items.find((i) => i.id === id)?.name ?? id

  return (
    <Dialog open wide onClose={onClose} title="Learned wordings"
      sub={`${ws.aliases.length} mapped · what each supplier calls your materials`}>
      <div className="max-h-[70vh] overflow-y-auto">
        {ws.aliases.length === 0 ? (
          <p className="px-4 py-6 text-center text-[12.5px] leading-relaxed text-ink-2">
            Nothing learned yet. Every line you map on a document is remembered here, so the next
            one from that supplier costs you less.
          </p>
        ) : (
          <table className="w-full border-collapse text-[12px]">
            <thead className="bg-surface-2">
              <tr className="text-ink-3">
                {['What they call it', 'What you call it', 'Supplier', 'Learned', ''].map((h) => (
                  <th key={h} className="whitespace-nowrap border-b border-line px-3 py-1.5 text-left font-medium">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {ws.aliases.map((a) => (
                <tr key={`${a.vendorId}/${a.raw}`} className="border-b border-line-soft">
                  <td className="px-3 py-2 font-medium">{a.raw}</td>
                  <td className="px-3 py-2 text-ink-2">{item(a.itemId)}</td>
                  <td className="whitespace-nowrap px-3 py-2 text-ink-2">{vendor(a.vendorId)}</td>
                  <td className="mono whitespace-nowrap px-3 py-2 text-[10.5px] text-ink-3">
                    {shortDate(a.confirmedAt)}
                  </td>
                  <td className="px-2 py-2 text-right">
                    <button type="button"
                      onClick={() => setDropping({ vendorId: a.vendorId, raw: a.raw })}
                      title={`Forget what ${vendor(a.vendorId)} means by “${a.raw}”`}
                      className="press rounded-md p-1 text-ink-4 hover:bg-critical-soft hover:text-critical">
                      <Icon name="trash" className="size-3.5" />
                      <span className="sr-only">Forget “{a.raw}”</span>
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {dropping && (
        <Dialog open onClose={() => setDropping(null)} title="Forget this wording?">
          <div className="space-y-3 px-4 py-4">
            <p className="text-[13px] leading-relaxed text-ink-2">
              Lines from <strong className="text-ink">{vendor(dropping.vendorId)}</strong> reading{' '}
              <strong className="text-ink">“{dropping.raw}”</strong> will come back for review on
              the next document.
            </p>
            {/* the thing people are actually afraid of, answered before they ask */}
            <p className="text-[12.5px] leading-relaxed text-ink-3">
              Rates already agreed from it stay exactly where they are. Only the shortcut goes.
            </p>
          </div>
          <footer className="flex items-center gap-2 border-t border-line-soft px-4 py-3">
            <button type="button" onClick={() => setDropping(null)}
              className="press rounded-lg px-2.5 py-2 text-[13px] text-ink-2 hover:text-ink">
              Keep it
            </button>
            <span className="ml-auto" />
            <button type="button"
              onClick={() => {
                update((w) => forgetAlias(w, dropping.vendorId, dropping.raw))
                setDropping(null)
              }}
              className="press rounded-lg border border-critical bg-critical px-3.5 py-2 text-[13px] font-semibold text-on-accent hover:opacity-90">
              Forget it
            </button>
          </footer>
        </Dialog>
      )}
    </Dialog>
  )
}
