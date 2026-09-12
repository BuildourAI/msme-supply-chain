'use client'
import { useEffect, useState } from 'react'
import { Button, Card, Pill, StatusPill } from '@/components/ui/bits'
import { Dialog } from '@/components/ui/Dialog'
import { Num } from '@/components/ui/Num'
import { money, num, shortDate } from '@/lib/domain/format'
import { useDispatch } from './store'

/* ------------------------------------------------------ raise a despatch -- */

/**
 * The despatch dialog. It will not let you send more than the order has left,
 * nor more than the bay holds — the two facts that turn a despatch note from a
 * piece of paper into a control. Both limits are shown rather than enforced
 * silently, because a storeman who cannot see why the button is off will find
 * another way to move the goods.
 */
function DespatchDialog() {
  const { despatchingOrder, showDespatch, raiseDespatch, carriers, fgRows } = useDispatch()
  const [qty, setQty] = useState('')
  const [carrierId, setCarrierId] = useState('CR-VRL')
  const [who, setWho] = useState('R. Menon · Sales')

  useEffect(() => {
    if (!despatchingOrder) return
    setQty(String(despatchingOrder.pending.value)); setCarrierId('CR-VRL'); setWho('R. Menon · Sales')
  }, [despatchingOrder])

  if (!despatchingOrder) return null
  const o = despatchingOrder
  const fgRow = fgRows.find((r) => r.fg.id === o.lines[0].fgId)!
  const onBay = fgRow.balance.value as number
  const pending = o.pending.value as number
  const n = Number(qty) || 0
  const overOrder = n > pending
  const overBay = n > onBay
  const ok = n > 0 && !overOrder && !overBay && who.trim().length > 0

  return (
    <Dialog open onClose={() => showDespatch(null)} title={`Despatch against ${o.soNo}`}
      sub={`${o.customer.name} · promised ${shortDate(o.promisedDate)} · ship to ${o.customer.shipTo}`}>
      <div className="space-y-3 px-4 py-4">
        <div className="grid gap-2 sm:grid-cols-3">
          <div className="rounded-md border border-line bg-surface-2 p-2.5">
            <span className="mono block text-[10px] uppercase tracking-wider text-ink-2">Still to despatch</span>
            <span className="mt-0.5 block"><Num d={o.pending} format="qty" dp={0} suffix={fgRow.fg.uom} /></span>
          </div>
          <div className="rounded-md border border-line bg-surface-2 p-2.5">
            <span className="mono block text-[10px] uppercase tracking-wider text-ink-2">On the bay</span>
            <span className="mt-0.5 block"><Num d={fgRow.balance} format="qty" dp={0} suffix={fgRow.fg.uom} /></span>
          </div>
          <div className="rounded-md border border-line bg-surface-2 p-2.5">
            <span className="mono block text-[10px] uppercase tracking-wider text-ink-2">Order value</span>
            <span className="mt-0.5 block"><Num d={o.value} format="money" /></span>
          </div>
        </div>

        <label className="block text-[12.5px]">
          <span className="block text-ink-2">Quantity leaving <span className="text-ink-3">({fgRow.fg.code} · {fgRow.fg.name})</span></span>
          <input type="number" step="1" min={0} value={qty} onChange={(e) => setQty(e.target.value)}
            data-autofocus
            className="num mt-1 w-full rounded-md border border-line bg-surface px-2 py-1.5 outline-none focus:border-accent" />
        </label>

        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block text-[12.5px]">
            <span className="block text-ink-2">Carrier</span>
            <select value={carrierId} onChange={(e) => setCarrierId(e.target.value)}
              className="mt-1 w-full rounded-md border border-line bg-surface px-2 py-1.5 text-[12.5px] outline-none focus:border-accent">
              {carriers.map((c) => <option key={c.id} value={c.id}>{c.name} — {c.mode}</option>)}
            </select>
          </label>
          <label className="block text-[12.5px]">
            <span className="block text-ink-2">Authorised by</span>
            <input value={who} onChange={(e) => setWho(e.target.value)}
              className="mt-1 w-full rounded-md border border-line bg-surface px-2 py-1.5 text-[12.5px] outline-none focus:border-accent" />
          </label>
        </div>

        {overOrder && (
          <p className="rounded-md border border-critical/30 bg-critical-soft px-3 py-2 text-[12px] text-critical">
            That is more than the order has left. {num(pending, 0)} {fgRow.fg.uom} outstanding on {o.soNo}.
          </p>
        )}
        {overBay && !overOrder && (
          <p className="rounded-md border border-warn/30 bg-warn-soft px-3 py-2 text-[12px] text-warn">
            The bay holds {num(onBay, 0)} {fgRow.fg.uom}. Despatching more would make the finished-goods
            balance negative, which is how a stock figure stops being worth reading.
          </p>
        )}
        <p className="text-[11.5px] leading-relaxed text-ink-3">
          Raising this note posts the movement that takes the goods off the bay and records who let them
          go. It does not raise an invoice and never will — the document pack hands off to the accounting
          system the client already runs.
        </p>
      </div>
      <footer className="flex items-center gap-2 border-t border-line-soft px-4 py-3">
        <Button onClick={() => showDespatch(null)}>Not now</Button>
        <span className="ml-auto" />
        <Button variant="primary" disabled={!ok}
          onClick={() => raiseDespatch(o, n, carrierId, who.trim())}>
          Raise despatch note
        </Button>
      </footer>
    </Dialog>
  )
}

/* ----------------------------------------------------------- the order book */

export function OrderBook() {
  const { orders, showDespatch, today } = useDispatch()
  return (
    <Card index={0} title="The order book" live
      sub="Every customer order with its lines, what has gone out, and what is still to go"
      actions={<span className="text-[12px] text-ink-3">{orders.filter((o) => !o.complete).length} open</span>}>
      <div className="scroll-x overflow-x-auto">
        <table className="w-full min-w-[60rem] border-collapse text-[12.5px]">
          <thead className="bg-surface-2">
            <tr className="text-[11px] uppercase tracking-wide text-ink-3">
              {['Order', 'Customer', 'Product', 'Ordered', 'Despatched', 'Still to go', 'Value', 'Promised', 'Status', ''].map((h, i) => (
                <th key={h || i} className={`whitespace-nowrap border-b border-line px-3 py-2 font-medium ${
                  i >= 3 && i <= 6 ? 'text-right' : 'text-left'}`}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {orders.map((o) => {
              const fgCode = o.lines[0]?.fgId ?? '—'
              return (
                <tr key={o.soNo} className="border-b border-line-soft">
                  <td className="mono whitespace-nowrap px-3 py-2 text-[11.5px]">{o.soNo}</td>
                  <td className="px-3 py-2">{o.customer.name}</td>
                  <td className="mono px-3 py-2 text-[11px] text-ink-3">{fgCode}</td>
                  <td className="num px-3 py-2 text-right">{num(o.ordered, 0)}</td>
                  <td className="num px-3 py-2 text-right text-ink-2">{num(o.despatched, 0)}</td>
                  <td className="num px-3 py-2 text-right">
                    {o.complete
                      ? <span className="text-ink-3">—</span>
                      : <Num d={o.pending} format="qty" dp={0} tone={o.overdue ? 'critical' : undefined} />}
                  </td>
                  <td className="num px-3 py-2 text-right"><Num d={o.value} format="money" /></td>
                  <td className={`whitespace-nowrap px-3 py-2 ${o.overdue ? 'text-critical' : 'text-ink-3'}`}>
                    {shortDate(o.promisedDate)}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2">
                    {o.complete
                      ? <StatusPill tone="good" label="Despatched in full" />
                      : o.overdue
                        ? <StatusPill tone="critical" label="Past the promise" explain={`Promised ${o.promisedDate}, today is ${today}`} />
                        : o.despatched > 0
                          ? <StatusPill tone="warn" label="Part shipped" />
                          : <StatusPill tone="neutral" label="Nothing out yet" />}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2 text-right">
                    {!o.complete && (
                      <Button size="sm" variant="primary" onClick={() => showDespatch(o.soNo)}>Despatch</Button>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      <p className="border-t border-line-soft px-4 py-3 text-[11.5px] leading-relaxed text-ink-3">
        <strong className="text-ink">An order value is derived from its lines</strong>, never stored beside
        them — two numbers for one fact is two numbers that will disagree. The three orders Line Watch
        already carries keep their published values exactly: their lines multiply out to the rupee.
      </p>
      <DespatchDialog />
    </Card>
  )
}

/* ----------------------------------------------------- finished goods on the bay */

export function FinishedGoods() {
  const { fgRows, fgValue } = useDispatch()
  return (
    <Card index={1} className="mt-3" title="Finished goods on the despatch bay" live
      sub="The leg of the stock picture this build had to assume until Stage 5 existed"
      actions={<span className="text-[12px] text-ink-3">
        Valued at cost <Num d={fgValue} format="money" />
      </span>}>
      <div className="grid gap-2.5 p-3 sm:grid-cols-2 xl:grid-cols-4">
        {fgRows.map((r, i) => (
          <div key={r.fg.id} style={{ '--i': i, '--tile-c': `var(--tile-${(i % 6) + 1})` } as React.CSSProperties}
               className="anim-fade-up lift glass-tile rounded-lg border p-3">
            <span className="mono block text-[10px] uppercase tracking-wider text-ink-2">{r.fg.code}</span>
            <span className="mt-0.5 block text-[13px] font-medium leading-tight">{r.fg.name}</span>
            <span className="mt-1.5 block">
              <Num d={r.balance} format="qty" dp={0} size="lg" suffix={r.fg.uom}
                   tone={(r.balance.value as number) <= 0 ? 'critical' : undefined} />
            </span>
            <span className="mt-1 block text-[11px] leading-snug text-ink-2">
              {money((r.balance.value as number) * r.fg.standardCost)} at cost · built by {r.fg.builtBy.join(', ')}
            </span>
            <span className="mono mt-1.5 block border-t border-line-soft pt-1.5 text-[10px] text-ink-2">
              {r.movements.length} movements · HSN {r.fg.hsn}
            </span>
          </div>
        ))}
      </div>
      <p className="border-t border-line-soft px-4 py-3 text-[11.5px] leading-relaxed text-ink-3">
        A balance here is the sum of its movements — an opening figure, the jobs the floor closed, the
        despatches raised against it, and anything a customer sent back. The same rule the raw-material
        ledger keeps, for the same reason: a quantity you can type over is a quantity nobody can audit.
      </p>
    </Card>
  )
}

/* ------------------------------------------------------------ notes raised */

export function DespatchRegister() {
  const { notes, despatchedValue, showDocuments } = useDispatch()
  const shown = [...notes].sort((a, b) => b.despatchedOn.localeCompare(a.despatchedOn))
  return (
    <Card index={2} className="mt-3" title="Despatch notes raised" live
      sub="The mirror of the goods receipt — what left, against which order, on whose authority"
      actions={<span className="text-[12px] text-ink-3">
        Value out <Num d={despatchedValue} format="money" />
      </span>}>
      <div className="scroll-x overflow-x-auto">
        <table className="w-full min-w-[54rem] border-collapse text-[12.5px]">
          <thead className="bg-surface-2">
            <tr className="text-[11px] uppercase tracking-wide text-ink-3">
              {['Note', 'Date', 'Order', 'Customer', 'Went out', 'Weight', 'Authorised by', ''].map((h, i) => (
                <th key={h || i} className={`whitespace-nowrap border-b border-line px-3 py-2 font-medium ${
                  i === 4 || i === 5 ? 'text-right' : 'text-left'}`}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {shown.map((n) => (
              <tr key={n.dnNo} className="border-b border-line-soft">
                <td className="mono whitespace-nowrap px-3 py-2 text-[11.5px]">{n.dnNo}</td>
                <td className="whitespace-nowrap px-3 py-2 text-ink-3">{shortDate(n.despatchedOn)}</td>
                <td className="mono px-3 py-2 text-[11px] text-ink-3">{n.soNo}</td>
                <td className="px-3 py-2">{n.customerId.replace('CU-', '')}</td>
                <td className="num px-3 py-2 text-right">
                  {n.lines.map((l) => `${num(l.qty, 0)} × ${l.fgId}`).join(', ')}
                </td>
                <td className="num px-3 py-2 text-right text-ink-2">{num(n.weightKg, 0)} kg</td>
                <td className="px-3 py-2 text-ink-2">
                  {n.authorisedBy}
                  {n.note && <span className="mono block text-[10px] text-warn">{n.note}</span>}
                </td>
                <td className="whitespace-nowrap px-3 py-2 text-right">
                  <Button size="sm" onClick={() => showDocuments(n.dnNo)}>Document pack</Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="border-t border-line-soft px-4 py-3 text-[11.5px] leading-relaxed text-ink-3">
        Every note names a person who let the goods go. That is the whole difference between a despatch
        and stock walking out of a gate, and it is why this is the smallest honest first step for the
        stage — before documents, before carriers, before milestones.
      </p>
    </Card>
  )
}

export { Pill }
