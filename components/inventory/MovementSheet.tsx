'use client'
import { Dialog } from '@/components/ui/Dialog'
import { Num } from '@/components/ui/Num'
import { num, qtyText, shortDate } from '@/lib/domain/format'
import { MOVEMENT_LABEL, SOURCE_LABEL } from '@/lib/domain/inventory'
import { useInventory } from './store'

/**
 * The document trail behind a balance. It is driven by app-wide state — any panel
 * under Inventory can open it — so it is mounted once in the stage layout rather
 * than owned by whichever panel happens to have a button. A panel that mounted
 * its own copy would leave the button dead everywhere else, which is exactly what
 * happened on the offcut register.
 */
export function MovementSheet() {
  const { selected, select } = useInventory()
  if (!selected) return null
  const r = selected
  let running = 0
  return (
    <Dialog open wide onClose={() => select(null)}
      title={`${r.item.name} · ${r.lot.batchNo}`}
      sub={r.band
        ? `${r.band.spec} · ${r.band.location} — every document behind a balance of ${qtyText(r.balance.value, r.uom)}`
        : `Every document behind a balance of ${qtyText(r.balance.value, r.uom)}`}>
      <div className="max-h-[62vh] overflow-y-auto px-4 py-4">
        <div className="scroll-x overflow-x-auto">
          <table className="w-full min-w-[40rem] border-collapse text-[12.5px]">
            <thead className="bg-surface-2">
              <tr className="text-[11px] uppercase tracking-wide text-ink-3">
                {['Date', 'What happened', 'Document', 'Movement', 'Balance'].map((h, i) => (
                  <th key={h} className={`whitespace-nowrap border-b border-line px-3 py-2 font-medium ${i > 2 ? 'text-right' : 'text-left'}`}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {r.movements.map((m) => {
                running += m.qty
                const opening = m.kind === 'opening'
                return (
                  <tr key={m.id} className={`border-b border-line-soft ${opening ? 'bg-surface-2' : ''}`}>
                    <td className="mono whitespace-nowrap px-3 py-2 text-[11.5px] text-ink-3">{shortDate(m.on)}</td>
                    <td className="px-3 py-2">
                      {MOVEMENT_LABEL[m.kind]}
                      {m.note && <span className="block text-[11px] text-ink-3">{m.note}</span>}
                    </td>
                    <td className="px-3 py-2">
                      <span className="mono text-[11.5px]">{m.sourceRef}</span>
                      <span className="block text-[10.5px] text-ink-3">{SOURCE_LABEL[m.source]}</span>
                    </td>
                    <td className={`num whitespace-nowrap px-3 py-2 text-right ${
                      opening ? 'text-ink-3' : m.qty > 0 ? 'text-good' : 'text-critical'}`}>
                      {opening ? '—' : `${m.qty > 0 ? '+' : ''}${num(m.qty, 3)}`}
                    </td>
                    <td className="num whitespace-nowrap px-3 py-2 text-right font-medium">
                      {num(Math.round(running * 1e6) / 1e6, 3)}
                    </td>
                  </tr>
                )
              })}
            </tbody>
            <tfoot>
              <tr className="bg-surface-2">
                <td colSpan={4} className="px-3 py-2.5 text-right text-[12px] font-medium">
                  Balance on hand, {r.uom}
                </td>
                <td className="px-3 py-2.5 text-right">
                  <Num d={r.balance} format="raw" dp={3} className="font-semibold" />
                </td>
              </tr>
            </tfoot>
          </table>
        </div>

        {r.counts.length > 0 && (
          <div className="mt-4">
            <p className="mono text-[10px] uppercase tracking-wider text-ink-3">Counts on this lot</p>
            <ul className="mt-1.5 space-y-1">
              {r.counts.map((c) => (
                <li key={c.id} className="flex flex-wrap items-baseline gap-x-2 text-[11.5px]">
                  <span className="mono text-ink-3">{shortDate(c.on)}</span>
                  <span>counted {num(c.countedQty, 3)} against a book of {num(c.bookQty, 3)}</span>
                  <span className={`num ml-auto ${c.countedQty === c.bookQty ? 'text-ink-3' : 'text-warn'}`}>
                    {c.countedQty === c.bookQty ? 'agreed' : `${c.countedQty > c.bookQty ? '+' : ''}${num(c.countedQty - c.bookQty, 3)}`}
                  </span>
                  {c.note && <span className="w-full text-[11px] italic text-ink-3">“{c.note}”</span>}
                </li>
              ))}
            </ul>
          </div>
        )}

        <p className="mt-4 rounded-md border border-line bg-surface-2 p-3 text-[12px] leading-relaxed text-ink-2">
          <strong className="text-ink">There is no stored quantity anywhere in this build.</strong> The
          balance is the sum of this list, and every line names a document — a goods receipt, a work
          order, a challan, a cut, a count. That is what makes the number on the screen and the number
          on the rack the same conversation instead of two different ones.
          {r.band && (
            <> A remnant band is an ordinary lot on this same ledger, which is the point of INV-02:
            an offcut is stock, and it has the same history behind it as anything else.</>
          )}
        </p>
      </div>
    </Dialog>
  )
}
