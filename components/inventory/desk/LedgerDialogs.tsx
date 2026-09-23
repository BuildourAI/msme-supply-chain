'use client'
import { useEffect, useState } from 'react'
import { Dialog } from '@/components/ui/Dialog'
import { Field } from '@/components/ui/Field'
import { useWorkspace } from '@/components/workspace/store'
import { num, shortDate } from '@/lib/domain/format'
import { lotOf, trail } from '@/lib/workspace/ledger'
import { placeLot } from '@/lib/workspace/racks'
import { RackSelect } from './RackSelect'

function Foot({ onClose, label, onSave, disabled }: {
  onClose: () => void; label: string; onSave: () => void; disabled?: boolean
}) {
  return (
    <footer className="flex items-center justify-end gap-2 border-t border-line-soft px-4 py-3">
      <button type="button" onClick={onClose}
        className="press rounded-lg px-2.5 py-2 text-[13px] text-ink-2 hover:text-ink">Cancel</button>
      <button type="button" onClick={onSave} disabled={disabled}
        className="press rounded-lg border border-accent-ink bg-accent-ink px-3.5 py-2 text-[13px] font-semibold text-on-accent hover:bg-accent disabled:opacity-40">
        {label}
      </button>
    </footer>
  )
}

/**
 * One lot's history, with the balance after every line.
 *
 * The answer to "why does the book say that?" — every receipt, issue, send-out,
 * count and write-off that made the number, each naming its document, and the
 * rack moves between them. The last balance is the book, always.
 */
export function TrailDialog({ lotId, onClose }: { lotId: string | null; onClose: () => void }) {
  const { workspace } = useWorkspace()
  if (!lotId || !workspace) return null
  const lot = lotOf(workspace, lotId)
  if (!lot) return null
  const item = workspace.items.find((i) => i.id === lot.itemId)
  const uom = item?.uom ?? ''
  const rows = trail(workspace, lotId)

  return (
    <Dialog open onClose={onClose} wide
      title={`${item?.name ?? 'Lot'} · ${lot.batchNo}`}
      sub={`${lot.id} · book ${num(lot.qty, 3)} ${uom}`}>
      <div className="px-4 py-4">
        {rows.length === 0 ? (
          <p className="text-[12.5px] text-ink-3">Nothing has been written against this lot yet.</p>
        ) : (
          <div className="scroll-x overflow-x-auto rounded-lg border border-line">
            <table className="w-full border-collapse text-[12.5px]">
              <thead>
                <tr className="border-b border-line text-left text-[12px] text-ink-3">
                  <th className="px-3 py-2 font-medium">Date</th>
                  <th className="px-3 py-2 font-medium">What happened</th>
                  <th className="px-3 py-2 font-medium">Document</th>
                  <th className="px-3 py-2 text-right font-medium">Moved</th>
                  <th className="px-3 py-2 text-right font-medium">Balance</th>
                  <th className="px-3 py-2 font-medium">By</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={i} className="border-b border-line-soft last:border-0">
                    <td className="whitespace-nowrap px-3 py-2 text-ink-2">{shortDate(r.on)}</td>
                    <td className="px-3 py-2">
                      <span className={r.kind === 'transfer' ? 'text-ink-3' : 'text-ink'}>{r.what}</span>
                      {r.note && <span className="block text-[11.5px] text-ink-3">{r.note}</span>}
                    </td>
                    <td className="mono whitespace-nowrap px-3 py-2 text-[11.5px] text-ink-2">{r.doc}</td>
                    <td className={`num whitespace-nowrap px-3 py-2 text-right ${
                      r.qty === undefined ? 'text-ink-4' : r.qty < 0 ? 'text-critical' : 'text-good'}`}>
                      {r.qty === undefined ? '—' : `${r.qty > 0 ? '+' : ''}${num(r.qty, 3)}`}
                    </td>
                    <td className="num whitespace-nowrap px-3 py-2 text-right font-medium">{num(r.balance, 3)} {uom}</td>
                    <td className="whitespace-nowrap px-3 py-2 text-ink-3">{r.actor || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="mt-3 text-[11.5px] leading-relaxed text-ink-3">
          Nobody types a balance. Every change is a line against the document that made it, and
          the last line is what the book says.
        </p>
      </div>
    </Dialog>
  )
}

/** A lot put on another rack. The quantity does not move, so nothing but the trail changes. */
export function MoveRackDialog({ lotId, onClose }: { lotId: string | null; onClose: () => void }) {
  const { workspace, update, today, session } = useWorkspace()
  const [rack, setRack] = useState('')

  useEffect(() => {
    if (!lotId || !workspace) return
    setRack(lotOf(workspace, lotId)?.rack ?? '')
  }, [lotId]) // eslint-disable-line react-hooks/exhaustive-deps

  if (!lotId || !workspace) return null
  const lot = lotOf(workspace, lotId)
  if (!lot) return null
  const item = workspace.items.find((i) => i.id === lot.itemId)
  const same = (lot.rack ?? '') === rack

  const save = () => {
    update((w) => placeLot(w, lotId, rack || undefined, today, session.actor))
    onClose()
  }

  return (
    <Dialog open onClose={onClose}
      title={lot.rack ? 'Move to another rack' : 'Put it on a rack'}
      sub={`${item?.name ?? 'Lot'} · ${lot.batchNo} · ${num(lot.qty, 3)} ${item?.uom ?? ''}`}>
      <div className="space-y-3 px-4 py-4">
        <Field label="Which rack is it on now?" htmlFor="mv-rack"
          hint="The move is kept on the lot's trail, dated and with your name.">
          <RackSelect id="mv-rack" value={rack} onChange={setRack} />
        </Field>
      </div>
      <Foot onClose={onClose} onSave={save} disabled={same}
        label={rack ? 'Move it' : 'Take it off the rack'} />
    </Dialog>
  )
}
