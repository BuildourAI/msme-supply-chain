'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Dialog } from '@/components/ui/Dialog'
import { Field, NumberInput, Select, TextInput } from '@/components/ui/Field'
import { useWorkspace } from '@/components/workspace/store'
import { checksFor } from '@/lib/workspace/checks'
import { arrive, outstandingOn, receiptsFor } from '@/lib/workspace/receipts'
import { num, shortDate } from '@/lib/domain/format'
import type { PurchaseOrder } from '@/lib/workspace/types'

/**
 * Goods at the gate.
 *
 * What came, and when — and nothing about whether it is any good, because
 * that is not known yet. The receipt this writes waits OPEN at the gate: no
 * stock, the order unmoved, until somebody works down the material's checks
 * and closes it on the Receiving screen. There is one gate, and every
 * "record what arrived" in the build leads to it; a quantity typed in here
 * cannot reach the shelf without passing it.
 *
 * The arrival date still measures the supplier from this moment: §5 makes the
 * trailing average of the last six actual receipts the lead time, and the
 * lorry arrived when it arrived, whenever it is inspected.
 */
export function ReceiveForm({ open, onClose, order, onArrived }: {
  open: boolean
  onClose: () => void
  /** the line it came against; absent to pick one from what is still to come */
  order: PurchaseOrder | null
  /**
   * Called with the order line it arrived against, so a screen can go
   * straight on to inspecting it. The line, not the receipt: the receipt's id
   * is issued inside the workspace update, which React may run after this
   * returns — the screen finds the newest open receipt on the line instead.
   */
  onArrived?: (orderId: string) => void
}) {
  const { workspace, update, today } = useWorkspace()
  const [lineId, setLineId] = useState('')
  const [qty, setQty] = useState('')
  const [note, setNote] = useState('')
  const [on, setOn] = useState('')
  const [tried, setTried] = useState(false)

  // what can still arrive: handed over, not called off, something left to come
  const waiting = (workspace?.orders ?? []).filter((o) =>
    (o.state === 'confirmed' || o.state === 'shipped') && workspace && outstandingOn(workspace, o) > 0)

  useEffect(() => {
    if (!open || !workspace) return
    const first = order ?? waiting[0] ?? null
    setTried(false)
    setLineId(first?.id ?? '')
    setQty(first ? String(outstandingOn(workspace, first) || first.qty) : '')
    setNote(''); setOn(today)
  }, [open, order?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  if (!open || !workspace) return null
  const ws = workspace
  const line = order ?? ws.orders.find((o) => o.id === lineId) ?? null

  if (!line) {
    return (
      <Dialog open onClose={onClose} title="Goods arrived">
        <div className="px-4 py-6 text-center">
          <p className="text-[13px] leading-relaxed text-ink-2">
            Nothing is on its way. A receipt comes against an order that has been handed to its
            supplier — draft one on the Purchase orders screen and hand it over first.
          </p>
          <Link href="/sourcing/orders" onClick={onClose}
            className="press mt-3 inline-flex rounded-lg border border-line bg-surface px-3 py-1.5 text-[12.5px] font-medium hover:bg-surface-2">
            Purchase orders
          </Link>
        </div>
      </Dialog>
    )
  }

  const item = ws.items.find((i) => i.id === line.itemId)
  const vendor = ws.vendors.find((v) => v.id === line.vendorId)
  const already = receiptsFor(ws, line.vendorId, line.itemId)
  const left = outstandingOn(ws, line)
  const checks = checksFor(ws, line.itemId)

  const n = (v: string) => (v.trim() === '' ? NaN : Number(v))
  const qtyN = n(qty)
  const qtyOk = Number.isFinite(qtyN) && qtyN > 0
  const dateOk = on.length === 10 && on >= line.orderedOn && on <= today
  const ok = qtyOk && dateOk

  const days = dateOk
    ? Math.round((Date.parse(`${on}T00:00:00Z`) - Date.parse(`${line.orderedOn}T00:00:00Z`)) / 86400000)
    : null

  const save = () => {
    setTried(true)
    if (!ok) return
    update((w) => arrive(w, { order: line, qty: qtyN, receivedOn: on, note })[0])
    onClose()
    onArrived?.(line.id)
  }

  return (
    <Dialog open onClose={onClose} wide title={`${line.no} — goods at the gate`}
      sub={`${item?.name ?? 'this material'} from ${vendor?.name ?? 'this supplier'}`}>
      <div className="space-y-4 px-4 py-4">
        {!order && waiting.length > 1 && (
          <Field label="Which order is it against?" htmlFor="rc-order">
            <Select id="rc-order" value={lineId}
              onChange={(v) => {
                setLineId(v)
                const o = ws.orders.find((x) => x.id === v)
                if (o) setQty(String(outstandingOn(ws, o) || o.qty))
              }}
              options={waiting.map((o) => ({
                value: o.id,
                label: `${o.no} · ${ws.items.find((i) => i.id === o.itemId)?.name ?? 'material'} · ${
                  ws.vendors.find((v) => v.id === o.vendorId)?.name ?? 'supplier'}`,
              }))} />
          </Field>
        )}

        <p className="rounded-lg border border-line bg-surface-2 px-3 py-2 text-[12.5px] text-ink-2">
          {num(line.qty, 3)} {item?.uom} ordered
          {left < line.qty && <>, {num(line.qty - left, 3)} {item?.uom} already in</>}
          {left > 0 && left < line.qty && <> — <strong className="text-ink">{num(left, 3)} {item?.uom} still to come</strong></>}
        </p>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="How much came" htmlFor="rc-qty"
            hint="Weighed or counted at the gate."
            error={tried && !qtyOk ? 'Put in what arrived.' : null}>
            <NumberInput id="rc-qty" value={qty} onChange={setQty} unit={item?.uom}
              invalid={tried && !qtyOk} />
          </Field>
          <Field label="On" htmlFor="rc-on"
            error={tried && !dateOk
              ? on > today ? 'It cannot have arrived in the future.' : 'A delivery cannot arrive before it was ordered.'
              : null}>
            <input id="rc-on" type="date" value={on} max={today} onChange={(e) => setOn(e.target.value)}
              className="num w-full rounded-md border border-line bg-surface px-2.5 py-2 text-[13px] outline-none focus:border-accent" />
          </Field>
        </div>

        <Field label="Anything worth remembering" hint="Optional — “lorry late, two coils on top”.">
          <TextInput value={note} onChange={setNote} placeholder="" />
        </Field>

        {/*
          * What happens next, said before it happens: the receipt waits at the
          * gate, and the material is not stock until it is inspected.
          */}
        <p className="rounded-lg border border-warn/30 bg-warn-soft px-3 py-2.5 text-[12.5px] leading-relaxed text-ink-2">
          It waits at the gate until somebody inspects it —
          {checks.length > 0
            ? <> {checks.length} check{checks.length === 1 ? '' : 's'} on {item?.name ?? 'this material'}.</>
            : <> no checks are written for {item?.name ?? 'this material'}, so it will close unchecked, and say so.</>}
          {' '}Until then none of it is usable stock.
        </p>

        {days !== null && (
          <p className="text-[12px] leading-relaxed text-ink-3">
            <strong className="text-ink-2">{days} days</strong> from order to arrival —
            {already.length > 0
              ? <> one of {already.length + 1} deliveries now measuring {vendor?.name}&apos;s lead time on this material.</>
              : <> the first measurement of {vendor?.name}&apos;s lead time on this material, instead of what they quoted.</>}
          </p>
        )}

        {already.length > 0 && (
          <div>
            <p className="text-[12.5px] font-medium">Already arrived</p>
            <ul className="mt-1 space-y-0.5">
              {already.slice(-4).reverse().map((r) => (
                <li key={r.id} className="flex gap-2 text-[11.5px] text-ink-2">
                  <span className="mono shrink-0">{shortDate(r.receivedOn)}</span>
                  <span className="min-w-0 flex-1 truncate">
                    {num(r.qty, 3)} {item?.uom}
                    {r.status === 'open' ? <span className="text-warn"> · at the gate</span>
                      : r.rejected > 0 ? <span className="text-critical"> · {num(r.rejected, 3)} rejected</span> : null}
                    {r.note && <span className="text-ink-3"> · {r.note}</span>}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      <footer className="flex items-center gap-2 border-t border-line-soft px-4 py-3">
        <button type="button" onClick={onClose}
          className="press rounded-lg px-2.5 py-2 text-[13px] text-ink-2 hover:text-ink">Cancel</button>
        <span className="ml-auto" />
        <button type="button" onClick={save}
          className="press rounded-lg border border-accent-ink bg-accent-ink px-3.5 py-2 text-[13px] font-semibold text-on-accent hover:bg-accent">
          It&apos;s at the gate
        </button>
      </footer>
    </Dialog>
  )
}
