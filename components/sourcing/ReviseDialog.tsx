'use client'
import { useEffect, useState } from 'react'
import { Dialog } from '@/components/ui/Dialog'
import { Field, NumberInput, Textarea } from '@/components/ui/Field'
import { useWorkspace } from '@/components/workspace/store'
import { num, shortDate } from '@/lib/domain/format'
import { reviseOrder, reviseProblem, revisionsOf } from '@/lib/workspace/orders'

/**
 * Changing a line its supplier already holds.
 *
 * A new version, with a reason — the supplier will ask, and so will whoever
 * reads this order in three months. Saving it tells nobody anything: the line
 * reads "changed, supplier not told" until somebody sends the revised order,
 * and every cover figure stays on the quantity the supplier confirmed, because
 * that is what will actually arrive.
 */
export function ReviseDialog({ orderId, onClose }: { orderId: string | null; onClose: () => void }) {
  const { workspace, update, today, session } = useWorkspace()
  const [qty, setQty] = useState('')
  const [date, setDate] = useState('')
  const [reason, setReason] = useState('')
  const [tried, setTried] = useState(false)

  const order = workspace?.orders.find((o) => o.id === orderId) ?? null
  useEffect(() => {
    if (!order) return
    const vs = revisionsOf(order)
    const cur = vs[vs.length - 1]
    setQty(String(cur?.qty ?? order.qty)); setDate(cur?.promisedDate ?? order.expectedOn)
    setReason(''); setTried(false)
  }, [orderId]) // eslint-disable-line react-hooks/exhaustive-deps

  if (!workspace || !order) return null
  const ws = workspace
  const item = ws.items.find((i) => i.id === order.itemId)
  const vendor = ws.vendors.find((v) => v.id === order.vendorId)
  const vs = revisionsOf(order)
  const cur = vs[vs.length - 1]
  const uom = item?.uom ?? ''

  const change = {
    qty: qty.trim() === '' ? NaN : Number(qty),
    expectedOn: date, reason, changedBy: session.actor, on: today,
  }
  const problem = reviseProblem(order, change)

  const save = () => {
    setTried(true)
    if (problem) return
    update((w) => reviseOrder(w, order.id, change))
    onClose()
  }

  return (
    <Dialog open onClose={onClose} title={`Change ${order.no}`}
      sub={`${item?.name ?? 'this material'} from ${vendor?.name ?? 'this supplier'} · now v${cur.version}, ${
        num(cur.qty, 3)} ${uom} by ${shortDate(cur.promisedDate)}`}>
      <div className="space-y-4 px-4 py-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Quantity you now want" htmlFor="rv-qty">
            <NumberInput id="rv-qty" value={qty} onChange={setQty} unit={uom} />
          </Field>
          <Field label="Needed by" htmlFor="rv-date">
            <input id="rv-date" type="date" value={date} onChange={(e) => setDate(e.target.value)}
              className="num w-full rounded-md border border-line bg-surface px-2.5 py-2 text-[13px] outline-none focus:border-accent" />
          </Field>
        </div>
        <Field label="Why is it changing?" htmlFor="rv-reason"
          hint="One line. It goes on the revised order the supplier receives.">
          <Textarea id="rv-reason" rows={2} value={reason} onChange={setReason}
            placeholder="A customer order grew · a job was cancelled · the line moved a week" />
        </Field>

        <p className="rounded-lg border border-warn/30 bg-warn-soft px-3 py-2.5 text-[12.5px] leading-relaxed text-ink-2">
          This makes <strong className="text-ink">v{cur.version + 1}</strong>. It tells {vendor?.name ?? 'the supplier'}{' '}
          nothing — the line reads <em>changed, supplier not told</em> until you send them the revised
          order, and cover stays on what they confirmed until they confirm this.
        </p>

        {tried && problem && <p className="text-[12.5px] text-critical">{problem}</p>}
      </div>
      <footer className="flex items-center gap-2 border-t border-line-soft px-4 py-3">
        <button type="button" onClick={onClose}
          className="press rounded-lg px-2.5 py-2 text-[13px] text-ink-2 hover:text-ink">Cancel</button>
        <span className="ml-auto" />
        <button type="button" onClick={save}
          className="press rounded-lg border border-accent-ink bg-accent-ink px-3.5 py-2 text-[13px] font-semibold text-on-accent hover:bg-accent">
          Save v{cur.version + 1}
        </button>
      </footer>
    </Dialog>
  )
}
